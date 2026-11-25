# Research: Asignación automática por carrera, ranking de revisores y rúbrica profesional

**Fase 0** del [plan](plan.md). Cada decisión resuelve una incógnita técnica de la [especificación](spec.md) con el código vigente como referencia. Ninguna queda como `NEEDS CLARIFICATION`.

## R-01 · Retirada del rol `EDITOR` sin perder historial

- **Decisión**. Quitar `EDITOR` de `Role.Code`, de los permisos, del panel, de los avisos y de las rutas. La fila `users_role` con código `EDITOR` se conserva inactiva porque `users_user_role` la referencia con `PROTECT`. El comando de transición revoca las filas activas de `UserRole` con auditoría `ROLE_REVOKED` y marca el rol como inactivo. `active_role_codes()` filtra además por `role__is_active=True`.
- **Justificación**. Las asignaciones de rol, la auditoría (`actor_role='EDITOR'`), los veredictos y las asignaciones históricas deben seguir siendo legibles. Filtrar por el rol activo bloquea en la siguiente solicitud cualquier fila que quedara activa, igual que la revocación a mitad de sesión.
- **Alternativas descartadas**. Borrar el rol y sus filas viola la conservación del historial. Una migración de datos sin auditoría incumple FR-002. Mantener el rol oculto en la interfaz dejaría permisos huérfanos en la API.

## R-02 · Catálogo de carreras o áreas validadas

- **Decisión**. Crear `AcademicArea` en `apps.users` con `code` estable, `name` único sin distinguir mayúsculas e `is_active`. `Manuscript.areas` y `ReviewerProfile.areas` pasan a relaciones de muchos a muchos. Las migraciones crean el catálogo inicial con Ingeniería en Computación, Ingeniería Agropecuaria y Derecho, más cada valor distinto de `Manuscript.area` y `ReviewerProfile.expertise_areas` normalizado por espacios y mayúsculas. Después vinculan cada fila y eliminan las columnas de texto libre. El límite de tres carreras por manuscrito se valida en el servicio.
- **Justificación**. La elegibilidad actual ya compara textos de forma exacta (`area in profile.expertise_areas`). Al promover esos textos a elementos del catálogo se mantienen las coincidencias vigentes y se elimina la ambigüedad de escritura. `apps.users` evita dependencias circulares entre migraciones, porque `publications` y `reviews` ya dependen de `users`.
- **Alternativas descartadas**. Un `ArrayField` de códigos sin integridad referencial. Una app nueva solo para el catálogo, que el alcance no justifica. Mantener `Manuscript.area` como área principal duplicaría la información.

## R-03 · Códigos de dictamen y versiones de rúbrica

- **Decisión**. Las evaluaciones nuevas usan `rubric_version=2` con `scientific_contribution`, `methodological_rigor`, `literature_grounding`, `results_conclusions` y `academic_writing`, y con los dictámenes `ACCEPTED`, `MINOR_REVISION`, `MAJOR_REVISION` y `REJECTED`. Las finales históricas quedan en `rubric_version=1` con sus cinco columnas y los dictámenes `ACCEPT`, `REQUIRES_CORRECTIONS` y `REJECT`. La columna se agrega con `DEFAULT 1` en el `ALTER TABLE` y después cambia el valor por defecto a `2`. Así PostgreSQL no reescribe filas ni dispara `trg_evaluation_no_update_after_final`. Los borradores, que sí admiten `UPDATE`, se migran a la versión 2: `ACCEPT` pasa a `ACCEPTED`, `REJECT` pasa a `REJECTED` y `REQUIRES_CORRECTIONS` queda sin dictamen.
- **Justificación**. Las evaluaciones finales son inmutables por disparador. Los dos conjuntos de códigos no se solapan y las restricciones `CHECK` los validan por versión. Los códigos nuevos son los que fija la solicitud.
- **Alternativas descartadas**. Reescribir las finales desactivando el disparador rompe la inmutabilidad. Reutilizar las columnas anteriores con otro significado haría ilegible el historial.

