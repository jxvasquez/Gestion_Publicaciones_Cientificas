# Implementation Plan: Asignación automática por carrera, ranking de revisores y rúbrica profesional

**Branch** `004-auto-assign-ranking-rubric` (referencia) | **Date** 2026-11-24 | **Spec** [spec.md](spec.md)

**Input** `specs/004-auto-assign-ranking-rubric/spec.md`

## Summary

Retirar el rol Editor y reemplazar sus decisiones por tres mecanismos del backend:

- Un **motor de asignación** serializado que cubre dos cupos por versión, y un tercero en desempate, con revisores de la misma carrera ordenados por ranking y carga, sin superar cinco asignaciones activas.
- Una **decisión automática** por consenso o mayoría, que reutiliza la publicación, las rondas y la auditoría vigentes.
- Un **ciclo programado** que vence, penaliza y reasigna las asignaciones vencidas.

La evaluación pasa a una rúbrica de cinco criterios con justificación obligatoria. Los incidentes de doble ciego y la corrección de veredictos se trasladan al Administrador. La SPA elimina el módulo Editor y agrega desempeño del revisor, padrón, catálogo de carreras e incidentes, con el sistema de diseño de 003. Las evaluaciones, veredictos, eventos y auditoría heredados se conservan intactos mediante migraciones que solo usan DDL o actualizan filas mutables.

## Technical Context

| Aspecto | Contexto del repositorio |
| --- | --- |
| Lenguaje y versiones | Python 3.12, Django 5.2.18, DRF 3.18.3, SimpleJWT 5.5.1 y drf-spectacular 0.30.0. TypeScript 6.0, Angular 22.2 standalone y SCSS. Node 22 en CI y en la imagen del frontend. |
| Dependencias | Sin dependencias nuevas. Cron del servidor con `flock` y comandos de gestión de Django, igual que el vencimiento y los avisos actuales. |
| Almacenamiento | PostgreSQL 16 con disparadores, índices parciales, restricciones `CHECK` y cerrojos consultivos. PDFs en el volumen privado vigente. |
| Pruebas | pytest 9.1, pytest-django 4.14, factory-boy 3.3 y freezegun 1.5. Vitest 5 con jsdom. Playwright 1.64.1 y `@axe-core/playwright` 4.11 en el stack aislado de `scripts/e2e.sh`. La CI exige 80 % de cobertura en servicios y permisos. |
| Plataforma | Docker Compose con Gunicorn, Nginx con la SPA y PostgreSQL. Cron del servidor según `scripts/cron/gpc.cron`. |
| Tipo de proyecto | Aplicación web: SPA Angular y API REST con Django y DRF. |
| Rendimiento | Asignación y veredicto en menos de un minuto tras el evento. Vencimiento procesado en un máximo de dos minutos. Consultas de candidatos y paneles sin N+1, verificadas con `tests/performance/test_query_scaling.py`. Presupuestos de Angular vigentes: aviso a 500 kB y error a 1 MB en el paquete inicial, y 4 y 8 kB por hoja de componente. |
| Restricciones | Tres roles y ningún selector de rol. Doble ciego en API, DOM, árbol accesible, documentos y avisos. Inmutabilidad de versiones, evaluaciones finales, veredictos, eventos y auditoría. Baja lógica. Toda acción crítica se audita o no se completa. WCAG 2.2 AA. |
| Escala | Padrón de decenas de revisores por carrera y decenas de envíos por semana. Se retiran 11 rutas de la API del Editor y 4 vistas de la SPA. Se agregan 3 vistas de administración. |

Referencias: [requisitos](../../backend/requirements/base.txt) · [package.json](../../frontend/package.json) · [docker-compose.yml](../../docker-compose.yml) · [cron](../../scripts/cron/gpc.cron) · [CI](../../.github/workflows/ci.yml).

## Constitution Check

*Control previo a la fase 0 y reevaluación tras el diseño de la fase 1. Resultado: sin violaciones.*

