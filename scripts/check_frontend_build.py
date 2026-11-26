#!/usr/bin/env python3
"""Comprueba que el build de producción de la SPA es de producción (TSK-92).

Estático y rápido: no levanta nada. Necesita el build ya hecho
(``cd frontend && npx ng build --configuration production``). Con ``--container NOMBRE``
revisa además lo que sirve Nginx en un contenedor en marcha. Código 1 si algo falla.

1. ``angular.json``: la configuración por defecto es la de producción, que minimiza, usa
   hashes y NO genera ``sourceMap``; el sourceMap solo está en «development».
2. El ``dist``: sin archivos ``.map``, sin referencias ``sourceMappingURL`` y sin rastro de
   herramientas de desarrollo (pruebas, E2E, formato).
3. ``package.json``: ``dependencies`` solo trae el runtime de Angular; todo lo demás
   (Playwright, axe, Vitest, jsdom, Prettier…) está en ``devDependencies``.
4. El ``Dockerfile`` de la imagen final no instala ni copia Node ni ``node_modules``.
5. El arranque del tema: ``theme-init.js`` se carga en ``<head>`` antes de la SPA y
   ``index.html`` no tiene ningún ``<script>`` en línea, que la CSP bloquearía.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
failures = 0

# Nombres que, si aparecieran dentro del bundle, delatarían dependencias de desarrollo.
DEV_MARKERS = ("playwright", "axe-core", "vitest", "jsdom", "prettier", "@angular/cli", "@types/node")
RUNTIME = re.compile(r"^(@angular/(common|compiler|core|forms|platform-browser|router)|rxjs|tslib)$")


def check(name: str, ok: bool, detail: str = "") -> None:
    global failures
    failures += 0 if ok else 1
    print(f"  [{'OK' if ok else 'FALLA'}] {name}" + (f" — {detail}" if detail else ""))


def configuration() -> None:
    print("angular.json")
    project = json.loads((FRONTEND / "angular.json").read_text(encoding="utf-8"))["projects"]
    build = next(iter(project.values()))["architect"]["build"]
    prod = build["configurations"]["production"]
    dev = build["configurations"]["development"]
    check("la configuración por defecto es «production»", build.get("defaultConfiguration") == "production")
    check("producción no genera sourceMap", prod.get("sourceMap", False) is False, str(prod.get("sourceMap")))
    check("producción optimiza y pone hash en los archivos",
          prod.get("optimization", True) is not False and prod.get("outputHashing") == "all")
    check("el sourceMap solo existe en «development»", dev.get("sourceMap") is True)


def bundle(dist: Path) -> None:
    print(f"Build ({dist.relative_to(ROOT) if dist.is_relative_to(ROOT) else dist})")
    if not dist.is_dir():
        check("existe el build de producción", False, "ejecute: cd frontend && npx ng build --configuration production")
        return
    files = [p for p in dist.rglob("*") if p.is_file()]
    check("el build tiene archivos", len(files) > 0, f"{len(files)} archivos")
    maps = [p.name for p in files if p.suffix == ".map"]
    check("no hay archivos .map", not maps, ", ".join(maps[:3]))
    text = [p for p in files if p.suffix in {".js", ".css", ".html", ".json", ".mjs"}]
    refs = [p.name for p in text if "sourceMappingURL" in p.read_text(encoding="utf-8", errors="ignore")]
    check("ningún archivo apunta a un sourceMappingURL", not refs, ", ".join(refs[:3]))
    leaked = sorted({m for p in text for m in DEV_MARKERS
                     if m in p.read_text(encoding="utf-8", errors="ignore").lower()})
    check("el bundle no contiene herramientas de desarrollo", not leaked, ", ".join(leaked))
    check("el bundle no incluye pruebas ni fuentes TypeScript",
          not [p.name for p in files if p.suffix == ".ts" or ".spec." in p.name])


def theme_boot(dist: Path) -> None:
    print("Arranque del tema")
    index, script = dist / "index.html", dist / "theme-init.js"
    if not index.is_file():
        check("existe index.html en el build", False)
        return
    html = index.read_text(encoding="utf-8")
    scripts = list(re.finditer(r"<script\b([^>]*)>(.*?)</script>", html, re.S))
    inline = [m for m in scripts if "src=" not in m.group(1) or m.group(2).strip()]
    check("index.html no tiene scripts en línea (CSP «script-src 'self'»)", not inline,
          f"{len(inline)} en línea" if inline else "")
    boot = next((m for m in scripts if re.search(r'src="theme-init\.js(\?[^"]*)?"', m.group(1))), None)
    check("index.html carga theme-init.js", boot is not None)
    if boot is not None:
        head_end = html.find("</head>")
        check("theme-init.js va en <head>", 0 <= boot.start() < head_end)
        check("theme-init.js es síncrono (sin defer, async ni module)",
              not re.search(r"\b(defer|async)\b|type=[\"']module", boot.group(1)), boot.group(1).strip())
        modules = [m.start() for m in scripts if re.search(r"type=[\"']module", m.group(1))]
        check("theme-init.js precede a los scripts de la SPA",
              bool(modules) and boot.start() < min(modules))
    check("el build publica theme-init.js", script.is_file())
    if script.is_file():
        source = script.read_text(encoding="utf-8")
        check("theme-init.js usa la clave «gpc-theme»", "'gpc-theme'" in source)
        check("theme-init.js pesa menos de 1 kB", script.stat().st_size < 1024, f"{script.stat().st_size} bytes")


def dependencies() -> None:
    print("package.json")
    runtime = json.loads((FRONTEND / "package.json").read_text(encoding="utf-8"))["dependencies"]
    extra = sorted(name for name in runtime if not RUNTIME.match(name))
    check("dependencies solo trae el runtime de Angular", not extra, ", ".join(extra))


def image() -> None:
    print("Dockerfile del frontend")
    stages = re.split(r"(?m)^FROM ", (FRONTEND / "Dockerfile").read_text(encoding="utf-8"))
    final = stages[-1]
    check("la imagen final parte de Nginx, no de Node", final.startswith("nginx"), final.splitlines()[0])
    check("la imagen final no instala ni ejecuta npm/node", not re.search(r"(?m)^(RUN|CMD|ENTRYPOINT).*\b(npm|node|npx)\b", final))
    check("la imagen final no copia node_modules", "node_modules" not in final)
    check("la imagen final solo copia el build compilado", "COPY --from=build" in final and "dist/gpc-frontend/browser" in final)


def container(name: str) -> None:
    print(f"Contenedor {name}")
    run = lambda cmd: subprocess.run(["docker", "exec", name, "sh", "-c", cmd], capture_output=True, text=True, check=False)  # noqa: E731
    found = run("find /usr/share/nginx/html \\( -name '*.map' -o -name node_modules -o -name '*.ts' \\) | head")
    check("Nginx no sirve .map, node_modules ni .ts", found.returncode == 0 and not found.stdout.strip(), found.stdout.strip()[:120])
    node = run("command -v node npm")
    check("la imagen no trae Node", not node.stdout.strip(), node.stdout.strip())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dist", type=Path, default=FRONTEND / "dist" / "gpc-frontend" / "browser")
    parser.add_argument("--container", help="contenedor de Nginx en marcha, p. ej. gpc_e2e-web-1")
    args = parser.parse_args()
    configuration()
    bundle(args.dist.resolve())
    theme_boot(args.dist.resolve())
    dependencies()
    image()
    if args.container:
        container(args.container)
    print(f"\n{'Todo en orden.' if not failures else f'{failures} comprobación(es) fallaron.'}")
    sys.exit(1 if failures else 0)
