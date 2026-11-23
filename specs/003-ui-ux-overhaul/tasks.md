---
description: "Tareas de implementación del rediseño integral de UI/UX"
---

# Tasks: Rediseño integral de la interfaz y experiencia de usuario

**Entrada** [Especificación](spec.md) y [plan](plan.md).

**Organización**. Cinco fases en orden de ejecución con las historias marcadas como `[US1]` a `[US5]`. Los contratos de presentación y la guía de verificación están en el plan.

## Formato y alcance

Cada tarea tiene un ID secuencial `TNNN`. `[P]` indica que se puede ejecutar en paralelo con otras tareas de su grupo una vez completados sus prerrequisitos. Todas las rutas de archivo parten de la raíz del repositorio.

En los `.component.ts` existentes, limitar los cambios a `templateUrl`, `styleUrl` e imports de presentación del decorador. Preservar selectores, nombres accesibles, bindings, condiciones de autorización, eventos, referencias a elementos, clases y lógica existentes. Mantener los guards, las rutas, los servicios y todas las llamadas y contratos de API. Conservar cero selectores de rol y el doble ciego por contexto, incluso en atributos, tooltips, contenido oculto y avisos. Las tareas de prueba reutilizan Vitest, jsdom y Playwright configurados en el repositorio.

## Fase 1 — Fundamentos

**Objetivo**. Registrar la línea base y preparar el sistema visual para todos los componentes.

- [x] T001 Registrar la línea base del frontend en el entorno Node del CI. Desde `frontend/`, ejecutar `npm ci`, `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npx ng build --configuration production` y `npx ng test --watch=false`. Usar `frontend/package-lock.json`, `frontend/tsconfig.app.json`, `frontend/tsconfig.spec.json` y `frontend/angular.json`. Desde la raíz, comprobar el artefacto con `python3 scripts/check_frontend_build.py`. Anotar resultados previos al refactor.
  - **Línea base del 2026-11-23** sobre `0ebfd8b`, Node 22.23.5 y npm 10.9.9. `npm ci` completó desde la caché local con 295 paquetes. Ambas comprobaciones de tipos pasaron.
  - **Compilación**. `ng build --configuration production` pasó con 302,38 kB iniciales y un aviso NG8113 por el import sin uso de `LoadingSpinnerComponent` en `UnifiedDashboardComponent`. `python3 scripts/check_frontend_build.py` pasó todas las comprobaciones del artefacto.
  - **Pruebas unitarias**. `ng test --watch=false` terminó con código 1. Pasaron 1282 de 1308 pruebas en 72 de 75 archivos. Los 26 fallos se concentran en el Revisor: formulario de evaluación (21), integración del módulo (3) y detalle de asignación (2). Las pruebas afectadas usan datos de prueba con vencimiento el 10 de noviembre de 2026, anterior a la ejecución.