| Principio | Resultado |
| --- | --- |
| Arquitectura y Docker | Cumple. Los cambios quedan en `backend/` y `frontend/`. El arranque de `docker-compose.yml` agrega un comando idempotente y el cron reutiliza su plantilla. |
| Stack restrictivo | Cumple. Django, DRF, Angular y PostgreSQL, sin colas, brokers ni frameworks nuevos. La automatización usa comandos de gestión, igual que hoy. |
| Idioma | Cumple. Identificadores, códigos y endpoints en inglés. Textos de interfaz, documentación y commits en español. |
| SOLID, KISS, DRY y YAGNI | Cumple. Un solo motor cubre envíos, liberaciones, desempates y transición. La decisión es una función pura. Se reutilizan los componentes de 003 y se elimina el código del Editor. Quedan fuera las apelaciones, la asignación manual y las invitaciones. |
| Documentación | Cumple en diseño. Se actualizan `README.md`, `QUICKSTART.md`, `docs/RUNBOOK.md` y el sitio `docs-site/`, incluida la referencia de la API regenerada. |
| Semántica visual | Cumple en diseño. Cambios solicitados en amarillo, En desempate en azul, Rechazado y penalización en rojo, bonificación y Aceptado en verde, y acciones neutras en azul o gris, siempre con texto. Se acepta tras medir contraste. |
| Doble ciego | Cumple en diseño. Serializadores de lista blanca por rol. El desempeño y los ajustes no incluyen identidades. El revisor de desempate no accede a otras evaluaciones. El Autor ve «Revisor N». Avisos con la carga útil vigente. |
| Solo PDF y versionado | Cumple. La validación del PDF y la creación de versiones no cambian. Las instantáneas nuevas agregan `areas` sin tocar las anteriores. |
| Integridad de datos | Cumple. Sin `DELETE` de manuscritos. Tablas nuevas append-only con disparador. Las migraciones no actualizan filas inmutables. |

[Constitución](../../.spec-kit/constitution.md).

## Project Structure

### Documentation (this feature)

```text
specs/004-auto-assign-ranking-rubric/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── contracts/api.md
├── quickstart.md
└── tasks.md            # generado por /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── apps/users/
│   ├── models.py                       # AcademicArea, Role sin EDITOR, ReviewerProfile
│   ├── migrations/0004_academic_area_ranking.py            # nuevo
│   ├── services/{auth,dashboard,provisioning}.py
│   ├── permissions.py                  # sin IsEditor
│   ├── views.py                        # AreaListView pública
│   ├── admin_views.py · admin_urls.py  # nuevos: catálogo de carreras
│   └── management/commands/{seed_roles,seed_dev_users,create_user}.py
├── apps/publications/
│   ├── models.py                       # Manuscript.areas, estados, Verdict, VerdictEvaluation
│   ├── migrations/0010_manuscript_areas_states.py           # nuevo
│   ├── migrations/0011_verdict_origin_basis.py              # nuevo
│   ├── services/{manuscripts,snapshot,submission,versions,verdicts,corrections,withdraw,history}.py
│   ├── serializers.py · views.py · catalog_*.py · filters.py
│   └── admin_views.py · admin_urls.py  # corrección de veredicto
├── apps/reviews/
│   ├── policy.py                       # nuevo: constantes
│   ├── models.py                       # Assignment, Evaluation, RankingAdjustment
│   ├── migrations/0004_assignment_slots_capacity.py         # nuevo
│   ├── migrations/0005_evaluation_rubric.py                 # nuevo
│   ├── migrations/0006_ranking_adjustment.py                # nuevo
│   ├── services/{eligibility,assignments,evaluations,incidents,inbox}.py
│   ├── services/{ranking,standing,consensus,automation}.py  # nuevos
│   ├── services/expiration.py          # eliminado
│   ├── serializers.py · views.py · reviewer_urls.py · signals.py · receivers.py
│   ├── admin_views.py · admin_urls.py  # nuevos: incidentes y padrón
│   ├── urls.py                         # eliminado: API del Editor
│   └── management/commands/
│       ├── run_review_automation.py    # nuevo
│       ├── apply_auto_review_transition.py                  # nuevo
│       └── mark_expired_assignments.py # eliminado
├── apps/notifications/{services,receivers}.py
├── config/{api,openapi}.py
└── tests/                              # ver tasks.md
frontend/
├── public/icons/ui.svg
├── e2e/                                # 01 a 07 y support/
└── src/app/
    ├── app.routes.ts
    ├── core/models/{role,audit,manuscript,reviewer,catalog,dashboard}.model.ts
    ├── core/models/{rubric,incident,area}.model.ts         # nuevos
    ├── core/models/editor.model.ts     # eliminado
    ├── core/services/{reviewer,manuscript,audit,catalog}.service.ts
    ├── core/services/{area,admin}.service.ts               # nuevos
    ├── core/services/editor.service.ts # eliminado
    ├── core/layout/side-nav.component.*
    ├── shared/components/{kpi-card,status-badge}.component.*
    └── features/
        ├── editor/                     # eliminado
        ├── dashboard/{reviewer-summary,admin-summary,unified-dashboard}/
        ├── dashboard/editor-summary/   # eliminado
        ├── author/{manuscript-form,manuscript-detail,manuscript-list,version-history}/
        ├── reviewer/{evaluation-form,assignment-list,assignment-detail,evaluation-history,conflict-dialog,identity-leak-dialog}/
        ├── reviewer/reviewer-standing/ # nuevo
        ├── admin/{incident-list,reviewer-roster,reviewer-edit-dialog,area-catalog}/  # nuevos
        ├── admin/{verdict-correction-dialog,audit-log-detail}/
        └── catalog/{catalog-search,catalog-list,catalog-detail}/
docker-compose.yml · scripts/cron/gpc.cron · scripts/e2e/seed_e2e.py · scripts/load/ · scripts/verify/
README.md · QUICKSTART.md · docs/RUNBOOK.md · docs-site/ · .spec-kit/specify.md
```

