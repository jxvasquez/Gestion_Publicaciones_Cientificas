# Implementation Plan: Tema claro y oscuro descansado y pulido visual de las vistas

**Branch** `005-ui-theme-polish` (referencia; se integra en `dev/jostin-setup`) | **Date** 2026-11-25 | **Spec** [spec.md](spec.md)

**Input** `specs/005-ui-theme-polish/spec.md`

## Summary

Agregar a la SPA un tema oscuro en tonos pizarra y suavizar el claro sin tocar el backend:

- Los **tokens** `--gpc-*` conservan su nombre y su rol. `:root` define el tema claro y `:root[data-theme='dark']` redefine solo los colores. Un token nuevo, `--gpc-on-accent`, reemplaza el uso de `--gpc-surface-alt` como color de texto sobre rellenos.
- El **arranque sin parpadeo** lo resuelve `frontend/public/theme-init.js`, un script externo del mismo origen que `index.html` carga de forma síncrona en `<head>`. Respeta la CSP `script-src 'self'` sin modificarla. `ThemeService` toma el relevo dentro de Angular y el botón de la cabecera lo controla.
- El **pulido visual** agrega avatar con iniciales, iconos en las métricas del Administrador, un indicador de etapas para el Autor y barras de plazo y de cupo para el Revisor.
- La **limpieza de acciones** deja una sola acción destacada por vista o tarjeta. Las secundarias pasan a `.btn--ghost` o `.btn--subtle` y los filtros extensos y «Dar de baja» a paneles `<details class="disclosure">`.

Todo se verifica con Vitest, `tsc`, el build de producción, un validador de contraste de la paleta y axe-core en ambos temas.

## Technical Context

| Aspecto | Contexto del repositorio |
| --- | --- |
| Lenguaje y versiones | TypeScript 6.0, Angular 22.2 standalone con señales y SCSS. JavaScript sin transpilar para `theme-init.js`, compatible con cualquier navegador que ya soporta la SPA. Python 3 para los scripts de verificación. |
| Dependencias | Sin dependencias nuevas. Iconos en el sprite vigente `frontend/public/icons/ui.svg`. |
| Almacenamiento | `localStorage` del navegador con la clave `gpc-theme`. Sin cambios en PostgreSQL ni en la API. |
| Pruebas | Vitest 5 con jsdom (`TZ=UTC npx ng test --watch=false`; línea base de 76 archivos y 1198 pruebas). Playwright 1.64.1 y `@axe-core/playwright` 4.11 en el stack aislado de `scripts/e2e.sh` (39 pruebas en verde al cerrar 004). `scripts/check_frontend_build.py` para el build. |
| Plataforma | Docker Compose. Nginx sirve la SPA desde `/usr/share/nginx/html` con `try_files` y la CSP `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; …` de `nginx/conf.d/default.conf`. |
| Tipo de proyecto | Aplicación web. Este cambio solo toca `frontend/` y dos scripts de verificación en `scripts/`. |
| Rendimiento | `theme-init.js` menor de 1 kB y sin peticiones. Presupuestos de `frontend/angular.json`: aviso a 500 kB y error a 1 MB en el paquete inicial, y 4 y 8 kB por hoja de componente. |
| Restricciones | WCAG 2.1 AA en ambos temas (la suite conserva las etiquetas de 2.2 AA). Sin `<script>` en línea. Doble ciego en DOM y árbol accesible. Sin selector de rol. Sin cambios en el inicio de sesión, los correos, la API, los guards ni las rutas. |
| Escala | 2 temas con 33 tokens de color cada uno (30 vigentes y 3 nuevos). 23 pantallas en el inventario de `frontend/e2e/support/world.ts`. Cuatro unidades nuevas en la SPA (servicio de tema, botón, indicador de etapas y utilidad de iniciales), un script de arranque y un validador de contraste. |

Referencias: [package.json](../../frontend/package.json) · [angular.json](../../frontend/angular.json) · [tokens](../../frontend/src/styles/_tokens.scss) · [CSP de Nginx](../../nginx/conf.d/default.conf) · [E2E](../../scripts/e2e.sh).

## Constitution Check

*Control previo a la fase 0 y reevaluación tras el diseño de la fase 1. Resultado: sin violaciones.*