- [x] T002 Registrar los resultados funcionales de referencia usando `scripts/e2e.sh` desde la raíz, con las suites de `frontend/playwright.config.ts`. Anotar el comportamiento y las solicitudes de API de sesión, panel, avisos, catálogo y ciclo editorial, incluidos métodos, rutas, parámetros, cuerpos y número de llamadas, para la comparación de la fase 5. Usar datos del stack aislado y excluir credenciales y tokens de las notas.
  - **Línea base E2E del 2026-11-23** sobre `0ebfd8b`. `scripts/e2e.sh` ejecutó Chromium con Playwright 1.64.1 en el stack aislado `gpc_e2e`. Pasaron **34 de 34 pruebas** en 2,2 min. Se verificaron sesión multirrol sin selector, permisos, ciclo de envío a retiro, catálogo público, auditoría, corrección de veredicto, doble ciego, accesibilidad con axe, teclado y diseño responsivo.

  **Solicitudes de referencia observadas en el navegador.** Rutas relativas a `/api/v1`. Cada solicitud cuenta una vez por caso salvo que se indique otro número. `{…}` enumera los campos del cuerpo JSON, `{}` indica un objeto vacío y los GET carecen de cuerpo. Los identificadores se normalizaron.

  | Caso | Métodos, rutas y conteos |
  | --- | --- |
  | Sesión multirrol | `POST /auth/refresh/` con `{}` (401 sin sesión), `POST /auth/login/` con `{identifier,password}` (200), `GET /dashboard/` (200, una carga para los dos roles), `GET /notifications/?read=false&page_size=1` (200) y `POST /auth/logout/` con `{}` (204). El caso de credenciales erróneas hizo dos `POST /auth/login/` (401) y mostró el mismo mensaje para ambas. |
  | Avisos | La campana consulta `GET /notifications/?read=false&page_size=1` al montar el shell. La apertura de la bandeja en el recorrido de doble ciego hizo un `GET /notifications/?page_size=20` (200). Las marcas de lectura quedan fuera de la cobertura de esta corrida. |
  | Catálogo público | `GET /catalog/?page_size=12`, `GET /catalog/?page_size=12&search=Chimborazo`, `GET /catalog/:code/` y `GET /catalog/:code/document/`, todos 200. Tras la baja, la ficha devolvió 404. |
  | Autor | `POST /manuscripts/` con `{title,abstract,keywords,area,language,authors}`, `POST /manuscripts/:id/draft-file/` con el campo multipart `file` y `POST /manuscripts/:id/submit/` sin cuerpo, todos 201. Dos `GET /manuscripts/:id/` (200) en el escenario de envío. La baja hizo un `POST /manuscripts/:id/withdraw/` con `{reason}` y un `GET /manuscripts/:id/history/?page_size=100`, ambos 200. |
  | Editor · asignación | `GET /editor/submissions/?page_size=20` antes de filtrar y una vez más con `search=:code`. Tres `GET /editor/submissions/:id/`. Un `POST /editor/submissions/:id/start-review/` con `{}`, un `GET /editor/reviewers/?manuscript_id=:id&page_size=100` y un `POST /editor/manuscripts/:id/assignments/` con `{reviewer_id}` (201). |
  | Revisor | `GET /reviewer/assignments/?page_size=20`, dos `GET /reviewer/assignments/:id/` y un `GET /reviewer/assignments/:id/document/`. Un `GET` y un `PUT` a `/reviewer/assignments/:id/evaluation/`. El PUT incluyó `originality_score`, `methodology_score`, `clarity_score`, `relevance_score`, `ethics_score`, `recommendation`, `comments_for_author` y `confidential_comments`. Un `POST /reviewer/assignments/:id/evaluation/submit/` con `{}`. Todas estas respuestas fueron 200. |
  | Veredicto y auditoría | `POST /editor/manuscripts/:id/verdicts/` con `{decision,justification,observations}` (201). En el escenario de auditoría, un `GET /admin/audit/?page_size=25` y dos GET filtrados por `manuscript=:id` y `action`, uno para la descarga y otro para el retiro. La autorización de corrección hizo un `POST /admin/verdicts/:id/authorize-correction/` con `{reason}` (201). |
  | Doble ciego | `POST /reviewer/assignments/:id/identity-leak/` con `{description,report_type}` (201), dos `GET /editor/incidents/?page_size=20&status=OPEN` (200) y un `POST /editor/incidents/:id/resolve/` con `{resolution}` (200). El recorrido comprobó la visibilidad del reporte para el Editor y el aislamiento de la identidad frente al Autor. |

- [x] T003 [P] Crear `frontend/src/styles/_tokens.scss` con un único `:root` para `--gpc-*`. Conservar los tokens institucionales y definir paleta semántica, escala tipográfica, espacios, radios de 8 y 12 px, pill, sombras, foco, barra de 260 px y altura base de cabecera de 64 px. Usar `#f1f5f9` para el área de trabajo, `#f8fafc` para la barra, `#e2e8f0` para el divisor decorativo y un borde funcional contrastado.
- [x] T004 Mover la declaración global de tokens desde `frontend/src/styles.scss` y cargarla una vez con `@use 'styles/tokens';`. Aplicar los patrones de botones, campos, superficies, tablas, badges y diálogos. Mantener `.table-wrap`, el enlace de salto, el texto solo para lectura asistida y el foco visible. Reducir el movimiento cuando el sistema lo indique. Conservar el registro vigente de estilos en `frontend/angular.json`.
- [x] T005 [P] Crear `frontend/public/icons/ui.svg` con símbolos `dashboard`, `bell`, `logout`, `search`, `author`, `reviewer`, `editor`, `admin`, `history`, `expired`, `incident`, `menu`, `empty-state` y `alert`. Usar `currentColor`, SVG locales y el copiado de `public/` configurado en `frontend/angular.json`.


**Control de fase**. La configuración existente compila los estilos globales y publica el sprite. Los consumidores actuales de tokens conservan sus referencias.

## Fase 2 — App Shell y compartidos

### US1 (P1) — Navegar y gestionar la sesión

**Prueba independiente**. Con una cuenta Autor–Revisor, comprobar acceso simultáneo a ambos módulos, indicador de ruta, nombre completo, campana y cierre de sesión por teclado.

