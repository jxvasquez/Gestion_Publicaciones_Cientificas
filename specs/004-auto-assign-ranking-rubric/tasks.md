---

description: "Tareas de implementación de la asignación automática por carrera, el ranking de revisores y la rúbrica profesional"
---

# Tasks: Asignación automática por carrera, ranking de revisores y rúbrica profesional

**Input**: Documentos de diseño de `specs/004-auto-assign-ranking-rubric/`: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md) y [quickstart.md](quickstart.md).

**Prerequisites**: `plan.md` y `spec.md`. Los demás artefactos de la fase 1 están disponibles.

**Tests**: Incluidas. La especificación define criterios medibles (SC-001 a SC-009) y el repositorio mantiene pytest, Vitest y Playwright. En cada historia las pruebas se escriben primero y deben fallar antes de implementar.

**Organization**: Las fases 1 y 2 registran la línea base, crean el esquema y retiran el Editor del backend. Las fases 3 a 8 implementan US1 a US6 en orden de prioridad. La fase 9 cierra E2E, documentación y verificación.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede ejecutarse en paralelo con otras tareas `[P]` de su bloque, porque toca archivos distintos y sus prerrequisitos están completos.
- **[Story]**: historia de la especificación (US1 a US6). Las fases 1, 2 y 9 no llevan etiqueta.
- Todas las rutas parten de la raíz del repositorio.

## Path Conventions

- Backend: `backend/apps/`, `backend/config/` y pruebas en `backend/tests/`. Los comandos corren en el contenedor con el patrón de `README.md`.
- Frontend: `frontend/src/app/`, recursos en `frontend/public/` y E2E en `frontend/e2e/`. Los comandos corren desde `frontend/`.
- Reglas transversales: identificadores en inglés y textos en español. Ninguna respuesta, plantilla, atributo, texto accesible ni aviso incluye identidades restringidas (FR-034). Las vistas reutilizan los tokens `--gpc-*` de `frontend/src/styles/_tokens.scss`, `KpiCardComponent`, `StatusBadgeComponent`, `EmptyStateComponent` y `ConfirmDialogComponent`, con plantilla y estilo hermanos (`templateUrl` y `styleUrl`) como en 003.

---

## Phase 1: Setup (línea base)

**Purpose**: registrar el comportamiento previo para comparar al final.

- [x] T001 Registrar la línea base del backend desde la raíz con `docker compose run --rm --no-deps -v "$PWD/backend:/app" backend sh -c "python -m pip install --quiet --user -r requirements/development.txt; python -m pytest -q -p no:cacheprovider --cov --cov-report=term:skip-covered"`, según `backend/pytest.ini` y `backend/.coveragerc`. Anotar aprobadas, fallidas y cobertura en «Resultados de verificación» de `specs/004-auto-assign-ranking-rubric/tasks.md`.
- [ ] T002 [P] Registrar la línea base del frontend. Desde `frontend/`, ejecutar `npm ci`, `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npx ng build --configuration production` y `npx ng test --watch=false`. Desde la raíz, ejecutar `python3 scripts/check_frontend_build.py`. Usar `frontend/package.json` y `frontend/angular.json` y anotar los resultados en `specs/004-auto-assign-ranking-rubric/tasks.md`.
- [ ] T003 [P] Registrar la línea base E2E con `./scripts/e2e.sh` y `frontend/playwright.config.ts`. Anotar en `specs/004-auto-assign-ranking-rubric/tasks.md` qué pruebas de `frontend/e2e/02-ciclo-completo.e2e.ts`, `frontend/e2e/03-correccion.e2e.ts` y `frontend/e2e/04-fuga-de-identidad.e2e.ts` dependen del Editor.
- [ ] T004 [P] Inventariar las referencias al Editor con `grep -rniE "EDITOR|IsEditor|/app/editor|editor_|editorSection" backend/apps backend/config backend/tests frontend/src frontend/e2e frontend/public scripts docs-site README.md QUICKSTART.md docs/RUNBOOK.md` y registrar la lista por archivo en `specs/004-auto-assign-ranking-rubric/tasks.md` como referencia de SC-006.

---

## Phase 2: Foundational (esquema y retirada del Editor en el backend)

**Purpose**: dejar el esquema de [data-model.md](data-model.md) y un backend importable sin Editor. Las historias agregan después el comportamiento.

**⚠️ CRITICAL**: ninguna historia puede empezar antes de cerrar esta fase.

### Pruebas de fundamentos

- [x] T005 [P] Crear `backend/tests/test_migrations_004.py` con `MigrationExecutor`. Migrar a `users 0003`, `publications 0009` y `reviews 0003` y crear con modelos históricos estos datos: un manuscrito `REQUIRES_CORRECTIONS` con `area="Ingeniería en Computación "`, otro `UNDER_REVIEW` con `area="derecho"`, un perfil con `expertise_areas=["Derecho", "Ingeniería en Computación"]` y `max_active_assignments=3`, una asignación `REVOKED`, otra `EXPIRED`, una evaluación `FINAL` con los cinco criterios anteriores y `REQUIRES_CORRECTIONS`, un borrador con `ACCEPT`, otro con `REQUIRES_CORRECTIONS` y un veredicto del Editor. Migrar a `users 0004`, `publications 0011` y `reviews 0006` y comprobar: carreras únicas sin distinguir mayúsculas y vinculadas; `CHANGES_REQUESTED` con `lock_version` incrementado; evaluación final idéntica con `rubric_version=1`; borradores en `rubric_version=2` con `ACCEPTED` y sin dictamen; `slot=1` y `release_cause='EDITOR_LEGACY'` en la revocada; la vencida sigue `EXPIRED` hasta la transición; veredicto con `origin='EDITOR_LEGACY'` y `decided_by` igual al Editor; `ranking_score=100`. Debe fallar antes de T009 a T016.
- [x] T006 [P] Crear `backend/tests/reviews/test_schema_004.py` para las barreras de base de datos. Deben fallar con `IntegrityError` o error de base: `CHECK (slot IN (1, 2, 3))`; `UNIQUE (version, slot) WHERE status IN ('ACTIVE', 'COMPLETED')`; `UNIQUE (version, reviewer) WHERE status IN ('ACTIVE', 'COMPLETED')`; la sexta asignación `ACTIVE` de un revisor frente a `trg_assignment_capacity`; `CHECK (ranking_score >= 0)`; criterio de rúbrica 2 fuera de 1 a 5; `ACCEPT` con `rubric_version=2`; evaluación final de versión 2 con un criterio en 3 y `char_length(comments_for_author)` de 99; `CONSENSUS` con `decided_by` no nulo; `REQUIRES_CORRECTIONS` con `origin` distinto de `EDITOR_LEGACY`; `UPDATE` y `DELETE` sobre `RankingAdjustment` y `VerdictEvaluation`; `UNIQUE (assignment, cause)`; y nombre de carrera repetido sin distinguir mayúsculas.

### Esquema