**Structure Decision**. Se conserva la separación por apps y por funcionalidades. `AcademicArea` vive en `apps.users`, de la que ya dependen `publications` y `reviews`, para evitar ciclos de migración. El motor, el ranking, el consenso y la automatización son servicios de `apps.reviews`, el dueño de asignaciones y evaluaciones. `apps.publications` expone `apply_decision()` como núcleo único de los veredictos. La SPA elimina `features/editor/` y crea en `features/admin/` las vistas que heredan sus responsabilidades. Los componentes nuevos siguen el patrón standalone de 003, con `templateUrl` y `styleUrl` hermanos.

## Fase 0 — Investigación

Las decisiones están en [research.md](research.md). No queda ningún `NEEDS CLARIFICATION`.

- Rol `EDITOR` revocado con auditoría y conservado como historial inactivo (R-01).
- Catálogo `AcademicArea` en relaciones de muchos a muchos, sembrado con los valores en uso para mantener las coincidencias exactas (R-02).
- Rúbrica versionada con `rubric_version`, sin reescribir evaluaciones finales, y conteo de caracteres por puntos de código (R-03 y R-04).
- `CHANGES_REQUESTED` y `TIE_BREAKER` como estados, con códigos heredados solo en registros inmutables (R-05).
- Motor serializado con un cerrojo consultivo, cupos y cola FIFO derivada, y límite de cinco con servicio y disparador (R-06 a R-08).
- Ranking con puntaje en el perfil y bitácora append-only (R-09).
- Automatización cada minuto y veredicto desacoplado de la evaluación, con conciliación (R-10 y R-11).
- Veredicto sin Editor (`decided_by`, `origin` y `VerdictEvaluation`) e incidentes y correcciones en el módulo del Administrador (R-12 a R-14).
- Retiro de los comentarios confidenciales, avisos nuevos, frontend sin Editor y transición idempotente (R-15 a R-18).
- Pruebas con reloj controlado, concurrencia, migraciones y E2E (R-19).

## Fase 1 — Diseño

Artefactos: [data-model.md](data-model.md) · [contracts/api.md](contracts/api.md) · [quickstart.md](quickstart.md).

### Flujos del sistema