| Principio | Resultado |
| --- | --- |
| Arquitectura y Docker | Cumple. Los cambios quedan en `frontend/` y `scripts/`. La imagen de Nginx copia el build igual que hoy; `theme-init.js` viaja en `public/`. |
| Stack restrictivo | Cumple. Angular y SCSS, sin librerías de temas, iconos ni componentes. |
| Idioma | Cumple. Identificadores, clases y claves en inglés (`ThemeService`, `gpc-theme`, `.disclosure`). Textos de interfaz, comentarios, documentación y commits en español. |
| SOLID, KISS, DRY y YAGNI | Cumple. Un solo juego de tokens con dos valores. Una sola fuente del tema en la SPA. Utilidades globales reutilizadas (`.disclosure`, `.meter-bar`, `.btn--subtle`) en lugar de estilos por vista. Funciones puras para etapas, plazo e iniciales. Fuera de alcance: temas personalizables y preferencia por cuenta. |
| Documentación | Cumple en diseño. Se actualizan la guía de primeros pasos, la página de pruebas y la de seguridad de `docs-site/`. |
| Semántica visual | Cumple. Verde, amarillo, rojo y azul o gris conservan su rol en ambos temas y siempre van con texto. Las acciones destructivas conservan el rojo en su diálogo y en su panel. |
| Doble ciego | Cumple. El indicador de etapas, las barras y el avatar solo usan datos que la vista ya recibe. Las iniciales son las de la persona autenticada. `04-fuga-de-identidad.e2e.ts` lo vuelve a verificar. |
| Solo PDF, versionado e integridad | No aplica. Sin cambios en carga, versiones ni baja lógica. La baja solo cambia de lugar en la interfaz. |

[Constitución](../../.spec-kit/constitution.md).

## Project Structure

### Documentation (this feature)

```text
specs/005-ui-theme-polish/
├── spec.md
├── plan.md
└── tasks.md
```

No se generan `research.md`, `data-model.md`, `contracts/` ni `quickstart.md`: no hay cambios de datos ni de API. Las decisiones de investigación quedan en la fase 0 de este plan y los escenarios de verificación en `tasks.md`.

### Source Code (repository root)

```text
frontend/
├── public/
│   ├── theme-init.js                      # nuevo: tema antes del primer pintado
│   └── icons/ui.svg                       # sun, moon, user, hourglass, check
├── src/
│   ├── index.html                         # <script src="theme-init.js"> síncrono en <head>
│   ├── styles/_tokens.scss                # claro refinado y :root[data-theme='dark']
│   ├── styles.scss                        # on-accent, backdrop y utilidades compartidas
│   └── app/
│       ├── app.component.ts               # activa ThemeService en todas las rutas
│       ├── core/theme/theme.service.ts    # nuevo
│       ├── core/layout/
│       │   ├── theme-toggle.component.*   # nuevo
│       │   ├── header.component.*         # avatar e integración del botón
│       │   ├── shell.component.*          # iniciales desde AuthStore
│       │   └── notification-bell.component.scss
│       ├── core/models/manuscript.model.ts                  # editorialStages()
│       ├── shared/utils/initials.ts       # nuevo
│       ├── shared/components/{kpi-card,pdf-viewer}.component.*
│       └── features/
│           ├── dashboard/{admin,reviewer,author}-summary/
│           ├── author/editorial-progress/ # nuevo
│           ├── author/{manuscript-detail,manuscript-list,manuscript-form,version-history}/
│           ├── reviewer/{deadline-countdown,assignment-detail,reviewer-standing,evaluation-form}/
│           ├── notifications/notification-list/
│           ├── admin/{audit-filters,area-catalog,reviewer-roster,incident-list}/
│           └── catalog/catalog-search/
└── e2e/
    ├── 02-ciclo-completo.e2e.ts · 05-accesibilidad.e2e.ts · 06-teclado.e2e.ts
    ├── 08-tema-y-acciones.e2e.ts          # nuevo
    └── support/{a11y,ui}.ts
scripts/
├── check_theme_contrast.py                # nuevo: valida la paleta de ambos temas
└── check_frontend_build.py                # sin <script> en línea y orden de arranque
docs-site/usuarios/primeros-pasos.qmd · docs-site/ingenieria/{pruebas,seguridad}.qmd
```

