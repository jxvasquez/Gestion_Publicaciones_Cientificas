# Implementation Plan: Rediseño integral de la interfaz y experiencia de usuario

**Branch** `003-ui-ux-overhaul` (referencia) | **Date** 2026-11-23 | **Spec** [spec.md](spec.md)

**Input** `specs/003-ui-ux-overhaul/spec.md`

## Summary

Modernizar toda la SPA mediante tokens CSS globales, HTML y SCSS con encapsulación por componente y un conjunto acotado de componentes de presentación. Usar las rutas, los bindings y los contratos existentes para renovar la navegación multirrol, el catálogo, los formularios y la gestión. La implementación conserva las clases TypeScript existentes, sus llamadas y validaciones, el acceso simultáneo a los roles habilitados y el doble ciego.

## Technical Context

| Aspecto | Contexto del repositorio |
| --- | --- |
| Lenguaje y versiones | TypeScript 6.0, Angular 22.2 y SCSS. El CI y el Dockerfile del frontend usan Node.js 22. |
| Dependencias | Angular Router, Angular Forms y RxJS vigentes. SVG locales y CSS nativo para el rediseño. |
| Almacenamiento | PostgreSQL y archivos PDF a través de los contratos vigentes. El rediseño consume los datos de presentación ya disponibles. |
| Pruebas | Angular TestBed con Vitest 5 y jsdom mediante `@angular/build:unit-test`. Playwright y axe-core en el stack Docker Compose para recorridos reales. |
| Plataforma | SPA web responsiva servida por Nginx. Verificación a 320, 768 y 1366 px como mínimo. |
| Rendimiento | Presupuestos vigentes de producción. Bundle inicial con aviso a 500 kB y error a 1 MB. Estilo por componente con aviso a 4 kB y error a 8 kB. |
| Restricciones | Cero selectores de rol. Contraste WCAG 2.2 AA. Doble ciego por vista y documento. Sin ampliación del tráfico de API ni dependencias de UI. |
| Alcance | Layout interno y público, 22 rutas de vista incluidas 403 y 404, componentes auxiliares y estilos globales. |

Referencias del entorno y configuración. [package.json](../../frontend/package.json) · [angular.json](../../frontend/angular.json) · [Dockerfile](../../frontend/Dockerfile) · [CI](../../.github/workflows/ci.yml).

## Constitution Check

*Control previo a la fase 0 y reevaluación tras el diseño de la fase 1.*

| Principio | Resultado del control de diseño |
| --- | --- |
| Separación y stack | Cumple. La implementación se concentra en `frontend/`, usa Angular y conserva la arquitectura, el stack del backend y la orquestación Docker Compose. |
| Convenciones y simplicidad | Cumple. Identificadores en inglés, documentación en español, componentes compartidos a partir de patrones vigentes y recursos locales. |
| Semántica institucional | Cumple en diseño. Verde para éxito o guardado, amarillo para advertencia, rojo para error, rechazo o acción destructiva y azul o gris para navegación y neutralidad. La implementación se acepta tras medir contraste. |
| Doble ciego y acceso | Cumple en diseño. Cada vista consume sus datos autorizados. Identidades restringidas quedan fuera de los bindings visibles, ocultos y accesibles. Se conservan guards, permisos por documento y contratos de respuesta. |
| Integridad editorial y documental | Cumple. Se mantienen validación del PDF, políticas de sesión, transiciones y plazos, historial y versiones inmutables, baja lógica y auditoría. |

Se vuelve a comprobar esta matriz con la revisión del diff y con las pruebas de regresión y accesibilidad. [Constitución del proyecto](../../.spec-kit/constitution.md).

## Project Structure

### Documentation (this feature)

```text
specs/003-ui-ux-overhaul/
├── spec.md
└── plan.md
```

El plan reúne los hallazgos de fase 0, las decisiones y contratos de presentación de fase 1 y la guía de verificación. Los modelos, migraciones y contratos de API vigentes se reutilizan. El flujo somete este plan a revisión antes de generar tareas.

### Source Code (repository root)