1. **Envío y asignación**. `submit_manuscript()` y `submit_new_version()` registran la versión en `SUBMITTED` y programan `fill_review_slots(manuscript_id)` con `on_commit`. El motor toma `pg_advisory_xact_lock(ASSIGNMENT_LOCK_KEY)`, bloquea el manuscrito, calcula los cupos pendientes y crea una asignación por cupo con el primer candidato de `eligible_candidates()`. Usa `assigned_by=NULL` y el plazo de PostgreSQL. Con la primera asignación pasa a `UNDER_REVIEW` y registra `StatusEvent` y `review_started`. Por cada cupo sin candidato audita `ASSIGNMENT_SLOT_UNFILLED` y emite `slot_unfilled`.
2. **Evaluación y veredicto**. `submit_evaluation()` valida la rúbrica y la justificación, registra la evaluación final, completa la asignación, aplica +10 con `ranking.adjust()`, audita y programa `decide_version()`. Esta función bloquea el manuscrito y no hace nada si existe un reporte abierto, un veredicto ordinario o un estado distinto de `UNDER_REVIEW` o `TIE_BREAKER`. Con las evaluaciones de los cupos completados aplica `consensus.outcome()`. Un desempate pasa a `TIE_BREAKER`, audita `TIE_BREAK_STARTED` y programa el motor. Las demás decisiones llaman a `apply_decision()`, que crea el `Verdict` del sistema y sus `VerdictEvaluation`, publica o retira del catálogo, abre la ronda en `CHANGES_REQUESTED`, escribe `StatusEvent`, audita y emite `verdict_registered`.
3. **Vencimiento**. El cron ejecuta `run_review_automation` cada minuto. `expire_overdue()` procesa cada asignación `ACTIVE` con `due_at <= now()` en su propia transacción, con `select_for_update(skip_locked=True)`. La pasa a `EXPIRED` con `release_cause='OVERDUE'`, aplica −20, audita y emite `assignment_expired`. Después corren `reconcile_pending_verdicts()` y `fill_pending_slots()`.
4. **Liberaciones**. `release_assignment()` revoca sin ranking por conflicto declarado, reasignación de incidente, versión anonimizada o baja. Audita `ASSIGNMENT_RELEASED`, emite `assignment_revoked` y programa `fill_pending_slots()`. La baja libera todas las asignaciones activas del manuscrito.
5. **Incidentes**. `report_incident()` no cambia. `resolve_incident()` usa el ámbito `for_admin()`, aplica las resoluciones de FR-005 y, al cerrarse el último reporte abierto, programa `decide_version()`.
6. **Corrección**. `correct_verdict()` valida el conflicto de autoría y `consumption_problem()`, crea y consume la `VerdictCorrection` y llama a `apply_decision(origin='ADMIN_CORRECTION')`, que copia la base del veredicto original.
7. **Desempeño y panel**. `standing.py` calcula en consultas agregadas el puntaje, las asignaciones activas, las evaluaciones a tiempo, los vencimientos y la carga, para el panel, `GET /reviewer/standing/` y el padrón. `build_admin_section()` cuenta reportes abiertos y manuscritos con cupos pendientes.

Regla de bloqueo: toda transacción que crea asignaciones toma primero el cerrojo consultivo y después las filas. Las que solo liberan cupos no asignan: programan el motor tras el commit.

### Mapa de cambios del backend