**Structure Decision**. Se conserva la organización de 003 y 004. `ThemeService` vive en `core/theme/` porque es infraestructura de toda la SPA. El botón vive en `core/layout/` junto a la campana, su único lugar de uso. El indicador de etapas es propio del Autor y vive en `features/author/`; su lógica es una función pura de `manuscript.model.ts`, junto a `nextAction()`. Los estilos que comparten varias vistas van a `styles.scss`, porque el encapsulado de Angular no aplica los estilos de `KpiCardComponent` al contenido proyectado y porque los presupuestos de 4 kB por hoja de componente desaconsejan repetirlos.

## Fase 0 — Hallazgos y decisiones

Cada hallazgo se verificó en el repositorio en `HEAD` (`9297dbe`).

- **R-01. CSP y script de arranque.** `nginx/conf.d/default.conf` aplica `script-src 'self'` en sus tres bloques y `backend/tests/test_openapi.py` ya vigila que no haya scripts en línea en la documentación de la API. Un `<script>` en línea en `index.html` se bloquearía. **Decisión**: archivo externo `frontend/public/theme-init.js`, que `angular.json` copia tal cual con el glob de `public/`, cargado sin `defer` ni `async` en `<head>`. **Alternativas descartadas**: un hash `sha256` en la CSP, que obliga a tocar Nginx y a sincronizar el hash con cada cambio, y un inicializador de Angular, que corre después del primer pintado y produce el destello.
- **R-02. Caché del script.** Los archivos de `public/` no llevan hash y `location /` no fija `Cache-Control`. **Decisión**: mantener el script mínimo y estable. Si cambia su contrato, se referencia con una consulta de versión (`theme-init.js?v=2`), que `try_files $uri` resuelve igual.
- **R-03. Roles de los tokens.** En las hojas actuales, `-900`, `-800` y `-700` se usan como tintas de primer plano y bordes, y `-100` y `-50` como fondos, con una excepción: `--gpc-surface-alt` como color de texto sobre rellenos en `styles.scss` (`.btn--primary`, `.btn--success`, `.btn--danger` y `.skip-link`), `notification-bell.component.scss` y `notification-list.component.scss`. **Decisión**: invertir la luminosidad de cada escala en oscuro conservando nombres y roles, y crear `--gpc-on-accent`. Con esto, ninguna hoja de componente necesita reglas propias por tema.
- **R-04. Colores fuera de los tokens.** `evaluation-form.component.scss` usa tokens inexistentes con respaldo claro (`--gpc-info-border`, `--gpc-info-bg` y `--gpc-focus`) y respaldos literales (`#c9ced6` y `#4a5260`). `reviewer-standing.component.scss` repite el respaldo `#c9ced6`. El telón de los diálogos es el literal `rgb(23 42 74 / 45%)`. En oscuro, la opción marcada de la rúbrica quedaría con texto claro sobre fondo claro. **Decisión**: reemplazarlos por `--gpc-primary-700`, `--gpc-primary-50`, `--gpc-focus-ring`, `--gpc-border`, `--gpc-text-muted` y un token `--gpc-backdrop`.
- **R-05. Paleta validada.** Se calcularon con la fórmula de luminancia relativa de WCAG 2.1 los 57 pares de texto y no textuales que usa la interfaz, en ambos temas: cero fallos. Los valores y ratios están en la fase 1. `scripts/check_theme_contrast.py` repetirá el cálculo leyendo `_tokens.scss` para que una edición futura no rompa el contraste.
- **R-06. Patrón del botón de tema.** Un botón conmutador con nombre constante y `aria-pressed` sigue el patrón de botón del WAI-ARIA APG. Un nombre que cambia («Cambiar a tema claro») se anunciaría como otro control al pulsarlo. **Decisión**: `aria-label="Tema oscuro"` con `aria-pressed`.
- **R-07. Barras.** `<meter>` y `<progress>` se dibujan distinto en cada navegador y no admiten el tono semántico con tokens. axe-core 4.11 conoce `role="meter"` y su regla `aria-meter-name`. **Decisión**: barra con `role="meter"`, nombre y `aria-valuetext` para el plazo, que no tiene otra expresión porcentual. Barra decorativa (`aria-hidden="true"`) para el cupo, que ya se anuncia como «3 de 5».
- **R-08. Indicador de etapas.** Una lista ordenada con `aria-current="step"` es el patrón reconocido por los lectores de pantalla para pasos de un proceso. **Decisión**: `<ol>` con nombre «Progreso del ciclo editorial» y un texto oculto por etapa («completada», «etapa actual», «pendiente»), además de un icono de verificación en las completadas.
- **R-09. Iniciales.** `SessionUser` ya trae `first_name` y `last_name`. Partir `full_name` por espacios fallaría con apellidos compuestos. **Decisión**: primera letra de cada campo con `toLocaleUpperCase('es')`; con un solo campo, una letra; sin campos, icono `user`.
- **R-10. Pruebas que dependen de la estructura actual.**
  - `e2e/support/ui.ts`: `standingMetric()` y `activeSlots()` leen el primer `[aria-hidden="true"]` de `.kpi-card__metric`. Un icono decorativo en la métrica lo capturaría, así que se acotan a `dd`.
  - `02-ciclo-completo`, `05-accesibilidad` y `06-teclado` pulsan «Dar de baja» directamente. Abrirán antes «Más acciones».
  - `filterAudit()` llena «Acción» y «Manuscrito (id)». Abrirá antes «Filtros».
  - `04-fuga-de-identidad` filtra `summary` por «Mi cuenta», un texto que se conserva junto al avatar.
  - `07-responsive` revisa todo `summary`, `button` y `a[href]` visibles a 320 px.
  - En las pruebas unitarias: `manuscript-detail.component.spec.ts` busca «Dar de baja» en `.actions button` con `btn--danger`, por lo que el panel vive dentro de `.actions` y conserva la clase; `dashboard-summaries.spec.ts` compara el texto de `dt`, por lo que el icono no aporta texto; `manuscript-list.component.spec.ts` toma `a.btn--primary` como «Nuevo manuscrito»; y `manuscript-form.component.spec.ts` busca `button.btn--danger` para quitar autores.

