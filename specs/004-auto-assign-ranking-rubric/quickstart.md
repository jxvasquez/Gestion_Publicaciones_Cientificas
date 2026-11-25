# Quickstart: validación de la asignación automática, el ranking y la rúbrica

Guía para comprobar de punta a punta la [especificación](spec.md) en un entorno de desarrollo. El modelo está en [data-model.md](data-model.md) y los contratos en [contracts/api.md](contracts/api.md). No usar estos pasos en el piloto real: las semillas crean contraseñas conocidas y la simulación del vencimiento modifica fechas en la base.

## 1. Preparar el entorno

Requisitos: Docker Compose, el `.env` del proyecto (ver `QUICKSTART.md`) y Node 22 para las pruebas del frontend.

```bash
docker compose up -d --build --wait
docker compose exec backend python manage.py seed_roles
docker compose exec -e ALLOW_DEV_USERS=1 backend python manage.py seed_dev_users
```

El arranque del backend ejecuta `migrate`, `apply_db_privileges` y `apply_auto_review_transition`. Resultado esperado:

- `seed_roles` informa `AUTHOR`, `REVIEWER` y `ADMIN`, y `EDITOR` inactivo si existía.
- `seed_dev_users` crea `autor`, `autor2`, `revisor`, `revisor2` y `revisor3` en Ingeniería en Computación, `revisor4` en Derecho, `admin` y `autor.revisor` con Ingeniería en Computación. No crea cuentas Editor.
- Repetir `docker compose exec backend python manage.py apply_auto_review_transition` informa que no hay cambios pendientes.

La automatización corre cada minuto por cron en el servidor. En desarrollo se ejecuta a mano:

```bash
docker compose exec backend python manage.py run_review_automation
```

## 2. Escenarios manuales

Usar `https://localhost` con la contraseña que informa `seed_dev_users`.

| # | Historia | Pasos | Resultado esperado |
| --- | --- | --- | --- |
| A | US1 | Como `autor.revisor`, crear un manuscrito con Ingeniería en Computación y un PDF válido, y enviarlo. | Pasa a En revisión. `autor.revisor` queda excluido por autoría y `revisor4` por carrera. `revisor`, `revisor2` y `revisor3` empatan en puntaje, carga y última asignación, así que el identificador estable decide cuáles dos reciben la asignación. Cada bandeja muestra el vencimiento a 20 días. |
| B | US1 | Como `autor`, enviar un manuscrito de Derecho. | Solo `revisor4` es elegible: queda una asignación y el segundo cupo pendiente. `admin` recibe el aviso de cupo sin revisores. |
| C | US2 | Como revisor asignado, calificar un criterio con 3 y escribir 99 caracteres. Repetir con 100. | Con 99 el envío se bloquea, se conserva el borrador y el contador muestra 99/100. Con 100 se registra la evaluación final y el puntaje sube a 110. |
| D | US3 | Enviar las dos evaluaciones del escenario A con Aceptar. | Aceptado y visible en `/catalog` en un máximo de cinco minutos. El Autor ve «Revisor 1» y «Revisor 2» sin identidades. |
| E | US3 | Como `autor`, enviar otro manuscrito de Ingeniería en Computación y registrar Aceptar y Rechazar. | En desempate y una tercera asignación al siguiente candidato de la carrera según FR-012. Con un tercer Rechazar el resultado es Rechazado. Con Revisión menor, Cambios solicitados. |
| F | US3 | En Cambios solicitados, editar metadatos y cargar v2 como Autor. | Se abre la ronda siguiente y v2 recibe dos asignaciones nuevas con la misma regla. |
| G | US4 | Simular el vencimiento de una asignación activa con el comando SQL de la sección 3 y ejecutar `run_review_automation`. | La asignación queda Vencida, el revisor baja 20 puntos, el cupo pasa al siguiente candidato y el revisor recibe el aviso con la penalización. |
| H | US4 | Como revisor, abrir el panel y Mis asignaciones. | Tarjeta con puntaje, «X/5 activas», evaluaciones a tiempo, vencimientos e historial de ajustes. El Autor y los demás revisores no ven estos datos. |
| I | US4 | Declarar un conflicto de interés en una asignación activa. | La asignación se libera sin cambiar el puntaje y el cupo se reasigna. |
| J | US5 | Abrir `/app/editor/submissions` con cualquier cuenta y llamar a `GET /api/v1/editor/submissions/`. | Página no encontrada y `404` en la API. Ninguna navegación ni aviso menciona al Editor. |
| K | US5 | Como revisor, reportar una posible fuga de identidad. Como `admin`, abrir Incidentes, ver el documento y resolver con cada opción en manuscritos distintos. | Descartar no cambia nada. Reasignar libera al revisor sin penalización y cubre el cupo. Solicitar versión anonimizada pasa el manuscrito a Cambios solicitados y libera todas las asignaciones activas. Con el reporte abierto no se emite veredicto. |
| L | US5 | Como `admin`, corregir desde Auditoría un veredicto con motivo y nueva decisión. | El original se conserva, el catálogo sigue la nueva decisión y se registra `VERDICT_CORRECTED`. |
| M | US6 | Como `admin`, crear la carrera «Ingeniería Civil», asignarla a `revisor4` y marcar a `revisor` como no disponible. | Un envío de Ingeniería Civil se asigna a `revisor4`. `revisor` no recibe asignaciones nuevas y conserva las vigentes. |

