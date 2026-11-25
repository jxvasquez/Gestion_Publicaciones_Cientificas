# API Contract: Asignación automática por carrera, ranking de revisores y rúbrica profesional

**Fase 1** del [plan](../plan.md). Diferencias sobre la API vigente bajo `/api/v1/`. Todas las respuestas JSON mantienen el envelope universal `{success, message, data, errors, meta}` de `backend/config/renderers.py` y los códigos de `config.exceptions.ErrorCode`. Un objeto fuera del ámbito del actor responde `404`, nunca `403`. El esquema OpenAPI se regenera con drf-spectacular y `scripts/build_docs_api.sh`.

## Rutas retiradas

Responden `404` porque dejan de montarse en `backend/config/api.py`.

| Ruta | Reemplazo |
| --- | --- |
| `GET /editor/submissions/`, `GET /editor/submissions/{id}/` | Ninguno: el envío pasa a revisión automáticamente. |
| `POST /editor/submissions/{id}/start-review/` | Asignación automática tras el envío. |
| `GET /editor/reviewers/` | `GET /admin/reviewers/` para consultar el padrón. |
| `GET /editor/manuscripts/{id}/assignments/`, `POST /editor/manuscripts/{id}/assignments/` | Motor de asignación. |
| `GET /editor/manuscripts/{id}/evaluations/` | Ninguno: solo el Revisor ve sus evaluaciones y el Autor ve la retroalimentación. |
| `GET /editor/manuscripts/{id}/verdicts/`, `POST /editor/manuscripts/{id}/verdicts/` | Veredicto automático y `POST /admin/verdicts/{id}/correct/`. |
| `GET /editor/assignments/expired/`, `POST /editor/assignments/{id}/revoke/` | Revocación automática al vencer. |
| `GET /editor/incidents/`, `POST /editor/incidents/{id}/resolve/` | `/admin/incidents/`. |
| `POST /admin/verdicts/{id}/authorize-correction/` | `POST /admin/verdicts/{id}/correct/`. |

## Rutas nuevas

### Carreras activas · público

`GET /areas/` · sin sesión · solo lectura.

```json
{"data": [{"code": "ingenieria-en-computacion", "name": "Ingeniería en Computación"}]}
```

Solo carreras activas, ordenadas por nombre. Sin paginar. La usan el formulario del Autor y el filtro del catálogo.

### Desempeño del revisor · `IsReviewer`

`GET /reviewer/standing/`

```json
{"data": {
  "ranking_score": 110,
  "active_assignments": 3,
  "max_active_assignments": 5,
  "on_time_evaluations": 2,
  "missed_deadlines": 1,
  "is_available": true,
  "areas": [{"code": "derecho", "name": "Derecho"}]
}}
```

`GET /reviewer/standing/adjustments/` · paginado con `page` y `page_size`, más reciente primero.

```json
{"data": [{"id": 7, "created_at": "2026-11-24T10:00:00-05:00", "cause": "ON_TIME_EVALUATION",
           "delta": 10, "score_after": 110, "manuscript_code": "GPC-2026-000042", "version_number": 1}]}
```

Ningún campo identifica autores ni a otros revisores.

### Incidentes · `IsAdmin`

| Método y ruta | Cuerpo | Respuesta |
| --- | --- | --- |
| `GET /admin/incidents/?status=OPEN\|RESOLVED&page_size=` | — | Lista paginada con `id`, `status`, `report_type`, `description`, `manuscript`, `manuscript_code`, `manuscript_title`, `manuscript_status`, `version_number`, `assignment`, `reporter` (`id`, `full_name`, `email`), `created_at`, `resolution`, `resolved_by`, `resolved_at` y `correction_round_number`. |
| `POST /admin/incidents/{id}/resolve/` | `{"resolution": "DISMISS" \| "REASSIGN" \| "REQUEST_ANONYMIZED_VERSION"}` | `200` con el reporte resuelto. `409 STATE_CONFLICT` si ya estaba resuelto o si el manuscrito no está activo en `UNDER_REVIEW` ni en `TIE_BREAKER` para Reasignar o Solicitar versión anonimizada. |
| `GET /admin/incidents/{id}/document/` | — | PDF sanitizado de la versión del reporte mediante `X-Accel-Redirect`, con nombre genérico `manuscript-{code}-v{n}.pdf` y auditoría `INCIDENT_DOCUMENT_VIEWED`. |