- [x] T006 [P] [US1] Refactorizar la barra lateral. Añadir un SVG decorativo por enlace, acento de ruta activa y `ariaCurrentWhenActive`. Conservar `groups()`, destinos y visibilidad por roles. Extraer a `frontend/src/app/core/layout/side-nav.component.html` y `frontend/src/app/core/layout/side-nav.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/core/layout/side-nav.component.ts`.
- [x] T007 [P] [US1] Refactorizar la campana con SVG y badge. Mantener su acción, nombre accesible con conteo exacto, cero sin badge y `99+` visual. Extraer a `frontend/src/app/core/layout/notification-bell.component.html` y `frontend/src/app/core/layout/notification-bell.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/core/layout/notification-bell.component.ts`.
- [ ] T008 [US1] Refactorizar la cabecera con altura base de 64 px, pills informativas, menú nativo que muestre el nombre íntegro y botón «Cerrar sesión» con icono. Conservar el selector `.app-header__roles .badge`, los bindings de sesión y el acceso a la campana. Extraer a `frontend/src/app/core/layout/header.component.html` y `frontend/src/app/core/layout/header.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/core/layout/header.component.ts`.
- [ ] T009 [US1] Refactorizar la composición del área autenticada. Reservar 260 px para la barra fija en escritorio y usar variante plegable nativa en pantalla estrecha con un único menú visible y accesible. Mantener el enlace de salto, `main#main-content`, feedback de API, outlet y bindings. Extraer a `frontend/src/app/core/layout/shell.component.html` y `frontend/src/app/core/layout/shell.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/core/layout/shell.component.ts`.


### Compartidos de gestión y accesibilidad (US4 y US5)

**Control independiente**. Abrir un diálogo con teclado y comprobar que la vista distingue datos, vacío, carga y error. Comparar los patrones compartidos en una vista pública y una interna.

- [ ] T010 [P] [US4] Aplicar los tokens semánticos a badges de estado con texto visible. Mantener el input `status`, las etiquetas, los tonos y el fallback neutral. Extraer a `frontend/src/app/shared/components/status-badge.component.html` y `frontend/src/app/shared/components/status-badge.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/shared/components/status-badge.component.ts`.
- [ ] T011 [P] [US5] Incorporar ilustración SVG decorativa, mensaje anunciado con `role="status"` y acción contextual. Mantener `message`, `actionLabel` y `action`. Extraer a `frontend/src/app/shared/components/empty-state.component.html` y `frontend/src/app/shared/components/empty-state.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/shared/components/empty-state.component.ts`.
- [ ] T012 [P] [US4] Unificar superficie, backdrop y jerarquía de acciones. Mantener el `dialog` nativo, `#dialog`, nombre accesible y los eventos vigentes de confirmación y cancelación. Extraer a `frontend/src/app/shared/components/confirm-dialog.component.html` y `frontend/src/app/shared/components/confirm-dialog.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/shared/components/confirm-dialog.component.ts`.
- [ ] T013 [P] [US5] Aplicar identidad y espaciado compartidos al encabezado público y conservar sus enlaces y nombres accesibles. Extraer a `frontend/src/app/shared/components/public-header.component.html` y `frontend/src/app/shared/components/public-header.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/shared/components/public-header.component.ts`.
- [ ] T014 [P] [US5] Unificar la presentación del mensaje de error, sus anuncios y su acción de reintento. Extraer a `frontend/src/app/shared/components/error-state.component.html` y `frontend/src/app/shared/components/error-state.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/shared/components/error-state.component.ts`.
- [ ] T015 [P] [US5] Unificar indicador y anuncio de carga. Respetar la preferencia de movimiento reducido. Extraer a `frontend/src/app/shared/components/loading-spinner.component.html` y `frontend/src/app/shared/components/loading-spinner.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/shared/components/loading-spinner.component.ts`.
- [ ] T016 [P] [US5] Alinear los controles de paginación y conservar estados, nombres accesibles y eventos. Extraer a `frontend/src/app/shared/components/pagination.component.html` y `frontend/src/app/shared/components/pagination.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/shared/components/pagination.component.ts`.
- [ ] T017 [P] [US5] Ajustar el marco del visor y sus acciones para pantallas estrechas. Mantener el origen de los archivos, acceso, descarga y etiquetas accesibles. Extraer a `frontend/src/app/shared/components/pdf-viewer.component.html` y `frontend/src/app/shared/components/pdf-viewer.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/shared/components/pdf-viewer.component.ts`.
- [ ] T018 [P] [US5] Reutilizar el estilo global de badge para el contador de rondas y conservar su valor y etiqueta. Extraer a `frontend/src/app/shared/components/round-counter.component.html` y `frontend/src/app/shared/components/round-counter.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/shared/components/round-counter.component.ts`.


### US2 (P1) — Componente de tarjetas del panel

**Control independiente**. Comprobar la presentación de conteo positivo, cero y dato ausente con entradas de prueba.

- [ ] T019 [US2] Implementar `KpiCardComponent` standalone con título, icono y métricas explícitas. Mostrar solo números finitos, enteros y no negativos. Proyectar accesos autorizados y reutilizar el estado vacío ilustrado cuando falten métricas. Excluir volcados de objetos, cadenas y datos identificables. Crear `frontend/src/app/shared/components/kpi-card.component.html` y `frontend/src/app/shared/components/kpi-card.component.scss`. Declarar el componente en `frontend/src/app/shared/components/kpi-card.component.ts`.


## Fase 3 — Vistas públicas y panel

### US1 (P1) — Inicio de sesión y avisos