## Fase 1 — Diseño

### Tokens de color

Solo cambian los colores. Tipografía, espaciado, radios y geometría siguen en el bloque `:root`. En el tema claro, los neutros pasan a la familia pizarra y los colores institucionales y semánticos no cambian.

| Token | Claro | Oscuro | Rol |
| --- | --- | --- | --- |
| `--gpc-surface` · `--gpc-workspace` | `#f8fafc` | `#0f172a` | Fondo base del documento y del área de trabajo |
| `--gpc-surface-alt` · `--gpc-sidebar-bg` | `#ffffff` | `#1e293b` | Tarjetas, diálogos, cabecera y barra lateral |
| `--gpc-border` · `--gpc-sidebar-divider` | `#e2e8f0` | `#334155` | Bordes de superficie y divisores (decorativos) |
| `--gpc-control-border` | `#64748b` | `#7b8aa0` | Límite funcional de campos y botones con borde |
| `--gpc-text` | `#1e293b` (antes `#1f2937`) | `#f1f5f9` | Texto principal |
| `--gpc-text-muted` | `#475569` (antes `#4b5563`) | `#b4c0cf` | Texto secundario |
| `--gpc-neutral-700` · `--gpc-neutral-100` | `#334155` · `#e2e8f0` | `#e2e8f0` · `#334155` | Insignia neutra |
| `--gpc-primary-900` · `-700` · `-100` · `-50` | `#172a4a` · `#1d4e89` · `#e4edf7` · `#f2f6fb` | `#cfe1fb` · `#7cb4f5` · `#203a5c` · `#1a2c47` | Títulos, enlaces y acento, insignia informativa, cabecera de tabla y hover |
| `--gpc-success-900` · `-700` · `-100` | `#0f5132` · `#146c33` · `#e2f4e7` | `#bbf0cf` · `#5fd08c` · `#173b2c` | Éxito y guardado |
| `--gpc-warning-900` · `-800` · `-700` · `-100` · `-50` | `#713f12` · `#8a4b0b` · `#a16207` · `#fdeed3` · `#fefce8` | `#fde7a6` · `#f8cf6a` · `#e0a93a` · `#3d2f14` · `#2c2312` | Advertencia |
| `--gpc-danger-900` · `-800` · `-700` · `-100` · `-50` | `#7f1d1d` · `#9b1c1c` · `#b3261e` · `#fce8e6` · `#fef2f2` | `#fed0d0` · `#fcaaaa` · `#f58b8b` · `#47212a` · `#33181f` | Error y acción destructiva |
| `--gpc-on-accent` (nuevo) | `#ffffff` | `#0f172a` | Texto e iconos sobre rellenos de acción |
| `--gpc-track` (nuevo) | `var(--gpc-neutral-100)` | `var(--gpc-neutral-100)` | Pista de las barras |
| `--gpc-backdrop` (nuevo) | `rgb(23 42 74 / 45%)` | `rgb(2 6 23 / 70%)` | Telón de los diálogos |
| `--gpc-shadow` · `--gpc-shadow-dialog` | Pizarra al 6–16 % | Negro al 35–55 % | Elevación |