- [x] T007 Crear `backend/apps/reviews/policy.py`, sin imports de modelos, con `MAX_ACTIVE_ASSIGNMENTS = 5`, `REVIEWERS_PER_VERSION = 2`, `TIE_BREAKER_SLOT = 3`, `ASSIGNMENT_DAYS = 20`, `RANKING_BASE_SCORE = 100`, `ON_TIME_BONUS = 10`, `MISSED_DEADLINE_PENALTY = -20`, `MAX_AREAS_PER_MANUSCRIPT = 3`, `JUSTIFICATION_MIN_LENGTH = 100` y `JUSTIFICATION_SCORE_THRESHOLD = 3`. `ASSIGNMENT_DAYS` de `backend/apps/reviews/models.py` pasa a importarse desde aquí.
- [x] T008 [P] Modificar `backend/apps/users/models.py` según data-model. `AcademicArea` con `code` `SlugField(80)` «único e inmutable», `name` `CharField(120)` «único sin distinguir mayúsculas (`UniqueConstraint(Lower("name"))`)», `is_active` con `True` por defecto y fechas automáticas. `Role.Code` solo con `AUTHOR`, `REVIEWER` y `ADMIN`, y un docstring que explique la fila heredada inactiva. En `ReviewerProfile`: `areas = ManyToManyField(AcademicArea)` y `ranking_score = IntegerField(default=RANKING_BASE_SCORE)` con `CHECK (ranking_score >= 0)`, importado desde `apps.reviews.policy`. Se eliminan `expertise_areas`, `max_active_assignments` e `idx_reviewer_expertise_areas`.
- [x] T009 Crear `backend/apps/users/migrations/0004_academic_area_ranking.py`. Crea `AcademicArea`, `ReviewerProfile.areas` y `ranking_score` con su `CHECK`. Con `RunPython`, siembra «Ingeniería en Computación», «Ingeniería Agropecuaria» y «Derecho», crea una carrera por cada valor distinto de `expertise_areas`, recortado y comparado sin mayúsculas, con `code=slugify(name)` único, y vincula los perfiles. Incluir `reverse_code` que reconstruya `expertise_areas`. Al final elimina el índice GIN, `expertise_areas` y `max_active_assignments`.
- [x] T010 [P] Modificar `backend/apps/publications/models.py`. `Manuscript.areas = ManyToManyField("users.AcademicArea")` y `Manuscript.Status` con `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `TIE_BREAKER`, `CHANGES_REQUESTED`, `ACCEPTED` y `REJECTED` en `ck_manuscript_status`. Se eliminan `area`, `idx_manuscript_area`, `ManuscriptQuerySet.for_editor()` y el parámetro `as_editor` de `visible_to()`. En `Verdict`: `decided_by`, renombrado desde `editor` con `null=True`; `origin` `CharField(20)` con `CONSENSUS`, `TIE_BREAK`, `ADMIN_CORRECTION` y `EDITOR_LEGACY`; `evaluation` con `null=True`; y `Decision` con `CHANGES_REQUESTED`, que conserva `REQUIRES_CORRECTIONS` «solo con `EDITOR_LEGACY`». Restricciones `ck_verdict_decision`, `ck_verdict_corrections_observations` y `ck_verdict_decider`. `VerdictEvaluation(AppendOnlyModel)` con `verdict`, `evaluation` y `slot`, más `UNIQUE (verdict, evaluation)` y `UNIQUE (verdict, slot)`.
- [x] T011 Crear `backend/apps/publications/migrations/0010_manuscript_areas_states.py`, que depende de `users 0004`. Agrega `Manuscript.areas` y, con `RunPython`, crea o reutiliza la carrera de cada `area` recortada y comparada sin mayúsculas. Elimina `area` e `idx_manuscript_area`. Actualiza `REQUIRES_CORRECTIONS` a `CHANGES_REQUESTED` incrementando `lock_version` y redefine `ck_manuscript_status` después de la actualización.
- [x] T012 [P] Modificar `backend/apps/reviews/models.py`. En `Assignment`: `slot` `PositiveSmallIntegerField` con `CHECK (slot IN (1, 2, 3))`, `assigned_by` con `null=True` («`NULL` significa asignación del sistema») y `ReleaseCause` con `release_cause` `CharField(32)` nulo: `OVERDUE`, `CONFLICT_OF_INTEREST`, `INCIDENT_REASSIGN`, `ANONYMIZATION_REQUESTED`, `MANUSCRIPT_WITHDRAWN`, `LEGACY_TRANSITION` y `EDITOR_LEGACY`. Se elimina `uq_assignment_active` y se agregan `uq_assignment_live_slot` y `uq_assignment_live_reviewer`. En `Evaluation`: `rubric_version` y los cinco criterios nuevos con «`CHECK` nulo o entre 1 y 5». Las constantes `RUBRIC_FIELDS` y `LEGACY_SCORE_FIELDS` reemplazan a `SCORE_FIELDS`. `Recommendation` incluye los conjuntos de las versiones 1 y 2 y las restricciones `ck_evaluation_recommendation`, `ck_evaluation_final_complete` y `ck_evaluation_rubric_justification` siguen data-model. `RankingAdjustment(AppendOnlyModel)` tiene `cause` `CharField(24)` con `ON_TIME_EVALUATION` o `DEADLINE_MISSED`, `delta` con `CHECK` de `+10` o `−20` según la causa, `score_before`, `score_after` con `CHECK (score_after >= 0)`, `UNIQUE (assignment, cause)` e índice `(reviewer, -created_at)`. `IncidentReportQuerySet.for_admin(user)` reemplaza a `for_editor()`.
- [x] T013 Crear `backend/apps/reviews/migrations/0004_assignment_slots_capacity.py`. Agrega `slot` con valor por defecto 1 para las filas existentes, `release_cause` y la nulidad de `assigned_by`. Con `RunPython`, completa `release_cause='EDITOR_LEGACY'` en las filas `REVOKED`. Reemplaza `uq_assignment_active` por los índices de cupo y crea con `RunSQL` la función y el disparador `trg_assignment_capacity` («`BEFORE INSERT OR UPDATE OF status`, cuando `NEW.status = 'ACTIVE'`»), que rechaza la operación si el revisor ya tiene 5 asignaciones `ACTIVE`. Incluir el SQL de reversión.
- [x] T014 Crear `backend/apps/reviews/migrations/0005_evaluation_rubric.py`. Agrega los cinco criterios con sus `CHECK` y `rubric_version` con `DEFAULT 1` en el `ALTER TABLE`, sin reescribir filas. Con `RunPython`, solo sobre `status='DRAFT'`, pasa a `rubric_version=2` y convierte `ACCEPT` en `ACCEPTED`, `REJECT` en `REJECTED` y `REQUIRES_CORRECTIONS` en nulo. Luego cambia el valor por defecto a 2 y reemplaza `ck_evaluation_recommendation` y `ck_evaluation_final_complete` por sus versiones con rúbrica, además de `ck_evaluation_rubric_justification`. Ninguna operación puede actualizar filas `FINAL`.
- [x] T015 Crear `backend/apps/reviews/migrations/0006_ranking_adjustment.py`. Crea `RankingAdjustment` con sus restricciones y, con `RunSQL`, el disparador `trg_ranking_adjustment_no_update` (`BEFORE UPDATE OR DELETE`), que reutiliza `prevent_append_only_mutation()` de `publications 0004`. Declarar esa dependencia.
- [x] T016 Crear `backend/apps/publications/migrations/0011_verdict_origin_basis.py`. Renombra `editor` a `decided_by` y permite nulos en él y en `evaluation`. Agrega `origin` con `DEFAULT 'EDITOR_LEGACY'` en el `ALTER TABLE` y luego elimina el valor por defecto. Crea `VerdictEvaluation` y su disparador `trg_verdict_evaluation_no_update` con `prevent_append_only_mutation()`, y redefine las restricciones del veredicto.

### Retirada del Editor y adaptación del backend

- [x] T017 Retirar `EDITOR` del núcleo de usuarios. En `backend/apps/users/services/auth.py`, `active_role_codes()` exige `role__is_active=True`. En `backend/apps/users/permissions.py` se elimina `IsEditor` y el docstring de `IsAdmin` incluye incidentes con documento acotado, padrón, carreras y corrección. En `backend/apps/users/services/dashboard.py` se eliminan `build_editor_section()` y su clave. `backend/apps/users/management/commands/seed_roles.py` siembra los tres roles y desactiva la fila `EDITOR` si existe.
- [x] T018 [P] Adaptar el aprovisionamiento al catálogo. En `backend/apps/users/services/provisioning.py`, `areas` recibe nombres o códigos de carreras activas, falla ante uno desconocido y ya no usa `max_active_assignments`. Actualizar la ayuda de `--areas` en `backend/apps/users/management/commands/create_user.py`. `backend/apps/users/management/commands/seed_dev_users.py` crea las cuentas de [quickstart.md](quickstart.md#1-preparar-el-entorno) sin Editor. `backend/apps/users/admin.py` registra `AcademicArea` y los campos nuevos del perfil.
- [x] T019 Eliminar la API del Editor. Borrar `backend/apps/reviews/urls.py`. En `backend/apps/reviews/views.py`, quitar `EditorBaseView` y las vistas de envíos, inicio de revisión, elegibles, asignaciones, revocación, vencidas, evaluaciones, veredictos e incidentes del Editor. En `backend/apps/reviews/serializers.py`, quitar los serializadores del Editor, salvo `PersonSerializer`, `EditorIncidentSerializer` y `ResolveIncidentSerializer`, que se trasladan en T105. En `backend/apps/reviews/services/assignments.py`, quitar `start_review`, `assign_reviewer`, `revoke_assignment`, `RevocationCause` y `record_editor_audit`, reemplazar sus usos por `Assignment.ReleaseCause` y agregar `record_review_audit(actor, actor_role, …)`. En `backend/apps/reviews/services/eligibility.py`, quitar `eligible_reviewers`, `eligibility_breakdown` e `ineligibility_reason`. En `backend/apps/publications/services/verdicts.py`, quitar `register_verdict()` y su vía del Editor. Quitar `path("editor/", …)` de `backend/config/api.py` y la etiqueta «Editor» de `backend/config/openapi.py`.
- [x] T020 Retirar los destinatarios Editor de `backend/apps/notifications/services.py` y `backend/apps/notifications/receivers.py`. Eliminar `editors_for()`, `assigning_editor()`, `_editor_link()` y los avisos al Editor de los receptores de envío, nueva versión, baja, vencimiento, evaluación, conflicto, incidente y autorización de corrección. La constante de roles queda sin `EDITOR`. Se conservan los avisos de Autor y Revisor.
- [x] T021 Adaptar las vistas y la validación del Autor. En `backend/apps/publications/views.py`: solo `IsAuthor` y el ámbito `Manuscript.objects.owned_by(user)`. En `backend/apps/publications/serializers.py`: `areas` se lee como `[{code, name}]` y se escribe como «lista de 1 a 3 códigos activos», y se elimina `EditorManuscriptSerializer`. En `backend/apps/publications/services/manuscripts.py`: `areas` en `REQUIRED_METADATA` y `METADATA_FIELDS`, con validación de `MAX_AREAS_PER_MANUSCRIPT` y carreras activas y error en `details.areas`. En `backend/apps/publications/services/snapshot.py`: `areas: [{code, name}]` y comparación «sin cambios» que normaliza el `area` heredado.
- [x] T022 [P] Adaptar el catálogo público. `backend/apps/publications/catalog_serializers.py` devuelve `areas: [{code, name}]`. `backend/apps/publications/catalog_filters.py` y `backend/apps/publications/filters.py` filtran por `area=<code>` sobre cualquiera de las carreras y `search` incluye sus nombres.
- [x] T023 [P] Adaptar estados y referencias de veredicto. En `backend/apps/publications/services/versions.py`, `ensure_requires_corrections()` pasa a `ensure_changes_requested()` con `CHANGES_REQUESTED`, y `run_formal_write()` y `audit_refusal()` aceptan `user=None` para el sistema. En `backend/apps/publications/services/withdraw.py`, el motivo es obligatorio en `UNDER_REVIEW`, `TIE_BREAKER` y `ACCEPTED`. `backend/apps/publications/services/history.py` etiqueta los códigos heredados y muestra al actor nulo como «Sistema». `backend/apps/publications/services/corrections.py` usa `decided_by`.
- [x] T024 Adaptar el módulo de revisiones al esquema. En `backend/apps/reviews/serializers.py` y `backend/apps/reviews/views.py`, los serializadores del Revisor usan `areas: [{code, name}]` y las vistas ya no importan `IsEditor`. En `backend/apps/reviews/services/inbox.py`, `EXPIRED` es terminal y se clasifica `OVERDUE`. En `backend/apps/reviews/services/incidents.py`, el ámbito pasa a `for_admin()` y la auditoría usa `record_review_audit` con `ADMIN`. Las resoluciones se redefinen en T104.
- [x] T025 Actualizar la infraestructura de pruebas en `backend/tests/factories.py` y `backend/tests/phase5.py`. Agregar `AcademicAreaFactory`. `ReviewerProfileFactory` usa `areas` y `ranking_score`, y `ManuscriptFactory` usa `areas`. `AssignmentFactory` lleva `slot` y `assigned_by=None`. `EvaluationFactory` usa la rúbrica 2 y un rasgo `legacy` con la versión 1. `VerdictFactory` usa `decided_by` y `origin`. Agregar los constructores de estado `submitted`, `under_review_with_slots`, `tie_breaker`, `changes_requested` y `accepted`, sin Editor, y eliminar las fábricas y ayudas del Editor.
- [x] T026 Eliminar las suites del flujo del Editor: `backend/tests/reviews/test_editor_api.py`, `backend/tests/reviews/test_verdict_api.py`, `backend/tests/reviews/test_expire_command.py`, `backend/tests/publications/test_verdicts.py`, `backend/tests/publications/test_verdict_concurrency.py`, `backend/tests/publications/test_verdict_correction_flow.py` y `backend/tests/publications/test_verdict_correction.py`. T033, T062, T063, T077 y T096 cubren lo que verificaban.
- [x] T027 [P] Adaptar a los tres roles y al esquema nuevo `backend/tests/users/test_auth.py`, `backend/tests/users/test_dashboard.py`, `backend/tests/users/test_models.py`, `backend/tests/users/test_permissions.py`, `backend/tests/users/test_provisioning.py`, `backend/tests/users/test_session_flow.py`, `backend/tests/security/test_access_matrix.py`, `backend/tests/security/test_permission_resolution.py`, `backend/tests/test_urls.py`, `backend/tests/test_openapi.py` y `backend/tests/test_media_isolation.py`.
- [x] T028 [P] Adaptar con los constructores de T025 `backend/tests/publications/test_author_feedback.py`, `test_draft_file.py`, `test_edge_cases.py`, `test_lifecycle.py`, `test_manuscript_api.py`, `test_new_version.py`, `test_phase5_catalog_flow.py`, `test_submission.py`, `test_verdict_models.py`, `test_versions_history.py`, `test_withdraw.py`, `test_catalog_api.py` y `test_models.py`, todos en `backend/tests/publications/`.
- [x] T029 [P] Adaptar en `backend/tests/reviews/` los archivos `test_assignment_service.py`, `test_concurrency.py`, `test_conflict_history_api.py`, `test_double_blind.py`, `test_evaluation_api.py`, `test_factories.py`, `test_final_evaluation_immutable.py`, `test_incident_api.py`, `test_incident_model.py`, `test_models.py`, `test_review_concurrency.py`, `test_reviewer_api.py`, `test_reviewer_scope.py` y `test_review_lifecycle.py`. Eliminar los casos que dependían de acciones del Editor, incluidas las resoluciones de `test_incident_api.py`, y conservar los de reporte del Revisor.
- [x] T030 [P] Adaptar `backend/tests/audit/test_admin_audit_api.py`, `backend/tests/audit/test_auth_flow_chain.py`, `backend/tests/audit/test_phase5_audit.py`, `backend/tests/notifications/test_notifications.py`, `backend/tests/notifications/test_phase5_notifications.py` y `backend/tests/performance/test_query_scaling.py`.
- [x] T031 Ejecutar el comando de T001 y `python manage.py makemigrations --check --dry-run` en el contenedor. Confirmar que el esquema coincide con los modelos, que pasan T005 y T006 y que la suite adaptada no tiene fallos nuevos frente a la línea base.

**Checkpoint**: esquema 004 aplicado, backend sin Editor e importable, suite en verde.

---

## Phase 3: User Story 1 - Enviar un manuscrito y recibir dos revisores de su carrera (Priority: P1) 🎯 MVP

**Goal**: cada envío formal recibe automáticamente dos revisores elegibles de su carrera, ordenados por ranking y carga y sin superar cinco asignaciones activas.

**Independent Test**: con revisores de varias carreras, puntajes y cargas, más un coautor Revisor, enviar un manuscrito y comprobar asignados, orden, plazo, cupos pendientes y aviso al Administrador (escenarios A y B de [quickstart.md](quickstart.md)).

### Tests for User Story 1 ⚠️

- [x] T032 [P] [US1] Crear `backend/tests/reviews/test_eligibility.py` para `eligible_candidates()`. Cada condición de FR-011 debe excluir: cuenta inactiva, rol revocado, fila de rol inactiva, no disponible, sin carrera compartida, registrante, autor o coautor por cuenta o por correo, participación previa en la versión con cualquier estado y 5 activas. Probar también el orden `-ranking_score`, `active_assignments`, `last_assigned_at` con nulos primero e `id`, un manuscrito con dos carreras y una carrera desactivada que sigue sirviendo para un manuscrito en curso.
- [x] T033 [P] [US1] Crear `backend/tests/reviews/test_assignment_engine.py` para `fill_review_slots()` y `fill_pending_slots()`:
  - Dos cupos distintos y paso de `SUBMITTED` a `UNDER_REVIEW` con `StatusEvent` de actor nulo.
  - `due_at` igual a `assigned_at` más 20 días, por el reloj de PostgreSQL.
  - `AUTO_ASSIGNMENT_CREATED` con actor nulo.
  - Un solo candidato deja el cupo 2 pendiente. Sin candidatos el manuscrito sigue `SUBMITTED`.
  - `ASSIGNMENT_SLOT_UNFILLED` y un único aviso al Administrador aunque se repita la ejecución.
  - Orden FIFO por `submitted_at`, manuscritos dados de baja omitidos e idempotencia sin duplicados.
- [x] T034 [P] [US1] Crear `backend/tests/reviews/test_assignment_concurrency.py` con `@pytest.mark.django_db(transaction=True)` y `backend/tests/parallel.py`. Con 20 envíos simultáneos de la misma carrera, ningún revisor supera 5 activas y los cupos sin candidato quedan pendientes. Un `INSERT` directo de la sexta activa falla por `trg_assignment_capacity`. Dos llenados simultáneos del mismo manuscrito no duplican cupos.
- [x] T035 [P] [US1] Crear `backend/tests/publications/test_submission_assignment.py`. El envío y la nueva versión en `CHANGES_REQUESTED` programan el motor tras el commit y la versión nueva recibe cupos propios. `areas` exige de 1 a 3 códigos activos (`400` en `details.areas`). La instantánea guarda `areas` y la comparación «sin cambios» normaliza el `area` heredado. El comprobante del envío no cambia.
- [x] T036 [P] [US1] Crear `backend/tests/users/test_areas_api.py` (clase `TestPublicList`). `GET /api/v1/areas/` es anónimo, devuelve solo activas ordenadas por nombre con `code` y `name` y no admite escritura.
- [x] T037 [P] [US1] Crear `frontend/src/app/core/services/area.service.spec.ts` con una petición compartida y reintento tras error. Actualizar `frontend/src/app/core/services/manuscript.service.spec.ts` y `frontend/src/app/features/author/manuscript-form/manuscript-form.component.spec.ts`: grupo de casillas con `fieldset` y `legend`, mínimo 1, máximo 3 con el contador «N de 3», error del servidor en `areas` y aviso por cambios sin guardar.
- [x] T038 [P] [US1] Actualizar `frontend/src/app/features/catalog/catalog-search/catalog-search.component.spec.ts`, con un selector de carreras activas que envía `area=<code>` y se restaura desde la URL. Actualizar también `frontend/src/app/features/catalog/catalog-list/catalog-list.component.spec.ts`, `frontend/src/app/features/catalog/catalog-detail/catalog-detail.component.spec.ts`, `frontend/src/app/core/models/catalog.model.spec.ts` y `frontend/src/app/features/catalog/testing/catalog.fixtures.ts`, con badges de varias carreras.
- [x] T039 [P] [US1] Actualizar `frontend/src/app/features/author/manuscript-detail/manuscript-detail.component.spec.ts` (`SUBMITTED` muestra «En espera de revisores» y las carreras), `frontend/src/app/features/author/version-history/version-history.component.spec.ts` (instantáneas con `areas` y con `area` heredado), `frontend/src/app/features/reviewer/assignment-list/assignment-list.component.spec.ts`, `frontend/src/app/features/reviewer/assignment-detail/assignment-detail.component.spec.ts`, `frontend/src/app/features/author/testing/manuscript.fixtures.ts` y `frontend/src/app/features/reviewer/testing/reviewer.fixtures.ts`.

### Implementation for User Story 1

- [x] T040 [US1] Implementar `eligible_candidates(manuscript, version)` en `backend/apps/reviews/services/eligibility.py` según R-08. Una sola consulta con `Count(..., distinct=True)`, `Max("review_assignments__assigned_at")`, exclusiones de autoría por cuenta y correo y de participación previa en la versión, filtro `active_assignments < MAX_ACTIVE_ASSIGNMENTS` y orden de FR-012. La coincidencia usa las carreras del manuscrito aunque estén inactivas. Se conservan `author_emails()` y `has_conflict()`.
- [x] T041 [US1] Implementar el motor en `backend/apps/reviews/services/assignments.py`:
  - `ASSIGNMENT_LOCK_KEY`.
  - `required_slots()` y `covered_slots()`.
  - `fill_review_slots(manuscript_id, *, context=None)`. Toma `pg_advisory_xact_lock` antes de bloquear el manuscrito. Crea asignaciones con `assigned_by=None`, `assigned_at=Now()` y `due_at=Now() + 20 días`. Pasa a `UNDER_REVIEW` con la primera y registra `StatusEvent`. Audita `AUTO_ASSIGNMENT_CREATED` o `ASSIGNMENT_SLOT_UNFILLED` y anuncia tras el commit.
  - `fill_pending_slots()` con el orden FIFO de data-model.
  - `release_assignment(assignment, *, cause, actor, actor_role, context)`, que revoca sin ranking, audita `ASSIGNMENT_RELEASED`, anuncia `assignment_revoked` y programa `fill_pending_slots()` con `on_commit`.
  - `release_on_withdrawal()`, que libera todas las asignaciones `ACTIVE` del manuscrito.
- [x] T042 [US1] Agregar las señales `review_started` y `slot_unfilled` en `backend/apps/reviews/signals.py` y actualizar sus docstrings sin el Editor. En `backend/apps/reviews/receivers.py`, la baja usa `release_on_withdrawal()` con `MANUSCRIPT_WITHDRAWN`.
- [x] T043 [P] [US1] Programar `fill_review_slots()` con `transaction.on_commit` al final de `submit_manuscript()`, en `backend/apps/publications/services/submission.py`, y de `submit_new_version()`, en `backend/apps/publications/services/versions.py`. El comprobante y la clave de idempotencia no cambian.
- [x] T044 [P] [US1] Exponer `GET /api/v1/areas/`: `AcademicAreaSerializer` en `backend/apps/users/serializers.py`, `AreaListView` pública y de solo lectura en `backend/apps/users/views.py`, la ruta `areas/` en `backend/config/api.py` y la etiqueta OpenAPI en `backend/config/openapi.py`.
- [x] T045 [US1] Agregar `admins_for(manuscript)` en `backend/apps/notifications/services.py`, con Administradores activos sin relación de autoría. En `backend/apps/notifications/receivers.py`: `assignment_created` avisa al Revisor con `due_at`; `review_started` y `manuscript_submitted` avisan al Autor; `slot_unfilled` avisa a los Administradores con `event_key` `SLOT_UNFILLED:<version>:<slot>:ADMIN` y el enlace `/app/admin/reviewers`. Solo con los campos de `build_payload()`.
- [x] T046 [US1] Crear `frontend/src/app/core/models/area.model.ts` con `AcademicArea {code, name}` y `frontend/src/app/core/services/area.service.ts` con `GET /areas/` y `shareReplay`. Actualizar `frontend/src/app/core/models/manuscript.model.ts` (`areas`, siguiente acción de `SUBMITTED` «En espera de revisores»), `frontend/src/app/core/services/manuscript.service.ts` (cuerpo con `areas`), `frontend/src/app/core/models/catalog.model.ts` y `frontend/src/app/core/models/reviewer.model.ts` (`areas`).
- [x] T047 [US1] Reemplazar el campo de texto del área en `frontend/src/app/features/author/manuscript-form/manuscript-form.component.ts`, `.html` y `.scss` por un `fieldset` con `legend` y casillas de las carreras activas de `AreaService`. Mínimo 1 y máximo 3 con el contador «N de 3», errores con `role="alert"` y el valor de `areas` en el formulario reactivo. Se conservan los validadores, la coautoría y el aviso de cambios sin guardar.
- [x] T048 [P] [US1] Mostrar las carreras como badges y la siguiente acción de `SUBMITTED` en `frontend/src/app/features/author/manuscript-detail/manuscript-detail.component.ts` y `.html`, `frontend/src/app/features/author/manuscript-list/manuscript-list.component.ts` y `.html`, y `frontend/src/app/features/author/version-history/version-history.component.ts` y `.html`. En el historial, las instantáneas heredadas muestran el `area` original.
- [x] T049 [P] [US1] Cambiar el campo de área por un `select` etiquetado de carreras activas en `frontend/src/app/features/catalog/catalog-search/catalog-search.component.ts` y `.html`. Se conservan la URL, el orden y la limpieza de filtros. Mostrar varias carreras en `frontend/src/app/features/catalog/catalog-list/catalog-list.component.html` y `frontend/src/app/features/catalog/catalog-detail/catalog-detail.component.html`.
- [x] T050 [P] [US1] Mostrar `areas` en `frontend/src/app/features/reviewer/assignment-list/assignment-list.component.html`, `frontend/src/app/features/reviewer/assignment-detail/assignment-detail.component.html` y `frontend/src/app/features/reviewer/evaluation-history/evaluation-history.component.html`, sin datos de autoría.

**Checkpoint**: un envío produce dos asignaciones correctas o deja cupos pendientes con aviso. US1 se verifica sola.

---

## Phase 4: User Story 2 - Evaluar con una rúbrica profesional (Priority: P1)

**Goal**: el Revisor califica cinco criterios con descriptores, elige uno de cuatro dictámenes y justifica cuando corresponde.

**Independent Test**: abrir una asignación activa, guardar un borrador incompleto e intentar el envío con 99 y con 100 caracteres en los casos de FR-019 (escenario C).

### Tests for User Story 2 ⚠️

- [x] T051 [P] [US2] Crear `backend/tests/reviews/test_rubric.py`:
  - El borrador parcial queda en `rubric_version=2`.
  - El envío exige los cinco criterios, un dictamen `ACCEPTED`, `MINOR_REVISION`, `MAJOR_REVISION` o `REJECTED` y comentarios.
  - Matriz de justificación: criterio en 3, `MAJOR_REVISION` y `REJECTED` exigen 100 caracteres. Con todos los criterios en 4 o 5 y `ACCEPTED` o `MINOR_REVISION` basta un comentario breve.
  - 99 y 100 caracteres tras recortar espacios, con emojis contados como 1.
  - Barrera `CHECK` ante una escritura directa.
  - Las claves anteriores y `confidential_comments` se ignoran y no se guardan.
- [x] T052 [P] [US2] Actualizar `backend/tests/reviews/test_evaluation_api.py` (GET con `rubric_version` y los criterios nuevos y sin `confidential_comments`; `ETag` e `If-Match` sin cambios; error en `details.comments_for_author`) y `backend/tests/reviews/test_final_evaluation_immutable.py` (versiones 1 y 2 inmutables).
- [x] T053 [P] [US2] Crear `frontend/src/app/core/models/rubric.model.spec.ts`. Cinco criterios en el orden de FR-016, con cinco niveles cuyos nombres y descriptores coinciden con la tabla de [spec.md](spec.md#descriptores-de-la-rúbrica). Probar `requiresJustification()`, `characterCount()` con emojis y las etiquetas de los dictámenes de las versiones 1 y 2.
- [x] T054 [P] [US2] Actualizar `frontend/src/app/features/reviewer/evaluation-form/evaluation-form.rules.spec.ts` y `frontend/src/app/features/reviewer/evaluation-form/evaluation-form.component.spec.ts`:
  - Cinco `fieldset` con cinco opciones y su descriptor.
  - Cuatro dictámenes.
  - Contador «N/100» visible solo cuando aplica, anunciado con `aria-live="polite"`.
  - Bloqueo con 99 y envío con 100.
  - Sin campo confidencial.
  - Borrador con huecos y errores del servidor por campo.
  - Fechas relativas en los fixtures.
- [x] T055 [P] [US2] Actualizar `frontend/src/app/features/reviewer/evaluation-history/evaluation-history.component.spec.ts`, que muestra los criterios de las versiones 1 y 2 en solo lectura, y `frontend/src/app/core/services/reviewer.service.spec.ts`, con el cuerpo del `PUT` nuevo.

### Implementation for User Story 2

- [x] T056 [US2] Implementar la rúbrica en `backend/apps/reviews/services/evaluations.py`. `DRAFT_FIELDS` y `REQUIRED_FIELDS` derivan de `RUBRIC_FIELDS` y los borradores nuevos usan `rubric_version=2`. Al enviar, `JUSTIFICATION_MIN_LENGTH` aplica cuando algún criterio es `<= JUSTIFICATION_SCORE_THRESHOLD` o el dictamen es `MAJOR_REVISION` o `REJECTED`, con `len(text.strip())`. El mensaje queda en `details.comments_for_author`. `confidential_comments` nunca se escribe.
- [x] T057 [US2] Actualizar `backend/apps/reviews/serializers.py` y `backend/apps/reviews/views.py`. `ReviewerEvaluationSerializer` expone `id`, `status`, `rubric_version`, los cinco criterios, `recommendation`, `comments_for_author`, `conflict_declared` y `submitted_at`. `EvaluationDraftSerializer` acepta los criterios de 1 a 5 o nulos, `recommendation` de la versión 2 o nulo y `comments_for_author` de hasta 10000 caracteres. El detalle del historial agrega `rubric_version` y `scores` con las claves de su versión.
- [x] T058 [US2] Crear `frontend/src/app/core/models/rubric.model.ts` con `RUBRIC_CRITERIA`: clave, nombre, ayuda y cinco niveles con número, nombre y descriptor copiados de la especificación. Incluir `RECOMMENDATION_OPTIONS` de la versión 2, `RECOMMENDATION_LABELS` con los códigos heredados, `LEGACY_SCORE_CRITERIA`, `JUSTIFICATION_MIN_LENGTH = 100`, `requiresJustification()` y `characterCount()`, que usa `Array.from(text.trim()).length`. Actualizar `frontend/src/app/core/models/reviewer.model.ts` para importar desde aquí y no desde `editor.model.ts`, y `frontend/src/app/core/services/reviewer.service.ts`.
- [x] T059 [US2] Reescribir `frontend/src/app/features/reviewer/evaluation-form/evaluation-form.rules.ts` con `EvaluationValues` de la rúbrica, `submitErrors()` con la justificación dinámica y la declaración de conflicto, `toDraft()`, `isDirty()` y `serverFieldErrors()`.
- [x] T060 [US2] Rediseñar `frontend/src/app/features/reviewer/evaluation-form/evaluation-form.component.ts`, `.html` y `.scss`:
  - Un `fieldset` y su `legend` por criterio, con opciones de radio cuyo `label` combina número, nivel y descriptor.
  - Grupo de cuatro dictámenes.
  - `textarea` con ayuda del mínimo y contador `aria-live="polite"`.
  - Se elimina el comentario confidencial.
  - Se conservan el guardado, el envío, el `ETag`, el guard de cambios sin guardar, los diálogos y los tokens de 003.
- [x] T061 [P] [US2] Mostrar en `frontend/src/app/features/reviewer/evaluation-history/evaluation-history.component.ts` y `.html` los criterios de la versión correspondiente, con las etiquetas de `rubric.model.ts`.

**Checkpoint**: las evaluaciones nuevas usan la rúbrica y la justificación se aplica en el cliente, el servicio y la base de datos.

---

## Phase 5: User Story 3 - Recibir el veredicto automático por consenso o desempate (Priority: P1)

**Goal**: con dos evaluaciones finales el sistema decide o abre el desempate. Con la tercera decide por mayoría, publica, rechaza o habilita la corrección del Autor.

**Independent Test**: registrar las combinaciones de las tablas de decisión y comprobar estado, catálogo, ronda, retroalimentación y avisos (escenarios D, E y F).

### Tests for User Story 3 ⚠️

- [x] T062 [P] [US3] Crear `backend/tests/reviews/test_consensus.py`:
  - `outcome()` con los diez pares, todas las combinaciones con tercer dictamen y la clasificación heredada.
  - `decide_version()` publica `ACCEPTED`, cierra `REJECTED` y abre ronda con `CHANGES_REQUESTED`.
  - `TIE_BREAKER` asigna el cupo 3 sin repetir participantes y decide por mayoría.
  - `VerdictEvaluation` registra cada cupo, con `decided_by=None` y `origin` `CONSENSUS` o `TIE_BREAK`.
  - No decide con un reporte abierto, con el manuscrito dado de baja ni dos veces.
  - Ante un `OSError` en la publicación, la evaluación sigue `FINAL` y `reconcile_pending_verdicts()` decide después.
- [x] T063 [P] [US3] Crear `backend/tests/reviews/test_consensus_concurrency.py` con `transaction=True`. Dos evaluaciones finales simultáneas de la misma versión producen un solo veredicto ordinario y un solo `StatusEvent` de decisión.
- [x] T064 [P] [US3] Reescribir `backend/tests/publications/test_author_feedback.py`. `feedback.reviews` tiene las etiquetas «Revisor 1» a «Revisor 3», sin identidades, puntajes, dictámenes ni ranking. No hay retroalimentación antes del veredicto. Un veredicto `EDITOR_LEGACY` devuelve una sola reseña.
- [x] T065 [P] [US3] Actualizar `backend/tests/publications/test_phase5_catalog_flow.py`, con publicación automática y retiro por baja, y `backend/tests/publications/test_verdict_models.py`, con `origin`, `decided_by` y `VerdictEvaluation`.
- [x] T066 [P] [US3] Ampliar `backend/tests/reviews/test_double_blind.py` con tres revisores. Ningún endpoint del Revisor expone a otros revisores ni sus evaluaciones. El revisor de desempate no ve las anteriores. El aviso de desempate al Autor no incluye dictámenes.
- [x] T067 [P] [US3] Actualizar `frontend/src/app/shared/components/status-badge.component.spec.ts` (`CHANGES_REQUESTED` como advertencia, `TIE_BREAKER` como información y `REQUIRES_CORRECTIONS` como etiqueta heredada), `frontend/src/app/core/models/manuscript.model.spec.ts`, `frontend/src/app/features/author/manuscript-detail/manuscript-detail.component.spec.ts` (reseñas «Revisor N», carga de versión en `CHANGES_REQUESTED` y siguiente acción en `TIE_BREAKER`) y `frontend/src/app/features/author/manuscript-list/manuscript-list.component.spec.ts`.

### Implementation for User Story 3

- [x] T068 [US3] Implementar `apply_decision()` en `backend/apps/publications/services/verdicts.py`, dentro de la transacción de quien llama. Recibe `manuscript`, `version`, `decision`, `origin`, `basis` con evaluación y cupo, `decided_by` opcional, `justification`, `observations`, `previous_verdict` y `correction`. Crea `Verdict` y `VerdictEvaluation`, publica o retira del catálogo con `Rollback` y abre ronda en `CHANGES_REQUESTED`. Escribe `StatusEvent` y audita `VERDICT_REGISTERED` o `VERDICT_CORRECTED` con actor nulo si decide el sistema. Emite `verdict_registered` tras el commit. Las observaciones del sistema son textos fijos sin identidades.
- [x] T069 [US3] Crear `backend/apps/reviews/services/consensus.py` con `recommendation_group()`, `outcome()` pura, `decide_version(manuscript_id)` y `reconcile_pending_verdicts()`. `decide_version()` usa `run_formal_write(user=None)`, bloquea el manuscrito, valida las condiciones de R-11 y, en desempate, pasa a `TIE_BREAKER` con `StatusEvent` y `TIE_BREAK_STARTED` y programa `fill_review_slots()`. `reconcile_pending_verdicts()` recorre las versiones completas sin veredicto.
- [x] T070 [US3] Programar `decide_version()` con `on_commit` en `submit_evaluation()`, en `backend/apps/reviews/services/evaluations.py`. Agregar `tie_break_started` en `backend/apps/reviews/signals.py`.
- [x] T071 [P] [US3] Implementar `feedback` con `decision`, `decided_at`, `origin`, `observations` y `reviews` en `backend/apps/publications/serializers.py`. En `backend/apps/publications/views.py`, precargar `verdicts__evaluations` para evitar N+1.
- [x] T072 [P] [US3] Registrar en `backend/apps/publications/services/history.py` los eventos de desempate y de decisión automática con el actor «Sistema», sin identidades de revisores.
- [x] T073 [US3] En `backend/apps/notifications/receivers.py`, `tie_break_started` avisa al Autor sin dictámenes y `verdict_registered` usa textos de decisión automática.
- [x] T074 [US3] Actualizar `frontend/src/app/core/models/manuscript.model.ts`: estados `TIE_BREAKER` y `CHANGES_REQUESTED`, `VerdictDecision` trasladado desde `editor.model.ts`, `EvaluationFeedback` con `reviews`, `EDITABLE_STATUSES` con `DRAFT` y `CHANGES_REQUESTED`, siguiente acción por estado y motivo de baja en `TIE_BREAKER`. Actualizar etiquetas y tonos en `frontend/src/app/shared/components/status-badge.component.ts`.
- [x] T075 [US3] Mostrar las reseñas «Revisor N» y la decisión, y habilitar la nueva versión en `CHANGES_REQUESTED`, en `frontend/src/app/features/author/manuscript-detail/manuscript-detail.component.ts`, `.html` y `.scss`. Actualizar el filtro de estados de `frontend/src/app/features/author/manuscript-list/manuscript-list.component.ts` y `.html` y las etiquetas de `frontend/src/app/features/author/version-history/version-history.component.html`.

**Checkpoint**: el ciclo envío, evaluación y veredicto funciona sin intervención manual.

---

## Phase 6: User Story 4 - Cumplir el plazo y consultar un ranking transparente (Priority: P1)

**Goal**: bonificación al evaluar a tiempo y, al vencer, penalización, revocación y reasignación automáticas, con desempeño visible para el Revisor.

**Independent Test**: con reloj controlado, evaluar a tiempo y dejar vencer otra asignación, y comprobar puntajes, cupos, avisos y métricas (escenarios G, H e I).

### Tests for User Story 4 ⚠️

- [x] T076 [P] [US4] Crear `backend/tests/reviews/test_ranking.py`. `ON_TIME_EVALUATION` suma 10 en la transacción del envío y `DEADLINE_MISSED` resta 20. Con 10 puntos y −20 se registra `score_after=0`. `UNIQUE (assignment, cause)` vuelve idempotente cada ajuste. Las liberaciones de FR-031 no cambian el puntaje. La bitácora es append-only y el puntaje concilia con `100 + 10·a − 20·b` con mínimo 0.
- [x] T077 [P] [US4] Crear `backend/tests/reviews/test_automation_command.py` con freezegun y fechas desplazadas en la base:
  - La asignación vencida pasa a `EXPIRED` con `OVERDUE`, −20 y reasignación al siguiente candidato, sin el revisor vencido.
  - Aviso al Revisor con la penalización. El borrador se conserva.
  - Un envío en el instante de `due_at` responde `410`.
  - Orden vencer, decidir y llenar.
  - Una segunda ejecución no tiene efectos ni repite avisos.
  - Si falla la auditoría, la asignación sigue `ACTIVE` y se reintenta.
  - Solo escribe salida cuando hubo trabajo.
- [x] T078 [P] [US4] Crear `backend/tests/reviews/test_standing_api.py` (`GET /api/v1/reviewer/standing/`, `GET /api/v1/reviewer/standing/adjustments/` paginado, sin identidades y `403` para otros roles). En `backend/tests/users/test_dashboard.py`, la sección `reviewer` tiene `ranking_score`, `active_assignments`, `max_active_assignments`, `pending_evaluations`, `on_time_evaluations` y `missed_deadlines`.
- [x] T079 [P] [US4] Actualizar `backend/tests/reviews/test_conflict_history_api.py`. Declarar conflicto revoca con `CONFLICT_OF_INTEREST`, no cambia el puntaje, cubre el cupo y deja el detalle en `404`. La respuesta es la de [contracts/api.md](contracts/api.md#revisor).
- [x] T080 [P] [US4] Actualizar `backend/tests/test_cron_template.py` para exigir en `scripts/cron/gpc.cron` la línea `run_review_automation` con `flock -n /var/lock/gpc-review.lock` y la ausencia de `mark_expired_assignments`.
- [x] T081 [P] [US4] Crear `frontend/src/app/shared/components/kpi-card.component.spec.ts` con `max` («3/5» visible y «3 de 5» accesible) y compatibilidad sin `max`. Crear `frontend/src/app/features/reviewer/reviewer-standing/reviewer-standing.component.spec.ts`, con métricas, tabla de ajustes con «+10 a tiempo» y «−20 vencida», estado vacío y paginación. Actualizar `frontend/src/app/features/dashboard/dashboard-summaries.spec.ts` con las métricas del Revisor.
- [x] T082 [P] [US4] Actualizar `frontend/src/app/features/reviewer/assignment-list/assignment-list.component.spec.ts` (desempeño visible), `frontend/src/app/features/reviewer/conflict-dialog/conflict-dialog.component.spec.ts`, `frontend/src/app/features/reviewer/assignment-detail/assignment-detail.component.spec.ts` (liberación y regreso a la bandeja con mensaje), `frontend/src/app/features/reviewer/deadline-countdown/deadline-countdown.component.spec.ts` y `frontend/src/app/core/services/reviewer.service.spec.ts` (endpoints de desempeño).

### Implementation for User Story 4

- [x] T083 [US4] Crear `backend/apps/reviews/services/ranking.py` con `adjust(*, reviewer_id, assignment, cause, context=None)`. Bloquea `ReviewerProfile`, calcula `score_after = max(0, score_before + delta)`, inserta `RankingAdjustment`, actualiza `ranking_score` y audita `RANKING_ADJUSTED`. Si ya existe el ajuste, devuelve `None`.
- [x] T084 [US4] En `backend/apps/reviews/services/evaluations.py`, `submit_evaluation()` llama a `adjust()` con `ON_TIME_EVALUATION` en su transacción, y `declare_conflict()` libera con `release_assignment(cause=CONFLICT_OF_INTEREST)` y conserva el borrador marcado.
- [x] T085 [US4] Crear `backend/apps/reviews/services/automation.py` con `expire_overdue()`, que procesa cada vencida en su transacción con `skip_locked`: `EXPIRED`, `release_cause='OVERDUE'`, `revoked_at=Now()`, `adjust(DEADLINE_MISSED)`, auditoría `ASSIGNMENT_EXPIRED` y señal. Agregar `run_cycle()`, que ejecuta vencer, conciliar y llenar y devuelve conteos. Borrar `backend/apps/reviews/services/expiration.py`.
- [x] T086 [US4] Crear `backend/apps/reviews/management/commands/run_review_automation.py`, que escribe solo si hubo trabajo. Borrar `backend/apps/reviews/management/commands/mark_expired_assignments.py`. En `scripts/cron/gpc.cron`, reemplazar su línea por `run_review_automation` cada minuto con `flock -n /var/lock/gpc-review.lock` y comentarios en español.
- [x] T087 [P] [US4] Crear `backend/apps/reviews/services/standing.py` con `reviewer_standing(user)` y `annotate_standing(queryset)`, sin N+1. Llenar `build_reviewer_section()` en `backend/apps/users/services/dashboard.py`.
- [x] T088 [US4] Agregar `ReviewerStandingSerializer` y `RankingAdjustmentSerializer` en `backend/apps/reviews/serializers.py` y las vistas de desempeño y ajustes en `backend/apps/reviews/views.py`, con sus rutas en `backend/apps/reviews/reviewer_urls.py`. `ReviewerConflictView` responde `{assignment, status, release_cause}`.
- [x] T089 [P] [US4] En `backend/apps/notifications/receivers.py`, `assignment_expired` avisa al Revisor de la revocación y de los 20 puntos restados, y `assignment_revoked` usa un mensaje por causa, sin el texto libre del motivo.
- [x] T090 [P] [US4] Agregar `max` opcional a `KpiMetric` en `frontend/src/app/shared/components/kpi-card.component.ts`, `.html` y `.scss`. Muestra «X/Y» y su nombre accesible es «X de Y». Valida enteros no negativos y presenta las métricas sin `max` igual que antes.
- [x] T091 [P] [US4] Agregar en `frontend/src/app/core/models/reviewer.model.ts` los tipos `ReviewerStanding` y `RankingAdjustment`, con las etiquetas de causa, y en `frontend/src/app/core/services/reviewer.service.ts` los métodos `standing()` y `adjustments(page)`.
- [x] T092 [US4] Crear `frontend/src/app/features/reviewer/reviewer-standing/reviewer-standing.component.ts`, `.html` y `.scss`, standalone. Muestra `KpiCardComponent` con puntaje, «X/5 activas», evaluaciones a tiempo y vencimientos, y una tabla de ajustes con `PaginationComponent`, `EmptyStateComponent` y deltas con texto y tono semántico.
- [x] T093 [US4] Integrar `app-reviewer-standing` en `frontend/src/app/features/reviewer/assignment-list/assignment-list.component.ts` y `.html`. Mostrar puntaje, «X/5 activas», evaluaciones a tiempo y vencimientos en `frontend/src/app/features/dashboard/reviewer-summary/reviewer-summary.component.ts` y `.html` con los enlaces vigentes.
- [x] T094 [P] [US4] Actualizar `frontend/src/app/features/reviewer/conflict-dialog/conflict-dialog.component.html` («la asignación se libera sin penalización»), `frontend/src/app/features/reviewer/assignment-detail/assignment-detail.component.ts` y `.html`, con regreso a la bandeja y mensaje tras la liberación, y `frontend/src/app/features/reviewer/deadline-countdown/deadline-countdown.component.html`, con el aviso de revocación y −20 al vencer.

**Checkpoint**: ningún cupo queda retenido por una asignación vencida y el Revisor ve su desempeño.

---

## Phase 7: User Story 5 - Operar con Autor, Revisor y Administrador (Priority: P1)

**Goal**: la SPA y los avisos operan con tres roles. El Administrador resuelve incidentes y corrige veredictos, y los expedientes en curso continúan solos.

**Independent Test**: recorrer con cada rol, una cuenta multirrol y una exeditora; resolver incidentes con las tres opciones y corregir un veredicto (escenarios J, K y L).

### Tests for User Story 5 ⚠️

- [x] T095 [P] [US5] Crear `backend/tests/reviews/test_admin_incidents_api.py`:
  - Listado con filtros y ámbito sin conflicto de autoría (`404`).
  - Documento sanitizado con nombre genérico y auditoría `INCIDENT_DOCUMENT_VIEWED`.
  - `DISMISS` no cambia nada.
  - `REASSIGN` libera una asignación `ACTIVE` o `COMPLETED` sin penalización y cubre el cupo.
  - `REQUEST_ANONYMIZED_VERSION` libera todas las activas, pasa a `CHANGES_REQUESTED`, abre ronda y envía un aviso sin el reporte.
  - Segunda resolución con `409`.
  - El reporte abierto bloquea el veredicto y su resolución lo reanuda.
- [x] T096 [P] [US5] Crear `backend/tests/publications/test_admin_verdict_correction.py`:
  - `POST /api/v1/admin/verdicts/{id}/correct/` crea `ADMIN_CORRECTION` y conserva el original.
  - El catálogo sigue cada decisión.
  - Observaciones obligatorias con `CHANGES_REQUESTED`.
  - Motivo de 10 a 1000 caracteres.
  - `403` por conflicto y `409` si no es el último veredicto.
  - Auditoría `VERDICT_CORRECTED` y `404` en `authorize-correction/`.
- [x] T097 [P] [US5] Crear `backend/tests/reviews/test_transition_command.py` para `apply_auto_review_transition`:
  - Revoca roles `EDITOR` con `ROLE_REVOKED` y desactiva el rol.
  - Las `EXPIRED` heredadas pasan a `REVOKED` con `LEGACY_TRANSITION` y sin ajuste.
  - Los `SUBMITTED` reciben asignación.
  - Un `UNDER_REVIEW` con una evaluación heredada completa el cupo 2 y se decide con la clasificación de la versión 1.
  - La segunda ejecución no tiene efectos.
- [x] T098 [P] [US5] Crear `backend/tests/users/test_role_retirement.py`. Una cuenta exeditora inicia sesión con `roles: []` y el panel sin secciones. Una fila `UserRole` activa con el rol inactivo no concede permisos. Las 11 rutas `editor/` responden `404`.
- [x] T099 [P] [US5] Completar `backend/tests/security/test_access_matrix.py` y `backend/tests/test_urls.py` con los endpoints de `/admin/incidents/`, el documento del incidente, `/admin/verdicts/{id}/correct/` y `/reviewer/standing/`. Verificar que `IsAdmin` no da acceso general a manuscritos, evaluaciones ni PDFs y que no queda ninguna ruta `editor/`.
- [x] T100 [P] [US5] Actualizar `backend/tests/notifications/test_notifications.py` con los destinatarios de cada evento de [contracts/api.md](contracts/api.md#avisos), `admins_for()` sin conflictos, ningún destinatario Editor y la lista blanca de la carga útil. En `backend/tests/users/test_dashboard.py`, la sección `admin` tiene `open_incidents` y `awaiting_reviewers`.
- [x] T101 [P] [US5] Actualizar sin `EDITOR` `frontend/src/app/core/auth/guards.spec.ts`, `frontend/src/app/core/auth/auth.store.spec.ts`, `frontend/src/app/core/layout/shell.component.spec.ts` y `frontend/src/app/shared/directives/has-role.directive.spec.ts`. Actualizar `frontend/src/app/features/dashboard/unified-dashboard/unified-dashboard.component.spec.ts` (sin sección `editor`). Crear `frontend/src/app/core/layout/side-nav.component.spec.ts` (sin grupo Editor y con Incidentes para Administrador).
- [x] T102 [P] [US5] Trasladar con `git mv` la carpeta `frontend/src/app/features/editor/incident-list/` a `frontend/src/app/features/admin/incident-list/` y reescribir `frontend/src/app/features/admin/incident-list/incident-list.component.spec.ts` con filtros, documento y tres resoluciones confirmadas. Crear `frontend/src/app/core/services/admin.service.spec.ts`. Actualizar `frontend/src/app/features/admin/verdict-correction-dialog/verdict-correction-dialog.component.spec.ts`, `frontend/src/app/features/admin/audit-log-detail/audit-log-detail.component.spec.ts`, `frontend/src/app/core/models/audit.model.spec.ts` («Editor (rol retirado)» y «Sistema») y `frontend/src/app/features/admin/testing/audit.fixtures.ts`.
- [x] T103 [P] [US5] Actualizar `frontend/src/app/features/admin/admin-module.integration.spec.ts`, `frontend/src/app/features/author/author-module.integration.spec.ts` y `frontend/src/app/features/reviewer/reviewer-module.integration.spec.ts`, sin `EDITOR` en los roles de prueba y con las rutas nuevas del Administrador.

### Implementation for User Story 5

- [x] T104 [US5] Redefinir `resolve_incident(*, incident_id, admin, resolution, context)` en `backend/apps/reviews/services/incidents.py`. `REASSIGN` usa `release_assignment(cause=INCIDENT_REASSIGN)` también sobre `COMPLETED`. `REQUEST_ANONYMIZED_VERSION` libera todas las activas con `ANONYMIZATION_REQUESTED` y abre la ronda sin veredicto desde `UNDER_REVIEW` o `TIE_BREAKER`. Al cerrar el último reporte abierto de la versión, programa `decide_version()`. La auditoría registra a `ADMIN`.
- [x] T105 [US5] Trasladar los serializadores de incidentes a `AdminIncidentSerializer` y `ResolveIncidentSerializer` en `backend/apps/reviews/serializers.py`, agregando `manuscript_status` y `version_number`. Crear `backend/apps/reviews/admin_views.py`, con listado, resolución y documento mediante `authorize_sanitized_download` y `xaccel_response`, con nombre genérico y auditoría `INCIDENT_DOCUMENT_VIEWED`, y `backend/apps/reviews/admin_urls.py`. Montar `path("admin/", include("apps.reviews.admin_urls"))` en `backend/config/api.py` con su etiqueta en `backend/config/openapi.py`.
- [x] T106 [P] [US5] Implementar `correct_verdict()` en `backend/apps/publications/services/corrections.py`. Valida conflicto y `consumption_problem()`, crea y consume `VerdictCorrection` y llama a `apply_decision(origin='ADMIN_CORRECTION')` con la base copiada. Reemplazar `authorize-correction/` por `correct/` en `backend/apps/publications/admin_views.py` y `backend/apps/publications/admin_urls.py` y retirar `verdict_correction_authorized` de `backend/apps/publications/signals.py` si queda sin uso.
- [x] T107 [P] [US5] Crear `backend/apps/reviews/management/commands/apply_auto_review_transition.py`, idempotente, según el plan. Agregar `python manage.py apply_auto_review_transition` después de `apply_db_privileges` en el `command` del servicio `backend` de `docker-compose.yml`.
- [x] T108 [US5] En `backend/apps/notifications/receivers.py`, `incident_reported` avisa a `admins_for()` con el enlace `/app/admin/incidents`, `incident_resolved` avisa al Autor sin mencionar el reporte y `verdict_registered` cubre las correcciones. Eliminar el receptor de autorización de corrección.
- [x] T109 [P] [US5] Llenar `build_admin_section()` en `backend/apps/users/services/dashboard.py` con `open_incidents` y `awaiting_reviewers`, este último a partir del helper de cupos pendientes de `backend/apps/reviews/services/assignments.py`.
- [x] T110 [US5] Adaptar `frontend/src/app/features/admin/incident-list/incident-list.component.ts`, `.html` y `.scss`, trasladados en T102, a `AdminService`, con filtros, enlace al documento, tres resoluciones con `ConfirmDialogComponent` y estado vacío. Crear `frontend/src/app/core/models/incident.model.ts` con los tipos de `editor.model.ts` y `frontend/src/app/core/services/admin.service.ts` con incidentes, documento y corrección. Agregar la ruta `admin/incidents` con `ADMIN` en `frontend/src/app/app.routes.ts`.
- [x] T111 [US5] Eliminar `frontend/src/app/features/editor/` y sus specs y fixtures, `frontend/src/app/core/services/editor.service.ts`, `editor.service.spec.ts`, `frontend/src/app/core/models/editor.model.ts` y `frontend/src/app/features/dashboard/editor-summary/`. Actualizar `frontend/src/app/app.routes.ts` (sin `editor/*`), `frontend/src/app/core/models/role.model.ts` (`'AUTHOR' | 'REVIEWER' | 'ADMIN'`), `frontend/src/app/core/models/dashboard.model.ts` y `frontend/src/app/features/dashboard/unified-dashboard/unified-dashboard.component.ts` y `.html`. En `frontend/src/app/core/layout/side-nav.component.ts` y `.html`, Administrador tiene Auditoría e Incidentes. Quitar `'editor'` de `KpiIcon` en `frontend/src/app/shared/components/kpi-card.component.ts` y `.html`. En `frontend/public/icons/ui.svg`, quitar el símbolo `editor` y agregar `areas`.
- [x] T112 [US5] Agregar la decisión, las observaciones condicionadas a `CHANGES_REQUESTED` y el motivo de 10 a 1000 caracteres en `frontend/src/app/features/admin/verdict-correction-dialog/verdict-correction-dialog.component.ts` y `.html`, con el texto «el Administrador registra la nueva decisión». Llamar a `AdminService.correctVerdict()` desde `frontend/src/app/features/admin/audit-log-detail/audit-log-detail.component.ts`. En `frontend/src/app/core/services/audit.service.ts`, quitar la autorización. En `frontend/src/app/core/models/audit.model.ts`, `actor_role` queda como `string | null`, con las etiquetas heredadas y las acciones nuevas.
- [x] T113 [P] [US5] Mostrar los reportes abiertos y los manuscritos en espera de revisores en `frontend/src/app/features/dashboard/admin-summary/admin-summary.component.ts` y `.html`, con enlaces a Incidentes y Auditoría.
- [x] T114 [P] [US5] Dirigir al Administrador los textos de `frontend/src/app/features/reviewer/identity-leak-dialog/identity-leak-dialog.component.html` y de las ayudas de `INCIDENT_REPORT_TYPES` en `frontend/src/app/core/models/reviewer.model.ts`. `OTHER` queda como canal confidencial.

**Checkpoint**: no queda Editor en la API ni en la SPA, el Administrador cubre incidentes y correcciones y la transición deja los expedientes en marcha.

---

## Phase 8: User Story 6 - Mantener el padrón de revisores y el catálogo de carreras (Priority: P3)

**Goal**: el Administrador gestiona las carreras validadas y las carreras y la disponibilidad de cada revisor.

**Independent Test**: crear una carrera, asignarla a un revisor, marcar a otro como no disponible y comprobar la asignación siguiente (escenario M).

### Tests for User Story 6 ⚠️

- [x] T115 [P] [US6] Crear `backend/tests/users/test_areas_api.py` (clase `TestAdminCatalog`):
  - El listado muestra todas las carreras con los conteos de manuscritos y revisores.
  - El alta genera `code` con `slugify`. Un nombre repetido sin distinguir mayúsculas da `400`.
  - Cambiar el nombre conserva el `code`.
  - Al desactivar, la carrera sale de `/areas/` y no se ofrece. Las asociaciones existentes se conservan y siguen sirviendo para asignar manuscritos en curso.
  - Auditoría `ACADEMIC_AREA_CREATED` y `ACADEMIC_AREA_UPDATED`.
  - `403` para otros roles.
- [x] T116 [P] [US6] Crear `backend/tests/reviews/test_admin_reviewers_api.py`:
  - Listado con métricas, filtros `area`, `available` y `search` y orden por defecto.
  - `PATCH` de `areas` e `is_available`. Rechaza una carrera inactiva nueva y conserva las ya asignadas.
  - Un revisor no disponible no recibe asignaciones nuevas y conserva las vigentes.
  - Auditoría `REVIEWER_PROFILE_UPDATED`, `403` para otros roles y número de consultas constante.
- [x] T117 [P] [US6] Crear `frontend/src/app/features/admin/reviewer-roster/reviewer-roster.component.spec.ts`, `frontend/src/app/features/admin/reviewer-edit-dialog/reviewer-edit-dialog.component.spec.ts` y `frontend/src/app/features/admin/area-catalog/area-catalog.component.spec.ts`. Ampliar `frontend/src/app/core/services/admin.service.spec.ts` con padrón y carreras.

### Implementation for User Story 6

- [x] T118 [P] [US6] Crear el catálogo del Administrador: serializadores en `backend/apps/users/serializers.py`, vistas de listado, alta y modificación con `IsAdmin` y auditoría en `backend/apps/users/admin_views.py`, `backend/apps/users/admin_urls.py` y la ruta `admin/areas/` en `backend/config/api.py`.
- [x] T119 [P] [US6] Agregar el padrón a `backend/apps/reviews/admin_views.py` y `backend/apps/reviews/admin_urls.py`: `GET /admin/reviewers/` con `annotate_standing()` y `PATCH /admin/reviewers/{user_id}/` con `AdminReviewerSerializer` y `AdminReviewerUpdateSerializer` en `backend/apps/reviews/serializers.py`.
- [x] T120 [US6] Agregar los tipos del padrón y del catálogo en `frontend/src/app/core/models/area.model.ts` y sus métodos en `frontend/src/app/core/services/admin.service.ts`.
- [x] T121 [US6] Crear `frontend/src/app/features/admin/reviewer-roster/reviewer-roster.component.ts`, `.html` y `.scss`, una tabla con filtros, métricas, badges y paginación. Crear `frontend/src/app/features/admin/reviewer-edit-dialog/reviewer-edit-dialog.component.ts`, `.html` y `.scss`, un diálogo nativo con casillas de carreras activas, disponibilidad y foco gestionado.
- [x] T122 [P] [US6] Crear `frontend/src/app/features/admin/area-catalog/area-catalog.component.ts`, `.html` y `.scss`, con listado, alta, cambio de nombre en línea, activación con `ConfirmDialogComponent` y estado vacío.
- [x] T123 [US6] Agregar las rutas `admin/reviewers` y `admin/areas` con `ADMIN` en `frontend/src/app/app.routes.ts`. En `frontend/src/app/core/layout/side-nav.component.ts` y `.html`, los enlaces Revisores y Carreras usan los iconos `reviewer` y `areas`. Agregar esos mismos accesos en `frontend/src/app/features/dashboard/admin-summary/admin-summary.component.html`.

**Checkpoint**: el Administrador ajusta carreras y padrón sin herramientas técnicas.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: E2E, documentación, rendimiento y verificación de SC-001 a SC-009.

- [x] T124 Actualizar `scripts/e2e/seed_e2e.py` sin `e2e-editor` y con tres revisores de Ingeniería en Computación, uno de Derecho, un Administrador y una cuenta Autor–Revisor. Ajustar `frontend/e2e/support/api.ts` y `frontend/e2e/support/world.ts` con ayudas para ejecutar `run_review_automation` en el stack aislado y sin ayudas del Editor.
- [x] T125 Reescribir `frontend/e2e/02-ciclo-completo.e2e.ts`. El envío produce dos asignaciones, dos evaluaciones con Aceptar dan Aceptado y catálogo, y siguen la baja y la auditoría.
- [x] T126 [P] Reescribir `frontend/e2e/03-correccion.e2e.ts`. Revisión menor produce Cambios solicitados y v2 con nuevas asignaciones. Aceptar y Rechazar abren el desempate y deciden por mayoría. El Administrador corrige un veredicto.
- [x] T127 [P] Reescribir `frontend/e2e/04-fuga-de-identidad.e2e.ts` con tres revisores y un Autor–Revisor. Verificar el aislamiento en DOM, árbol accesible, respuestas, documentos y avisos, y el reporte resuelto por el Administrador.
- [x] T128 [P] Actualizar el inventario de vistas de `frontend/e2e/01-sesion.e2e.ts`, `frontend/e2e/05-accesibilidad.e2e.ts`, `frontend/e2e/06-teclado.e2e.ts` y `frontend/e2e/07-responsive.e2e.ts`: rúbrica, desempeño, incidentes, padrón y carreras, sin vistas del Editor, a 320, 768 y 1366 px.
- [ ] T129 [P] Retirar el Editor de `scripts/load/seed_users.py`, `scripts/load/load_test.py`, `scripts/verify/verify_pilot.py`, `scripts/build_docs_diagrams.sh` y `scripts/check_docs_site.py`.
- [ ] T130 [P] Actualizar `README.md`, `QUICKSTART.md` y `docs/RUNBOOK.md` con los tres roles, `create_user --areas`, el catálogo de carreras, `run_review_automation` en cron, la transición en el arranque y los comandos de verificación.
- [ ] T131 [P] Actualizar el sitio de documentación. Eliminar `docs-site/usuarios/editor.qmd` y su entrada en `docs-site/_quarto.yml`. Actualizar `docs-site/index.qmd`, `docs-site/usuarios/administrador.qmd`, `revisor.qmd`, `autor.qmd`, `estados-y-glosario.qmd` y `primeros-pasos.qmd`, más `docs-site/ingenieria/proceso-editorial.qmd`, `dominio-y-estados.qmd`, `seguridad.qmd`, `arquitectura.qmd`, `vision-general.qmd`, `pruebas.qmd`, `contribuir.qmd` y `api.qmd`. Revisar `docs-site/ingenieria/adr/0003-doble-ciego-por-diseno.qmd`, crear `docs-site/ingenieria/adr/0008-flujo-editorial-automatico.qmd` y registrarlo en `docs-site/ingenieria/adr/index.qmd`. Regenerar la API con `scripts/build_docs_api.sh`.
- [ ] T132 [P] Agregar a la tabla 1.1 de `.spec-kit/specify.md` las decisiones que reemplazan D-02, D-04, RN-04, RN-05, RN-12, CA-HU-11-01, CA-HU-15-01, CA-HU-15-03, CA-HU-16-06 y la fase 2, con enlace a `specs/004-auto-assign-ranking-rubric/spec.md`.
- [x] T133 [P] Ampliar `backend/tests/performance/test_query_scaling.py` con `/areas/`, `/reviewer/standing/`, sus ajustes, `/admin/incidents/`, `/admin/reviewers/`, `/admin/areas/` y `eligible_candidates()`. Con 2 y con 9 filas, el número de consultas no cambia.
- [ ] T134 Repetir el inventario de T004 y registrar en `specs/004-auto-assign-ranking-rubric/tasks.md` que solo quedan referencias heredadas justificadas: migraciones, el comando de transición, etiquetas de auditoría y de estados históricos, y ADR.
- [x] T135 Ejecutar el comando de T001 con cobertura y confirmar el mínimo del 80 % en servicios y permisos de `backend/.coveragerc`, además de `makemigrations --check --dry-run`. Registrar los resultados frente a la línea base.
- [x] T136 Desde `frontend/`, ejecutar `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npx ng build --configuration production` y `npx ng test --watch=false`. Desde la raíz, ejecutar `python3 scripts/check_frontend_build.py`. Confirmar los presupuestos de `frontend/angular.json` y la publicación del símbolo `areas` de `frontend/public/icons/ui.svg`.
- [x] T137 Ejecutar `./scripts/e2e.sh` completo. Con axe, exigir cero infracciones A/AA. Medir el contraste de los estados nuevos (opciones de la rúbrica, contador, deltas, `CHANGES_REQUESTED`, `TIE_BREAKER` y tablas del Administrador) en reposo, hover, foco, activo y error. Registrar los ratios por vista con el formato de 003.
- [ ] T138 Recorrer los escenarios A a M de `specs/004-auto-assign-ranking-rubric/quickstart.md` en el entorno de desarrollo. Medir con al menos cinco revisores de prueba el tiempo de llenado de la rúbrica para SC-008. Registrar los resultados por criterio de éxito.
- [ ] T139 Ejecutar `graphify update .` para actualizar `graphify-out/graph.json`, según `CLAUDE.md`, y `git diff --check` antes de cerrar la implementación.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (fase 1)**: sin dependencias. T002 a T004 corren en paralelo después de T001 o junto con él.
- **Foundational (fase 2)**: depende de la fase 1 y bloquea todas las historias. Orden interno:
  1. T005 y T006.
  2. T007, que precede a T008, T010 y T012, en paralelo entre sí.
  3. Migraciones en orden: T009, T011, T013, T014, T015 y T016.
  4. Adaptación: T017 y T018, después T019, T020 y T021, con T022 y T023 en paralelo, y por último T024.
  5. Pruebas: T025 y T026, después T027 a T030 en paralelo, y T031 al final.
- **US1 (fase 3)**: depende de la fase 2.
- **US2 (fase 4)**: depende de la fase 2. Puede avanzar en paralelo con US1, porque toca archivos distintos salvo `frontend/src/app/core/models/reviewer.model.ts` (T046 y T058) y `evaluation-history.component.html` (T050 y T061), que se coordinan.
- **US3 (fase 5)**: depende de US1 (motor y cupos) y de US2 (dictámenes de la versión 2).
- **US4 (fase 6)**: depende de US1 (liberaciones y llenado) y de US3, porque `run_cycle()` usa `reconcile_pending_verdicts()`.
- **US5 (fase 7)**: depende de US1, por `release_assignment()` y la transición, y de US3, por `apply_decision()` y `decide_version()`. Para el panel del Administrador usa el helper de cupos de US1.
- **US6 (fase 8)**: depende de US4 (`standing.py`) y de US5 (`admin_views.py`, `admin.service.ts` y la navegación del Administrador).
- **Polish (fase 9)**: depende de las historias que se entreguen. T124 precede a T125, T126 y T127.

### User Story Dependencies

| Historia | Depende de | Entrega independiente | Criterios |
| --- | --- | --- | --- |
| US1 | Fase 2 | Asignación automática por carrera con cupo y cola | SC-001, SC-002 |
| US2 | Fase 2 | Rúbrica y justificación obligatoria | SC-003, SC-008 |
| US3 | US1 y US2 | Veredicto por consenso y desempate | SC-004, SC-007 |
| US4 | US1 y US3 | Ranking, vencimiento automático y desempeño | SC-005 |
| US5 | US1 y US3 | Tres roles, incidentes, corrección y transición | SC-006, SC-007, SC-009 |
| US6 | US4 y US5 | Padrón y catálogo de carreras | Apoya SC-001 en la operación |

### Within Each User Story

- Las pruebas se escriben primero y deben fallar.
- Modelos y servicios antes que vistas y rutas, y estas antes que la SPA.
- En la SPA: modelos y servicios, después componentes y por último rutas y navegación.
- La historia se cierra en su checkpoint antes de la siguiente prioridad.

### Parallel Opportunities

- Todas las tareas `[P]` de un bloque de pruebas corren a la vez.
- En la fase 2: T008, T010 y T012; T022 y T023; y T027 a T030.
- US1 y US2 pueden asignarse a dos personas al cerrar la fase 2.
- En la fase 9: T126 a T133 en paralelo, después de T124 y T125.

---

## Parallel Example: User Story 1

```bash
# Pruebas de US1 en paralelo:
Task: "T032 Elegibilidad y orden en backend/tests/reviews/test_eligibility.py"
Task: "T033 Motor y cola en backend/tests/reviews/test_assignment_engine.py"
Task: "T034 Concurrencia y disparador en backend/tests/reviews/test_assignment_concurrency.py"
Task: "T036 API pública de carreras en backend/tests/users/test_public_areas_api.py"

# Frontend de US1 en paralelo, después de T046:
Task: "T048 Carreras en detalle, listado e historial del Autor"
Task: "T049 Selector de carrera en el catálogo público"
Task: "T050 Carreras en las vistas del Revisor"
```

## Parallel Example: User Story 4

```bash
Task: "T076 Ranking en backend/tests/reviews/test_ranking.py"
Task: "T077 Automatización en backend/tests/reviews/test_automation_command.py"
Task: "T081 Tarjeta KPI con máximo y desempeño del Revisor"
Task: "T090 KpiMetric.max en frontend/src/app/shared/components/kpi-card.component.ts"
Task: "T091 Tipos y servicio de desempeño en frontend/src/app/core/services/reviewer.service.ts"
```

## Parallel Example: User Story 5

```bash
Task: "T095 Incidentes del Administrador en backend/tests/reviews/test_admin_incidents_api.py"
Task: "T096 Corrección en backend/tests/publications/test_admin_verdict_correction.py"
Task: "T097 Transición en backend/tests/reviews/test_transition_command.py"
Task: "T106 correct_verdict() en backend/apps/publications/services/corrections.py"
Task: "T107 Comando de transición y docker-compose.yml"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Completar las fases 1 y 2.
2. Completar US1 y validar los escenarios A y B: cada envío recibe sus revisores o deja cupos pendientes con aviso.
3. **Parar y validar** antes de seguir.

### Incremental Delivery

1. US1, US2, US3 y US4 completan el ciclo automático operable: envío, rúbrica, veredicto y control del plazo.
2. US5 es requisito de liberación: retira el Editor de la SPA y entrega incidentes, corrección y transición.
3. US6 (P3) agrega la gestión diaria del padrón y del catálogo. Mientras tanto, `create_user --areas` y la transición cubren la operación.
4. La fase 9 cierra E2E, documentación y verificación.

### Parallel Team Strategy

1. El equipo completa junto las fases 1 y 2.
2. Persona A con US1 y luego US3. Persona B con US2 y luego US4.
3. US5 se integra al terminar US3. US6 cierra la secuencia.

---

## Resultados de verificación

### Estado parcial (reanudación)

- Backend: 1421 pruebas pasan (12 omitidas); migraciones aplicadas sobre datos heredados; `makemigrations --check` limpio. Con xdist hay 19 pruebas inestables heredadas de la línea base (pasan en serie con `API_DOCS_ENABLED=true`).
- Frontend: `tsc` app y spec limpios, 76 archivos / 1198 pruebas en verde con `TZ=UTC npx ng test --watch=false`, build de producción y `scripts/check_frontend_build.py` correctos (T136).
- Cobertura (T135): servicios y permisos 95 % (mínimo por archivo 85 %, umbral 80 %); `makemigrations --check --dry-run` sin cambios; 1432 pruebas pasan con xdist (la de 50 MB es inestable en paralelo y pasa en serie).
- E2E (T124–T128, T137): `./scripts/e2e.sh` completo desde un stack nuevo, 39 pruebas en verde (2,3 min). Semilla: 6 revisores de Ingeniería en Computación, 1 de Derecho, 1 cuenta Autor–Revisor de Derecho, 1 Autor y 1 Administrador, sin Editor. Cubre auto-asignación y cupo `X/5`, ranking +10, rúbrica de 5 criterios con justificación de 100 caracteres, consenso, desempate automático, corrección del Administrador y aislamiento del doble ciego (DOM, árbol accesible, respuestas, PDF y avisos). axe-core: cero infracciones WCAG A/AA, contraste incluido, en todas las vistas de los tres roles y en el formulario con el contador de justificación. Teclado y responsive (320, 768, 1024, 1366 y 1920 px) sin hallazgos. Limitaciones: el contraste se verificó con axe en reposo, sin ratios por estado (hover, foco, activo, error) como en 003, y no se agregó una ayuda E2E para `run_review_automation`: el vencimiento automático lo cubren las pruebas del backend (`test_automation_command.py`).
- Pendientes: T002–T004 (registro de líneas base e inventario), T129–T132 (scripts, docs), T134, T137–T139. `graphify` no está instalado en este entorno.

Completar durante la implementación: línea base (T001 a T004), suite tras la fase 2 (T031), inventario final (T134), backend (T135), frontend (T136), E2E, accesibilidad y contraste (T137) y escenarios manuales (T138).

---

## Notes

- `[P]` indica archivos distintos sin dependencias pendientes.
- `[USn]` vincula la tarea con su historia para la trazabilidad.
- Ninguna tarea modifica filas `FINAL` de evaluaciones, veredictos, versiones, eventos de estado ni auditoría.
- Hacer commit en español después de cada tarea o grupo lógico.
- Detenerse en cada checkpoint para validar la historia de forma independiente.