**Prueba independiente**. Iniciar sesión con teclado y abrir la bandeja desde la campana. Verificar filtros, paginación, lectura y actualización del contador.

- [ ] T020 [P] [US1] Rediseñar la tarjeta de inicio de sesión con campos, feedback y jerarquía de acciones coherentes. Mantener etiquetas, validación, envío y redirección. Extraer a `frontend/src/app/features/auth/login/login.component.html` y `frontend/src/app/features/auth/login/login.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/auth/login/login.component.ts`.
- [ ] T021 [P] [US1] Mejorar la jerarquía de cada aviso, distinguir leídos y pendientes con señales adicionales al color y conservar las acciones y la información autorizada. Extraer a `frontend/src/app/features/notifications/notification-item/notification-item.component.html` y `frontend/src/app/features/notifications/notification-item/notification-item.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/notifications/notification-item/notification-item.component.ts`.
- [ ] T022 [P] [US1] Refactorizar la bandeja con filtros, paginación y estados diferenciados. Conservar la lectura individual y masiva y su efecto en el contador. Extraer a `frontend/src/app/features/notifications/notification-list/notification-list.component.html` y `frontend/src/app/features/notifications/notification-list/notification-list.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/notifications/notification-list/notification-list.component.ts`.


### US3 (P1) — Buscar y consultar publicaciones

**Prueba independiente**. Desde una sesión anónima, combinar filtros, recuperar la consulta por URL, paginar y abrir una ficha con PDF público. Comprobar la búsqueda sin coincidencias.

- [ ] T023 [P] [US3] Presentar filtros en cuadrícula responsiva y añadir el icono al campo de búsqueda, etiquetas persistentes y jerarquía de Buscar y Limpiar. Conservar área, palabra clave, idioma, fechas, orden y validación. Extraer a `frontend/src/app/features/catalog/catalog-search/catalog-search.component.html` y `frontend/src/app/features/catalog/catalog-search/catalog-search.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/catalog/catalog-search/catalog-search.component.ts`.
- [ ] T024 [P] [US3] Rediseñar resultados como tarjetas editoriales con resumen, metadatos autorizados y badges de área e idioma cuando existan. Reutilizar `clear()` en el estado filtrado sin coincidencias y conservar paginación, URL, carga y error. Extraer a `frontend/src/app/features/catalog/catalog-list/catalog-list.component.html` y `frontend/src/app/features/catalog/catalog-list/catalog-list.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/catalog/catalog-list/catalog-list.component.ts`.
- [ ] T025 [P] [US3] Rediseñar la ficha pública con encabezado editorial, resumen, metadatos permitidos y acción para el PDF vigente. Conservar los límites de visibilidad de artículos aceptados y activos. Extraer a `frontend/src/app/features/catalog/catalog-detail/catalog-detail.component.html` y `frontend/src/app/features/catalog/catalog-detail/catalog-detail.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/catalog/catalog-detail/catalog-detail.component.ts`.


### US2 (P1) — Panel unificado de los cuatro roles

**Prueba independiente**. Verificar el panel con un rol, con varios y sin roles. Comprobar conteos positivos, cero, secciones sin métricas y errores parciales con la petición vigente.

- [ ] T026 [P] [US2] Integrar la tarjeta KPI de Autor con conteos explícitos disponibles y acceso a `/app/author/manuscripts`. Conservar selector e input `data`. Extraer a `frontend/src/app/features/dashboard/author-summary/author-summary.component.html` y `frontend/src/app/features/dashboard/author-summary/author-summary.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/dashboard/author-summary/author-summary.component.ts`.
- [ ] T027 [P] [US2] Integrar la tarjeta KPI de Revisor con conteos explícitos disponibles y accesos a `/app/reviewer/assignments` y `/app/reviewer/history`. Conservar selector e input `data`. Extraer a `frontend/src/app/features/dashboard/reviewer-summary/reviewer-summary.component.html` y `frontend/src/app/features/dashboard/reviewer-summary/reviewer-summary.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/dashboard/reviewer-summary/reviewer-summary.component.ts`.
- [ ] T028 [P] [US2] Integrar la tarjeta KPI de Editor con conteos explícitos disponibles y accesos a `/app/editor/submissions`, `/app/editor/assignments/expired` y `/app/editor/incidents`. Conservar selector e input `data`. Extraer a `frontend/src/app/features/dashboard/editor-summary/editor-summary.component.html` y `frontend/src/app/features/dashboard/editor-summary/editor-summary.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/dashboard/editor-summary/editor-summary.component.ts`.
- [ ] T029 [P] [US2] Integrar la tarjeta KPI de Administrador con conteos explícitos disponibles y acceso a `/app/admin/audit`. Conservar selector e input `data`. Extraer a `frontend/src/app/features/dashboard/admin-summary/admin-summary.component.html` y `frontend/src/app/features/dashboard/admin-summary/admin-summary.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/dashboard/admin-summary/admin-summary.component.ts`.
- [ ] T030 [US2] Aplicar la cuadrícula responsiva y retirar `::ng-deep`. Conservar `data-section`, los cuatro resúmenes, estado sin roles, carga, error global, error parcial y reintento. Mantener una petición por carga y presentar los accesos en las secciones sin métricas que envía actualmente el backend. Extraer a `frontend/src/app/features/dashboard/unified-dashboard/unified-dashboard.component.html` y `frontend/src/app/features/dashboard/unified-dashboard/unified-dashboard.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/dashboard/unified-dashboard/unified-dashboard.component.ts`.
- [ ] T031 [US2] Actualizar las suites existentes en `frontend/src/app/features/dashboard/dashboard-summaries.spec.ts` y `frontend/src/app/features/dashboard/unified-dashboard/unified-dashboard.component.spec.ts` para montar Router donde se necesite y verificar tarjetas con conteos positivos, cero y ausencia de métricas. Conservar las aserciones de permisos, secciones sanas ante fallo parcial, reintento y petición única.