| Archivo | Cambio |
| --- | --- |
| `apps/users/models.py` y migración `0004` | `AcademicArea`. `Role.Code` sin `EDITOR`. `ReviewerProfile.areas` y `ranking_score`. Se eliminan `expertise_areas` y `max_active_assignments`. |
| `apps/users/services/auth.py` | `active_role_codes()` exige `role__is_active=True`. |
| `apps/users/permissions.py` | Sin `IsEditor`. `IsAdmin` documenta incidentes con documento acotado, padrón, carreras y corrección. |
| `apps/users/services/dashboard.py` | Sin sección del Editor. Métricas en las secciones del Revisor y del Administrador. |
| `apps/users/services/provisioning.py` y `create_user.py` | `--areas` acepta nombres o códigos del catálogo activo y falla ante uno desconocido. |
| `apps/users/management/commands/seed_roles.py` y `seed_dev_users.py` | Tres roles, `EDITOR` inactivo y cuentas de la quickstart. |
| `apps/users/views.py`, `admin_views.py`, `admin_urls.py` y `admin.py` | `GET /areas/` público, catálogo del Administrador y registro de desarrollo. |
| `apps/publications/models.py` y migraciones `0010` y `0011` | `Manuscript.areas` y estados. `Verdict.decided_by`, `origin`, `VerdictEvaluation` y restricciones. Sin `for_editor()`. |
| `apps/publications/services/manuscripts.py` y `snapshot.py` | De 1 a 3 carreras activas, instantánea con `areas` y comparación normalizada. |
| `apps/publications/services/submission.py` y `versions.py` | `CHANGES_REQUESTED` y motor programado con `on_commit`. |
| `apps/publications/services/verdicts.py` | `apply_decision()` sin Editor. Se elimina `register_verdict()`. |
| `apps/publications/services/corrections.py`, `admin_views.py` y `admin_urls.py` | `correct_verdict()` y `POST /admin/verdicts/{id}/correct/`. |
| `apps/publications/services/withdraw.py` y `history.py` | Motivo de baja en `TIE_BREAKER`, eventos de desempate y decisión automática, y etiquetas heredadas. |
| `apps/publications/serializers.py`, `views.py`, `catalog_*.py` y `filters.py` | `areas`, `feedback.reviews`, solo `IsAuthor` y filtro por código. Se elimina `EditorManuscriptSerializer`. |
| `apps/reviews/policy.py` y `models.py` | Constantes, cupos, `release_cause`, rúbrica 2, `RankingAdjustment` y `for_admin()`. |
| `apps/reviews/migrations/0004` a `0006` | Cupos y disparador de capacidad, rúbrica y bitácora. |
| `apps/reviews/services/eligibility.py` | `eligible_candidates()` con el orden de FR-012. `has_conflict()` no cambia. |
| `apps/reviews/services/assignments.py` | `fill_review_slots()`, `fill_pending_slots()` y `release_assignment()`. Se eliminan las acciones del Editor. |
| `apps/reviews/services/ranking.py`, `standing.py`, `consensus.py` y `automation.py` | Ajustes, métricas, decisión y ciclo programado. Se elimina `expiration.py`. |
| `apps/reviews/services/evaluations.py`, `incidents.py` e `inbox.py` | Rúbrica, justificación, bonificación, conflicto que libera, resolución del Administrador y `EXPIRED` terminal. |
| `apps/reviews/serializers.py`, `views.py` y `reviewer_urls.py` | Rúbrica, `areas`, desempeño y ajustes. Sin código del Editor. |
| `apps/reviews/admin_views.py` y `admin_urls.py` | Incidentes, documento del incidente y padrón. Se elimina `urls.py`. |
| `apps/reviews/signals.py` y `receivers.py` | `review_started`, `tie_break_started` y `slot_unfilled`. La baja libera todas las asignaciones activas. |
| `apps/reviews/management/commands/` | `run_review_automation` y `apply_auto_review_transition`. Se elimina `mark_expired_assignments`. |
| `apps/notifications/services.py` y `receivers.py` | `admins_for()` y receptores según el contrato. Sin destinatarios Editor. |
| `config/api.py` y `config/openapi.py` | Rutas `areas/`, `admin/` y `reviewer/standing/`. Sin `editor/`. Etiquetas actualizadas. |

### Mapa de cambios del frontend

