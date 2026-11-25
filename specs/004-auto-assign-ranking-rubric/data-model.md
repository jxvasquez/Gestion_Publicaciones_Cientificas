# Data Model: Asignación automática por carrera, ranking de revisores y rúbrica profesional

**Fase 1** del [plan](plan.md). Describe solo lo que cambia sobre el modelo vigente de `backend/apps/*/models.py`. Las decisiones que lo justifican están en [research.md](research.md).

## Políticas fijas

Constantes de `backend/apps/reviews/policy.py`. No se configuran por entorno ni por perfil.

| Constante | Valor | Uso |
| --- | --- | --- |
| `MAX_ACTIVE_ASSIGNMENTS` | 5 | Cupo estricto de asignaciones `ACTIVE` por revisor (FR-013). |
| `REVIEWERS_PER_VERSION` | 2 | Cupos iniciales de cada versión (FR-010). |
| `TIE_BREAKER_SLOT` | 3 | Cupo del desempate (FR-023). |
| `ASSIGNMENT_DAYS` | 20 | Plazo en días calendario; se mantiene `ck_assignment_due_at` (FR-015). |
| `RANKING_BASE_SCORE` | 100 | Puntaje inicial (FR-028). |
| `ON_TIME_BONUS` | +10 | Evaluación final antes de `due_at` (FR-029). |
| `MISSED_DEADLINE_PENALTY` | −20 | Vencimiento sin evaluación final (FR-030). |
| `MAX_AREAS_PER_MANUSCRIPT` | 3 | Carreras por manuscrito (FR-008). |
| `JUSTIFICATION_MIN_LENGTH` | 100 | Caracteres mínimos de los comentarios en los casos de FR-019. |
| `JUSTIFICATION_SCORE_THRESHOLD` | 3 | Un criterio con este valor o menos exige justificación. |

## Entidades

### AcademicArea · nueva · `apps.users`

Tabla `users_academic_area`.

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `id` | `SmallAutoField` | Clave primaria. |
| `code` | `SlugField(80)` | Único e inmutable. Se genera desde el nombre al crearse y lo usan la API y los filtros. |
| `name` | `CharField(120)` | Único sin distinguir mayúsculas (`UniqueConstraint(Lower("name"))`). Sin espacios sobrantes. |
| `is_active` | `BooleanField` | `True` por defecto. Una carrera inactiva no se ofrece, pero conserva sus asociaciones. |
| `created_at`, `updated_at` | `DateTimeField` | Automáticos. |

Relaciones: `Manuscript.areas` y `ReviewerProfile.areas`, de muchos a muchos. La coincidencia de FR-011 compara identificadores de esta tabla.

### Role · modificada · `apps.users`

- `Role.Code` solo contiene `AUTHOR`, `REVIEWER` y `ADMIN`.
- La fila heredada con `code='EDITOR'` permanece con `is_active=False`. Nadie puede recibirla y `active_role_codes()` exige `role__is_active=True`.

### ReviewerProfile · modificada · `apps.users`

| Campo | Cambio | Reglas |
| --- | --- | --- |
| `areas` | Nuevo `ManyToManyField(AcademicArea)` | Sin carreras, el revisor no es elegible. |
| `ranking_score` | Nuevo `IntegerField(default=100)` | `CHECK (ranking_score >= 0)`. Solo lo modifica `ranking.adjust()`. |
| `is_available` | Sin cambios | Si es falso, el revisor no recibe asignaciones nuevas. |
| `expertise_areas` | Eliminado | Se migra a `areas`. También se elimina `idx_reviewer_expertise_areas`. |
| `max_active_assignments` | Eliminado | Lo reemplaza `MAX_ACTIVE_ASSIGNMENTS`. |

Métricas derivadas en `apps/reviews/services/standing.py`, sin columnas nuevas:

- `active_assignments`: asignaciones `ACTIVE` del revisor.
- `on_time_evaluations`: ajustes `ON_TIME_EVALUATION`.
- `missed_deadlines`: ajustes `DEADLINE_MISSED`.
- `last_assigned_at`: `assigned_at` más reciente, usado para el desempate del orden.