**Control de fase**. El login, el catálogo y los avisos mantienen sus recorridos. El panel muestra en conjunto las secciones autorizadas y diferencia cero, ausencia y error.

## Fase 4 — Módulos de gestión y páginas de error

### US4 (P1) — Gestión editorial y auditoría

**Prueba independiente**. Usar cuentas con los cuatro roles para recorrer listados, detalles, formularios y diálogos. Comparar resultados con la línea base y comprobar el doble ciego en dos cuentas distintas del mismo manuscrito.

Para todas las tablas de esta fase, mantener columnas, encabezados semánticos, filtros, orden, paginación y acciones existentes. Aplicar resaltado con `:hover` y `:focus-within`, badges con texto y desplazamiento horizontal local. Reusar estados ilustrados y conservar `dialog` nativo, etiquetas, foco y validaciones en formularios y confirmaciones.

#### Autor

- [ ] T032 [P] [US4] Rediseñar la tabla de manuscritos activos y archivados, sus filtros, estados y acciones por fila. Extraer a `frontend/src/app/features/author/manuscript-list/manuscript-list.component.html` y `frontend/src/app/features/author/manuscript-list/manuscript-list.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/author/manuscript-list/manuscript-list.component.ts`.
- [ ] T033 [P] [US4] Agrupar campos de registro y edición, coautoría, validaciones y acciones. Mantener el aviso vigente al abandonar cambios sin guardar. Extraer a `frontend/src/app/features/author/manuscript-form/manuscript-form.component.html` y `frontend/src/app/features/author/manuscript-form/manuscript-form.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/author/manuscript-form/manuscript-form.component.ts`.
- [ ] T034 [P] [US4] Refactorizar la presentación del adjunto y su feedback. Conservar selección, restricciones y validación estricta de PDF. Extraer a `frontend/src/app/features/author/pdf-uploader/pdf-uploader.component.html` y `frontend/src/app/features/author/pdf-uploader/pdf-uploader.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/author/pdf-uploader/pdf-uploader.component.ts`.
- [ ] T035 [P] [US4] Rediseñar detalle, tabla de autores autorizada y acciones permitidas de versión. Respetar el doble ciego al presentar información procedente de la revisión. Extraer a `frontend/src/app/features/author/manuscript-detail/manuscript-detail.component.html` y `frontend/src/app/features/author/manuscript-detail/manuscript-detail.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/author/manuscript-detail/manuscript-detail.component.ts`.
- [ ] T036 [P] [US4] Refactorizar la confirmación de baja lógica y conservar cancelación, confirmación y foco. Extraer a `frontend/src/app/features/author/withdraw-dialog/withdraw-dialog.component.html` y `frontend/src/app/features/author/withdraw-dialog/withdraw-dialog.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/author/withdraw-dialog/withdraw-dialog.component.ts`.
- [ ] T037 [P] [US4] Jerarquizar el historial de versiones y distinguir versión de ronda. Mantener accesos autorizados e historial inmutable. Extraer a `frontend/src/app/features/author/version-history/version-history.component.html` y `frontend/src/app/features/author/version-history/version-history.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/author/version-history/version-history.component.ts`.


#### Revisor