```text
frontend/
├── angular.json
├── public/
│   └── icons/ui.svg                     # nuevo sprite SVG local
├── src/
│   ├── index.html
│   ├── styles.scss                      # entrada global existente
│   ├── styles/
│   │   └── _tokens.scss                 # nuevo, declara :root
│   └── app/
│       ├── app.routes.ts
│       ├── core/
│       │   ├── auth/
│       │   ├── http/
│       │   ├── layout/
│       │   └── services/
│       ├── shared/components/
│       └── features/
│           ├── admin/
│           ├── auth/
│           ├── author/
│           ├── catalog/
│           ├── dashboard/
│           ├── editor/
│           ├── forbidden/
│           ├── not-found/
│           ├── notifications/
│           └── reviewer/
└── e2e/
backend/                                # API y servicios vigentes
```

**Structure Decision**. Las rutas se concentran en `app.routes.ts` y los componentes actuales son standalone. Las vistas y compartidos del mapa tienen plantillas embebidas en `.component.ts`. Sus archivos HTML y SCSS se crearán al lado de cada componente. Los únicos cambios en los `.ts` de producción existentes serán en metadatos de presentación de `@Component`, usando `templateUrl`, `styleUrl` y los `imports` requeridos por las nuevas plantillas. Se conservan selectores, inputs, outputs, handlers, validadores, selectores de foco, suscripciones y llamadas. El nuevo `KpiCardComponent` tendrá su propia declaración TypeScript puramente presentacional. El punto de entrada `index.html` y el `router-outlet` de `AppComponent` se reutilizan tal como están. [Rutas](../../frontend/src/app/app.routes.ts).

### Fase 0 — Hallazgos y decisiones

- `angular.json` ya registra `src/styles.scss` y copia `public/`. Se aprovechará esa configuración para cargar los tokens una vez y publicar el sprite SVG. Esto evita otro pipeline de estilos, paquetes de iconos y dependencias CSS en tiempo de ejecución.
- Los cuatro proveedores del panel devuelven `{}`. Se reutilizan la respuesta actual y los destinos autorizados. Las pruebas pueden suministrar conteos sintéticos, incluido cero, y el uso habitual mostrará el estado de métricas no disponibles. [Proveedores del panel](../../backend/apps/users/services/dashboard.py).
- Las pruebas unitarias existentes corren con Vitest y jsdom. Karma y Jasmine carecen de configuración y dependencias en este repositorio. Se conserva el runner de CI y se usa Chromium con Playwright para contraste, foco y comportamiento responsive. [Configuración de tipos de pruebas](../../frontend/tsconfig.spec.json) · [Configuración Playwright](../../frontend/playwright.config.ts).

### Fase 1 — Arquitectura de tokens y estilos globales

`frontend/src/styles.scss` cargará `@use 'styles/tokens';` al principio. `frontend/src/styles/_tokens.scss` declarará el único `:root` de tokens `--gpc-*`. Las hojas locales consumirán `var(--gpc-…)`. Se conservarán los nombres de tokens que ya usan los componentes y se completarán las variantes referenciadas por el código. No se volverá a importar el parcial en cada componente.

| Grupo | Aplicación planificada |
| --- | --- |
| Marca y semántica | Conservar el azul institucional `#1d4e89` y sus tonos actuales. Definir pares de texto, fondo y borde por éxito, advertencia, peligro, información y neutralidad. |
| Superficies y límites | `--gpc-workspace: #f1f5f9`, `--gpc-sidebar-bg: #f8fafc`, `--gpc-sidebar-divider: #e2e8f0` y tarjetas blancas. El divisor es decorativo. Los límites de controles usarán `--gpc-control-border: #64748b` como valor inicial y el foco tendrá su propio token contrastado. |
| Tipografía | Pila de sistema para interfaz. Pila serif local para títulos editoriales del catálogo y ficha. Escala en `rem` para metadatos, cuerpo y encabezados, con interlineado y peso comunes. |
| Espaciado y geometría | Escala de 4, 8, 12, 16, 24 y 32 px en `rem`. Radios de 8 y 12 px y pill de 999 px. Tokens de `260px` para la barra lateral y `64px` para la altura base de la cabecera. |
| Elevación e interacción | Sombras de baja intensidad para tarjetas y diálogos, un color de foco contrastado y transiciones cortas, desactivadas con `prefers-reduced-motion: reduce`. |