| Archivo o carpeta | Cambio |
| --- | --- |
| `app.routes.ts` | Sin `editor/*`. Nuevas `admin/incidents`, `admin/reviewers` y `admin/areas` con `rolesGuard` y `ADMIN`. |
| `core/models/role.model.ts` y `audit.model.ts` | `Role` con tres valores. `actor_role` admite el código heredado y nulo, con las etiquetas «Editor (rol retirado)» y «Sistema». Acciones nuevas. |
| `core/models/rubric.model.ts`, `incident.model.ts` y `area.model.ts` | Criterios, niveles y descriptores, dictámenes, `requiresJustification()` y `characterCount()`. Tipos de incidente trasladados. Carrera y padrón. |
| `core/models/manuscript.model.ts`, `reviewer.model.ts`, `catalog.model.ts` y `dashboard.model.ts` | Estados nuevos, `areas`, `feedback.reviews`, desempeño, ajustes y secciones sin Editor. `VerdictDecision` pasa a `manuscript.model.ts`. |
| `core/services/area.service.ts` y `admin.service.ts` | `GET /areas/` compartido con `shareReplay`. Incidentes, documento, padrón, carreras y corrección. |
| `core/services/reviewer.service.ts`, `manuscript.service.ts` y `audit.service.ts` | Rúbrica, desempeño y `areas`. La corrección pasa a `admin.service.ts`. |
| `core/layout/side-nav.component.*` y `public/icons/ui.svg` | Sin grupo ni símbolo `editor`. Administrador con Auditoría, Incidentes, Revisores y Carreras. Símbolo `areas`. |
| `shared/components/kpi-card.component.*` | `max` opcional para «3/5» con nombre accesible «3 de 5». Sin icono `editor`. |
| `shared/components/status-badge.component.ts` | Estados, dictámenes y causas nuevas con tono semántico. `REQUIRES_CORRECTIONS` queda como etiqueta heredada. |
| `features/dashboard/` | Resúmenes con métricas de Revisor y Administrador. Se eliminan `editor-summary/` y su rama del panel. |
| `features/author/` | Selector accesible de 1 a 3 carreras, `CHANGES_REQUESTED`, reseñas «Revisor N», siguiente acción y carga de versión. |
| `features/reviewer/evaluation-form/` | Rúbrica con `fieldset`, `legend` y descriptor por nivel. Cuatro dictámenes, contador con `aria-live="polite"`, mínimo dinámico y sin comentarios confidenciales. |
| `features/reviewer/reviewer-standing/` | `KpiCardComponent` con puntaje, cupo, evaluaciones a tiempo y vencimientos, más historial paginado con `EmptyStateComponent`. |
| `features/reviewer/` (demás vistas) | `areas`, desempeño en la bandeja, liberación por conflicto y textos dirigidos al Administrador. |
| `features/admin/incident-list/` | Se traslada desde `features/editor/incident-list/` con filtros, documento y resoluciones mediante `ConfirmDialogComponent`. |
| `features/admin/reviewer-roster/`, `reviewer-edit-dialog/` y `area-catalog/` | Padrón con filtros, edición de carreras y disponibilidad, y catálogo con alta, cambio de nombre y activación. |
| `features/admin/verdict-correction-dialog/` y `audit-log-detail/` | Decisión, observaciones y motivo. Llamada a `correct/`. |
| `features/catalog/` | Selector de carrera y badges de varias carreras. |
| `features/editor/`, `core/models/editor.model.ts` y `core/services/editor.service.ts` | Eliminados con sus specs y fixtures. |
| `e2e/` | Recorridos sin Editor, desempate, incidentes del Administrador y vistas nuevas en las suites de accesibilidad. |

### Presentación y accesibilidad

- Cada criterio es un `fieldset` con `legend`. Cada opción combina el número, el nombre del nivel y el descriptor en su `label`, de modo que el lector de pantalla los anuncia juntos. El grupo conserva el foco con flechas y los errores usan `role="alert"`, como el formulario vigente.
- El contador de los comentarios muestra «N/100» solo cuando aplica el mínimo y anuncia el cambio con `aria-live="polite"`. El mínimo aparece en la ayuda visible del campo.
- Las insignias y deltas usan los tokens semánticos de `_tokens.scss` y siempre muestran texto, como «+10 a tiempo» y «−20 vencida». Los estados vacíos del padrón, los ajustes, los incidentes y el catálogo de carreras reutilizan `EmptyStateComponent`.
- El selector de carreras es un grupo de casillas con `fieldset`, `legend` y un contador «N de 3». No incorpora librerías nuevas.

## Transición y despliegue