- [ ] T038 [P] [US4] Rediseñar la tabla de asignaciones, badges, acciones por fila y vacío. Extraer a `frontend/src/app/features/reviewer/assignment-list/assignment-list.component.html` y `frontend/src/app/features/reviewer/assignment-list/assignment-list.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/reviewer/assignment-list/assignment-list.component.ts`.
- [ ] T039 [P] [US4] Refactorizar el detalle anonimizado, sus acciones y el visor PDF autorizado. Preservar las condiciones que delimitan acceso y visibilidad. Extraer a `frontend/src/app/features/reviewer/assignment-detail/assignment-detail.component.html` y `frontend/src/app/features/reviewer/assignment-detail/assignment-detail.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/reviewer/assignment-detail/assignment-detail.component.ts`.
- [ ] T040 [P] [US4] Aplicar el patrón visual de plazos, avisos y estados. Conservar cálculo y vencimiento vigentes. Extraer a `frontend/src/app/features/reviewer/deadline-countdown/deadline-countdown.component.html` y `frontend/src/app/features/reviewer/deadline-countdown/deadline-countdown.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/reviewer/deadline-countdown/deadline-countdown.component.ts`.
- [ ] T041 [P] [US4] Estilizar el diálogo de conflicto con la jerarquía común y conservar controles, envío y cancelación. Extraer a `frontend/src/app/features/reviewer/conflict-dialog/conflict-dialog.component.html` y `frontend/src/app/features/reviewer/conflict-dialog/conflict-dialog.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/reviewer/conflict-dialog/conflict-dialog.component.ts`.
- [ ] T042 [P] [US4] Estilizar el reporte de identidad con el patrón de diálogo accesible. Mantener campos, avisos, acciones y confidencialidad. Extraer a `frontend/src/app/features/reviewer/identity-leak-dialog/identity-leak-dialog.component.html` y `frontend/src/app/features/reviewer/identity-leak-dialog/identity-leak-dialog.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/reviewer/identity-leak-dialog/identity-leak-dialog.component.ts`.
- [ ] T043 [P] [US4] Agrupar secciones de evaluación y mensajes. Conservar bindings, validación, permisos y guard de cambios sin guardar. Extraer a `frontend/src/app/features/reviewer/evaluation-form/evaluation-form.component.html` y `frontend/src/app/features/reviewer/evaluation-form/evaluation-form.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/reviewer/evaluation-form/evaluation-form.component.ts`.
- [ ] T044 [P] [US4] Rediseñar la tabla e historial de evaluaciones con estados legibles y datos anonimizados. Extraer a `frontend/src/app/features/reviewer/evaluation-history/evaluation-history.component.html` y `frontend/src/app/features/reviewer/evaluation-history/evaluation-history.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/reviewer/evaluation-history/evaluation-history.component.ts`.


#### Editor

- [ ] T045 [P] [US4] Rediseñar bandeja, filtros, cabeceras de tabla, estados y acciones de nuevos envíos. Extraer a `frontend/src/app/features/editor/submission-inbox/submission-inbox.component.html` y `frontend/src/app/features/editor/submission-inbox/submission-inbox.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/editor/submission-inbox/submission-inbox.component.ts`.
- [ ] T046 [P] [US4] Jerarquizar detalle, tablas, versión, acciones y avisos visibles para el Editor. Extraer a `frontend/src/app/features/editor/submission-detail/submission-detail.component.html` y `frontend/src/app/features/editor/submission-detail/submission-detail.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/editor/submission-detail/submission-detail.component.ts`.
- [ ] T047 [P] [US4] Unificar presentación de la asignación y sus confirmaciones. Conservar el flujo de un Revisor activo y los mensajes vigentes. Extraer a `frontend/src/app/features/editor/assign-reviewer-dialog/assign-reviewer-dialog.component.html` y `frontend/src/app/features/editor/assign-reviewer-dialog/assign-reviewer-dialog.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/editor/assign-reviewer-dialog/assign-reviewer-dialog.component.ts`.
- [ ] T048 [P] [US4] Rediseñar búsqueda y resultados de selección de Revisor. Conservar filtros, selección y condiciones de elegibilidad. Extraer a `frontend/src/app/features/editor/reviewer-picker/reviewer-picker.component.html` y `frontend/src/app/features/editor/reviewer-picker/reviewer-picker.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/editor/reviewer-picker/reviewer-picker.component.ts`.
- [ ] T049 [P] [US4] Refactorizar el diálogo de revocación con jerarquía de acción destructiva y confirmación vigente. Extraer a `frontend/src/app/features/editor/revoke-assignment-dialog/revoke-assignment-dialog.component.html` y `frontend/src/app/features/editor/revoke-assignment-dialog/revoke-assignment-dialog.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/editor/revoke-assignment-dialog/revoke-assignment-dialog.component.ts`.
- [ ] T050 [P] [US4] Agrupar controles de veredicto, campos de justificación, errores y confirmaciones con los patrones visuales compartidos. Extraer a `frontend/src/app/features/editor/verdict-form/verdict-form.component.html` y `frontend/src/app/features/editor/verdict-form/verdict-form.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/editor/verdict-form/verdict-form.component.ts`.
- [ ] T051 [P] [US4] Rediseñar tabla de asignaciones vencidas y sus acciones autorizadas de decisión y revocación. Extraer a `frontend/src/app/features/editor/expired-assignments/expired-assignments.component.html` y `frontend/src/app/features/editor/expired-assignments/expired-assignments.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/editor/expired-assignments/expired-assignments.component.ts`.
- [ ] T052 [P] [US4] Refactorizar el listado confidencial con tipo, estado, acciones y mensajes de resolución vigentes. Extraer a `frontend/src/app/features/editor/incident-list/incident-list.component.html` y `frontend/src/app/features/editor/incident-list/incident-list.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/editor/incident-list/incident-list.component.ts`.