## R-04 · Justificación de 100 caracteres

- **Decisión**. Contar puntos de código del texto ya recortado. El servicio usa `len(text.strip())`, que coincide con `char_length()` de PostgreSQL. El formulario usa `Array.from(text.trim()).length`. Una restricción `CHECK` de la versión 2 exige `char_length(comments_for_author) >= 100` en una evaluación final si algún criterio es menor o igual a 3 o si el dictamen es `MAJOR_REVISION` o `REJECTED`. El servicio ya guarda el texto recortado.
- **Justificación**. `String.length` cuenta unidades UTF-16 y difiere con emojis y algunos caracteres combinados. La restricción sirve de última barrera, como las demás reglas de integridad del proyecto.
- **Alternativas descartadas**. Contar palabras no es lo que exige la solicitud. Validar solo en el cliente no protege la API.

## R-05 · Estados del manuscrito y del veredicto

- **Decisión**. Agregar `TIE_BREAKER` y sustituir `REQUIRES_CORRECTIONS` por `CHANGES_REQUESTED` en `Manuscript.status`, con una migración que actualiza las filas, ya que el manuscrito solo bloquea `DELETE`, e incrementa `lock_version`. `Verdict.decision` acepta `CHANGES_REQUESTED` en los veredictos nuevos y conserva `REQUIRES_CORRECTIONS` solo con `origin='EDITOR_LEGACY'`. `StatusEvent` conserva los códigos históricos. La interfaz etiqueta ambos códigos.
- **Justificación**. La solicitud nombra los estados `CHANGES_REQUESTED` y `TIE_BREAKER`. Los eventos y veredictos son append-only y no se reescriben.
- **Alternativas descartadas**. Conservar el código anterior con otra etiqueta contradice la nomenclatura pedida. Convertir los registros históricos viola su inmutabilidad.

## R-06 · Motor de asignación serializado

- **Decisión**. Un único servicio `fill_review_slots(manuscript_id)` cubre los cupos faltantes de la versión vigente, en una transacción que primero toma `pg_advisory_xact_lock(ASSIGNMENT_LOCK_KEY)` y después bloquea el manuscrito. Toda transacción que crea asignaciones toma ese cerrojo antes que cualquier fila. Las transacciones que liberan cupos, como evaluación final, vencimiento, conflicto, incidente o baja, no asignan: programan `fill_pending_slots()` con `transaction.on_commit`.
- **Justificación**. Con un orden de bloqueo único no hay interbloqueos y el conteo de carga es exacto, porque solo el motor crea asignaciones activas. El volumen institucional de envíos es bajo y la auditoría ya serializa con un cerrojo consultivo global.
- **Alternativas descartadas**. Bloquear perfiles uno a uno con `select_for_update` admite interbloqueos entre envíos concurrentes. Con `skip_locked` se alteraría el orden del ranking. Una cola externa o Celery agrega infraestructura no prevista en la constitución.

## R-07 · Cupos y cola de espera

- **Decisión**. Cada asignación tiene `slot` 1, 2 o 3, donde 3 es el desempate. Un cupo está cubierto si tiene una asignación `ACTIVE` o `COMPLETED` en la versión. Índices únicos parciales impiden dos asignaciones vivas en el mismo cupo y dos asignaciones vivas del mismo revisor en una versión. La cola no es una tabla: se deriva de los manuscritos activos en `SUBMITTED`, `UNDER_REVIEW` o `TIE_BREAKER` con cupos faltantes, ordenados por `submitted_at` de la versión vigente.
- **Justificación**. Una consulta determinista evita estados duplicados y mantiene el orden FIFO de FR-014. La exclusión de quien ya participó en la versión se consulta con todas las asignaciones, también las revocadas y vencidas.
- **Alternativas descartadas**. Una tabla de cola debería sincronizarse con cada cambio de estado. Un contador en el manuscrito puede desviarse con revocaciones concurrentes.