Cada tema declara `color-scheme: light` o `color-scheme: dark` en su bloque. El foco sigue siendo `--gpc-focus-ring`, derivado de `--gpc-primary-700`.

**Ratios validados** (texto mínimo 4.5:1, no textual mínimo 3:1):

| Par | Claro | Oscuro |
| --- | --- | --- |
| Texto principal sobre base · sobre tarjeta | 13.98 · 14.63 | 16.30 · 13.35 |
| Texto secundario sobre tarjeta · aviso urgente · aviso vencido | 7.58 · 6.62 · 6.43 | 7.93 · 7.05 · 7.49 |
| Enlace sobre tarjeta · sobre hover | 8.39 · 7.72 | 6.76 · 6.49 |
| `--gpc-on-accent` sobre primario · éxito · peligro | 8.39 · 6.52 · 6.54 | 8.25 · 9.26 · 7.61 |
| Insignia `ACCEPTED` y «+10» | 8.17 | 9.70 |
| Insignia `CHANGES_REQUESTED` | 5.93 | 8.75 |
| Insignia `TIE_BREAKER` | 12.11 | 8.68 |
| Insignia `REJECTED` y «−20» | 6.92 | 7.55 |
| Texto de peligro sobre tarjeta · sobre hover | 6.54 · 6.02 | 6.23 · 5.98 |
| Borde de control sobre tarjeta · sobre base | 4.76 · 4.55 | 4.17 · 5.09 |
| Anillo de foco sobre base · sobre tarjeta | 8.02 · 8.39 | 8.25 · 6.76 |
| Relleno de barra (neutro · advertencia · peligro) sobre pista | 6.81 · 3.99 · 5.30 | 4.78 · 4.88 · 4.41 |

### Flujo del tema

1. **Antes de Angular.** El navegador ejecuta `theme-init.js` al leer `<head>`. El script, envuelto en una función autoejecutable y con cada acceso a `localStorage` y a `matchMedia` protegido con `try`, resuelve el tema según FR-005 y fija `document.documentElement.dataset.theme` en `light` o `dark`. La hoja global ya contiene ambos temas, así que el primer pintado usa los colores correctos.
2. **Arranque de la SPA.** `AppComponent` inyecta `ThemeService`, que queda activo también en las páginas públicas. El servicio lee el atributo como estado inicial (`theme`, una señal) y si existe una elección guardada (`explicit`). Si el script no cargó, resuelve el tema con la misma regla y fija el atributo.
3. **Elección de la persona.** `ThemeToggleComponent` llama a `toggle()`: el servicio fija el atributo, guarda el valor con `THEME_STORAGE_KEY = 'gpc-theme'` y marca la elección como explícita. Si guardar falla, el tema cambia igual en la pestaña.
4. **Cambios externos.** Sin elección explícita, el servicio escucha `matchMedia('(prefers-color-scheme: dark)')`. Con el evento `storage` de la misma clave adopta el tema elegido en otra pestaña. Los escuchas se registran solo si el entorno los ofrece, lo que mantiene las pruebas en jsdom.

La clave y los valores se repiten en `theme-init.js` con un comentario que remite a `theme.service.ts`. `scripts/check_frontend_build.py` comprueba en el build que el script existe, contiene la clave, se carga antes del paquete principal y que `index.html` no tiene scripts en línea.

### Mapa de cambios del frontend