En `styles.scss` quedarán estilos de documento, foco visible, enlace de salto, texto para lectura asistida y patrones reutilizados de botones, badges, campos, tablas, superficies y diálogos. Las tablas conservan `.table-wrap` para aislar el desbordamiento. Las hojas locales definen la distribución de su vista. Se eliminarán las reglas `::ng-deep` del panel al trasladar su presentación a las tarjetas. El punto de quiebre inicial será el existente de `60rem`, con verificación de reflujo y zoom. [Estilos globales actuales](../../frontend/src/styles.scss).

### Fase 1 — Inventario de componentes de presentación

En la tabla, cada base `.component` identifica el `.ts` actual y sus dos nuevos archivos hermanos `.html` y `.scss`. Solo la fila de KPI añade un `.ts` de producción.

| Base bajo `frontend/src/app/` | Componente y contrato de presentación |
| --- | --- |
| `core/layout/shell.component` | `ShellComponent`. Sidebar fijo con espacio reservado en escritorio, cabecera y superficie de trabajo. Mantener feedback de API, enlace de salto, `main#main-content`, outlet y bindings actuales. En pantalla estrecha, variante plegable nativa con `details/summary` que reutiliza `app-side-nav`. Las variantes responsive se excluyen visualmente y del árbol accesible entre sí mediante `display: none`. |
| `core/layout/side-nav.component` | `SideNavComponent`. Incorporar un SVG por enlace, reutilizar `groups()` y rutas actuales. Conservar la clase activa de `RouterLinkActive`, añadir indicador lateral y anunciar el enlace activo con `ariaCurrentWhenActive`. |
| `core/layout/header.component` | `HeaderComponent`. Cabecera de 64 px de altura base, roles como pills y menú nativo de usuario que admite salto de línea para el nombre íntegro. Conservar entradas y salidas, botón textual «Cerrar sesión» con icono y selectores verificables de las etiquetas. |
| `core/layout/notification-bell.component` | `NotificationBellComponent`. SVG de campana y badge visual. Conserva `unreadCount`, `opened`, cero sin badge, `99+` visual y el nombre accesible con el conteo exacto. |
| `shared/components/empty-state.component` | `EmptyStateComponent`. Ilustración decorativa, mensaje anunciado con `role="status"` y acción contextual mediante los contratos `message`, `actionLabel` y `action` existentes. |
| `shared/components/status-badge.component` | `StatusBadgeComponent`. Consume tokens semánticos y muestra etiqueta legible. Conservar `status`, `STATUS_LABELS`, `STATUS_TONES` y fallback neutral. Los badges de área, idioma y rol reutilizan el patrón global. |
| `shared/components/kpi-card.component` (nuevo) | `KpiCardComponent` standalone. Recibe título de rol, icono y métricas explícitas ya autorizadas. Presenta cada conteo con su etiqueta, el cero real y el estado ilustrado si no hay métricas. Proyecta los enlaces de cada resumen. |
| `shared/components/public-header.component` | `PublicHeaderComponent`. Identidad común y enlaces públicos vigentes. |
| `shared/components/confirm-dialog.component` | `ConfirmDialogComponent`. Superficie, backdrop y jerarquía visual. Mantener el `dialog` nativo, `#dialog`, apertura, cancelación y cierre. |
| `shared/components/error-state.component` | `ErrorStateComponent`. Mensaje y reintento accesibles con tratamiento visual de error. |
| `shared/components/loading-spinner.component` | `LoadingSpinnerComponent`. Indicador y anuncio de carga coherentes, con movimiento reducido. |
| `shared/components/pagination.component` | `PaginationComponent`. Jerarquía visual, nombres accesibles y estados vigentes. |
| `shared/components/pdf-viewer.component` | `PdfViewerComponent`. Marco responsivo y acciones del PDF. Mantener fuentes, descargas y acceso autorizado. |
| `shared/components/round-counter.component` | `RoundCounterComponent`. Badge visual del contador de rondas existente. |