El ámbito excluye los manuscritos en los que el Administrador es registrante, autor o coautor. Esos reportes responden `404`.

### Padrón de revisores · `IsAdmin`

`GET /admin/reviewers/?area=<code>&available=true|false&search=<texto>&page_size=`

```json
{"data": [{"id": "uuid", "full_name": "…", "email": "…", "institutional_id": "…",
           "is_available": true, "areas": [{"code": "derecho", "name": "Derecho"}],
           "ranking_score": 90, "active_assignments": 5, "max_active_assignments": 5,
           "on_time_evaluations": 4, "missed_deadlines": 2}]}
```

Orden por defecto: `-ranking_score`, `active_assignments` y nombre.

`PATCH /admin/reviewers/{user_id}/` con `{"areas": ["derecho"], "is_available": false}`. Ambos campos son opcionales. Las carreras nuevas deben estar activas; si una inactiva ya estaba asignada, se conserva. Responde `200` con la fila y audita `REVIEWER_PROFILE_UPDATED`. No modifica asignaciones vigentes.

### Catálogo de carreras · `IsAdmin`

| Método y ruta | Cuerpo | Respuesta |
| --- | --- | --- |
| `GET /admin/areas/` | — | Todas las carreras con `code`, `name`, `is_active`, `manuscripts` y `reviewers`. |
| `POST /admin/areas/` | `{"name": "Ingeniería Civil"}` | `201`. `400 VALIDATION_ERROR` si el nombre está vacío o repetido sin distinguir mayúsculas. |
| `PATCH /admin/areas/{code}/` | `{"name": "…", "is_active": false}` | `200`. El `code` no cambia. |

### Corrección de veredicto · `IsAdmin`

`POST /admin/verdicts/{verdict_id}/correct/`

```json
{"decision": "CHANGES_REQUESTED", "reason": "Motivo de 10 a 1000 caracteres",
 "observations": "Texto para el Autor; obligatorio con CHANGES_REQUESTED"}
```

Responde `201` con `{verdict, correction}`. Errores: `409 CORRECTION_NOT_AUTHORIZED` si el veredicto no es el último del manuscrito, `403 FORBIDDEN` si el Administrador tiene relación de autoría y `400 VALIDATION_ERROR` por decisión, motivo u observaciones. El veredicto nuevo tiene `origin=ADMIN_CORRECTION` y `previous_verdict` apunta al original. Audita `VERDICT_CORRECTED`.

## Rutas modificadas

### Manuscritos del Autor

- `areas` reemplaza a `area`. Se escribe como lista de 1 a 3 códigos activos y se lee como `[{code, name}]`. Error `400` en `details.areas`.
- `status` incorpora `TIE_BREAKER` y `CHANGES_REQUESTED`. `?status=` acepta ambos.
- `PATCH /manuscripts/{id}/` admite `DRAFT` y `CHANGES_REQUESTED`. `POST /manuscripts/{id}/versions/` exige `CHANGES_REQUESTED`, que sustituye a `REQUIRES_CORRECTIONS`.
- `POST /manuscripts/{id}/submit/` conserva su comprobante. La asignación ocurre después del commit y el estado resultante se consulta en `GET /manuscripts/{id}/`.
- Las rutas de manuscritos admiten solo `IsAuthor`. Desaparece `IsAuthor | IsEditor`.
- `feedback` pasa a tener esta forma:

```json
{"decision": "CHANGES_REQUESTED", "decided_at": "…", "origin": "CONSENSUS",
 "observations": "Los revisores solicitaron cambios. Revise los comentarios de cada evaluación.",
 "reviews": [{"label": "Revisor 1", "comments_for_author": "…"},
             {"label": "Revisor 2", "comments_for_author": "…"}]}
```