| Archivo o carpeta | Cambio |
| --- | --- |
| `src/styles/_tokens.scss` | Valores claros refinados, `color-scheme`, `--gpc-on-accent`, `--gpc-track`, `--gpc-backdrop` y bloque `:root[data-theme='dark']`. |
| `src/styles.scss` | `--gpc-on-accent` en `.btn--primary`, `.btn--success`, `.btn--danger` y `.skip-link`. `--gpc-backdrop` en `dialog::backdrop`. Utilidades `.btn--subtle`, `.btn--danger-text`, `.btn--icon`, `.btn__icon`, `.disclosure` (resumen, flecha, conteo y panel), `.meter-bar` con tonos y `.avatar`. Bordes visibles con `forced-colors: active`. |
| `public/theme-init.js` · `src/index.html` | Script de arranque y su `<script src="theme-init.js">` síncrono en `<head>`. |
| `public/icons/ui.svg` | Símbolos `sun`, `moon`, `user`, `hourglass` y `check`, con `currentColor`. |
| `core/theme/theme.service.ts` | Servicio de FR-006 con `theme`, `isDark`, `toggle()` y `set()`. |
| `core/layout/theme-toggle.component.*` | Botón de FR-007 con `.btn--ghost.btn--icon`, `aria-label` constante y `aria-pressed`. |
| `core/layout/header.component.*` · `shell.component.*` | Entrada `userInitials`. El shell la calcula con `initialsOf()` desde `AuthStore`. Avatar decorativo y etiqueta «Mi cuenta» en el `summary`, que por debajo de 30 rem se oculta visualmente sin salir del árbol accesible. El botón de tema va entre la campana y la cuenta. |
| `core/layout/notification-bell.component.scss` · `features/notifications/notification-list/*.scss` | Texto sobre relleno con `--gpc-on-accent`. |
| `shared/utils/initials.ts` | `initialsOf({ first_name, last_name })` según R-09. |
| `app.component.ts` | Inyecta `ThemeService`. |
| `shared/components/kpi-card.component.*` | `KpiMetric.icon` opcional, dibujado en `dt` como icono decorativo. Con `max`, una barra decorativa tras «X/Y» y `KpiMetric.fullLabel` visible al llegar al máximo, con tono de advertencia. `KpiIcon` suma `incident` y `hourglass`. |
| `features/dashboard/admin-summary/*` | Iconos `incident` y `hourglass` en las dos métricas. Incidentes como `.btn--ghost`; Revisores, Carreras y Auditoría como `.btn--subtle`, en el mismo orden. |
| `features/dashboard/{reviewer,author}-summary/*` | Acceso principal como `.btn--ghost` y los demás como `.btn--subtle`. El cupo con `fullLabel: 'Cupo completo'`. |
| `core/models/manuscript.model.ts` | `editorialStages(manuscript)` según la tabla de etapas de la especificación: clave, rótulo, estado (`done`, `current` o `upcoming`) y tono. |
| `features/author/editorial-progress/*` | Componente del indicador con entrada `manuscript`, en horizontal desde 34 rem y en vertical por debajo. |
| `features/author/manuscript-detail/*` | Indicador bajo la cabecera. «Editar manuscrito» pasa a `.btn--ghost` y «Historial de versiones» a `.btn--subtle`. «Más acciones» (`details.disclosure.disclosure--more`) contiene una frase sobre la baja lógica y «Dar de baja» con `btn--danger`, dentro de `.actions`. |
| `features/reviewer/deadline-countdown/*` | Entrada opcional `assignedAt`. Función pura `remainingFraction(assignedAt, dueAt, now)`. Barra con `role="meter"` de FR-012 y línea «Asignada el». Tarjeta a ancho completo. |
| `features/reviewer/assignment-detail/*` | Bloque de contexto al inicio, con la tarjeta de plazo y la nota del doble ciego en una cuadrícula de dos columnas desde 48 rem. «Ver documento» como `.btn--ghost`, «Descargar PDF» y «Reportar posible fuga de identidad» como `.btn--subtle`. «Evaluar manuscrito» es la única primaria. |
| `features/reviewer/reviewer-standing/*` | Cupo con `fullLabel: 'Cupo completo'`. Respaldo literal retirado. |
| `features/reviewer/evaluation-form/*` | Tokens válidos en la rúbrica y el contador. En el aviso de borrador desactualizado, «Conservar mi texto» y «Usar la versión guardada» como `.btn--ghost` de igual peso. |
| `features/author/manuscript-list/*` | Filtros en `<details class="disclosure">` «Filtros» con conteo, abierto si `hasFilters()` o hay error. «Filtrar» como `.btn--ghost` y «Limpiar» como `.btn--subtle`. |
| `features/admin/audit-filters/*` | Filtros en el panel «Filtros», abierto con filtros activos o con un error. «Filtrar» sigue primaria y «Limpiar» pasa a `.btn--subtle`. |
| `features/catalog/catalog-search/*` | El buscador y «Buscar» quedan visibles. Carrera, palabra clave, idioma, fechas y orden pasan al panel «Filtros». «Limpiar» como `.btn--subtle`. |
| `features/author/version-history/*.html` · `shared/components/pdf-viewer.component.html` | «Descargar PDF exacto» y «Descargar» del visor como `.btn--ghost`. |
| `features/author/manuscript-form/*.html` | «Quitar autor N» como `.btn--subtle.btn--danger-text`. «Recargar datos» del aviso de conflicto como `.btn--ghost`. |
| `features/admin/area-catalog/*.html` · `reviewer-roster/*.html` | Acciones por fila como `.btn--subtle`; desactivar con `.btn--danger-text`. «Guardar» de la edición en línea como `.btn--ghost`. |
| `features/admin/incident-list/*.html` | Las tres resoluciones como `.btn--ghost`, las destructivas con `.btn--danger-text`. El diálogo de confirmación conserva el relleno rojo. |
| `e2e/support/{a11y,ui}.ts` | `withTheme(page, theme)` con `addInitScript`. Métricas acotadas a `dd`. `filterAudit()` abre «Filtros» si está plegado. Nueva `openMoreActions(page)`. |
| `e2e/05-accesibilidad.e2e.ts` | Cada recorrido corre en `light` y `dark`, con el tema en el nombre del hallazgo. Se agregan los paneles abiertos. |
| `e2e/02-ciclo-completo.e2e.ts` · `06-teclado.e2e.ts` | Abren «Más acciones» antes de «Dar de baja». El foco vuelve al botón dentro del panel abierto. |
| `e2e/08-tema-y-acciones.e2e.ts` (nuevo) | Tema por sistema, persistencia, sincronía entre pestañas, ausencia de destello con el paquete principal retrasado y conteo de acciones destacadas por vista. |