1. Respaldar con `scripts/backup.sh` antes de desplegar, conforme a `docs/RUNBOOK.md`.
2. `migrate` aplica las seis migraciones en el orden de [data-model.md](data-model.md#migraciones).
3. `apply_db_privileges` vuelve a aplicar los privilegios. Las tablas nuevas reciben los privilegios operativos y sus disparadores las protegen.
4. `apply_auto_review_transition` se ejecuta en el arranque de `docker-compose.yml`, después de los privilegios. Revoca roles `EDITOR` con auditoría `ROLE_REVOKED`, cierra con `LEGACY_TRANSITION` las asignaciones `EXPIRED` heredadas y ejecuta `fill_pending_slots()` sobre los manuscritos en curso. No hace nada si se repite.
5. `scripts/cron/gpc.cron` reemplaza la línea de `mark_expired_assignments` por `run_review_automation` con su propio `flock`. `backend/tests/test_cron_template.py` lo verifica.
6. En las versiones heredadas, `reconcile_pending_verdicts()` decide cuando se completan las dos evaluaciones, con la clasificación de los dictámenes de la versión 1.

## Orden de implementación

1. Registrar la línea base de backend, frontend y E2E.
2. Políticas, modelos, migraciones y retirada de `EDITOR` en permisos y rutas del backend.
3. Motor de asignación y envío automático (US1).
4. Rúbrica en backend y formulario (US2).
5. Consenso, desempate, retroalimentación del Autor y catálogo (US3).
6. Ranking, automatización, desempeño y panel del Revisor (US4).
7. Retirada del Editor en la SPA, incidentes, corrección, transición, avisos y panel del Administrador (US5).
8. Padrón y catálogo de carreras (US6).
9. Documentación, E2E, accesibilidad y verificación final.

## Estrategia de verificación

Comandos y escenarios en [quickstart.md](quickstart.md).

| Criterio | Evidencia |
| --- | --- |
| SC-001 | Pruebas del motor con candidatos de varias carreras, autoría por cuenta y por correo, participación previa y orden completo. E2E de envío. |
| SC-002 | 20 envíos simultáneos con `tests/parallel.py` y base transaccional. Prueba directa del disparador `trg_assignment_capacity`. Cupo liberado y cubierto en el ciclo siguiente. |
| SC-003 | Reglas de servicio, restricción `CHECK` y `evaluation-form.rules.spec.ts` con 99, 100 y caracteres multibyte. |
| SC-004 | Tabla exhaustiva de `consensus.outcome()`. Dos envíos simultáneos con un solo veredicto. Publicación en el catálogo. Reintento tras un fallo de almacenamiento simulado. |
| SC-005 | Reloj controlado y fechas desplazadas en la base, más conciliación de puntajes con la bitácora y el mínimo de 0. |
| SC-006 | `tests/test_urls.py` y `tests/security/test_access_matrix.py` sin rutas de Editor. Búsqueda de `EDITOR`, `IsEditor` y `/app/editor` en el código de producción, con resultado vacío salvo en los registros heredados documentados. Recorridos del Administrador. |
| SC-007 | Doble ciego con tres revisores y cuentas multirrol en respuestas, DOM, árbol accesible, documentos y avisos. El desempeño no aparece para Autores ni para otros revisores. |
| SC-008 | axe sin infracciones A/AA en las vistas nuevas a 320, 768 y 1366 px. Teclado, contraste medido y prueba de tiempo de la rúbrica. |
| SC-009 | `MigrationExecutor` con evaluaciones finales y veredictos heredados. Comando de transición sobre cada caso de FR-039 y ejecución repetida sin efectos. |

### Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Interbloqueos o sobreasignación con concurrencia | Cerrojo consultivo antes de cualquier fila, disparador de capacidad y pruebas paralelas. |
| Migraciones sobre tablas inmutables | Columnas con `DEFAULT` en DDL, actualización limitada a borradores y manuscritos, pruebas de migración y respaldo previo. |
| Expedientes detenidos tras retirar al Editor | Transición idempotente en el arranque y ciclo programado de conciliación. |
| Exposición entre revisores | Serializadores de lista blanca, etiquetas «Revisor N» y suites de doble ciego con tres revisores. |
| Avisos repetidos en cada ciclo | `event_key` por cupo y por evento. Los pasos solo actúan si existe trabajo pendiente. |

## Complexity Tracking

Sin violaciones de la constitución. Los elementos nuevos responden a requisitos de la especificación: dos tablas append-only para la bitácora y la base del veredicto, un cerrojo consultivo y un disparador de capacidad. Reutilizan los patrones de integridad que el proyecto ya aplica a versiones, eventos, veredictos y auditoría.