Sin identidades, puntajes ni dictámenes individuales. Los veredictos `EDITOR_LEGACY` devuelven una sola reseña con la etiqueta «Revisor 1».

### Catálogo público

- `GET /catalog/` y `GET /catalog/{code}/` devuelven `areas: [{code, name}]`.
- El filtro `area=<code>` coincide con cualquiera de las carreras del artículo. `search` también busca en los nombres de las carreras.

### Revisor

- Asignaciones, detalle e historial: `areas: [{code, name}]` reemplaza a `area`.
- `GET` y `PUT /reviewer/assignments/{id}/evaluation/`: el cuerpo es `scientific_contribution`, `methodological_rigor`, `literature_grounding`, `results_conclusions` y `academic_writing`, cada uno de 1 a 5 o nulo, más `recommendation`, con `ACCEPTED`, `MINOR_REVISION`, `MAJOR_REVISION`, `REJECTED` o nulo, y `comments_for_author`. La lectura añade `id`, `status`, `rubric_version`, `conflict_declared` y `submitted_at`. Se retiran los cinco criterios anteriores y `confidential_comments`. El bloqueo optimista por `ETag` e `If-Match` no cambia.
- `POST /reviewer/assignments/{id}/evaluation/submit/` responde `400 VALIDATION_ERROR` con `details.comments_for_author = ["Escriba al menos 100 caracteres: …"]` cuando aplica FR-019. Un envío correcto completa la asignación y aplica la bonificación en la misma transacción.
- `POST /reviewer/assignments/{id}/conflict/` libera la asignación y responde `200` con `{"assignment": "uuid", "status": "REVOKED", "release_cause": "CONFLICT_OF_INTEREST"}`. Después, el detalle responde `404`, igual que cualquier asignación revocada.
- `GET /reviewer/evaluations/{id}/` incluye `rubric_version` y los criterios de esa versión. `editorial_result` conserva `decision` y `decided_at`.

### Panel

`GET /dashboard/` deja de devolver la sección `editor`.

```json
{"data": {"roles": ["REVIEWER", "ADMIN"],
 "sections": {
   "reviewer": {"status": "ok", "message": null, "data": {
     "ranking_score": 110, "active_assignments": 3, "max_active_assignments": 5,
     "pending_evaluations": 2, "on_time_evaluations": 2, "missed_deadlines": 1}},
   "admin": {"status": "ok", "message": null, "data": {
     "open_incidents": 1, "awaiting_reviewers": 2}}}}}
```

`awaiting_reviewers` cuenta los manuscritos con al menos un cupo pendiente.

### Sesión y auditoría

- `GET /auth/me/` y `POST /auth/login/` nunca devuelven `EDITOR` en `roles`.
- `GET /admin/audit/` incorpora las acciones nuevas de [data-model.md](../data-model.md#notification-y-auditlog--sin-cambios-de-esquema). Los eventos del sistema llevan `actor` y `actor_role` nulos. Los eventos históricos conservan `actor_role="EDITOR"`.

## Avisos

Carga útil sin cambios: `title`, `message`, `manuscript_code`, `manuscript_title`, `action`, `due_at` y `link`.

| Evento | Destinatario | Enlace |
| --- | --- | --- |
| Asignación creada | Revisor | `/app/reviewer/assignments/{id}` |
| Vencimiento con penalización | Revisor | `/app/reviewer/assignments` |
| Liberación por conflicto, incidente o baja | Revisor | `/app/reviewer/assignments` |
| Envío registrado e inicio de revisión | Autor | `/app/author/manuscripts/{id}` |
| Paso a desempate | Autor | `/app/author/manuscripts/{id}` |
| Veredicto o corrección | Autor | `/app/author/manuscripts/{id}` |
| Versión anonimizada solicitada | Autor | `/app/author/manuscripts/{id}` |
| Reporte nuevo | Administradores sin conflicto | `/app/admin/incidents` |
| Cupo sin revisores elegibles | Administradores sin conflicto | `/app/admin/reviewers` |