**Iconografía SVG reutilizable**. Crear `frontend/public/icons/ui.svg` con símbolos `dashboard`, `bell`, `logout`, `search`, `author`, `reviewer`, `editor`, `admin`, `history`, `expired`, `incident`, `menu`, `empty-state` y `alert`. Usar `<svg><use href="icons/ui.svg#…"></use></svg>` con `currentColor`. Los iconos decorativos tendrán `aria-hidden="true"`. Los controles conservarán nombre accesible mediante texto visible o su etiqueta vigente. La navegación resuelve iconos por los destinos existentes en su plantilla y conserva `groups()` como fuente de los enlaces.

**Contrato visual del KPI**. Los cuatro resúmenes conservan sus selectores e input `data`. Cada plantilla enlaza únicamente campos de conteo explícitos de su sección. El componente valida que se trate de números finitos, enteros y no negativos antes de pintarlos. Las claves de prueba, como `manuscripts` y `pending`, son ejemplos de presentación. El servicio no anuncia nuevas claves en su contrato. Se excluyen los volcados genéricos de objetos, metadatos y cadenas formateadas del DOM. Los accesos directos existen únicamente dentro del resumen habilitado. El panel conserva `data-section`, carga, error global, fallo por sección, reintento y estado sin roles, con la misma petición y la misma lógica de agrupación.

### Fase 1 — Mapa de refactorización por vista

Cada ruta de archivo de la tabla es relativa a `frontend/src/app/features/`. Por cada base `.component` se crearán y editarán sus hermanos exactos `.component.html` y `.component.scss`. La base identifica el `.component.ts` actual del que se extraen los metadatos inline. Los cuatro resúmenes del panel y 404 tienen plantilla inline y recibirán una hoja local inicial. Las demás vistas y auxiliares enumerados tienen también estilos inline. El encabezado público, la paginación, el visor PDF y los estados compartidos se modifican en las rutas del inventario anterior.

| Vista o punto de entrada existente | Bases de archivos HTML y SCSS | Trabajo de presentación |
| --- | --- | --- |
| Auth · `/login` | `auth/login/login.component` | Tarjeta de autenticación, legibilidad de campos y avisos. Se mantienen etiquetas, validación y redirección vigente. |
| Catálogo público · `/catalog` | `catalog/catalog-list/catalog-list.component` · `catalog/catalog-search/catalog-search.component` | Cuadrícula responsiva de filtros, icono de búsqueda, jerarquía de Buscar y Limpiar, tarjetas editoriales y estado ilustrado. Reutilizar el handler `clear()` desde la acción de estado vacío de una búsqueda filtrada. |
| Ficha pública · `/catalog/:code` | `catalog/catalog-detail/catalog-detail.component` | Título editorial, resumen, metadatos públicos y jerarquía del acceso al PDF. |
| Panel unificado · `/app/dashboard` | `dashboard/unified-dashboard/unified-dashboard.component` · `dashboard/author-summary/author-summary.component` · `dashboard/reviewer-summary/reviewer-summary.component` · `dashboard/editor-summary/editor-summary.component` · `dashboard/admin-summary/admin-summary.component` | Cuadrícula KPI. Accesos según la sección a Mis manuscritos, Mis asignaciones e historial, Nuevos envíos, Vencidas e Incidentes, o Auditoría. |
| Autor · `/app/author/manuscripts` | `author/manuscript-list/manuscript-list.component` | Filtros, tabla, badges, acciones y estados de listados activos y archivados. |
| Autor · `/app/author/manuscripts/new`, `/app/author/manuscripts/:id/edit` | `author/manuscript-form/manuscript-form.component` · `author/pdf-uploader/pdf-uploader.component` | Agrupación de campos, metadatos, coautoría y estado de adjuntos. Conservar controles, nombres de formulario y validación del PDF. |
| Autor · `/app/author/manuscripts/:id` | `author/manuscript-detail/manuscript-detail.component` · `author/withdraw-dialog/withdraw-dialog.component` | Detalle, tabla de autores autorizada, acciones de la versión y confirmación de baja. |
| Autor · `/app/author/manuscripts/:id/history` | `author/version-history/version-history.component` | Historial legible y distinción visual de versión y ronda. |
| Revisor · `/app/reviewer/assignments` | `reviewer/assignment-list/assignment-list.component` | Tabla de asignaciones, estados y acciones por fila. |
| Revisor · `/app/reviewer/assignments/:id` | `reviewer/assignment-detail/assignment-detail.component` · `reviewer/deadline-countdown/deadline-countdown.component` · `reviewer/conflict-dialog/conflict-dialog.component` · `reviewer/identity-leak-dialog/identity-leak-dialog.component` | Detalle anonimizado, aviso de plazo, visor PDF autorizado y diálogos. |
| Revisor · `/app/reviewer/assignments/:id/evaluate`, `/app/reviewer/history` | `reviewer/evaluation-form/evaluation-form.component` · `reviewer/evaluation-history/evaluation-history.component` | Secciones y mensajes de evaluación, listado histórico y badges. |
| Editor · `/app/editor/submissions`, `/app/editor/submissions/:id` | `editor/submission-inbox/submission-inbox.component` · `editor/submission-detail/submission-detail.component` · `editor/assign-reviewer-dialog/assign-reviewer-dialog.component` · `editor/reviewer-picker/reviewer-picker.component` · `editor/verdict-form/verdict-form.component` | Bandeja, tablas del detalle, asignación y veredicto con jerarquía de acciones y tratamiento de validación. |
| Editor · `/app/editor/assignments/expired`, `/app/editor/incidents` | `editor/expired-assignments/expired-assignments.component` · `editor/revoke-assignment-dialog/revoke-assignment-dialog.component` · `editor/incident-list/incident-list.component` | Listados, diálogo de revocación compartido con el detalle y presentación del tipo y estado de los incidentes. Mantener el tratamiento confidencial. |
| Administrador · `/app/admin/audit` | `admin/audit-log-list/audit-log-list.component` · `admin/audit-filters/audit-filters.component` | Cuadrícula de filtros, tabla de eventos, acciones y estado vacío. |
| Administrador · `/app/admin/audit/:id` | `admin/audit-log-detail/audit-log-detail.component` · `admin/verdict-correction-dialog/verdict-correction-dialog.component` | Detalle de auditoría de solo lectura y presentación de la corrección mediante el flujo autorizado. |
| Avisos · `/app/notifications` | `notifications/notification-list/notification-list.component` · `notifications/notification-item/notification-item.component` | Jerarquía de avisos leídos y pendientes, filtros, paginación y acciones vigentes. |
| Acceso denegado · `/forbidden` | `forbidden/forbidden.component` | Mensaje accesible y enlaces existentes. |
| Página no encontrada · ruta comodín `**` | `not-found/not-found.component` | Ilustración decorativa y salida por el enlace vigente. |