#### Administrador

- [ ] T053 [P] [US4] Presentar filtros de auditoría en cuadrícula responsiva y conservar campos, validación y eventos. Extraer a `frontend/src/app/features/admin/audit-filters/audit-filters.component.html` y `frontend/src/app/features/admin/audit-filters/audit-filters.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/admin/audit-filters/audit-filters.component.ts`.
- [ ] T054 [P] [US4] Refactorizar tabla, estados, acciones y paginación de auditoría. Extraer a `frontend/src/app/features/admin/audit-log-list/audit-log-list.component.html` y `frontend/src/app/features/admin/audit-log-list/audit-log-list.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/admin/audit-log-list/audit-log-list.component.ts`.
- [ ] T055 [P] [US4] Jerarquizar el detalle de solo lectura y el acceso autorizado al flujo vigente de corrección. Extraer a `frontend/src/app/features/admin/audit-log-detail/audit-log-detail.component.html` y `frontend/src/app/features/admin/audit-log-detail/audit-log-detail.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/admin/audit-log-detail/audit-log-detail.component.ts`.
- [ ] T056 [P] [US4] Rediseñar el diálogo de corrección de veredicto. Conservar motivo obligatorio, confirmación, cancelación y foco. Extraer a `frontend/src/app/features/admin/verdict-correction-dialog/verdict-correction-dialog.component.html` y `frontend/src/app/features/admin/verdict-correction-dialog/verdict-correction-dialog.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/admin/verdict-correction-dialog/verdict-correction-dialog.component.ts`.


### US5 (P2) — Páginas de error y coherencia visual

**Prueba independiente**. Abrir una ruta vedada y una inexistente. Verificar mensaje, enlace de salida, lectura con teclado, contraste y reflujo.

- [ ] T057 [P] [US5] Rediseñar la página 403 con título, mensaje accesible y enlaces de salida existentes. Extraer a `frontend/src/app/features/forbidden/forbidden.component.html` y `frontend/src/app/features/forbidden/forbidden.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/forbidden/forbidden.component.ts`.
- [ ] T058 [P] [US5] Rediseñar la página 404 con ilustración decorativa y enlace de retorno vigente. Extraer a `frontend/src/app/features/not-found/not-found.component.html` y `frontend/src/app/features/not-found/not-found.component.scss`. Enlazar los archivos en el decorador de `frontend/src/app/features/not-found/not-found.component.ts`.


**Control de fase**. Todas las vistas del mapa usan los patrones compartidos y las acciones autorizadas conservan los resultados de la línea base.

## Fase 5 — Verificación

**Objetivo**. Verificar compilación, regresión, aislamiento doble ciego, coherencia y contraste de toda la entrega.

- [ ] T059 Revisar el diff con `git diff --check` y contrastar los archivos modificados con `specs/003-ui-ux-overhaul/plan.md`. Revisar especialmente `frontend/src/app/app.routes.ts`, `frontend/src/app/core/auth/auth.guard.ts`, `frontend/src/app/core/auth/roles.guard.ts`, `frontend/src/app/core/auth/unsaved-changes.guard.ts` y `frontend/src/app/core/services/dashboard.service.ts`. Revisar también el diff de `frontend/src/app/core/services/` y `backend/`. Confirmar que los cambios a decoradores son de presentación y que el backend, las políticas de acceso y los contratos de API quedan intactos.
- [ ] T060 Desde `frontend/`, ejecutar `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit` y `npx ng build --configuration production` usando `frontend/tsconfig.app.json`, `frontend/tsconfig.spec.json` y `frontend/angular.json`. Verificar todas las plantillas, los presupuestos de Angular y la publicación de `frontend/public/icons/ui.svg`.
- [ ] T061 Desde `frontend/`, ejecutar `npx ng test --watch=false` con el runner vigente de `frontend/angular.json` y `frontend/package.json`. Verificar las suites existentes y comparar con la línea base de T001, incluidos shell, sesión, permisos, panel, catálogo y gestión.
- [ ] T062 Desde la raíz, ejecutar `python3 scripts/check_frontend_build.py` sobre el build de producción generado en T060, conforme a `.github/workflows/ci.yml`. Verificar el código de salida y el artefacto de `frontend/dist/gpc-frontend/`.
- [ ] T063 [US4] Desde la raíz, ejecutar `./scripts/e2e.sh` mediante `scripts/e2e.sh`. Confirmar sesión y ciclo editorial con `frontend/e2e/01-sesion.e2e.ts`, `frontend/e2e/02-ciclo-completo.e2e.ts` y `frontend/e2e/03-correccion.e2e.ts`, y doble ciego con `frontend/e2e/04-fuga-de-identidad.e2e.ts`. Comparar solicitudes y resultados con T002 y verificar catálogo anónimo, avisos y permiso de acceso al PDF. Usar dos cuentas distintas con roles múltiples para comprobar que las respuestas, el DOM y el árbol accesible no revelen datos restringidos.
- [ ] T064 [US5] Examinar los resultados de `frontend/e2e/05-accesibilidad.e2e.ts`, `frontend/e2e/06-teclado.e2e.ts` y `frontend/e2e/07-responsive.e2e.ts` en T063. Exigir cero infracciones A/AA en las vistas automatizadas y completar la matriz de `specs/003-ui-ux-overhaul/plan.md` a 320, 768 y 1366 px con 403/404, estados de carga/error/vacío, nombre largo, menús, tablas y diálogos. Verificar Tab, Escape, retorno del foco, lector de pantalla, texto ampliado, movimiento reducido y ausencia de desbordamiento global.
- [ ] T065 [US5] Medir colores computados de primer plano y fondo en las vistas de `specs/003-ui-ux-overhaul/plan.md` y en los patrones de `frontend/src/styles/_tokens.scss` y `frontend/src/styles.scss`. Registrar ratios por vista y estado, incluidos reposo, hover, foco, activo, error y badges. Confirmar 4.5:1 para texto normal, 3:1 para texto grande y 3:1 frente a colores adyacentes para elementos no textuales aplicables. Completar las mediciones que axe no cubra y corroborar que los estados y acciones siguen siendo distinguibles sin depender del color.

