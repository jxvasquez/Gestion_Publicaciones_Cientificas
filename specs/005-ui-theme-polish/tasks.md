---

description: "Tareas de implementación del tema claro y oscuro descansado y del pulido visual de las vistas"
---

# Tasks: Tema claro y oscuro descansado y pulido visual de las vistas

**Input**: Documentos de diseño de `specs/005-ui-theme-polish/`: [spec.md](spec.md) y [plan.md](plan.md).

**Prerequisites**: `plan.md` y `spec.md`. No hay `research.md`, `data-model.md`, `contracts/` ni `quickstart.md`: la funcionalidad no cambia datos ni API, y sus decisiones están en la fase 0 de [plan.md](plan.md#fase-0--hallazgos-y-decisiones).

**Tests**: Incluidas. La especificación define criterios medibles (SC-001 a SC-007) y el repositorio mantiene Vitest, Playwright con axe-core y scripts de verificación. En cada historia las pruebas se escriben primero y deben fallar antes de implementar.

**Organization**: La fase 1 registra la línea base y los inventarios. La fase 2 deja los tokens de ambos temas, las utilidades compartidas y el validador de contraste. Las fases 3 a 8 implementan US1 a US6 en orden de prioridad. La fase 9 cierra colores forzados, documentación, E2E y verificación.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede ejecutarse en paralelo con otras tareas `[P]` de su bloque, porque toca archivos distintos y sus prerrequisitos están completos.
- **[Story]**: historia de la especificación (US1 a US6). Las fases 1, 2 y 9 no llevan etiqueta.
- Todas las rutas parten de la raíz del repositorio.

## Path Conventions

- Frontend: `frontend/src/app/`, estilos globales en `frontend/src/styles.scss` y `frontend/src/styles/_tokens.scss`, recursos en `frontend/public/` y E2E en `frontend/e2e/`. Los comandos de Angular y Playwright corren desde `frontend/`.
- Scripts de verificación en `scripts/`, ejecutados desde la raíz con `python3`.
- Reglas transversales: identificadores, clases y claves en inglés y textos en español. Todo color sale de un token `--gpc-*` (FR-003). Ninguna plantilla, atributo ni texto accesible agrega identidades restringidas (FR-019). Los componentes nuevos son standalone, con plantilla y estilo hermanos (`templateUrl` y `styleUrl`) como en 003 y 004. Los estilos que comparten varias vistas van a `frontend/src/styles.scss`.

---

## Phase 1: Setup (línea base)

**Purpose**: registrar el comportamiento previo y los puntos que la funcionalidad va a cambiar.

- [x] T001 Registrar la línea base del frontend sobre `9297dbe`. Desde `frontend/`, ejecutar `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npx ng build --configuration production` y `TZ=UTC npx ng test --watch=false`. Desde la raíz, ejecutar `python3 scripts/check_frontend_build.py`. Anotar en «Resultados de verificación» el tamaño del paquete inicial, los avisos de presupuesto por hoja de componente de `frontend/angular.json` y las pruebas aprobadas.
- [x] T002 [P] Registrar la línea base E2E con `./scripts/e2e.sh` y `frontend/playwright.config.ts`: número de pruebas, duración y hallazgos de `frontend/e2e/05-accesibilidad.e2e.ts`, `06-teclado.e2e.ts` y `07-responsive.e2e.ts`. Anotar en `specs/005-ui-theme-polish/tasks.md` los selectores que cambiarán según R-10 de [plan.md](plan.md).
- [x] T003 [P] Inventariar los colores fuera de los tokens con `grep -rnE "color: var\(--gpc-surface-alt\)" frontend/src`, `grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(|rgb\(" frontend/src --include=*.scss | grep -v _tokens.scss` y la comparación de `grep -rhoE "var\(--gpc-[a-z0-9-]+" frontend/src | sort -u` con los tokens declarados en `frontend/src/styles/_tokens.scss`. Registrar la lista por archivo y confirmar R-03 y R-04.
- [x] T004 [P] Inventariar las acciones destacadas con `grep -rnE "btn--(primary|success|danger)" frontend/src/app --include=*.html` y confirmar o corregir la tabla «Inventario de acciones destacadas» de [plan.md](plan.md#inventario-de-acciones-destacadas) antes de la fase 8.

---

## Phase 2: Foundational (tokens, utilidades e iconos)

**Purpose**: dejar ambos temas definidos y verificables y las utilidades que reutilizan las historias. Sin el botón todavía, el tema oscuro se activa a mano con `document.documentElement.dataset.theme = 'dark'`.

**⚠️ CRITICAL**: ninguna historia puede empezar antes de cerrar esta fase.

### Pruebas de fundamentos

- [x] T005 Crear `scripts/check_theme_contrast.py`, con el estilo de `scripts/check_frontend_build.py` (una función `check()` y código de salida 1 si algo falla). Lee `frontend/src/styles/_tokens.scss`, extrae los bloques `:root` y `:root[data-theme='dark']`, hereda en el oscuro los tokens no redefinidos y resuelve las referencias `var(--gpc-…)`. Calcula el contraste con la luminancia relativa de WCAG 2.1 para el inventario de pares de la tabla «Ratios validados» de [plan.md](plan.md#tokens-de-color), más el avatar (`--gpc-primary-900` sobre `--gpc-primary-100`). Exige 4.5:1 en texto y 3:1 en no textuales e imprime una tabla por tema. Falla si falta el bloque oscuro o un token del inventario. Debe fallar antes de T006.

### Implementación de fundamentos

- [x] T006 Modificar `frontend/src/styles/_tokens.scss` con los valores de la tabla «Tokens de color» de [plan.md](plan.md#tokens-de-color). En `:root`: `color-scheme: light`, superficies `#f8fafc` y `#ffffff`, bordes `#e2e8f0`, neutros pizarra, `--gpc-on-accent`, `--gpc-track`, `--gpc-backdrop` y sombras suaves. Agregar `:root[data-theme='dark']` con `color-scheme: dark` y solo los colores. Un comentario de cabecera explica que `-900`, `-800` y `-700` son tintas de primer plano, `-100` y `-50` son fondos y el contenido sobre rellenos usa `--gpc-on-accent`.
- [x] T007 Modificar `frontend/src/styles.scss`. Usar `--gpc-on-accent` en `.btn--primary`, `.btn--success`, `.btn--danger` y `.skip-link`, y `--gpc-backdrop` en `:where(dialog)::backdrop`. Agregar las utilidades del mapa de cambios: `.btn--subtle`, `.btn--danger-text`, `.btn--icon`, `.btn__icon`, `.disclosure` (resumen como botón, flecha, `.disclosure__count` y `.disclosure__panel`), `.meter-bar` y `.meter-bar__fill` con los tonos `--success`, `--warning` y `--danger`, y `.avatar`. Desactivar transiciones de las barras con `prefers-reduced-motion: reduce`.
- [x] T008 [P] Reemplazar `color: var(--gpc-surface-alt)` por `var(--gpc-on-accent)` en `frontend/src/app/core/layout/notification-bell.component.scss` y `frontend/src/app/features/notifications/notification-list/notification-list.component.scss`.
- [x] T009 [P] Reemplazar en `frontend/src/app/features/reviewer/evaluation-form/evaluation-form.component.scss` `--gpc-info-border`, `--gpc-info-bg` y `--gpc-focus` por `--gpc-primary-700`, `--gpc-primary-50` y `--gpc-focus-ring`, y retirar los respaldos literales de ese archivo y de `frontend/src/app/features/reviewer/reviewer-standing/reviewer-standing.component.scss`.
- [x] T010 [P] Agregar a `frontend/public/icons/ui.svg` los símbolos `sun`, `moon`, `user`, `hourglass` y `check`, con `viewBox="0 0 24 24"`, `stroke="currentColor"` y `stroke-width="1.75"`, como los vigentes.
- [x] T011 Ejecutar `python3 scripts/check_theme_contrast.py`, que ahora debe pasar, y `TZ=UTC npx ng test --watch=false` y `npx ng build --configuration production` desde `frontend/`. Registrar la tabla de ratios por tema en «Resultados de verificación».

**Checkpoint**: ambos temas existen, cumplen el contraste en el validador y el tema claro no pierde pruebas.

---

## Phase 3: User Story 1 - Elegir un tema claro u oscuro y conservarlo (Priority: P1) 🎯 MVP

**Goal**: la persona alterna el tema desde la cabecera, la elección persiste y el primer pintado ya usa el tema correcto, sin `<script>` en línea.

**Independent Test**: con el sistema operativo en claro y en oscuro, sin preferencia y con preferencia guardada, abrir `/login` y el panel, alternar, recargar, abrir otra pestaña y bloquear el almacenamiento (escenarios 1 a 5 de US1).

### Tests for User Story 1 ⚠️

- [x] T012 [P] [US1] Crear `frontend/src/app/core/theme/theme.service.spec.ts` con `localStorage` y `matchMedia` simulados:
  - Estado inicial tomado del atributo `data-theme` que fijó el script.
  - Sin atributo: valor guardado válido, valor inválido, `prefers-color-scheme: dark` y ninguna preferencia.
  - `toggle()` fija el atributo, guarda `gpc-theme` y marca la elección como explícita.
  - Un `setItem` que lanza no impide el cambio ni produce errores.
  - Sin elección explícita sigue el cambio de `matchMedia`; con elección lo ignora.
  - El evento `storage` de la clave `gpc-theme` adopta el tema de otra pestaña y el de otras claves se ignora.
  - Un entorno sin `matchMedia` no produce errores.
- [x] T013 [P] [US1] Crear `frontend/src/app/core/layout/theme-toggle.component.spec.ts`. Es un `button` de tipo `button` con `aria-label="Tema oscuro"` constante, `aria-pressed` en `false` o `true` según el tema, icono `moon` en claro y `sun` en oscuro con `aria-hidden="true"`, clases `btn--ghost` y `btn--icon`, y al pulsarlo llama a `toggle()`.
- [x] T014 [P] [US1] Actualizar `frontend/src/app/core/layout/shell.component.spec.ts`. La cabecera muestra el botón de tema entre la campana y «Mi cuenta» y sigue sin `select` ni `[role="listbox"]`.
- [x] T015 [P] [US1] Ampliar `scripts/check_frontend_build.py` con la sección «Arranque del tema». En `dist/gpc-frontend/browser/index.html`, `<script src="theme-init.js">` va en `<head>`, sin `defer`, `async` ni `type="module"`, antes de cualquier script de módulo. Ningún `<script>` tiene cuerpo en línea, con la misma expresión de `backend/tests/test_openapi.py`. `theme-init.js` existe, contiene `gpc-theme` y pesa menos de 1 kB. Debe fallar antes de T017.
- [x] T016 [P] [US1] Crear `frontend/e2e/08-tema-y-acciones.e2e.ts` con las pruebas del tema:
  - `emulateMedia({ colorScheme: 'dark' })` sin preferencia da `data-theme="dark"` en `/login` y en el panel; con `light`, `data-theme="light"`.
  - El botón de la cabecera cambia el atributo y `aria-pressed`. La elección persiste al recargar, aun con el sistema en el tema contrario, y en una página nueva del mismo contexto.
  - Dos páginas del mismo contexto: alternar en una cambia la otra sin recargar.
  - Sin destello: con `page.route` que retrasa 1.5 s el paquete `main-*.js` y `gpc-theme=dark` guardado, en `domcontentloaded` el atributo ya es `dark` y `app-root` todavía no tiene hijos.
  - Con `Storage.prototype.getItem` y `setItem` que lanzan (`addInitScript`), la aplicación carga, el botón cambia el tema y no hay `pageerror`.

### Implementation for User Story 1

- [x] T017 [US1] Crear `frontend/public/theme-init.js` según el paso 1 del «Flujo del tema» de [plan.md](plan.md#flujo-del-tema): función autoejecutable, accesos protegidos con `try`, valores `light` y `dark` y un comentario que remite a `THEME_STORAGE_KEY` de `theme.service.ts`. Agregar `<script src="theme-init.js"></script>` a `<head>` de `frontend/src/index.html`, sin `defer` ni `async`.
- [x] T018 [US1] Crear `frontend/src/app/core/theme/theme.service.ts` (`providedIn: 'root'`). Exporta `Theme`, `THEME_STORAGE_KEY = 'gpc-theme'` y la función pura `resolveTheme(stored, prefersDark)`. Expone `theme` y `isDark` como señales, `toggle()` y `set()`. Usa `DOCUMENT` y registra los escuchas de `matchMedia` y `storage` solo si existen. Al cambiar el tema, suspende las transiciones de color vigentes (`.btn` y la navegación lateral) para que el cambio no se anime (caso límite «Movimiento reducido» de [spec.md](spec.md#edge-cases)).
- [x] T019 [US1] Inyectar `ThemeService` en `frontend/src/app/app.component.ts` para que funcione también en las rutas públicas, y comprobar en `frontend/src/app/app.component.spec.ts` que al crear la raíz el atributo `data-theme` existe.
- [x] T020 [US1] Crear `frontend/src/app/core/layout/theme-toggle.component.ts`, `.html` y `.scss` según FR-007. Incorporarlo en `frontend/src/app/core/layout/header.component.html` y `.ts`, entre `app-notification-bell` y «Mi cuenta», y ajustar `header.component.scss` para que la sesión se reparta en varias líneas a 320 px.

**Checkpoint**: T012 a T016 pasan. El tema se elige, persiste y arranca sin destello. US1 se verifica sola.

---

## Phase 4: User Story 2 - Leer cualquier vista con contraste suficiente en ambos temas (Priority: P1)

**Goal**: cero infracciones WCAG A/AA en ambos temas, con los estados semánticos y los controles nativos legibles.

**Independent Test**: `05-accesibilidad.e2e.ts` en claro y en oscuro sobre todas las pantallas y diálogos, más la medición de estados interactivos (escenarios 1 a 4 de US2).

### Tests for User Story 2 ⚠️

- [x] T021 [P] [US2] Ampliar `frontend/e2e/support/a11y.ts` con `THEMES = ['light', 'dark'] as const`, `withTheme(page, theme)`, que guarda `gpc-theme` con `page.addInitScript` antes de navegar, y `expectTheme(page, theme)`, que comprueba el atributo de `<html>`.
- [x] T022 [US2] Reescribir `frontend/e2e/05-accesibilidad.e2e.ts` para que los recorridos público, Autor, Revisor y Administrador corran en cada tema dentro de `test.describe(\`tema ${theme}\`)`. Cada hallazgo lleva el tema en su nombre y cada recorrido comprueba el tema antes de analizar. La prueba de control del contraste insuficiente corre una sola vez.
- [x] T023 [P] [US2] Agregar a `frontend/e2e/08-tema-y-acciones.e2e.ts` una medición de estilos computados en ambos temas. Para `.btn--primary`, `.btn--success`, `.btn--danger`, `.btn--ghost`, `.btn--subtle`, `.btn--danger-text`, enlaces, campos y las insignias de FR-004, medir el contraste de texto y fondo en reposo, con `hover()`, con `focus()` (anillo frente al fondo) y en error (`aria-invalid="true"`). Exigir 4.5:1 en texto y 3:1 en anillos y bordes, en el panel, el detalle del manuscrito, el detalle de la asignación y la auditoría.

### Implementation for User Story 2

- [x] T024 [US2] Ejecutar `./scripts/e2e.sh -g "tema|Accesibilidad|accesibilidad"` y corregir cada hallazgo solo con tokens: superficies públicas del inicio de sesión y del catálogo, marco del visor PDF, telón de los diálogos, cabeceras de tabla, enlace de salto y controles nativos con `color-scheme`. Registrar los hallazgos y su corrección por vista en «Resultados de verificación».
- [x] T025 [US2] Si T023 detecta un par de estado por debajo del mínimo, ajustar el token afectado en `frontend/src/styles/_tokens.scss` y agregar el par al inventario de `scripts/check_theme_contrast.py` para que no vuelva a fallar.

**Checkpoint**: axe sin infracciones y estados medidos en ambos temas. US1 y US2 forman un tema oscuro publicable.

---

## Phase 5: User Story 3 - Reconocer la sesión y el estado general de un vistazo (Priority: P2)

**Goal**: avatar con iniciales y roles en la cabecera, y métricas con iconos y accesos jerarquizados en la tarjeta del Administrador.

**Independent Test**: cuentas de un rol, multirrol y Administrador con nombres compuestos y con tildes, a 320 y 1366 px; tarjeta del Administrador con conteos en cero, positivos y ausentes (escenarios 1 a 4 de US3).

### Tests for User Story 3 ⚠️

- [x] T026 [P] [US3] Crear `frontend/src/app/shared/utils/initials.spec.ts`: «Marcela» y «Quizhpe Ordóñez» dan «MQ»; «ángel» y «ñuño» dan «ÁÑ»; solo nombre da una letra; solo apellido da una letra; vacíos o con espacios dan `null`; los espacios sobrantes se ignoran.
- [x] T027 [P] [US3] Actualizar `frontend/src/app/core/layout/shell.component.spec.ts`. Para «Ana López» el `summary` contiene `.avatar` con «AL» y `aria-hidden="true"` y el texto «Mi cuenta», y el menú muestra «Ana López». Sin nombre ni apellidos se muestra el icono `user`. Las insignias de rol no cambian.
- [x] T028 [P] [US3] Actualizar `frontend/src/app/shared/components/kpi-card.component.spec.ts`. Una métrica con `icon: 'incident'` dibuja dentro de `dt` un `svg` con `aria-hidden="true"` y `use[href="icons/ui.svg#incident"]`, y el texto de `dt` sigue siendo la etiqueta. Sin `icon` no hay `svg` en `dt`.
- [x] T029 [P] [US3] Actualizar `frontend/src/app/features/dashboard/dashboard-summaries.spec.ts`. La tarjeta del Administrador usa los iconos `incident` y `hourglass`. Los destinos conservan su orden: Incidentes con `btn--ghost` y Revisores, Carreras y Auditoría con `btn--subtle`. En Autor y Revisor, el primer acceso es `btn--ghost` y los demás `btn--subtle`. Se conservan los casos de cero y dato ausente.

### Implementation for User Story 3

- [x] T030 [US3] Crear `frontend/src/app/shared/utils/initials.ts` con `initialsOf(user: Pick<SessionUser, 'first_name' | 'last_name'> | null): string | null` según R-09.
- [x] T031 [US3] Agregar la entrada `userInitials` a `frontend/src/app/core/layout/header.component.ts`. En `header.component.html`, poner en el `summary` el avatar decorativo, o el icono `user`, y el texto «Mi cuenta» en `.app-header__account-label`. En `header.component.scss`, ocultar visualmente esa etiqueta por debajo de 30 rem sin quitarla del árbol accesible. Calcular las iniciales en `frontend/src/app/core/layout/shell.component.ts` con `initialsOf(store.user())` y pasarlas en `shell.component.html`.
- [x] T032 [US3] En `frontend/src/app/shared/components/kpi-card.component.ts`, agregar `incident` y `hourglass` a `KpiIcon` y `icon?: KpiIcon` a `KpiMetric`. Dibujar el icono en `dt` de `kpi-card.component.html` y su tamaño en `kpi-card.component.scss`.
- [x] T033 [US3] Actualizar `frontend/src/app/features/dashboard/admin-summary/admin-summary.component.html` con los iconos y la jerarquía de accesos de FR-009, y `reviewer-summary.component.html` y `author-summary.component.html` con el acceso principal con borde y los demás compactos.

**Checkpoint**: cabecera y panel identificables de un vistazo en ambos temas, sin selector de rol.

---

## Phase 6: User Story 4 - Seguir el progreso de mi manuscrito (Priority: P2)

**Goal**: indicador de cuatro etapas en el detalle del manuscrito, accesible y sin datos de los revisores.

**Independent Test**: detalle de manuscritos en los siete estados y uno dado de baja, con la vista y con el árbol accesible (escenarios 1 a 5 de US4).

### Tests for User Story 4 ⚠️

- [x] T034 [P] [US4] Ampliar `frontend/src/app/core/models/manuscript.model.spec.ts` con `editorialStages()`. Para cada fila de la «Tabla de etapas del ciclo editorial» de [spec.md](spec.md#tabla-de-etapas-del-ciclo-editorial), comprobar estado, rótulo y tono de las cuatro etapas, incluido el caso dado de baja con cada estado.
- [x] T035 [P] [US4] Crear `frontend/src/app/features/author/editorial-progress/editorial-progress.component.spec.ts`. Lista `ol` con `aria-label="Progreso del ciclo editorial"` y cuatro `li`. `aria-current="step"` solo en la actual. Texto oculto «completada», «etapa actual» o «pendiente» en cada etapa. Icono `check` en las completadas. Rótulos «En desempate», «Cambios solicitados», «Aceptado», «Rechazado» y «Dado de baja». Ningún texto de «Revisor».
- [x] T036 [P] [US4] Actualizar `frontend/src/app/features/author/manuscript-detail/manuscript-detail.component.spec.ts`. El indicador aparece bajo la cabecera en cada estado y refleja el estado nuevo tras el envío, sin recargar.

### Implementation for User Story 4

- [x] T037 [US4] Agregar a `frontend/src/app/core/models/manuscript.model.ts` la interfaz `EditorialStage` (`key`, `label`, `state` con `done`, `current` o `upcoming`, y `tone`) y la función pura `editorialStages(manuscript: Pick<Manuscript, 'status' | 'is_active'>)`, junto a `nextAction()`.
- [x] T038 [US4] Crear `frontend/src/app/features/author/editorial-progress/editorial-progress.component.ts`, `.html` y `.scss` con la entrada `manuscript`, en horizontal desde 34 rem y en vertical por debajo, con los marcadores y anillos de «Presentación y accesibilidad» de [plan.md](plan.md#presentación-y-accesibilidad).
- [x] T039 [US4] Mostrar `<app-editorial-progress>` bajo `.detail-header` en `frontend/src/app/features/author/manuscript-detail/manuscript-detail.component.html` e importarlo en `manuscript-detail.component.ts`.

**Checkpoint**: el Autor reconoce la etapa de su manuscrito en ambos temas. US4 se verifica sola.

---

## Phase 7: User Story 5 - Medir mi plazo y mi cupo como Revisor (Priority: P2)

**Goal**: barra del plazo restante en el detalle de la asignación y barra del cupo «X/5» en el panel y en «Mi desempeño».

**Independent Test**: asignaciones al inicio, a la mitad, con menos de 24 horas y vencidas; revisores con 0, 3 y 5 activas (escenarios 1 a 5 de US5).

### Tests for User Story 5 ⚠️

- [ ] T040 [P] [US5] Ampliar `frontend/src/app/features/reviewer/deadline-countdown/deadline-countdown.component.spec.ts`:
  - `remainingFraction()` da 1 al inicio, 0.5 a la mitad, 0 al vencer o después y `null` si la fecha límite no es posterior a la de asignación o alguna no es válida.
  - Con `assignedAt`, la barra tiene `role="meter"`, `aria-label="Plazo restante"`, `aria-valuenow="50"` y `aria-valuetext="Queda el 50 % del plazo"` a la mitad, y la línea «Asignada el».
  - Tono neutro, de advertencia por debajo de 24 horas y de peligro al vencer, también con `serverOffsetMs` distinto de cero.
  - Sin `assignedAt` no hay barra. Las pruebas vigentes del contador siguen pasando.
- [ ] T041 [P] [US5] Actualizar `frontend/src/app/features/reviewer/assignment-detail/assignment-detail.component.spec.ts`. Un bloque de contexto contiene el contador con `assignedAt` y la nota del doble ciego. Una asignación completada no muestra la barra.
- [ ] T042 [P] [US5] Ampliar `frontend/src/app/shared/components/kpi-card.component.spec.ts`. Con 3 de 5 hay una `.meter-bar` con `aria-hidden="true"` al 60 % y el primer `dd [aria-hidden="true"]` sigue siendo «3/5». Con 5 de 5 y `fullLabel`, la barra está llena, en tono de advertencia y con el texto visible. Un valor mayor que el máximo llena la barra sin superar el 100 %. Sin `max` no hay barra.
- [ ] T043 [P] [US5] Actualizar `frontend/src/app/features/reviewer/reviewer-standing/reviewer-standing.component.spec.ts` y `frontend/src/app/features/dashboard/dashboard-summaries.spec.ts`. «Cupo completo» aparece con 5 de 5 y la barra con 3 de 5.
- [ ] T044 [P] [US5] Acotar `standingMetric()` y `activeSlots()` de `frontend/e2e/support/ui.ts` a `dd`, para que un icono o una barra decorativos no cambien lo que leen.

### Implementation for User Story 5

- [ ] T045 [US5] Agregar a `frontend/src/app/features/reviewer/deadline-countdown/deadline-countdown.component.ts` la entrada opcional `assignedAt` y la función exportada `remainingFraction(assignedAt, dueAt, now)`. Dibujar la barra de FR-012 y la línea «Asignada el» en `deadline-countdown.component.html` y dar a la tarjeta el ancho completo en `deadline-countdown.component.scss`.
- [ ] T046 [US5] En `frontend/src/app/features/reviewer/assignment-detail/assignment-detail.component.html` y `.scss`, crear el bloque de contexto de FR-013, en dos columnas desde 48 rem, y pasar `[assignedAt]="a.assigned_at"` al contador.
- [ ] T047 [US5] Agregar `fullLabel?: string` a `KpiMetric` en `frontend/src/app/shared/components/kpi-card.component.ts` y dibujar la barra y el texto de FR-010 en `kpi-card.component.html`. Pasar `fullLabel: 'Cupo completo'` en `frontend/src/app/features/reviewer/reviewer-standing/reviewer-standing.component.html` y `frontend/src/app/features/dashboard/reviewer-summary/reviewer-summary.component.html`.

**Checkpoint**: plazo y cupo visibles con texto y barra en ambos temas. US5 se verifica sola.

---

## Phase 8: User Story 6 - Actuar sin fatiga de botones (Priority: P2)

**Goal**: una sola acción destacada por vista o tarjeta, con las secundarias compactas y los filtros extensos y la baja lógica en paneles plegables.

**Independent Test**: conteo automático de acciones destacadas en las 23 pantallas del inventario y uso con teclado de «Filtros» y «Más acciones» (escenarios 1 a 4 de US6).

### Tests for User Story 6 ⚠️

- [ ] T048 [P] [US6] Actualizar `frontend/src/app/features/author/manuscript-detail/manuscript-detail.component.spec.ts`. Dentro de `.actions` hay un `details.disclosure.disclosure--more` plegado con el resumen «Más acciones», que contiene «Dar de baja» con `btn--danger`. Al abrir el diálogo, el panel sigue abierto. «Editar manuscrito» tiene `btn--ghost` e «Historial de versiones» `btn--subtle`. En borrador, fuera de diálogos y de «Más acciones», solo hay una acción con relleno: «Enviar manuscrito».
- [ ] T049 [P] [US6] Actualizar `frontend/src/app/features/author/manuscript-list/manuscript-list.component.spec.ts`. Los filtros viven en `details.disclosure` «Filtros», plegado sin filtros y abierto con filtros desde la URL o con el error de rango de fechas. El resumen cuenta los filtros activos. «Filtrar» tiene `btn--ghost` y `a.btn--primary` sigue siendo «Nuevo manuscrito».
- [ ] T050 [P] [US6] Actualizar `frontend/src/app/features/admin/audit-filters/audit-filters.component.spec.ts`: panel «Filtros» abierto con filtros activos o con un error, conteo correcto y «Limpiar» con `btn--subtle`.
- [ ] T051 [P] [US6] Actualizar `frontend/src/app/features/catalog/catalog-search/catalog-search.component.spec.ts`. El buscador y «Buscar» quedan fuera del panel. Carrera, palabra clave, idioma, fechas y orden quedan dentro de «Filtros», que se abre si alguno llega por la URL. La sincronización con la URL no cambia.
- [ ] T052 [P] [US6] Actualizar las pruebas de las demás vistas del inventario:
  - `frontend/src/app/features/author/version-history/version-history.component.spec.ts`: sin `btn--primary`.
  - `frontend/src/app/shared/components/pdf-viewer.component.spec.ts`: «Descargar» con `btn--ghost`.
  - `frontend/src/app/features/reviewer/evaluation-form/evaluation-form.component.spec.ts`: en el aviso de borrador desactualizado, ambas opciones con `btn--ghost`.
  - `frontend/src/app/features/author/manuscript-form/manuscript-form.component.spec.ts`: «Quitar autor N» con `btn--subtle` y `btn--danger-text`, en lugar de `button.btn--danger`, y «Recargar datos» con `btn--ghost`.
  - `frontend/src/app/features/admin/area-catalog/area-catalog.component.spec.ts` y `reviewer-roster/reviewer-roster.component.spec.ts`: acciones por fila con `btn--subtle`, desactivar con `btn--danger-text` y «Guardar» en línea con `btn--ghost`.
  - `frontend/src/app/features/admin/incident-list/incident-list.component.spec.ts`: tres resoluciones con `btn--ghost`, las destructivas con `btn--danger-text` y la confirmación con relleno rojo.
- [ ] T053 [US6] Adaptar los E2E a los paneles. En `frontend/e2e/support/ui.ts`, agregar `openMoreActions(page)` y hacer que `filterAudit()` abra «Filtros» si está plegado. En `frontend/e2e/02-ciclo-completo.e2e.ts` y `05-accesibilidad.e2e.ts`, abrir «Más acciones» antes de «Dar de baja». En `frontend/e2e/06-teclado.e2e.ts`, abrir el panel con el teclado, comprobar el atrapado de foco y que al cerrar con Escape el foco vuelve a «Dar de baja» dentro del panel abierto. En `05-accesibilidad.e2e.ts`, analizar también «Filtros» abierto en mis manuscritos, auditoría y catálogo, y «Más acciones» abierto, en ambos temas.
- [ ] T054 [US6] Agregar a `frontend/e2e/08-tema-y-acciones.e2e.ts` el conteo de acciones destacadas en cada pantalla de `screens(world)`. Contar los `.btn--primary`, `.btn--success` y `.btn--danger` visibles fuera de `dialog` y de `details.disclosure--more[open]`, agrupados por la fila (`tr`) o el elemento de lista (`li`) más cercano. Cada grupo y el resto de la vista deben tener como máximo uno.

### Implementation for User Story 6

- [ ] T055 [US6] Reorganizar las acciones de `frontend/src/app/features/author/manuscript-detail/manuscript-detail.component.html` y `.scss` según el mapa de cambios: «Editar manuscrito» con borde, «Historial de versiones» compacto y «Más acciones» con una frase sobre la baja lógica y «Dar de baja».
- [ ] T056 [US6] Mover los filtros de `frontend/src/app/features/author/manuscript-list/manuscript-list.component.html` al panel «Filtros» con `[open]` enlazado a `hasFilters()` o al error de fechas. Agregar `activeFilterCount()` en `manuscript-list.component.ts` y ajustar la jerarquía de «Filtrar» y «Limpiar».
- [ ] T057 [US6] Mover los campos de `frontend/src/app/features/admin/audit-filters/audit-filters.component.html` al panel «Filtros», con conteo y apertura en `audit-filters.component.ts`, y «Limpiar» compacto.
- [ ] T058 [US6] En `frontend/src/app/features/catalog/catalog-search/catalog-search.component.html`, `.ts` y `.scss`, dejar visible el buscador con «Buscar» y mover los filtros avanzados al panel «Filtros», con conteo y apertura desde la URL.
- [ ] T059 [P] [US6] Ajustar la jerarquía de `frontend/src/app/features/author/version-history/version-history.component.html`, `frontend/src/app/shared/components/pdf-viewer.component.html`, `frontend/src/app/features/reviewer/evaluation-form/evaluation-form.component.html`, `frontend/src/app/features/author/manuscript-form/manuscript-form.component.html` y `frontend/src/app/features/reviewer/assignment-detail/assignment-detail.component.html` según el inventario de acciones. Pasar a `.btn--ghost` la acción de `frontend/src/app/shared/components/empty-state.component.html` y `error-state.component.html`.
- [ ] T060 [P] [US6] Ajustar las acciones por fila y por reporte de `frontend/src/app/features/admin/area-catalog/area-catalog.component.html`, `frontend/src/app/features/admin/reviewer-roster/reviewer-roster.component.html` y `frontend/src/app/features/admin/incident-list/incident-list.component.html` según FR-018.

**Checkpoint**: el conteo de T054 pasa en las 23 pantallas y ninguna acción ni destino desapareció.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: colores forzados, documentación, CI y verificación de SC-001 a SC-007.

- [ ] T061 [P] Agregar a `frontend/src/styles.scss` y a las hojas de `editorial-progress` y `header` las reglas `@media (forced-colors: active)` del plan, y a `frontend/e2e/08-tema-y-acciones.e2e.ts` una prueba con `emulateMedia({ forcedColors: 'active' })` que exige un borde de al menos 1 px en `.meter-bar`, `.avatar`, los marcadores de etapa y `.disclosure > summary`.
- [ ] T062 [P] Agregar un paso `python3 scripts/check_theme_contrast.py` al trabajo del frontend de `.github/workflows/ci.yml`, junto a `python3 scripts/check_frontend_build.py`, y actualizar la sección de verificación del frontend de `README.md`: suites `05` en dos temas, suite `08` y el validador de contraste.
- [ ] T063 [P] Actualizar el sitio de documentación: `docs-site/usuarios/primeros-pasos.qmd` (botón de tema, preferencia por navegador, paneles «Filtros» y «Más acciones»), `docs-site/usuarios/autor.qmd` (indicador de etapas y «Dar de baja» en «Más acciones»), `docs-site/usuarios/revisor.qmd` (barras de plazo y de cupo), `docs-site/ingenieria/pruebas.qmd` (validador de contraste y suites `05` y `08`) y `docs-site/ingenieria/seguridad.qmd` (`theme-init.js` y la CSP sin excepciones). Ejecutar `python3 scripts/check_docs_site.py`.
- [ ] T064 Desde `frontend/`, ejecutar `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npx tsc -p e2e/tsconfig.json`, `npx ng build --configuration production` y `TZ=UTC npx ng test --watch=false`. Desde la raíz, ejecutar `python3 scripts/check_frontend_build.py` y `python3 scripts/check_theme_contrast.py`. Confirmar que no aparecen avisos de presupuesto nuevos frente a T001 y registrar los resultados.
- [ ] T065 Ejecutar `./scripts/e2e.sh` completo desde un stack nuevo. Exigir cero infracciones axe A/AA en ambos temas, cero exposiciones de identidad en `04-fuga-de-identidad.e2e.ts`, cero hallazgos de teclado y responsive en `06` y `07` y el conteo de acciones de `08` en verde. Registrar número de pruebas, duración y hallazgos frente a T002.
- [ ] T066 Recorrer en el entorno de desarrollo, en ambos temas y a 320, 768 y 1366 px, la cabecera, el panel de cada rol, el detalle del manuscrito en cada estado, el detalle de una asignación activa y una vencida, «Mi desempeño» con 5 de 5 y los paneles plegables. Anotar en «Resultados de verificación» lo que las pruebas automáticas no cubren, como la legibilidad prolongada y la lectura con un lector de pantalla.
- [ ] T067 Ejecutar `graphify update .` para actualizar `graphify-out/graph.json`, según `CLAUDE.md`, y `git diff --check` antes de cerrar la implementación. Si la CLI `graphify` no está instalada en el entorno, instalarla o registrar la omisión.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (fase 1)**: sin dependencias. T002 a T004 corren en paralelo con T001.
- **Foundational (fase 2)**: depende de la fase 1 y bloquea todas las historias. T005 primero; después T006 y T007, en ese orden; T008 a T010 en paralelo; T011 al final.
- **US1 (fase 3)**: depende de la fase 2.
- **US2 (fase 4)**: depende de US1, porque los recorridos de axe eligen el tema con la clave que crea US1.
- **US3 (fase 5)**: depende de la fase 2. Puede avanzar en paralelo con US1, salvo `header.component.*` y `shell.component.spec.ts`, que comparte con T014 y T020 y se coordinan.
- **US4 (fase 6)**: depende de la fase 2. Es independiente de US1, US3 y US5.
- **US5 (fase 7)**: depende de la fase 2 y comparte `kpi-card.component.*` con US3 (T028, T032, T042 y T047), que se hacen en ese orden.
- **US6 (fase 8)**: depende de la fase 2 y conviene hacerla después de US4 y US5, porque reorganiza `manuscript-detail` y `assignment-detail`. T053 depende de T055 a T058.
- **Polish (fase 9)**: depende de las historias que se entreguen. T064 y T065 cierran.

### User Story Dependencies

| Historia | Depende de | Entrega independiente | Criterios |
| --- | --- | --- | --- |
| US1 | Fase 2 | Tema elegible, persistente y sin destello | SC-003 |
| US2 | US1 | Contraste AA y axe sin infracciones en ambos temas | SC-001, SC-002 |
| US3 | Fase 2 | Avatar e iconos del Administrador | SC-004 |
| US4 | Fase 2 | Indicador de etapas del Autor | SC-005 |
| US5 | Fase 2 | Barras de plazo y de cupo del Revisor | SC-005 |
| US6 | Fase 2 | Una acción destacada por vista y paneles plegables | SC-006 |

SC-007 (sin regresiones, sin scripts en línea y con presupuestos) se verifica al cerrar cada historia y en T064 y T065.

### Within Each User Story

- Las pruebas se escriben primero y deben fallar.
- Funciones puras y servicios antes que componentes, y estos antes que su integración en las vistas.
- Los ayudantes de E2E se actualizan en la misma historia que cambia la estructura que leen.
- La historia se cierra en su checkpoint antes de la siguiente prioridad.

### Parallel Opportunities

- Todas las tareas `[P]` de un bloque de pruebas corren a la vez.
- En la fase 2: T008, T009 y T010.
- US3, US4 y US5 pueden asignarse a tres personas al cerrar la fase 2, con el orden indicado para `kpi-card.component.*`.
- En la fase 9: T061, T062 y T063.

---

## Parallel Example: User Story 1

```bash
# Pruebas de US1 en paralelo:
Task: "T012 ThemeService en frontend/src/app/core/theme/theme.service.spec.ts"
Task: "T013 Botón de tema en frontend/src/app/core/layout/theme-toggle.component.spec.ts"
Task: "T015 Arranque del tema en scripts/check_frontend_build.py"
Task: "T016 Tema, persistencia y destello en frontend/e2e/08-tema-y-acciones.e2e.ts"
```

## Parallel Example: User Stories 3, 4 y 5

```bash
# Tras la fase 2, tres frentes independientes:
Task: "T026 Iniciales en frontend/src/app/shared/utils/initials.spec.ts"
Task: "T034 editorialStages() en frontend/src/app/core/models/manuscript.model.spec.ts"
Task: "T040 remainingFraction() y barra en frontend/src/app/features/reviewer/deadline-countdown/deadline-countdown.component.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 y 2)

1. Completar las fases 1 y 2.
2. Completar US1 y US2: el tema oscuro se elige, persiste, arranca sin destello y cumple AA.
3. **Parar y validar** con `05-accesibilidad.e2e.ts` en ambos temas antes de seguir.

### Incremental Delivery

1. US1 y US2 entregan el tema claro y oscuro publicable.
2. US3, US4 y US5 agregan el enriquecimiento visual, cada una verificable por separado.
3. US6 limpia la jerarquía de acciones sobre las vistas ya enriquecidas.
4. La fase 9 cierra colores forzados, CI, documentación y verificación.

### Parallel Team Strategy

1. El equipo completa junto las fases 1 y 2.
2. Persona A con US1 y luego US2. Persona B con US3 y luego US5. Persona C con US4 y luego US6.
3. La fase 9 se cierra en conjunto.

---

## Resultados de verificación

### Líneas base (T001 a T004)

Medidas el 2026-11-25 sobre `45ffaeb`, cuyo árbol de `frontend/` y `scripts/` es idéntico al de `9297dbe` (solo agrega los documentos de 005).

- **Frontend (T001):** `tsc` de app y de specs limpios. Build de producción correcto, paquete inicial de 306,45 kB (85,94 kB transferidos): `chunk-DJUT-jL5.js` 196,75 kB, `main` 104,43 kB y `styles` 5,27 kB. Cero avisos de presupuesto, ni del paquete inicial ni de hojas de componente. `TZ=UTC npx ng test --watch=false` con 76 archivos y 1198 pruebas en verde. `scripts/check_frontend_build.py` sin fallos (55 archivos en el build).
- **E2E (T002):** `./scripts/e2e.sh` desde un stack nuevo, 39 pruebas en verde en 2,3 min (190 s con la construcción), salida 0. `05-accesibilidad` sin hallazgos axe en público, Autor, Revisor y Administrador (solo tema claro). `06-teclado` y `07-responsive` sin hallazgos. El stack se borró al terminar.
- **Selectores que cambiarán (R-10):**
  - `support/ui.ts`: `filterAudit()` (usado en `02-ciclo-completo:227` y `03-correccion:164,193`), `standingMetric()` y `activeSlots()` (usados en `02-ciclo-completo:107,108,139`).
  - «Dar de baja» directo en `02-ciclo-completo:199`, `05-accesibilidad:72` y `06-teclado:92`.
  - `04-fuga-de-identidad:129` abre el `summary` «Mi cuenta», que se conserva.
- **Colores fuera de los tokens (T003):** confirma R-03 y R-04.
  - `color: var(--gpc-surface-alt)` como texto sobre relleno: `styles.scss:66` (`.skip-link`), `:155`, `:164` y `:173` (`.btn--primary`, `--success`, `--danger`), `notification-bell.component.scss:19` y `notification-list.component.scss:49`.
  - Literales: `styles.scss:117` (telón de diálogos); `evaluation-form.component.scss:152,157,158,162,178` (respaldos `#c9ced6`, `#1d4f91`, `#eaf1fb`, `#4a5260`); `reviewer-standing.component.scss:13` (`#c9ced6`).
  - Tokens usados y no declarados: `--gpc-info-border`, `--gpc-info-bg` y `--gpc-focus`, todos en `evaluation-form.component.scss`. Ningún otro.
- **Acciones destacadas (T004):** la tabla del plan se confirmó y se corrigió. Faltaban las acciones primarias de `EmptyStateComponent` y `ErrorStateComponent`, que coinciden con otra primaria en el listado de manuscritos (vacío o con error), el catálogo (sin coincidencias o con error), la auditoría (con error) y las carreras (con error). Se agregaron cuatro filas a la tabla y los dos componentes compartidos a T059. En el resto, las primarias de una misma vista son excluyentes (`@switch`), viven en diálogos o van en tarjetas distintas.

### Contraste de la paleta (T011 y T025)

**T011 (2026-11-25).** Antes de T006, `python3 scripts/check_theme_contrast.py` falló con 11 comprobaciones (sin tema oscuro, sin `--gpc-on-accent` y sin `--gpc-track`). Con los tokens nuevos pasa: 51 pares por tema, cero fallos. Mínimos observados: claro 5,93:1 en texto y 3,99:1 en no textuales; oscuro 5,98:1 y 4,17:1. `TZ=UTC npx ng test --watch=false` con 76 archivos y 1198 pruebas en verde, `tsc` de la app limpio, build de producción sin avisos (paquete inicial de 309,67 kB, 3,22 kB más que la línea base, por `styles` 8,49 kB) y `scripts/check_frontend_build.py` correcto.

| Par (sin el prefijo `--gpc-`) | Uso | Mínimo | Claro | Oscuro |
| --- | --- | --- | --- | --- |
| `text` / `surface` | texto sobre el fondo base | 4.5:1 | 13.98 | 16.30 |
| `text` / `surface-alt` | texto en tarjeta | 4.5:1 | 14.63 | 13.35 |
| `text` / `primary-50` | texto en fila resaltada | 4.5:1 | 13.48 | 12.82 |
| `text` / `primary-100` | texto en navegación activa | 4.5:1 | 12.37 | 10.53 |
| `text` / `neutral-100` | texto sobre superficie neutra | 4.5:1 | 11.87 | 9.45 |
| `text-muted` / `surface-alt` | secundario en tarjeta | 4.5:1 | 7.58 | 7.93 |
| `text-muted` / `workspace` | secundario sobre el fondo base | 4.5:1 | 7.24 | 9.68 |
| `text-muted` / `primary-50` | secundario en aviso sin leer | 4.5:1 | 6.98 | 7.61 |
| `text-muted` / `primary-100` | secundario sobre acento suave | 4.5:1 | 6.41 | 6.25 |
| `text-muted` / `warning-100` | secundario en plazo urgente | 4.5:1 | 6.62 | 7.05 |
| `text-muted` / `danger-100` | secundario en plazo vencido | 4.5:1 | 6.43 | 7.49 |
| `text-muted` / `success-100` | secundario en aviso de éxito | 4.5:1 | 6.61 | 6.70 |
| `primary-900` / `surface-alt` | títulos en tarjeta | 4.5:1 | 14.32 | 11.02 |
| `primary-900` / `workspace` | títulos sobre el fondo base | 4.5:1 | 13.69 | 13.45 |
| `primary-900` / `primary-50` | cabecera de tabla | 4.5:1 | 13.20 | 10.58 |
| `primary-900` / `primary-100` | insignia TIE_BREAKER e informativa; avatar | 4.5:1 | 12.11 | 8.68 |
| `primary-900` / `success-100` | título en aviso de éxito | 4.5:1 | 12.50 | 9.31 |
| `primary-700` / `surface-alt` | enlace en tarjeta | 4.5:1 | 8.39 | 6.76 |
| `primary-700` / `workspace` | enlace sobre el fondo base | 4.5:1 | 8.02 | 8.25 |
| `primary-700` / `primary-50` | enlace al pasar el puntero | 4.5:1 | 7.73 | 6.49 |
| `primary-700` / `sidebar-bg` | navegación lateral | 4.5:1 | 8.39 | 6.76 |
| `on-accent` / `primary-700` | botón primario | 4.5:1 | 8.39 | 8.25 |
| `on-accent` / `primary-900` | botón primario al pasar el puntero y salto | 4.5:1 | 14.32 | 13.45 |
| `on-accent` / `success-700` | botón de éxito | 4.5:1 | 6.52 | 9.26 |
| `on-accent` / `success-900` | botón de éxito al pasar el puntero | 4.5:1 | 9.36 | 14.01 |
| `on-accent` / `danger-700` | botón destructivo y contador de avisos | 4.5:1 | 6.54 | 7.61 |
| `on-accent` / `danger-800` | botón destructivo al pasar el puntero | 4.5:1 | 8.15 | 9.75 |
| `neutral-700` / `neutral-100` | insignia neutra | 4.5:1 | 8.40 | 8.40 |
| `success-900` / `success-100` | insignia ACCEPTED y ajuste «+10» | 4.5:1 | 8.17 | 9.70 |
| `warning-800` / `warning-100` | insignia CHANGES_REQUESTED | 4.5:1 | 5.93 | 8.75 |
| `danger-800` / `danger-100` | insignia REJECTED y ajuste «−20» | 4.5:1 | 6.92 | 7.55 |
| `danger-800` / `danger-50` | error del inicio de sesión | 4.5:1 | 7.45 | 8.88 |
| `danger-800` / `surface-alt` | peligro en tarjeta | 4.5:1 | 8.15 | 7.99 |
| `danger-900` / `danger-50` | aviso de error de la API | 4.5:1 | 9.16 | 11.73 |
| `warning-900` / `warning-50` | aviso de advertencia de la API | 4.5:1 | 8.38 | 12.65 |
| `warning-900` / `warning-100` | aviso de advertencia | 4.5:1 | 7.58 | 10.62 |
| `warning-800` / `surface-alt` | texto de advertencia en tarjeta | 4.5:1 | 6.79 | 9.84 |
| `warning-800` / `workspace` | texto de advertencia sobre el fondo base | 4.5:1 | 6.49 | 12.01 |
| `success-900` / `surface-alt` | texto de éxito | 4.5:1 | 9.36 | 11.48 |
| `success-700` / `surface-alt` | texto de éxito medio | 4.5:1 | 6.52 | 7.58 |
| `danger-700` / `surface-alt` | texto de peligro en tarjeta | 4.5:1 | 6.54 | 6.23 |
| `danger-700` / `workspace` | texto de peligro sobre el fondo base | 4.5:1 | 6.25 | 7.61 |
| `danger-700` / `primary-50` | texto de peligro al pasar el puntero | 4.5:1 | 6.02 | 5.98 |
| `control-border` / `surface-alt` | borde de control en tarjeta | 3.0:1 | 4.76 | 4.17 |
| `control-border` / `surface` | borde de control sobre el fondo base | 3.0:1 | 4.55 | 5.09 |
| `focus-color` / `surface` | anillo de foco sobre el fondo base | 3.0:1 | 8.02 | 8.25 |
| `focus-color` / `surface-alt` | anillo de foco en tarjeta | 3.0:1 | 8.39 | 6.76 |
| `primary-700` / `track` | relleno de barra neutro | 3.0:1 | 6.81 | 4.78 |
| `success-700` / `track` | relleno de barra de éxito | 3.0:1 | 5.29 | 5.37 |
| `warning-700` / `track` | relleno de barra de advertencia | 3.0:1 | 3.99 | 4.88 |
| `danger-700` / `track` | relleno de barra de peligro | 3.0:1 | 5.30 | 4.41 |

### Tema claro y oscuro (US1, T012 a T020)

**2026-11-25.** Antes de implementar, las pruebas nuevas fallaron (módulos inexistentes en Vitest y 2 comprobaciones del arranque en `scripts/check_frontend_build.py`). Con la implementación: `tsc` de app, specs y E2E limpios; `TZ=UTC npx ng test --watch=false` con 78 archivos y 1228 pruebas en verde; build de producción sin avisos (paquete inicial de 311,41 kB); arranque del tema correcto en el build (`theme-init.js` de 522 bytes, síncrono en `<head>` y sin scripts en línea); y `./scripts/e2e.sh` desde un stack nuevo con 45 pruebas en verde en 2,4 min, 6 de ellas de `08-tema-y-acciones` (sistema oscuro y claro, persistencia, otra pestaña, sin destello con el paquete principal retenido y almacenamiento bloqueado). `05-accesibilidad` aún corre solo en tema claro: el oscuro se verifica en US2.

### Accesibilidad y estados (T024 y T023)

**2026-11-25.** `./scripts/e2e.sh` completo desde un stack nuevo: 58 pruebas en verde en 4,1 min.

**axe (T022 y T024).** `05-accesibilidad` corre los recorridos público, Autor, Revisor y Administrador en `light` y en `dark`, con sus diálogos: cero infracciones WCAG A/AA en las ocho pruebas, a la primera. No hubo nada que corregir en T024.

**Estados computados (T023).** `support/contrast.ts` mide variantes de prueba (sobre el fondo de trabajo y dentro de una tarjeta), el primer control real de cada tipo y el enlace de salto, en reposo, hover, foco por teclado y error. Una prueba de control confirma que detecta contrastes insuficientes. Mínimos por vista y tema, con cero pares por debajo del mínimo:

| Vista | Muestras | Claro: texto · borde · anillo | Oscuro: texto · borde · anillo |
| --- | --- | --- | --- |
| Panel | 159 | 5,93 · 4,55 · 8,02 | 5,98 · 4,17 · 6,76 |
| Detalle del manuscrito | 171 | 5,93 · 4,55 · 8,02 | 5,98 · 4,17 · 6,76 |
| Detalle de la asignación | 173 | 5,93 · 4,55 · 8,02 | 5,98 · 4,17 · 6,76 |
| Auditoría | 196 | 5,93 · 4,55 · 7,73 | 5,98 · 4,17 · 6,49 |

**T025.** No aplica: ningún par quedó por debajo del mínimo, así que `_tokens.scss` y el inventario del validador no cambian.

**Revisión visual en oscuro.** Con un spec temporal de capturas (borrado después) se revisaron las 23 pantallas, el visor PDF y el diálogo de baja: superficies, campos, listas, fechas, casillas y selector de archivo adoptan el esquema oscuro. El PDF en sí no se pudo revisar porque Chromium sin interfaz no lo dibuja. Quedan dos defectos de maquetación que no dependen del tema ni son de contraste, anteriores a esta funcionalidad y sin corregir: en el inicio de sesión el párrafo `.login__error--global` se ve como una barra vacía (`:empty` no aplica porque contiene espacios), y en la auditoría la insignia «Éxito» se parte en varias líneas.

**Nota sobre el filtro de T024.** `-g "tema|Accesibilidad|accesibilidad"` también coincide con «sistema» y ejecuta sueltos dos pasos encadenados de `02-ciclo-completo` y `03-correccion`, que fallan por faltarles los anteriores. En la suite completa pasan.

### Cabecera y panel (US3, T026 a T033)

**2026-11-25.** Antes de implementar, las pruebas nuevas fallaron (módulo de iniciales inexistente y 7 casos). Con la implementación: `TZ=UTC npx ng test --watch=false` con 79 archivos y 1247 pruebas en verde, `tsc` de app y specs limpios, build de producción sin avisos (paquete inicial de 311,41 kB) y los dos validadores en orden. `./scripts/e2e.sh` completo: 58 pruebas en verde. Con capturas temporales (borradas) se revisaron las cuentas Administrador y Autor–Revisor en ambos temas a 320 y 1366 px; ahí apareció que el icono desalineaba el conteo y, a 320 px, lo bajaba de línea. Se corrigió en `kpi-card.component.scss` y se repitieron `05`, `06` y `07`, en verde.

Decisiones tomadas al implementar:

- Una cuenta sin nombre ni apellidos llega con `full_name` vacío y antes no mostraba «Mi cuenta». Ahora el menú muestra su nombre de usuario, y el avatar, el icono genérico.
- El icono de la cabecera de `KpiCardComponent` y el de cada métrica enlazan `href` a partir del nombre del símbolo, en lugar de un `@switch` por icono.
- `activeSlots()` y `standingMetric()` de E2E siguen sin acotar a `dd` hasta T044: solo la tarjeta del Administrador lleva iconos en sus métricas y esas funciones no la leen.

### Progreso del manuscrito (US4, T034 a T039)

**2026-11-25.** Antes de implementar, las pruebas nuevas fallaron (`editorialStages` y el componente no existían). Con la implementación: `TZ=UTC npx ng test --watch=false` con 80 archivos y 1292 pruebas en verde, `tsc` de app y specs limpios, build de producción sin avisos de presupuesto y los dos validadores en orden. Se agregó al validador de contraste el par `on-accent` sobre `text-muted` (marcador completado de un dado de baja), con 7,58:1 en claro y 9,68:1 en oscuro: son ya 52 pares por tema.

`./scripts/e2e.sh` completo: 58 pruebas en verde. Con un spec temporal (borrado) se abrió el detalle de los estados que dejan los flujos (Borrador, En revisión, Cambios solicitados, Aceptado, Rechazado y un aceptado dado de baja) en ambos temas, a 1366 y 320 px: cero infracciones axe, sin desbordamiento horizontal y el árbol accesible anuncia cada etapa con su situación. `SUBMITTED` y `TIE_BREAKER` no quedaban al terminar los flujos y se verifican en las pruebas unitarias.

### Resultados finales (T064 a T066)

Pendiente.