## 3. Simulación del vencimiento

Solo en desarrollo. Mantiene la restricción `due_at = assigned_at + 20 días`:

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "UPDATE reviews_assignment SET assigned_at = now() - interval '"'"'20 days 1 minute'"'"', due_at = now() - interval '"'"'1 minute'"'"' WHERE id = '"'"'<uuid>'"'"';"'
```

## 4. Pruebas automatizadas

Backend, con el patrón de `README.md`:

```bash
docker compose run --rm --no-deps -v "$PWD/backend:/app" backend sh -c "python -m pip install --quiet --user -r requirements/development.txt; python -m pytest -q -p no:cacheprovider --cov --cov-report=term:skip-covered"
```

Frontend, desde `frontend/`:

```bash
npm ci
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.spec.json --noEmit
npx ng build --configuration production
npx ng test --watch=false
```

Desde la raíz:

```bash
python3 scripts/check_frontend_build.py
./scripts/e2e.sh
```

## 5. Criterios de aceptación

| Criterio | Evidencia mínima |
| --- | --- |
| SC-001 | Escenarios A y B, más `tests/reviews/test_assignment_engine.py`. |
| SC-002 | Prueba concurrente de 20 envíos en `tests/reviews/test_assignment_concurrency.py` y disparador de capacidad. |
| SC-003 | Escenario C, más `tests/reviews/test_rubric.py` y `evaluation-form.rules.spec.ts` con 99 y 100 caracteres. |
| SC-004 | Escenarios D, E y F, más la tabla completa de `tests/reviews/test_consensus.py`. |
| SC-005 | Escenario G, más `tests/reviews/test_ranking.py` y `tests/reviews/test_automation_command.py` con reloj controlado. |
| SC-006 | Escenarios J, K y L, más la matriz de `tests/security/test_access_matrix.py`. |
| SC-007 | Suites de doble ciego del backend y `frontend/e2e/04-fuga-de-identidad.e2e.ts` con tres revisores. |
| SC-008 | `frontend/e2e/05-accesibilidad.e2e.ts`, `06-teclado.e2e.ts` y `07-responsive.e2e.ts` sobre las vistas nuevas, y tiempo de llenado de la rúbrica. |
| SC-009 | `tests/reviews/test_transition_command.py` y `tests/test_migrations_004.py` sobre datos heredados. |

## 6. Problemas frecuentes

| Síntoma | Causa probable |
| --- | --- |
| El manuscrito sigue Enviado | No hay revisores elegibles en sus carreras o todos tienen cinco asignaciones activas. Revisar el padrón en `/app/admin/reviewers`. |
| No se aplica el vencimiento | El cron no corre o la fecha se modificó sin ejecutar `run_review_automation`. |
| Un veredicto no aparece | Hay un reporte abierto en la versión o la conciliación se reintentará en el próximo minuto. |