## R-08 · Orden de candidatos y límite estricto

- **Decisión**. La consulta de elegibles filtra cuenta, rol activo, disponibilidad, carrera compartida, autoría por cuenta o correo, participación previa en la versión y `active_assignments < MAX_ACTIVE_ASSIGNMENTS`. Ordena por `-ranking_score`, `active_assignments`, `last_assigned_at` ascendente con nulos primero e `id`. Un disparador `BEFORE INSERT OR UPDATE OF status` en `reviews_assignment` rechaza la sexta asignación `ACTIVE` del mismo revisor como última barrera. `max_active_assignments` del perfil desaparece.
- **Justificación**. El límite debe ser uniforme y estricto. El cerrojo de R-06 garantiza el conteo y el disparador protege contra cualquier escritura fuera del motor.
- **Alternativas descartadas**. Mantener el cupo configurable por perfil contradice el valor fijo. Confiar solo en el disparador no basta bajo `READ COMMITTED` sin serialización.

## R-09 · Ranking y bitácora de ajustes

- **Decisión**. Guardar `ranking_score` en `ReviewerProfile`, con valor inicial 100 y `CHECK >= 0`, y registrar cada cambio en `RankingAdjustment`, append-only mediante la función existente `prevent_append_only_mutation()`. Cada fila guarda causa, delta nominal, puntaje anterior y posterior, y asignación. `UNIQUE (assignment, cause)` vuelve idempotentes la bonificación y la penalización. El ajuste bloquea la fila del perfil, aplica `max(0, score + delta)` y audita `RANKING_ADJUSTED` en la misma transacción que la evaluación final o que el vencimiento.
- **Justificación**. El puntaje cacheado ordena candidatos sin agregaciones costosas. La bitácora explica cada cambio y permite conciliar SC-005.
- **Alternativas descartadas**. Calcular el puntaje en cada lectura multiplica consultas. Guardar solo el total impide explicar los ajustes.

## R-10 · Automatización programada del plazo

- **Decisión**. Sustituir `mark_expired_assignments` por `run_review_automation`, que el cron ejecuta cada minuto con `flock`. El comando aplica tres pasos idempotentes en este orden. Primero vence cada asignación `ACTIVE` con `due_at <= now()` en su propia transacción: pasa a `EXPIRED` terminal con `release_cause='OVERDUE'`, aplica −20 y audita. Después concilia veredictos pendientes. Por último cubre los cupos pendientes. `expiration.py` se reemplaza por `automation.py`.
- **Justificación**. Con un ciclo de un minuto se cumple el máximo de dos minutos de FR-030. El corte exacto ya lo aplica la base de datos al rechazar envíos con `due_at <= now()`, de modo que la penalización nunca compite con un envío válido.
- **Alternativas descartadas**. Revocar al leer la bandeja no se ejecuta si nadie la abre. Un proceso residente con su propio planificador duplica la plantilla de cron vigente.

## R-11 · Veredicto automático desacoplado

- **Decisión**. `submit_evaluation` registra la evaluación final, la bonificación y la auditoría, y programa `decide_version()` con `on_commit`. `decide_version()` bloquea el manuscrito y comprueba que siga activo, en `UNDER_REVIEW` o `TIE_BREAKER`, sin reporte abierto y sin veredicto ordinario para la versión. Después aplica las tablas de decisión con las evaluaciones de los cupos completados. Un desempate cambia el estado y programa `fill_review_slots()`. Las demás decisiones llaman al núcleo común `apply_decision()` de `publications`. La conciliación de R-10 reintenta los pendientes.
- **Justificación**. Un fallo de catálogo o de almacenamiento no debe revertir la evaluación del revisor ni afectar su plazo. El bloqueo del manuscrito y `uq_verdict_normal_per_version` garantizan un único veredicto ordinario aun con dos evaluaciones simultáneas.
- **Alternativas descartadas**. Decidir dentro de la transacción de la evaluación acopla al revisor con la publicación. Decidir solo desde el cron añade hasta un minuto de espera innecesaria.