### Inventario de acciones destacadas

Se cuentan los rellenos `.btn--primary`, `.btn--success` y `.btn--danger` visibles a la vez, fuera de diálogos y de paneles «Más acciones» abiertos (`.disclosure--more`). Cada fila de tabla y cada elemento de lista cuenta por separado.

| Vista | Hoy | Después |
| --- | --- | --- |
| Detalle del manuscrito (borrador) | «Editar manuscrito» y «Enviar manuscrito», más «Dar de baja» en rojo | «Enviar manuscrito». Editar con borde y la baja en «Más acciones» |
| Detalle del manuscrito (otros estados) | «Editar manuscrito», cuando aplica, y «Dar de baja» en rojo | Ninguna o la de éxito del cargador de la nueva versión |
| Listado de manuscritos | «Nuevo manuscrito» y «Filtrar» | «Nuevo manuscrito» |
| Historial de versiones | Una primaria por versión | Ninguna |
| Formulario del manuscrito | «Guardar borrador», un «Quitar» rojo por autor y, en conflicto, «Recargar datos» | «Guardar borrador» |
| Detalle de la asignación | «Ver documento», «Evaluar manuscrito» y «Descargar» del visor | «Evaluar manuscrito» |
| Formulario de evaluación (borrador desactualizado) | «Conservar mi texto» y «Enviar evaluación» | «Enviar evaluación» |
| Incidentes | Dos rellenos rojos por reporte | Ninguna; la confirmación sigue en rojo |
| Carreras | «Crear», un rojo por fila activa y «Guardar» en línea | «Crear» |
| Listado de manuscritos (vacío o con error) | «Nuevo manuscrito» más «Registrar mi primer manuscrito», «Limpiar filtros» o «Reintentar» | «Nuevo manuscrito». Las acciones de los estados compartidos con borde |
| Catálogo (sin coincidencias o con error) | «Buscar» más «Limpiar filtros» o «Reintentar» | «Buscar» |
| Auditoría (con error) | «Filtrar» más «Reintentar» | «Filtrar» |
| Carreras (con error) | «Crear carrera» más «Reintentar» | «Crear carrera» |
| Padrón, detalle del evento, avisos, ficha, inicio de sesión y panel | Una o ninguna | Sin cambios de jerarquía |

Las filas de estados vacío y de error se resuelven en `shared/components/empty-state.component.html` y `error-state.component.html`, cuya acción pasa a `.btn--ghost` (T059).

### Presentación y accesibilidad