Mantener los campos y validadores de formularios, handlers, parámetros de URL, nombres accesibles, eventos y referencias de plantilla. En las tablas, preservar encabezados semánticos y acciones y añadir estados visuales `:hover` y `:focus-within`. En diálogos, conservar los hooks de foco, el `dialog` nativo y su orden de acciones. En las vistas sensibles, no agregar campos de identidad en atributos, tooltips, texto para lectores de pantalla ni fragmentos ocultos.

### Orden de implementación

1. Extraer tokens y ajustar estilos globales. Incorporar el sprite y refactorizar shell y compartidos.
2. Extraer y modernizar inicio de sesión, catálogo, panel y avisos con los mismos contratos de vista. Conectar los resúmenes al KPI y a los destinos actuales.
3. Aplicar los patrones a Autor, Revisor, Editor y Administrador, a sus diálogos y a las páginas 403 y 404.
4. Comprobar el alcance del diff, las pruebas existentes y la matriz de verificación antes de cerrar la implementación.

### Estrategia de verificación

**Compilación y pruebas unitarias**. Registrar una línea base y repetir estos comandos tras el refactor desde `frontend/`, en el entorno Node del CI y con el lockfile existente.

```bash
npm ci
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.spec.json --noEmit
npx ng build --configuration production
npx ng test --watch=false
```

Desde la raíz, ejecutar `python3 scripts/check_frontend_build.py` para aplicar las mismas comprobaciones del artefacto de producción que el CI. El build debe compilar todas las plantillas, empaquetar `icons/ui.svg` y respetar los presupuestos. `ng test` corre los `*.spec.ts` existentes en Vitest y jsdom. En las suites de panel y resúmenes, ajustar el montaje de Router y, si la plantilla lo requiere, los datos de prueba y las aserciones de contenido visual. Mantener las aserciones funcionales de guard, navegación, permisos, respuesta parcial y petición única. Validar conteo ausente frente a cero con respuestas de prueba. [Scripts npm](../../frontend/package.json) · [CI](../../.github/workflows/ci.yml).

