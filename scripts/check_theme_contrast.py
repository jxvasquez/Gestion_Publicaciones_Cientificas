#!/usr/bin/env python3
"""Comprueba el contraste de la paleta en ambos temas (spec 005, SC-002).

Estático y rápido: lee ``frontend/src/styles/_tokens.scss`` y no levanta nada. Código 1
si falta el tema oscuro o un token del inventario, o si un par no llega al mínimo de
WCAG 2.1 AA: 4.5:1 para texto y 3:1 para elementos no textuales.

El tema claro es el bloque ``:root``; el oscuro es ``:root[data-theme='dark']`` y hereda
los tokens que no redefine. Un par nuevo de la interfaz se agrega a ``PAIRS``.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOKENS = ROOT / "frontend" / "src" / "styles" / "_tokens.scss"

TEXT = 4.5
NON_TEXT = 3.0

# (primer plano, fondo, mínimo, dónde se usa). Los nombres van sin el prefijo «--gpc-».
PAIRS: tuple[tuple[str, str, float, str], ...] = (
    ("text", "surface", TEXT, "texto sobre el fondo base"),
    ("text", "surface-alt", TEXT, "texto en tarjeta"),
    ("text", "primary-50", TEXT, "texto en fila resaltada"),
    ("text", "primary-100", TEXT, "texto en navegación activa"),
    ("text", "neutral-100", TEXT, "texto sobre superficie neutra"),
    ("text-muted", "surface-alt", TEXT, "secundario en tarjeta"),
    ("text-muted", "workspace", TEXT, "secundario sobre el fondo base"),
    ("text-muted", "primary-50", TEXT, "secundario en aviso sin leer"),
    ("text-muted", "primary-100", TEXT, "secundario sobre acento suave"),
    ("text-muted", "warning-100", TEXT, "secundario en plazo urgente"),
    ("text-muted", "danger-100", TEXT, "secundario en plazo vencido"),
    ("text-muted", "success-100", TEXT, "secundario en aviso de éxito"),
    ("primary-900", "surface-alt", TEXT, "títulos en tarjeta"),
    ("primary-900", "workspace", TEXT, "títulos sobre el fondo base"),
    ("primary-900", "primary-50", TEXT, "cabecera de tabla"),
    ("primary-900", "primary-100", TEXT, "insignia TIE_BREAKER e informativa; avatar"),
    ("primary-900", "success-100", TEXT, "título en aviso de éxito"),
    ("primary-700", "surface-alt", TEXT, "enlace en tarjeta"),
    ("primary-700", "workspace", TEXT, "enlace sobre el fondo base"),
    ("primary-700", "primary-50", TEXT, "enlace al pasar el puntero"),
    ("primary-700", "sidebar-bg", TEXT, "navegación lateral"),
    ("on-accent", "primary-700", TEXT, "botón primario"),
    ("on-accent", "primary-900", TEXT, "botón primario al pasar el puntero y salto"),
    ("on-accent", "success-700", TEXT, "botón de éxito"),
    ("on-accent", "success-900", TEXT, "botón de éxito al pasar el puntero"),
    ("on-accent", "danger-700", TEXT, "botón destructivo y contador de avisos"),
    ("on-accent", "danger-800", TEXT, "botón destructivo al pasar el puntero"),
    ("on-accent", "text-muted", TEXT, "marcador de etapa completada en un dado de baja"),
    ("neutral-700", "neutral-100", TEXT, "insignia neutra"),
    ("success-900", "success-100", TEXT, "insignia ACCEPTED y ajuste «+10»"),
    ("warning-800", "warning-100", TEXT, "insignia CHANGES_REQUESTED"),
    ("danger-800", "danger-100", TEXT, "insignia REJECTED y ajuste «−20»"),
    ("danger-800", "danger-50", TEXT, "error del inicio de sesión"),
    ("danger-800", "surface-alt", TEXT, "peligro en tarjeta"),
    ("danger-900", "danger-50", TEXT, "aviso de error de la API"),
    ("warning-900", "warning-50", TEXT, "aviso de advertencia de la API"),
    ("warning-900", "warning-100", TEXT, "aviso de advertencia"),
    ("warning-800", "surface-alt", TEXT, "texto de advertencia en tarjeta"),
    ("warning-800", "workspace", TEXT, "texto de advertencia sobre el fondo base"),
    ("success-900", "surface-alt", TEXT, "texto de éxito"),
    ("success-700", "surface-alt", TEXT, "texto de éxito medio"),
    ("danger-700", "surface-alt", TEXT, "texto de peligro en tarjeta"),
    ("danger-700", "workspace", TEXT, "texto de peligro sobre el fondo base"),
    ("danger-700", "primary-50", TEXT, "texto de peligro al pasar el puntero"),
    ("control-border", "surface-alt", NON_TEXT, "borde de control en tarjeta"),
    ("control-border", "surface", NON_TEXT, "borde de control sobre el fondo base"),
    ("focus-color", "surface", NON_TEXT, "anillo de foco sobre el fondo base"),
    ("focus-color", "surface-alt", NON_TEXT, "anillo de foco en tarjeta"),
    ("primary-700", "track", NON_TEXT, "relleno de barra neutro"),
    ("success-700", "track", NON_TEXT, "relleno de barra de éxito"),
    ("warning-700", "track", NON_TEXT, "relleno de barra de advertencia"),
    ("danger-700", "track", NON_TEXT, "relleno de barra de peligro"),
)

LIGHT_BLOCK = re.compile(r"(?ms)^:root\s*\{(.*?)^\}")
DARK_BLOCK = re.compile(r"(?ms)^:root\[data-theme=(?:'dark'|\"dark\")\]\s*\{(.*?)^\}")
DECLARATION = re.compile(r"(--gpc-[a-z0-9-]+)\s*:\s*([^;]+);")
REFERENCE = re.compile(r"^var\(\s*(--gpc-[a-z0-9-]+)\s*\)$")
HEX = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

failures = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global failures
    failures += 0 if ok else 1
    print(f"  [{'OK' if ok else 'FALLA'}] {name}" + (f" — {detail}" if detail else ""))


def themes(source: str) -> dict[str, dict[str, str]]:
    """Declaraciones por tema; el oscuro hereda del claro. Vacío si falta un bloque."""
    source = re.sub(r"(?s)/\*.*?\*/", "", source)
    light = LIGHT_BLOCK.search(source)
    dark = DARK_BLOCK.search(source)
    found: dict[str, dict[str, str]] = {}
    if light:
        found["claro"] = dict(DECLARATION.findall(light.group(1)))
    if light and dark:
        found["oscuro"] = found["claro"] | dict(DECLARATION.findall(dark.group(1)))
    return found


def color(tokens: dict[str, str], name: str) -> str | None:
    """Color hexadecimal de un token, siguiendo las referencias ``var(--gpc-…)``."""
    key = f"--gpc-{name}"
    seen: set[str] = set()
    while key in tokens and key not in seen:
        seen.add(key)
        value = tokens[key].strip()
        reference = REFERENCE.match(value)
        if not reference:
            return value if HEX.match(value) else None
        key = reference.group(1)
    return None


def luminance(value: str) -> float:
    digits = value.lstrip("#")
    if len(digits) == 3:
        digits = "".join(c * 2 for c in digits)
    channels = (int(digits[i : i + 2], 16) / 255 for i in (0, 2, 4))
    r, g, b = (c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(first: str, second: str) -> float:
    high, low = sorted((luminance(first), luminance(second)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def palette(name: str, tokens: dict[str, str]) -> None:
    print(f"Tema {name}")
    for foreground, background, minimum, use in PAIRS:
        pair = f"{foreground} sobre {background}"
        first, second = color(tokens, foreground), color(tokens, background)
        if first is None or second is None:
            missing = foreground if first is None else background
            check(pair, False, f"falta «--gpc-{missing}» o no es un color hexadecimal ({use})")
            continue
        value = ratio(first, second)
        check(pair, value >= minimum, f"{value:.2f}:1 (mínimo {minimum}) · {first} / {second} · {use}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tokens", type=Path, default=TOKENS)
    args = parser.parse_args()
    found = themes(args.tokens.read_text(encoding="utf-8"))
    print("Bloques de tema")
    check("existe el tema claro («:root»)", "claro" in found)
    check("existe el tema oscuro («:root[data-theme='dark']»)", "oscuro" in found)
    for theme, declarations in found.items():
        palette(theme, declarations)
    print(f"\n{'Todo en orden.' if not failures else f'{failures} comprobación(es) fallaron.'}")
    sys.exit(1 if failures else 0)