- El botón de tema mide 40 × 40 px, tiene foco visible y su icono es decorativo. La cabecera conserva el orden de lectura: título, roles, campana, tema, cuenta y cierre de sesión.
- El avatar mide 1.75 rem, usa `--gpc-primary-100` con texto `--gpc-primary-900` (12.11:1 en claro y 8.68:1 en oscuro) y tiene `aria-hidden="true"`.
- `.disclosure > summary` se dibuja como `.btn--ghost` con flecha y conteo («Filtros · 2»). El panel es un `<details>` nativo, operable con Intro y Espacio sin JavaScript. Su estado inicial se enlaza a `[open]` y la persona puede cambiarlo después.
- Las barras siempre van con texto: tiempo restante, «Próximo a vencer», «Plazo vencido», «X/Y» y «Cupo completo». No se animan con `prefers-reduced-motion: reduce`.
- El indicador de etapas usa círculos con número o verificación, una línea de conexión y el rótulo de la etapa. La etapa actual tiene un anillo de 3 px y negrita, además de `aria-current`. Por debajo de 34 rem la lista es vertical.
- Con `forced-colors: active`, las barras, el avatar, los círculos de etapa y los resúmenes de los paneles reciben un borde `1px solid CanvasText`.

## Orden de implementación

1. Registrar la línea base de frontend y E2E y el inventario de colores y acciones.
2. Tokens, utilidades globales, correcciones de colores fuera de tokens, iconos y validador de contraste (fundamentos).
3. Script de arranque, `ThemeService`, botón y comprobaciones del build (US1).
4. Contraste y axe en ambos temas (US2).
5. Avatar e iconos del Administrador (US3).
6. Indicador de etapas (US4).
7. Barras de plazo y de cupo (US5).
8. Limpieza de acciones y paneles plegables (US6).
9. Documentación, E2E completos y verificación final.

## Estrategia de verificación

| Criterio | Evidencia |
| --- | --- |
| SC-001 | `05-accesibilidad.e2e.ts` en `light` y `dark` con las etiquetas `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` y `wcag22aa`, incluidos diálogos y paneles abiertos. |
| SC-002 | `scripts/check_theme_contrast.py` sobre `_tokens.scss` con el inventario de pares de la fase 1. axe cubre los colores computados en pantalla. Ratios registrados en `tasks.md`. |
| SC-003 | `theme.service.spec.ts` y `theme-toggle.component.spec.ts` con almacenamiento simulado y fallido. `08-tema-y-acciones.e2e.ts` con `emulateMedia`, recarga, pestaña nueva y el paquete principal retrasado con `page.route`. |
| SC-004 | `06-teclado.e2e.ts` y `07-responsive.e2e.ts` sobre el inventario de pantallas, que incluye el botón, el avatar, los paneles y las barras. |
| SC-005 | `manuscript.model.spec.ts` (siete estados y baja), `editorial-progress.component.spec.ts`, `deadline-countdown.component.spec.ts` (`remainingFraction()` y tonos) y `kpi-card.component.spec.ts` (0, 3 y 5 de 5). |
| SC-006 | Conteo de acciones destacadas por vista en `08-tema-y-acciones.e2e.ts` y aserciones en las pruebas unitarias de cada vista modificada. |
| SC-007 | `TZ=UTC npx ng test --watch=false`, `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npx ng build --configuration production`, `python3 scripts/check_frontend_build.py` y `./scripts/e2e.sh`, incluido `04-fuga-de-identidad.e2e.ts`. |

### Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Destello del tema claro al arrancar | Script síncrono en `<head>`, prueba E2E con el paquete principal retrasado y comprobación del orden en el build. |
| Una hoja futura usa un color de superficie como texto o un literal | Inventario por búsqueda en la fase 1 de tareas, validador de contraste y axe en ambos temas en cada E2E. |
| Selectores de pruebas que dependen de la estructura actual | Inventario R-10. El panel «Más acciones» vive dentro de `.actions` y los ayudantes de E2E abren los paneles antes de usarlos. |
| Hojas de componente por encima del presupuesto de 4 kB | Utilidades en `styles.scss` y componentes nuevos con hojas mínimas. El build de producción lo verifica. |
| `matchMedia` o `localStorage` ausentes o bloqueados | Accesos protegidos con `try`, comprobación de existencia y pruebas con almacenamiento que falla. |
| Script de arranque en caché tras un cambio de contrato | Consulta de versión en la referencia de `index.html` (R-02). |

## Complexity Tracking

Sin violaciones de la constitución. El único archivo fuera del árbol de Angular, `theme-init.js`, es la forma de aplicar el tema antes del primer pintado sin debilitar la CSP. El validador de contraste es un script de verificación como los que ya existen en `scripts/`.