**Regresión funcional y accesibilidad**. Desde la raíz, con Docker Compose, el `.env` del proyecto y las dependencias del frontend instaladas, ejecutar `./scripts/e2e.sh`. Para iterar sobre accesibilidad puede usarse `./scripts/e2e.sh 05-accesibilidad 06-teclado 07-responsive`. El script inicia el stack aislado. Reutilizar los recorridos de sesión, ciclo completo, corrección y fuga de identidad. Comparar para la misma operación métodos, rutas, parámetros, cuerpos, número de llamadas y resultados de la API antes y después, incluidas carga inicial de panel y avisos, búsqueda pública, acciones editoriales y reintentos. Las solicitudes de recursos estáticos se evalúan como parte del build. [Script E2E](../../scripts/e2e.sh) · [Pruebas de doble ciego](../../frontend/e2e/04-fuga-de-identidad.e2e.ts).

| Criterios de la especificación | Evidencia de aceptación |
| --- | --- |
| SC-001 · Navegación | Cuentas de un rol, multirrol y sin roles. Enlaces y tarjetas autorizados, cero selectores de rol, nombre largo íntegro y campana con cero, un conteo positivo y más de 99 avisos. Acceso directo 403 cuando corresponda. |
| SC-002 · Panel | Respuestas de prueba con conteos positivos, cero, campos ausentes y fallo parcial. Verificar tarjetas, mensajes, reintento vigente y que se mantenga una sola petición por carga. |
| SC-003 · Catálogo | Pruebas anónimas con texto y filtros combinados, orden, paginación, restauración por URL, ficha y PDF. Comparar la lista de resultados con la línea base. Probar catálogo vacío, sin coincidencias y fallo. |
| SC-004 · Flujos y privacidad | Ejecutar regresiones de sesión, avisos, guard de cambios sin guardar y ciclo editorial. Con el mismo manuscrito y dos cuentas distintas, comprobar DOM, árbol accesible, avisos y respuestas de cada contexto. El Revisor no recibe nombres, correos ni filiaciones del Autor y el Autor no recibe identidad del Revisor. Repetir con roles múltiples activos y validar el acceso al PDF según el rol. |
| SC-005 · Contraste, foco y reflujo | Ejecutar axe y las suites de teclado y responsive vigentes. Completar manualmente lo que falte a 320 px, 768 px y 1366 px, con texto ampliado, movimiento reducido, 403/404, menús abiertos y cerrados y diálogos. Verificar orden de Tab, foco visible, Escape y retorno en diálogos, lectura asistida, acciones en tablas y ausencia de desbordamiento horizontal de página. |
| SC-006 · Consistencia y estados | Recorrer todo el mapa de vistas y estados de carga, error, vacío y contenido. Confirmar reutilización de tokens y patrones, y registrar capturas o hallazgos por pantalla y estado. |

El control de contraste se hará sobre colores computados y fondos efectivos, incluidos reposo, hover, foco, activo, error y badges. Registrar por pantalla y estado el texto o control, color frontal, fondo y ratio medido. Aplicar `4.5:1` a texto normal, `3:1` a texto grande y `3:1` frente a colores adyacentes a los controles y estados no textuales que lo requieran. Axe debe pasar sin infracciones A/AA en las vistas automatizadas. Completar con medición manual de estados que axe no cubra y una pasada con lector de pantalla. [Suite axe](../../frontend/e2e/05-accesibilidad.e2e.ts) · [Suite de teclado](../../frontend/e2e/06-teclado.e2e.ts) · [Suite responsive](../../frontend/e2e/07-responsive.e2e.ts) · [WCAG 2.2, contraste de texto](https://www.w3.org/TR/WCAG22/#contrast-minimum) · [WCAG 2.2, contraste no textual](https://www.w3.org/TR/WCAG22/#non-text-contrast).

## Complexity Tracking

La revisión del diseño confirma que las decisiones se ajustan a la constitución. La extracción de archivos afecta a metadatos de componentes existentes. La única clase nueva de la SPA prevista es `KpiCardComponent`, dedicada a presentación.