### Manuscript · modificada · `apps.publications`

| Campo | Cambio | Reglas |
| --- | --- | --- |
| `areas` | Nuevo `ManyToManyField(AcademicArea)` | Entre 1 y 3 carreras activas para enviar. Se editan en `DRAFT` y `CHANGES_REQUESTED`. |
| `area` | Eliminado | Se migra a `areas`. También se elimina `idx_manuscript_area`. |
| `status` | Nuevos valores | `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `TIE_BREAKER`, `CHANGES_REQUESTED`, `ACCEPTED` y `REJECTED`. `ck_manuscript_status` se redefine con ese conjunto. |

- `ManuscriptQuerySet.for_editor()` desaparece y `visible_to()` se reduce al ámbito del Autor (`owned_by`).
- `metadata_snapshot` de las versiones nuevas guarda `areas: [{code, name}]` en lugar de `area`. Las instantáneas existentes no cambian. La comparación «sin cambios» de una nueva versión normaliza el `area` heredado al nombre de la carrera equivalente.

### Assignment · modificada · `apps.reviews`

| Campo | Cambio | Reglas |
| --- | --- | --- |
| `slot` | Nuevo `PositiveSmallIntegerField` | `CHECK (slot IN (1, 2, 3))`. Las filas existentes reciben `1`. |
| `assigned_by` | Admite nulos | `NULL` significa asignación del sistema. Las filas heredadas conservan al Editor. |
| `release_cause` | Nuevo `CharField(32)`, nulo | `OVERDUE`, `CONFLICT_OF_INTEREST`, `INCIDENT_REASSIGN`, `ANONYMIZATION_REQUESTED`, `MANUSCRIPT_WITHDRAWN`, `LEGACY_TRANSITION` o `EDITOR_LEGACY`. Se completa al revocar o vencer. |
| `status` | Nueva semántica | `EXPIRED` es terminal: vencida y revocada por el sistema, con penalización. `REVOKED` cubre las demás liberaciones. |

Restricciones e índices:

- Se elimina `uq_assignment_active`, que admitía un solo revisor activo por manuscrito.
- `uq_assignment_live_slot`: `UNIQUE (version, slot) WHERE status IN ('ACTIVE', 'COMPLETED')`.
- `uq_assignment_live_reviewer`: `UNIQUE (version, reviewer) WHERE status IN ('ACTIVE', 'COMPLETED')`.
- Se conservan `ck_assignment_status`, `ck_assignment_due_at` y los índices actuales.
- Disparador `trg_assignment_capacity`: `BEFORE INSERT OR UPDATE OF status`, cuando `NEW.status = 'ACTIVE'`. Cuenta las otras asignaciones `ACTIVE` del revisor y rechaza la operación si ya hay `MAX_ACTIVE_ASSIGNMENTS`.
- La exclusión por participación previa en la versión se aplica en la consulta de elegibles sobre todas las asignaciones, sin importar su estado.

### Evaluation · modificada · `apps.reviews`

| Campo | Cambio | Reglas |
| --- | --- | --- |
| `rubric_version` | Nuevo `PositiveSmallIntegerField` | `1` para las filas existentes, agregado con `DEFAULT 1` en el `ALTER TABLE` sin reescribir filas. `2` para las nuevas. |
| `scientific_contribution`, `methodological_rigor`, `literature_grounding`, `results_conclusions`, `academic_writing` | Nuevos `SmallIntegerField`, nulos | `CHECK` nulo o entre 1 y 5, igual que los criterios actuales. |
| `originality_score` … `ethics_score` | Sin cambios | Solo los usan las filas `rubric_version=1`. |
| `recommendation` | Nuevos valores | Versión 1: `ACCEPT`, `REQUIRES_CORRECTIONS` o `REJECT`. Versión 2: `ACCEPTED`, `MINOR_REVISION`, `MAJOR_REVISION` o `REJECTED`. |
| `confidential_comments` | Columna conservada | La API ya no la expone ni la escribe. |

Restricciones:

- `ck_evaluation_recommendation`: el dictamen es nulo o pertenece al conjunto de su versión.
- `ck_evaluation_final_complete`: un borrador admite huecos. Una evaluación final exige dictamen, comentarios, `submitted_at` y los cinco criterios de su versión.
- `ck_evaluation_rubric_justification`: en una evaluación final de versión 2, si algún criterio es 3 o menos o el dictamen es `MAJOR_REVISION` o `REJECTED`, exige `char_length(comments_for_author) >= 100`.
- Se conservan `uq_evaluation_version_reviewer` y `trg_evaluation_no_update_after_final`.

### RankingAdjustment · nueva · `apps.reviews`

Tabla `reviews_ranking_adjustment`, append-only.

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `id` | `BigAutoField` | Clave primaria. |
| `reviewer` | FK `User` (`PROTECT`) | Revisor afectado. |
| `assignment` | FK `Assignment` (`PROTECT`) | Asignación que origina el ajuste. |
| `cause` | `CharField(24)` | `ON_TIME_EVALUATION` o `DEADLINE_MISSED`. |
| `delta` | `SmallIntegerField` | `+10` con `ON_TIME_EVALUATION` y `−20` con `DEADLINE_MISSED` (`CHECK`). |
| `score_before`, `score_after` | `IntegerField` | `score_after = max(0, score_before + delta)`, con `CHECK (score_after >= 0)`. |
| `created_at` | `DateTimeField` | Automático. |

- `UNIQUE (assignment, cause)`: una sola bonificación o penalización por asignación.
- Índice `(reviewer, -created_at)` para el historial del revisor.
- El disparador `trg_ranking_adjustment_no_update` reutiliza `prevent_append_only_mutation()` y el modelo hereda la protección de `AppendOnlyModel`.

### Verdict · modificada · `apps.publications`

| Campo | Cambio | Reglas |
| --- | --- | --- |
| `decided_by` | Renombrado desde `editor` y admite nulos | `NULL` significa decisión del sistema. |
| `origin` | Nuevo `CharField(20)` | `CONSENSUS`, `TIE_BREAK`, `ADMIN_CORRECTION` o `EDITOR_LEGACY`. Las filas existentes reciben `EDITOR_LEGACY` por `DEFAULT` en el `ALTER TABLE`. |
| `evaluation` | Admite nulos | Solo lo usan los veredictos `EDITOR_LEGACY`. Los nuevos usan `VerdictEvaluation`. |
| `decision` | Nuevo valor | `ACCEPTED`, `REJECTED` o `CHANGES_REQUESTED`. `REQUIRES_CORRECTIONS` solo con `EDITOR_LEGACY`. |

Restricciones:

- `ck_verdict_decision` redefinida según la tabla anterior.
- `ck_verdict_corrections_observations`: `CHANGES_REQUESTED` y `REQUIRES_CORRECTIONS` exigen `observations`.
- `ck_verdict_decider`: `decided_by` es nulo con `CONSENSUS` y `TIE_BREAK`, y no nulo con `ADMIN_CORRECTION` y `EDITOR_LEGACY`.
- Se conservan `ck_verdict_rejected_justification`, `uq_verdict_normal_per_version` y `trg_verdict_no_update`.

### VerdictEvaluation · nueva · `apps.publications`

Tabla `publications_verdict_evaluation`, append-only. Registra las evaluaciones consideradas por un veredicto nuevo.

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `id` | `BigAutoField` | Clave primaria. |
| `verdict` | FK `Verdict` (`PROTECT`) | Veredicto. |
| `evaluation` | FK `reviews.Evaluation` (`PROTECT`) | Evaluación final considerada. |
| `slot` | `PositiveSmallIntegerField` | Cupo de la asignación. Define la etiqueta «Revisor N» que ve el Autor. |

`UNIQUE (verdict, evaluation)`, `UNIQUE (verdict, slot)` y disparador `trg_verdict_evaluation_no_update` con `prevent_append_only_mutation()`. Una corrección copia la base del veredicto que sustituye.

### VerdictCorrection · sin cambios de esquema

`authorized_by` es el Administrador que corrige. La autorización se crea y se consume en la misma transacción de `correct_verdict()`.

### IncidentReport · sin cambios de esquema

- `IncidentReportQuerySet.for_editor()` se reemplaza por `for_admin(user)`, que excluye los manuscritos en los que el Administrador es registrante, autor o coautor.
- `resolved_by` es el Administrador. Un reporte `OPEN` bloquea `decide_version()` de su versión.

### Notification y AuditLog · sin cambios de esquema

Acciones de auditoría nuevas: `ROLE_REVOKED`, `AUTO_ASSIGNMENT_CREATED`, `ASSIGNMENT_SLOT_UNFILLED`, `ASSIGNMENT_RELEASED`, `RANKING_ADJUSTED`, `TIE_BREAK_STARTED`, `INCIDENT_DOCUMENT_VIEWED`, `REVIEWER_PROFILE_UPDATED`, `ACADEMIC_AREA_CREATED` y `ACADEMIC_AREA_UPDATED`. Se conservan `ASSIGNMENT_EXPIRED`, `EVALUATION_SUBMITTED`, `VERDICT_REGISTERED`, `VERDICT_CORRECTED` e `INCIDENT_RESOLVED`. Las acciones del sistema se registran con `actor=NULL` y `actor_role=NULL`.

## Reglas derivadas

### Cupos de una versión

- **Requeridos**: 1 y 2. También el 3 si el manuscrito está en `TIE_BREAKER`.
- **Cubiertos**: cupos con una asignación `ACTIVE` o `COMPLETED` de la versión vigente.
- **Pendientes**: requeridos sin cubrir, solo en manuscritos activos en `SUBMITTED`, `UNDER_REVIEW` o `TIE_BREAKER`. La cola se recorre por `submitted_at` de la versión vigente y, después, por `id`.

### Elegibilidad y orden

Un candidato cumple FR-011 y se ordena por `-ranking_score`, `active_assignments`, `last_assigned_at` con nulos primero e `id`. La consulta excluye a quien tuvo cualquier asignación en la versión.

### Clasificación de dictámenes

| Grupo | Rúbrica 2 | Rúbrica 1, solo transición |
| --- | --- | --- |
| Aceptación | `ACCEPTED` | `ACCEPT` |
| Cambios | `MINOR_REVISION`, `MAJOR_REVISION` | `REQUIRES_CORRECTIONS` |
| Rechazo | `REJECTED` | `REJECT` |

`consensus.outcome(groups)` implementa las tablas de decisión de la [especificación](spec.md#tablas-de-decisión-del-veredicto) como una función pura:

- Con dos grupos: dos aceptaciones dan `ACCEPTED` y dos rechazos dan `REJECTED`. Un rechazo con otro grupo da `TIE_BREAKER`. En los demás casos, `CHANGES_REQUESTED`.
- Con tres grupos: dos o más rechazos dan `REJECTED`. Si no, el resultado es `ACCEPTED` cuando los dos que no rechazan son aceptaciones y `CHANGES_REQUESTED` en los demás casos.

### Ranking

`ranking.adjust(reviewer, assignment, cause)` bloquea el perfil, calcula `score_after = max(0, score + delta)`, inserta el ajuste y audita `RANKING_ADJUSTED`. Lo invocan `submit_evaluation()` con `ON_TIME_EVALUATION` y `automation.expire_overdue()` con `DEADLINE_MISSED`. Las liberaciones de FR-031 nunca lo invocan.

## Máquinas de estado

### Manuscrito

| Desde | Hacia | Actor | Condición |
| --- | --- | --- | --- |
| `DRAFT` | `SUBMITTED` | Autor | Metadatos completos, entre 1 y 3 carreras activas y PDF válido. |
| `SUBMITTED` | `UNDER_REVIEW` | Sistema | Se crea la primera asignación de la versión. |
| `UNDER_REVIEW` | `ACCEPTED`, `REJECTED` o `CHANGES_REQUESTED` | Sistema | Dos evaluaciones finales en cupos cubiertos, sin reportes abiertos. |
| `UNDER_REVIEW` | `TIE_BREAKER` | Sistema | Un rechazo y un dictamen distinto. |
| `TIE_BREAKER` | `ACCEPTED`, `REJECTED` o `CHANGES_REQUESTED` | Sistema | Evaluación final del cupo 3, sin reportes abiertos. |
| `UNDER_REVIEW` o `TIE_BREAKER` | `CHANGES_REQUESTED` | Administrador | Resolución Solicitar versión anonimizada. Abre una ronda sin veredicto. |
| `CHANGES_REQUESTED` | `SUBMITTED` | Autor | Nueva versión válida. |
| `ACCEPTED`, `REJECTED` o `CHANGES_REQUESTED` | Otra decisión final | Administrador | Corrección de veredicto. |
| Cualquiera | Baja lógica | Autor | Sin cambio de `status`. Motivo obligatorio en `UNDER_REVIEW`, `TIE_BREAKER` y `ACCEPTED`. |

Cada transición escribe un `StatusEvent` con `actor=NULL` cuando la ejecuta el sistema. Un veredicto `CHANGES_REQUESTED` abre la siguiente `CorrectionRound` con `opened_by_verdict`. El desempate no abre ronda.

### Asignación

| Desde | Hacia | Causa | Ranking |
| --- | --- | --- | --- |
| — | `ACTIVE` | Motor de asignación | — |
| `ACTIVE` | `COMPLETED` | Evaluación final antes de `due_at` | +10 |
| `ACTIVE` | `EXPIRED` | `due_at <= now()` sin evaluación final (`OVERDUE`) | −20 |
| `ACTIVE` | `REVOKED` | `CONFLICT_OF_INTEREST`, `INCIDENT_REASSIGN`, `ANONYMIZATION_REQUESTED` o `MANUSCRIPT_WITHDRAWN` | Sin cambio |
| `COMPLETED` | `REVOKED` | `INCIDENT_REASSIGN`. La evaluación se conserva y deja de contar | Sin cambio |
| `EXPIRED` heredada, abierta | `REVOKED` | `LEGACY_TRANSITION` | Sin cambio |

## Migraciones

En orden de dependencia. Cada operación sobre tablas con disparador de inmutabilidad es DDL o actualiza solo filas mutables.

1. `apps/users/migrations/0004_academic_area_ranking.py`. Crea `AcademicArea`, agrega `ReviewerProfile.areas` y `ranking_score` con su `CHECK`. Siembra el catálogo inicial, crea carreras desde los valores de `expertise_areas` y las vincula. Elimina el índice GIN, `expertise_areas` y `max_active_assignments`.
2. `apps/publications/migrations/0010_manuscript_areas_states.py`. Agrega `Manuscript.areas`, crea o reutiliza carreras desde `area` y las vincula, y elimina `area` e `idx_manuscript_area`. Actualiza `REQUIRES_CORRECTIONS` a `CHANGES_REQUESTED`, incrementa `lock_version` y redefine `ck_manuscript_status`.
3. `apps/reviews/migrations/0004_assignment_slots_capacity.py`. Agrega `slot`, `release_cause` y la nulidad de `assigned_by`. Completa `release_cause='EDITOR_LEGACY'` en las filas `REVOKED`. Reemplaza `uq_assignment_active` por los índices de cupo y crea `ck_assignment_slot` y `trg_assignment_capacity`.
4. `apps/reviews/migrations/0005_evaluation_rubric.py`. Agrega `rubric_version` con `DEFAULT 1` y los cinco criterios con sus `CHECK`. Pasa los borradores a la versión 2 con el dictamen equivalente, cambia el valor por defecto a 2 y redefine las restricciones de dictamen, completitud y justificación.
5. `apps/reviews/migrations/0006_ranking_adjustment.py`. Crea `RankingAdjustment`, sus restricciones y su disparador.
6. `apps/publications/migrations/0011_verdict_origin_basis.py`. Renombra `editor` a `decided_by` y permite nulos en él y en `evaluation`. Agrega `origin` con `DEFAULT 'EDITOR_LEGACY'`, crea `VerdictEvaluation` y su disparador, y redefine las restricciones del veredicto.

`apply_auto_review_transition` completa los cambios que necesitan auditoría o servicios. Se describe en el [plan](plan.md#transición-y-despliegue).