## R-12 · Modelo de veredicto sin Editor

- **Decisión**. Renombrar `Verdict.editor` a `decided_by` y permitir nulos, que representan al sistema. Permitir nulos en `Verdict.evaluation`, que solo usan los veredictos heredados. Agregar `origin` con `CONSENSUS`, `TIE_BREAK`, `ADMIN_CORRECTION` y `EDITOR_LEGACY`, creado con `DEFAULT 'EDITOR_LEGACY'` en el `ALTER TABLE`. Agregar `VerdictEvaluation` append-only para registrar las evaluaciones consideradas y su cupo. Las restricciones relacionan `origin` con `decided_by` y con los códigos permitidos. La observación obligatoria de `CHANGES_REQUESTED` es un texto fijo sin identidades.
- **Justificación**. El disparador de inmutabilidad del veredicto solo impide `UPDATE` y `DELETE` de filas. El DDL y las columnas con valor por defecto no reescriben registros.
- **Alternativas descartadas**. Una cuenta técnica de sistema ensuciaría la auditoría y los permisos. Un JSON de identificadores pierde la integridad referencial.

## R-13 · Incidentes en el módulo del Administrador

- **Decisión**. Trasladar el listado y la resolución a `/api/v1/admin/incidents/` con `IsAdmin` y `IncidentReport.objects.for_admin(user)`, que excluye los manuscritos en los que el Administrador tiene relación de autoría. Agregar `GET /api/v1/admin/incidents/{id}/document/`, que entrega el PDF sanitizado de la versión del reporte mediante `authorize_sanitized_download` y auditoría de descarga. Reasignar libera la asignación del revisor que reportó con `INCIDENT_REASSIGN`, aunque ya esté `COMPLETED`. Solicitar versión anonimizada libera todas las asignaciones `ACTIVE` de la versión con `ANONYMIZATION_REQUESTED` y abre la ronda sin veredicto, como hoy. Un reporte abierto bloquea `decide_version()`.
- **Justificación**. Para revisar una fuga de identidad hay que ver el documento que recibió el revisor. El acceso se limita al reporte y queda auditado. RN-06 ya permite al Administrador conocer identidades.
- **Alternativas descartadas**. Dar al Administrador acceso general a manuscritos excede su función. Resolver sin ver el documento debilita la revisión del incidente.

## R-14 · Corrección de veredictos por el Administrador

- **Decisión**. Reemplazar `POST /admin/verdicts/{id}/authorize-correction/` por `POST /admin/verdicts/{id}/correct/` con `decision`, `reason` y `observations`. El servicio crea la `VerdictCorrection` y la consume en la misma transacción mediante `apply_decision(origin='ADMIN_CORRECTION')`. Se conservan `consumption_problem()`, la sincronización del catálogo, la ronda abierta y el bloqueo por conflicto de autoría.
- **Justificación**. Sin Editor, la autorización vigente no tiene quién la consuma. Un solo paso auditado conserva CA-HU-13-12 con el mínimo cambio.
- **Alternativas descartadas**. Retirar la corrección deja sin salida los veredictos erróneos. Exigir dos Administradores no está pedido y complica la operación del piloto.

## R-15 · Comentarios confidenciales

- **Decisión**. Retirar `confidential_comments` del formulario, de los serializadores y de los borradores nuevos. La columna se conserva por las evaluaciones históricas y nunca se expone. El diálogo de incidentes presenta el tipo `OTHER` como canal confidencial hacia el Administrador.
- **Justificación**. El destinatario de esos comentarios era el Editor. Mantenerlos sin lector crea una expectativa falsa de confidencialidad atendida.
- **Alternativas descartadas**. Mostrarlos al Administrador le daría acceso al contenido de las evaluaciones, fuera de su función. Borrar la columna requiere tocar filas finales.

## R-16 · Avisos y destinatarios