- [ ] T066 [US1] Comprobar en `frontend/src/app/core/layout/shell.component.html`, `frontend/src/app/core/layout/header.component.html` y `frontend/src/app/core/layout/notification-bell.component.html` la navegación con uno, varios y cero roles habilitados. Verificar enlaces permitidos, 403 por acceso directo no autorizado, ausencia de selector de rol, nombre íntegro y campana con cero, conteo positivo y más de 99 avisos. Comparar lo mostrado con el conteo exacto accesible.
- [ ] T067 [US3] Validar `frontend/src/app/features/catalog/catalog-search/catalog-search.component.html`, `frontend/src/app/features/catalog/catalog-list/catalog-list.component.html` y `frontend/src/app/features/catalog/catalog-detail/catalog-detail.component.html` en sesión anónima. Comparar filtros combinados, orden, paginación y recuperación por URL con T002. Comprobar carga, error, catálogo vacío, acción de limpiar filtros y acceso a ficha y PDF de los artículos admitidos.
- [ ] T068 [US5] Recorrer el inventario completo de `specs/003-ui-ux-overhaul/plan.md` y comprobar la aplicación de `frontend/src/styles/_tokens.scss` y de los patrones de `frontend/src/styles.scss`. Confirmar que listados y búsquedas sin datos tienen estado ilustrado distinguible de carga y error. Registrar resultados para SC-001 a SC-006 en la revisión de implementación.

## Dependencias y orden de ejecución

1. Registrar la línea base antes de editar fuentes. Definir los tokens antes de cambiar su entrada global. El sprite puede prepararse en paralelo con los tokens.
2. Completar fundamentos antes del shell y los compartidos. La cabecera consume la campana y el shell consume la cabecera y la barra lateral. La tarjeta KPI consume el estado vacío.
3. Tras los compartidos, ejecutar la fase 3 y la fase 4 en orden de ID. Dentro de cada bloque, las tareas `[P]` trabajan sobre archivos distintos y pueden adelantarse juntas. Integrar el panel después de sus cuatro resúmenes y ajustar sus pruebas después de la integración.
4. Ejecutar la fase 5 con el refactor completo. La comprobación del artefacto requiere un build de producción. La revisión manual de accesibilidad complementa la suite E2E.

### Trazabilidad de historias

| Historia | Entrega independiente | Criterios |
| --- | --- | --- |
| US1 | Shell, login y avisos | SC-001, SC-004 |
| US2 | Tarjetas KPI, cuatro resúmenes y panel | SC-002 |
| US3 | Búsqueda, resultados y ficha públicos | SC-003 |
| US4 | Gestión y auditoría con aislamiento doble ciego | SC-004 |
| US5 | Compartidos, errores y verificación transversal | SC-005, SC-006 |

### Ejemplos de trabajo en paralelo

- US1. Preparar la barra lateral y la campana después de fundamentos.
- US2. Refactorizar los cuatro resúmenes una vez creado el KPI.
- US3. Trabajar la cuadrícula de filtros y la ficha pública en paralelo.
- US4. Distribuir las vistas de gestión por módulo después de estabilizar los compartidos.
- US5. Refactorizar 403 y 404 en paralelo.

## Estrategia de implementación

**MVP**. Completar fundamentos, shell, login y avisos para validar US1 con una sesión multirrol real. Incorporar después catálogo y panel, gestión editorial y páginas de error. Cerrar el rediseño con todos los criterios de aceptación y la verificación de producción.