- **Decisión**. Eliminar `editors_for()` y `assigning_editor()` y agregar `admins_for(manuscript)`, que excluye a quien tenga relación de autoría. Agregar las señales `review_started`, `tie_break_started` y `slot_unfilled`, y adaptar los receptores de asignación, revocación, vencimiento, veredicto, incidentes y baja según FR-036. `build_payload()` y su lista blanca no cambian. La clave de evento de un cupo sin candidato es `SLOT_UNFILLED:<version>:<slot>:ADMIN`, que produce un solo aviso por cupo.
- **Justificación**. La lista blanca de la carga útil ya garantiza que ningún aviso transporte identidades. La idempotencia por `event_key` evita repetir avisos en cada minuto del cron.
- **Alternativas descartadas**. Avisar al Administrador de cada evaluación final genera ruido sin una acción asociada.

## R-17 · Frontend sin módulo Editor

- **Decisión**. Eliminar `features/editor/`, `editor.service.ts`, `editor.model.ts`, `editor-summary` y el símbolo `editor` del sprite. Los tipos compartidos pasan a `rubric.model.ts`, `incident.model.ts` y `manuscript.model.ts`. `KpiCardComponent` admite un `max` opcional para mostrar «3/5» con el nombre accesible «3 de 5». La bandeja del Revisor reutiliza esa tarjeta en un componente `reviewer-standing`. Las vistas nuevas reutilizan `StatusBadgeComponent`, `EmptyStateComponent`, `ConfirmDialogComponent`, `PaginationComponent` y los tokens `--gpc-*`.
- **Justificación**. Se cumple FR-037 sin dependencias nuevas. La extensión de la tarjeta es compatible: sin `max` presenta lo mismo que hoy.
- **Alternativas descartadas**. Una tarjeta nueva para el ranking duplicaría la de 003. Mostrar «X/5» como cadena no pasa el filtro numérico vigente de la tarjeta.

## R-18 · Transición de datos y expedientes en curso

- **Decisión**. Las migraciones aplican cambios de esquema y datos sin auditoría que no toquen filas inmutables: catálogo y vínculos de carreras, estados, borradores, `slot=1` y `release_cause='EDITOR_LEGACY'` en asignaciones heredadas revocadas. El comando idempotente `apply_auto_review_transition` se ejecuta en el arranque, después de `migrate` y `apply_db_privileges`. Revoca roles `EDITOR` con auditoría, cierra sin penalización las asignaciones `EXPIRED` heredadas que esperaban al Editor (`release_cause='LEGACY_TRANSITION'`) y cubre los cupos de los manuscritos en curso con el motor. En las versiones heredadas, la conciliación de veredictos clasifica `ACCEPT` como aceptación, `REQUIRES_CORRECTIONS` como cambios y `REJECT` como rechazo.
- **Justificación**. Las acciones con auditoría usan los servicios reales y no los modelos históricos de una migración. Ejecutar el comando en cada arranque, sin efecto tras la primera vez, cumple FR-039 sin un paso manual.
- **Alternativas descartadas**. Exigir al operador un comando manual. Penalizar vencimientos ocurridos con las reglas anteriores, que sería retroactivo.

## R-19 · Estrategia de pruebas

- **Decisión**. Pytest con `freezegun` para el reloj de Python y con `due_at` y `assigned_at` desplazados en la base para el reloj de PostgreSQL, porque `Now()` no se congela. Concurrencia con `tests/parallel.py` y bases transaccionales. Pruebas de migración con `MigrationExecutor` sobre datos heredados, incluidas evaluaciones finales. Vitest y jsdom para reglas, componentes y servicios. Playwright y axe con el stack aislado de `scripts/e2e.sh` y semillas de tres revisores por carrera para el desempate.
- **Justificación**. Es el mismo conjunto de herramientas del repositorio, con el patrón de fechas relativas que ya se aplicó a los fixtures del Revisor.
- **Alternativas descartadas**. Esperar el vencimiento real en E2E. Simular PostgreSQL en memoria, que no ejecuta disparadores ni restricciones.
