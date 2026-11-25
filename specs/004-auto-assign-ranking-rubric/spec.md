# Feature Specification: Asignación automática por carrera, ranking de revisores y rúbrica profesional

**Feature Branch**: `004-auto-assign-ranking-rubric` (nombre de referencia)

**Created**: 2026-11-24

**Status**: Draft

**Input**: Eliminar el rol Editor y operar solo con Autor, Revisor y Administrador. Asignar automáticamente dos revisores de la misma carrera o área del manuscrito, con un límite estricto de cinco asignaciones activas por revisor. Incorporar un ranking de revisores que bonifique la evaluación a tiempo y que, al vencer el plazo, penalice, revoque y reasigne de forma automática. Emitir el veredicto automáticamente por consenso, con un tercer revisor de desempate. Reemplazar los criterios de evaluación por una rúbrica profesional de cinco criterios con justificación obligatoria. Preservar el doble ciego y reutilizar el sistema de diseño y la accesibilidad de `003-ui-ux-overhaul`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enviar un manuscrito y recibir dos revisores de su carrera (Priority: P1)

Como Autor, quiero que al enviar mi manuscrito el sistema asigne automáticamente dos revisores de su misma carrera o área, para que la evaluación empiece sin esperar una decisión manual.

**Why this priority**: Sin Editor, la asignación automática es lo que pone en marcha la revisión. Las demás historias dependen de que existan asignaciones.

**Independent Test**: Preparar revisores con distintas carreras, puntajes y cargas, incluido un coautor del manuscrito que también es Revisor. Enviar el manuscrito y comprobar quiénes reciben la asignación, en qué orden y con qué plazo.

**Acceptance Scenarios**:

1. **Given** un manuscrito de Ingeniería en Computación y cuatro revisores elegibles de esa carrera, **When** el Autor confirma el envío, **Then** el manuscrito pasa a En revisión con dos asignaciones de revisores distintos. Se eligen por mayor puntaje de ranking y, a igual puntaje, por menor carga activa. Cada asignación vence a los 20 días calendario exactos.
2. **Given** revisores de Derecho e Ingeniería Agropecuaria y un coautor del manuscrito que es Revisor de Ingeniería en Computación, **When** se asignan los revisores, **Then** no se elige a nadie de otra carrera ni al registrante, autor o coautor, aunque tenga mejor puntaje.
3. **Given** un revisor elegible con cinco asignaciones activas, **When** se envía un manuscrito de su carrera, **Then** no recibe la asignación y se elige al siguiente revisor elegible.
4. **Given** un solo revisor elegible con cupo, **When** se envía el manuscrito, **Then** se asigna ese revisor y el segundo cupo queda pendiente hasta que otro revisor elegible esté disponible. Sin ningún revisor elegible, el manuscrito permanece Enviado en espera de revisores y el Administrador recibe un aviso.
5. **Given** un manuscrito con dos carreras, **When** se asignan revisores, **Then** es elegible quien comparta al menos una de ellas de forma exacta, sin afinidades ni coincidencias parciales de texto.

### User Story 2 - Evaluar con una rúbrica profesional (Priority: P1)

Como Revisor, quiero calificar el manuscrito con cinco criterios técnicos y descriptores por nivel, para emitir un dictamen fundamentado y comparable.

**Why this priority**: La rúbrica define el contenido de cada evaluación y la justificación que recibe el Autor. El veredicto automático se basa en los dictámenes que produce.

**Independent Test**: Abrir una asignación activa, consultar los descriptores, guardar un borrador incompleto e intentar el envío final con distintas combinaciones de puntajes, dictámenes y longitudes de comentario.

**Acceptance Scenarios**:

1. **Given** una asignación activa, **When** el Revisor abre el formulario, **Then** ve los cinco criterios en el orden definido, cada uno con la escala del 1 al 5 y el descriptor de cada nivel, junto con los dictámenes Aceptar, Revisión menor, Revisión mayor y Rechazar.
2. **Given** una evaluación con algún criterio en 3 o menos, o con dictamen Revisión mayor o Rechazar, **When** el Revisor intenta el envío final con menos de 100 caracteres en «Comentarios para el autor», **Then** el envío se bloquea, el campo indica el mínimo y los caracteres escritos, y el borrador se conserva.
3. **Given** la misma evaluación con 100 caracteres o más en los comentarios, **When** el Revisor confirma el envío, **Then** se registra una evaluación final inmutable de la versión asignada.
4. **Given** todos los criterios en 4 o 5 y dictamen Aceptar o Revisión menor, **When** el Revisor escribe un comentario breve, **Then** puede enviar la evaluación. El comentario sigue siendo obligatorio, sin el mínimo de 100 caracteres.
5. **Given** un borrador con criterios sin calificar, **When** el Revisor lo guarda, **Then** se conserva en privado. Solo el envío final exige los cinco criterios, el dictamen y los comentarios.

### User Story 3 - Recibir el veredicto automático por consenso o desempate (Priority: P1)

Como Autor, quiero que el resultado se decida automáticamente a partir de las evaluaciones, para conocerlo en cuanto se completen, sin un paso editorial manual.

**Why this priority**: El veredicto automático reemplaza la decisión del Editor y cierra cada ronda: publica, rechaza o habilita la corrección del Autor.

**Independent Test**: Registrar pares de evaluaciones finales que cubran las combinaciones de dictámenes y, en los empates, una tercera evaluación. Comprobar estado, catálogo, ronda y avisos.

**Acceptance Scenarios**:

1. **Given** dos evaluaciones finales con dictamen Aceptar, **When** se registra la segunda, **Then** el manuscrito pasa a Aceptado y aparece en el catálogo público en un máximo de cinco minutos.
2. **Given** dos evaluaciones finales con dictamen Rechazar, **When** se registra la segunda, **Then** el manuscrito pasa a Rechazado y no se publica.
3. **Given** dos evaluaciones sin Rechazar y con al menos una Revisión menor o mayor, **When** se registra la segunda, **Then** el manuscrito pasa a Cambios solicitados y se abre la siguiente ronda. El Autor puede editar sus metadatos y cargar una nueva versión desde su módulo. Esa versión recibe dos revisores con las reglas de la historia 1.
4. **Given** una evaluación con Rechazar y otra con Aceptar, Revisión menor o Revisión mayor, **When** se registra la segunda, **Then** el manuscrito pasa a En desempate. El sistema asigna un tercer revisor de la misma carrera, el siguiente mejor del ranking que no haya participado en esa versión.
5. **Given** un manuscrito En desempate, **When** el tercer revisor envía su evaluación, **Then** el veredicto se decide por mayoría según la tabla de desempate. El Autor ve la decisión y los comentarios de cada evaluación, identificados como «Revisor 1», «Revisor 2» y «Revisor 3», sin identidades.

### User Story 4 - Cumplir el plazo y consultar un ranking transparente (Priority: P1)

Como Revisor, quiero conocer mi puntaje, mi cupo y el efecto de cumplir o incumplir el plazo, para organizar mi trabajo. Como institución, quiero que una asignación vencida se reasigne sola, para que ningún manuscrito quede detenido.

**Why this priority**: Sin Editor, solo la revocación automática libera un cupo abandonado. El ranking ordena las asignaciones de las historias 1 y 3.

**Independent Test**: Con un reloj controlado, enviar una evaluación antes del vencimiento y dejar vencer otra asignación. Comprobar puntajes, revocación, reasignación, avisos y métricas del panel y de la bandeja.

**Acceptance Scenarios**:

1. **Given** un revisor con 100 puntos, **When** envía su evaluación final antes del vencimiento, **Then** su puntaje sube a 110 y el ajuste queda registrado con la asignación que lo originó.
2. **Given** una asignación activa sin evaluación final, **When** se cumple el instante exacto de su vencimiento, **Then** el sistema la revoca como Vencida, resta 20 puntos al revisor y asigna el cupo al siguiente mejor revisor elegible en un máximo de dos minutos. El borrador del revisor anterior se conserva y ya no puede enviarse.
3. **Given** un revisor autenticado, **When** consulta su panel o su bandeja de asignaciones, **Then** ve su puntaje actual, su cupo como «X/5 activas», sus evaluaciones a tiempo, sus vencimientos y el historial de ajustes.
4. **Given** un revisor que declara un conflicto de interés, o una asignación cerrada por la baja del manuscrito o por un incidente, **When** se libera el cupo, **Then** su puntaje no cambia y el cupo se reasigna cuando corresponde.
5. **Given** un Autor u otro Revisor, **When** consulta cualquier vista, aviso o documento, **Then** no accede al puntaje ni a las métricas de ningún revisor.

### User Story 5 - Operar con Autor, Revisor y Administrador (Priority: P1)

Como institución, quiero retirar el rol Editor y repartir sus funciones entre el Autor, el sistema y el Administrador, para operar con tres roles y sin pasos editoriales manuales.

**Why this priority**: La retirada completa es obligatoria. Sin ella quedarían funciones, permisos y avisos huérfanos, y los incidentes de doble ciego no tendrían responsable.

**Independent Test**: Recorrer el sistema con una cuenta de cada rol, una multirrol y una que solo tenía el rol Editor. Reportar un incidente desde una asignación y resolverlo como Administrador con cada resolución.

**Acceptance Scenarios**:

1. **Given** una cuenta Autor–Revisor, **When** inicia sesión, **Then** ve ambos módulos a la vez, sin selector de rol y sin módulos, accesos ni avisos de Editor.
2. **Given** una cuenta que solo tenía el rol Editor, **When** inicia sesión tras la activación, **Then** no tiene roles habilitados y ve el estado informativo correspondiente. Sus acciones anteriores siguen en la auditoría y en el historial.
3. **Given** cualquier sesión, **When** intenta abrir una ruta o una operación del antiguo módulo Editor, **Then** la ruta no existe y no se entrega ningún dato.
4. **Given** manuscritos en curso al activar la funcionalidad, Enviados, En revisión con un solo revisor, con una asignación vencida pendiente de decisión o en Requiere correcciones, **When** concluye la activación, **Then** cada uno continúa según FR-039 sin intervención manual y los registros históricos quedan intactos.
5. **Given** un reporte confidencial abierto, **When** el Administrador lo consulta en su módulo, **Then** ve el tipo, la descripción, el código, título, estado y versión del manuscrito y el documento sanitizado que recibió el revisor. Puede descartarlo, reasignar o solicitar una versión anonimizada.
6. **Given** la resolución Reasignar, **When** el Administrador la confirma, **Then** la asignación del revisor que reportó se libera sin penalización y el cupo se cubre automáticamente.
7. **Given** la resolución Solicitar versión anonimizada, **When** el Administrador la confirma, **Then** se liberan sin penalización todas las asignaciones activas de esa versión y el manuscrito pasa a Cambios solicitados. El Autor recibe un aviso que no menciona el reporte ni a quien lo hizo.
8. **Given** un veredicto con un error comprobado, **When** el Administrador registra la decisión corregida con un motivo, **Then** el veredicto original se conserva, la nueva decisión se aplica y el catálogo se ajusta a ella.
9. **Given** un Administrador con reportes abiertos y manuscritos con cupos pendientes, **When** abre el panel unificado, **Then** su tarjeta muestra ambos conteos y los accesos a Incidentes, Revisores, Carreras y Auditoría.

### User Story 6 - Mantener el padrón de revisores y el catálogo de carreras (Priority: P3)

Como Administrador, quiero gestionar las carreras o áreas validadas y las de cada revisor, para que la asignación automática encuentre revisores adecuados.

**Why this priority**: La transición carga el catálogo inicial y las carreras de los revisores actuales. Esta gestión permite ajustarlas en la operación diaria sin herramientas técnicas.

**Independent Test**: Crear una carrera, asignarla a un revisor, marcar a otro como no disponible y comprobar el efecto en la siguiente asignación automática.

**Acceptance Scenarios**:

1. **Given** el catálogo de carreras, **When** el Administrador crea, renombra, desactiva o reactiva una carrera, **Then** solo las activas se ofrecen en manuscritos y perfiles. Las asociaciones existentes se conservan.
2. **Given** el listado de revisores, **When** el Administrador lo consulta, **Then** ve las carreras, la disponibilidad, el puntaje, la carga activa y el cumplimiento de cada revisor.
3. **Given** un revisor sin carreras o no disponible, **When** se ejecuta una asignación automática, **Then** no es elegible. Sus asignaciones vigentes continúan hasta completarse o liberarse.

### Edge Cases

- **Menos de dos revisores elegibles**. Se asignan los disponibles y los cupos restantes quedan pendientes. Se cubren por orden de envío cuando un revisor completa o libera una asignación, recupera la disponibilidad o recibe la carrera. Sin ninguna asignación, el manuscrito sigue Enviado en espera de revisores. El Administrador recibe un aviso cuando un cupo no puede cubrirse.
- **Concurrencia**. Varios envíos simultáneos que compiten por el último cupo de un revisor nunca le dejan más de cinco asignaciones activas. Dos evaluaciones finales simultáneas producen un solo veredicto.
- **Participación previa**. Quien tuvo una asignación en una versión, completada, revocada o vencida, no vuelve a recibirla. En una versión posterior puede volver a ser elegido.
- **Instante del vencimiento**. Una evaluación enviada en el instante exacto del vencimiento o después queda fuera de plazo. Se rechaza y el borrador se conserva. Un borrador guardado no evita la revocación ni la penalización.
- **Desempate sin candidatos**. El manuscrito permanece En desempate con el tercer cupo pendiente y el Administrador recibe un aviso. Si vence el tercer revisor, se aplica la regla de vencimiento y se reasigna.
- **Baja lógica durante la revisión o el desempate**. Se liberan sin penalización todas las asignaciones activas, no se emite veredicto y las evaluaciones registradas se conservan.
- **Reporte abierto antes del veredicto**. Mientras una versión tenga un reporte confidencial abierto, su veredicto automático espera la resolución del Administrador. Los plazos de sus asignaciones siguen corriendo. Si la resolución es Reasignar y el revisor que reportó ya había evaluado, su evaluación se conserva en el historial y deja de contar para el veredicto.
- **Versión anonimizada con una evaluación final**. Las evaluaciones finales de la versión retirada se conservan en el historial y no cuentan para el veredicto de la versión nueva.
- **Puntaje mínimo**. El puntaje no baja de 0. El ajuste registra el valor resultante.
- **Comentarios con espacios**. Los 100 caracteres se cuentan sin espacios al inicio ni al final. Exactamente 100 caracteres cumplen el mínimo y 99 no.
- **Carrera desactivada**. No se ofrece en nuevos manuscritos ni perfiles. Quienes ya la tienen la conservan y los manuscritos en curso siguen usándola para la asignación.
- **Revisor que pierde condiciones**. Si pierde el rol, la disponibilidad o la carrera, sus asignaciones vigentes continúan y no recibe nuevas mientras no cumpla todas las condiciones.
- **Registros históricos**. Las evaluaciones con los criterios anteriores, los veredictos del Editor y los estados Requiere correcciones se conservan sin cambios y se muestran con su etiqueta vigente. Los avisos antiguos con enlaces a rutas retiradas llevan a la página no encontrada.
- **Falla del veredicto o de la publicación**. La evaluación final queda registrada aunque el veredicto no pueda completarse en ese momento. El sistema lo reintenta sin duplicarlo.

## Requirements *(mandatory)*

### Functional Requirements

#### Roles y retirada del Editor

- **FR-001**. El sistema DEBE operar solo con los roles Autor (`AUTHOR`), Revisor (`REVIEWER`) y Administrador (`ADMIN`). El rol Editor (`EDITOR`), su módulo, sus rutas `/app/editor/*`, sus vistas, sus operaciones y sus avisos DEBEN dejar de existir. No DEBE existir selector ni conmutador de rol antes ni después de iniciar sesión. Una cuenta multirrol ve juntos todos sus módulos habilitados.
- **FR-002**. Al activarse la funcionalidad, las asignaciones vigentes del rol Editor DEBEN revocarse con registro de auditoría y el rol no DEBE poder asignarse de nuevo. Las cuentas sin otros roles DEBEN ver el estado sin roles habilitados. La auditoría, el historial, las asignaciones y los veredictos existentes DEBEN conservar sus referencias históricas.
- **FR-003**. El Autor DEBE editar sus borradores, elegir las carreras o áreas, enviar a revisión y cargar nuevas versiones tras Cambios solicitados desde su propio módulo. Los metadatos solo DEBEN poder editarse en Borrador y en Cambios solicitados.
- **FR-004**. El Administrador DEBE consultar, filtrar y resolver los reportes confidenciales de incidentes desde su módulo. En cada reporte DEBE ver el tipo, la descripción, el revisor que reportó, el código, título, estado y versión del manuscrito y el documento sanitizado que recibió ese revisor. Cada consulta del documento DEBE quedar auditada.
- **FR-005**. Las resoluciones de un reporte DEBEN ser Descartar, que lo cierra sin otros efectos; Reasignar, que libera sin penalización la asignación del revisor que reportó, aunque ya haya enviado su evaluación, y cubre el cupo automáticamente; y Solicitar versión anonimizada, que libera sin penalización todas las asignaciones activas de la versión, pasa el manuscrito a Cambios solicitados y abre la siguiente ronda. Un reporte se resuelve una sola vez. Mientras una versión tenga un reporte abierto, su veredicto automático DEBE esperar la resolución.
- **FR-006**. El Administrador DEBE poder corregir un veredicto con error comprobado registrando la nueva decisión y un motivo obligatorio. El veredicto original DEBE conservarse sin cambios y el catálogo DEBE ajustarse a la nueva decisión. El Administrador no edita evaluaciones.

#### Carreras y áreas académicas

- **FR-007**. El sistema DEBE mantener un catálogo institucional de carreras o áreas validadas, por ejemplo Ingeniería en Computación, Ingeniería Agropecuaria y Derecho. Solo las activas DEBEN ofrecerse en manuscritos, perfiles y filtros del catálogo público.
- **FR-008**. Cada manuscrito DEBE declarar entre una y tres carreras o áreas del catálogo para poder enviarse. Cada perfil de Revisor DEBE tener al menos una para ser elegible.
- **FR-009**. El Administrador DEBE poder crear, renombrar, desactivar y reactivar carreras y asignar a cada revisor sus carreras y su disponibilidad. Ningún cambio DEBE alterar asignaciones vigentes ni registros históricos.

#### Asignación automática y límite de carga

- **FR-010**. Al registrarse un envío formal, inicial o de una nueva versión, el sistema DEBE asignar automáticamente dos revisores distintos a la versión enviada.
- **FR-011**. Un revisor DEBE ser elegible solo si cumple todas estas condiciones: cuenta activa, rol Revisor activo, disponibilidad declarada, al menos una carrera idéntica a una del manuscrito, ninguna relación de autoría con el manuscrito (registrante, autor o coautor, por cuenta o por correo), ninguna asignación previa en la misma versión y menos de cinco asignaciones activas.
- **FR-012**. Los candidatos DEBEN ordenarse por puntaje de ranking descendente y, a igual puntaje, por menor carga activa. Si persiste el empate, se prioriza a quien recibió su última asignación hace más tiempo o nunca la recibió y, por último, un identificador estable. La misma regla DEBE aplicarse a las reasignaciones y al desempate.
- **FR-013**. Ningún revisor DEBE superar cinco asignaciones activas simultáneas (`MAX_ACTIVE_ASSIGNMENTS = 5`), incluidas las de desempate y aun con solicitudes concurrentes. Una asignación deja de estar activa al completarse con la evaluación final, al revocarse o al vencer.
- **FR-014**. Si no hay suficientes revisores elegibles, los cupos faltantes DEBEN quedar pendientes y cubrirse automáticamente en cuanto las condiciones lo permitan, por orden de antigüedad del envío. Un manuscrito sin ninguna asignación DEBE permanecer Enviado en espera de revisores y pasar a En revisión al recibir la primera. El Administrador DEBE recibir un aviso cuando un cupo no pueda cubrirse.
- **FR-015**. Cada asignación DEBE vencer a los 20 días calendario exactos desde el instante de su creación, en la zona horaria institucional. El revisor DEBE ver la fecha y la hora de vencimiento.

#### Rúbrica de evaluación

- **FR-016**. El formulario DEBE reemplazar los criterios anteriores por cinco criterios calificados del 1 al 5, en este orden: Pertinencia y Contribución Científica (`scientific_contribution`), Rigor Metodológico y Reproducibilidad (`methodological_rigor`), Estado del Arte y Sustento Bibliográfico (`literature_grounding`), Validez de Resultados y Conclusiones (`results_conclusions`) y Redacción Académica y Estructura Formal (`academic_writing`).
- **FR-017**. Cada nivel de cada criterio DEBE presentar su nombre y su descriptor según la tabla de descriptores de la rúbrica.
- **FR-018**. El dictamen DEBE elegirse entre Aceptar (`ACCEPTED`), Revisión menor (`MINOR_REVISION`), Revisión mayor (`MAJOR_REVISION`) y Rechazar (`REJECTED`).
- **FR-019**. Los Comentarios para el autor DEBEN ser obligatorios en el envío final. DEBEN tener al menos 100 caracteres, sin contar espacios al inicio ni al final, si algún criterio recibe 3 o menos o si el dictamen es Revisión mayor o Rechazar. El formulario DEBE indicar el mínimo aplicable y los caracteres escritos.
- **FR-020**. El borrador DEBE admitir campos incompletos. El envío final DEBE exigir los cinco criterios, el dictamen, comentarios válidos y la declaración de no tener conflicto de interés. La evaluación final DEBE ser inmutable.
- **FR-021**. El formulario no DEBE ofrecer comentarios confidenciales, porque su destinatario era el Editor. Las preocupaciones confidenciales DEBEN canalizarse mediante el reporte de incidentes dirigido al Administrador.

#### Veredicto automático y desempate

- **FR-022**. Al registrarse la segunda evaluación final de una versión, el sistema DEBE decidir automáticamente según la tabla de decisión inicial: Aceptado (`ACCEPTED`), Rechazado (`REJECTED`), Cambios solicitados (`CHANGES_REQUESTED`) o En desempate (`TIE_BREAKER`).
- **FR-023**. En desempate, el sistema DEBE asignar automáticamente un tercer revisor con las reglas de FR-011 a FR-015, sin repetir participantes de la versión.
- **FR-024**. El veredicto del desempate DEBE decidirse por mayoría según la tabla de desempate.
- **FR-025**. Aceptado DEBE publicar el artículo en el catálogo público en un máximo de cinco minutos. Rechazado DEBE cerrar el proceso sin publicación. Cambios solicitados DEBE abrir la siguiente ronda y habilitar al Autor para editar y cargar una nueva versión.
- **FR-026**. Cada versión DEBE tener un único veredicto ordinario, emitido por el sistema e inmutable, aun ante evaluaciones simultáneas o reintentos. El veredicto DEBE identificar las evaluaciones consideradas.
- **FR-027**. Tras el veredicto, el Autor DEBE ver la decisión y los comentarios para el autor de cada evaluación de la versión, identificados como «Revisor 1», «Revisor 2» y «Revisor 3». No DEBE ver identidades, puntajes, dictámenes individuales ni datos del ranking. Antes del veredicto no ve comentarios.

#### Ranking de revisores y plazo

- **FR-028**. Cada revisor DEBE tener un puntaje de ranking (`ranking_score`) que empieza en 100 puntos al activarse la funcionalidad o al crearse su perfil.
- **FR-029**. Cada evaluación final enviada antes del vencimiento DEBE sumar 10 puntos al revisor.
- **FR-030**. Al cumplirse el vencimiento sin evaluación final, el sistema DEBE revocar la asignación como Vencida, restar 20 puntos al revisor y asignar el cupo al siguiente mejor revisor elegible. El proceso DEBE completarse en un máximo de dos minutos desde el vencimiento.
- **FR-031**. Las liberaciones no atribuibles al revisor no DEBEN modificar su puntaje: conflicto de interés declarado, resolución de un incidente, solicitud de versión anonimizada y baja lógica del manuscrito. El revisor DEBE poder liberar una asignación activa solo declarando un conflicto de interés.
- **FR-032**. El puntaje no DEBE bajar de 0 y no tiene tope superior. Cada ajuste DEBE registrar causa, fecha, asignación y puntaje resultante, sin recálculos retroactivos.
- **FR-033**. El revisor DEBE ver en su panel y en su bandeja de asignaciones su puntaje, su cupo como «X/5 activas», sus evaluaciones a tiempo, sus vencimientos y el historial de ajustes. Solo el propio revisor y el Administrador DEBEN acceder al puntaje y a las métricas.

#### Doble ciego, auditoría y avisos

- **FR-034**. El doble ciego DEBE preservarse en respuestas, vistas, contenido accesible, documentos, historial, errores y avisos. El Autor no ve la identidad de los revisores. Los revisores no ven la identidad del Autor ni la de otros revisores, ni las evaluaciones ajenas, incluido el revisor de desempate. Cada vista mantiene su ámbito en cuentas multirrol.
- **FR-035**. Cada asignación, revocación, ajuste de ranking, paso a desempate, veredicto, resolución de incidente y corrección DEBE generar un registro de auditoría. Las acciones automáticas se registran con el sistema como actor. Si la auditoría no puede registrarse, la acción no DEBE completarse y DEBE reintentarse.
- **FR-036**. Los avisos DEBEN informar al revisor de cada asignación con su vencimiento, de cada revocación por vencimiento con su penalización y de cada liberación. Al Autor DEBEN informarle del envío, del inicio de la revisión, del paso a desempate sin detallar los dictámenes, del veredicto y de la solicitud de cambios. Al Administrador DEBEN informarle de cada nuevo reporte y de cada cupo sin revisores elegibles. Ningún aviso DEBE incluir identidades restringidas.

#### Interfaz, accesibilidad y transición

- **FR-037**. Las vistas nuevas o modificadas DEBEN reutilizar el sistema de diseño, las tarjetas de métricas, las insignias de estado y los estados vacíos de `003-ui-ux-overhaul`. DEBEN cumplir el contraste WCAG 2.2 AA, operar por teclado y adaptarse a pantallas estrechas. Cambios solicitados y En desempate DEBEN mostrarse con etiqueta textual y color semántico institucional.
- **FR-038**. El panel unificado DEBE mostrar en la tarjeta del Revisor su puntaje y su cupo, y en la del Administrador los reportes abiertos y los manuscritos con cupos pendientes, con accesos a Incidentes, Revisores, Carreras y Auditoría.
- **FR-039**. Los manuscritos en curso DEBEN continuar con las nuevas reglas sin intervención manual. Los Enviados reciben asignación automática y los En revisión completan sus dos cupos. Las asignaciones vencidas que esperaban una decisión del Editor se cierran sin penalización y su cupo se reasigna. Los manuscritos en Requiere correcciones pasan a Cambios solicitados. Las evaluaciones finales, veredictos, versiones, eventos de estado y registros de auditoría previos DEBEN conservarse sin modificaciones.

### Descriptores de la rúbrica

Los niveles se denominan 1 Deficiente, 2 Insuficiente, 3 Aceptable, 4 Bueno y 5 Excelente. Una calificación de 3 o menos exige justificación según FR-019.

**Pertinencia y Contribución Científica** (`scientific_contribution`)

| Nivel | Descriptor |
| --- | --- |
| 1 · Deficiente | No corresponde a la carrera o área declarada, o repite resultados conocidos sin aporte identificable. |
| 2 · Insuficiente | Pertinencia parcial. El aporte es mínimo o no se distingue de trabajos previos. |
| 3 · Aceptable | Es pertinente y tiene un aporte incremental o delimitado de forma insuficiente. |
| 4 · Bueno | Es pertinente y su contribución, explícita, amplía el conocimiento o la práctica del área. |
| 5 · Excelente | Contribución original y significativa, con un impacto potencial evidente en el área. |

**Rigor Metodológico y Reproducibilidad** (`methodological_rigor`)

| Nivel | Descriptor |
| --- | --- |
| 1 · Deficiente | El método no se describe o no es adecuado para el problema. No es posible reproducir el trabajo. |
| 2 · Insuficiente | Descripción incompleta y fallas que comprometen la validez. La reproducción no es viable. |
| 3 · Aceptable | Método adecuado en general, con omisiones de datos, instrumentos o parámetros que dificultan reproducirlo. |
| 4 · Bueno | Método adecuado y descrito con detalle suficiente para reproducirlo, con limitaciones menores. |
| 5 · Excelente | Método riguroso y justificado, con datos, instrumentos y procedimientos documentados para reproducirlo íntegramente. |

**Estado del Arte y Sustento Bibliográfico** (`literature_grounding`)

| Nivel | Descriptor |
| --- | --- |
| 1 · Deficiente | No revisa antecedentes o sus referencias no se relacionan con el problema. |
| 2 · Insuficiente | Revisión escasa o desactualizada, sin vínculo claro con el problema planteado. |
| 3 · Aceptable | Revisión suficiente, con vacíos relevantes o con fuentes poco académicas o desactualizadas. |
| 4 · Bueno | Revisión actualizada y pertinente que sitúa el problema, con vacíos menores. |
| 5 · Excelente | Revisión exhaustiva, crítica y actualizada que identifica con precisión la brecha que el trabajo atiende. |

**Validez de Resultados y Conclusiones** (`results_conclusions`)

| Nivel | Descriptor |
| --- | --- |
| 1 · Deficiente | Faltan resultados o no tienen sustento. Las conclusiones no se relacionan con los datos. |
| 2 · Insuficiente | Resultados con errores o inconsistencias graves. Las conclusiones no se derivan de ellos. |
| 3 · Aceptable | Resultados correctos en general con un análisis limitado. Algunas conclusiones exceden la evidencia. |
| 4 · Bueno | Resultados correctos y bien analizados. Las conclusiones son coherentes con la evidencia y reconocen sus limitaciones. |
| 5 · Excelente | Resultados sólidos discutidos frente a la literatura. Las conclusiones son precisas, sustentadas y explicitan sus limitaciones. |

**Redacción Académica y Estructura Formal** (`academic_writing`)

| Nivel | Descriptor |
| --- | --- |
| 1 · Deficiente | Texto ininteligible o sin estructura. Incumple las normas formales. |
| 2 · Insuficiente | Errores frecuentes de redacción, estructura desordenada o incumplimiento reiterado de las normas de citación. |
| 3 · Aceptable | Redacción comprensible con errores ocasionales. Estructura y citación con fallas puntuales. |
| 4 · Bueno | Redacción clara y estructura ordenada. Cumple las normas con errores menores. |
| 5 · Excelente | Redacción precisa y fluida, estructura impecable y cumplimiento total de las normas formales y de citación. |

### Tablas de decisión del veredicto

**Decisión inicial** (FR-022). El orden de los dictámenes no importa.

| Dictamen A | Dictamen B | Resultado |
| --- | --- | --- |
| Aceptar | Aceptar | Aceptado |
| Aceptar | Revisión menor o Revisión mayor | Cambios solicitados |
| Revisión menor o Revisión mayor | Revisión menor o Revisión mayor | Cambios solicitados |
| Rechazar | Rechazar | Rechazado |
| Rechazar | Aceptar, Revisión menor o Revisión mayor | En desempate |

**Desempate** (FR-024). El tercer dictamen forma mayoría con uno de los dos anteriores.

| Dictamen inicial que no rechaza | Tercer dictamen | Resultado |
| --- | --- | --- |
| Cualquiera | Rechazar | Rechazado |
| Aceptar | Aceptar | Aceptado |
| Aceptar | Revisión menor o Revisión mayor | Cambios solicitados |
| Revisión menor o Revisión mayor | Aceptar, Revisión menor o Revisión mayor | Cambios solicitados |

### Reglas vigentes que se sustituyen

| Referencia de la especificación funcional | Nueva regla |
| --- | --- |
| D-02, RN-04 y CA-HU-11-04. Un único Revisor activo | Dos revisores por versión y un tercero en desempate (FR-010, FR-023). |
| D-04, RN-05 y CA-HU-12-05. Sin revocación automática | Revocación, penalización y reasignación automáticas al vencer (FR-030). |
| RN-12, HU-10 a HU-13. Paso a revisión, asignación y veredicto del Editor | Asignación y veredicto automáticos (FR-010 a FR-026) y corrección por el Administrador (FR-006). |
| CA-HU-11-01. Área del manuscrito o área afín | Coincidencia exacta en el catálogo validado (FR-011). |
| CA-HU-15-01 y CA-HU-15-03. Criterios anteriores y comentarios confidenciales | Rúbrica de cinco criterios sin comentarios confidenciales (FR-016 a FR-021). |
| CA-HU-16-06. Incidentes resueltos por el Editor | Incidentes resueltos por el Administrador (FR-004, FR-005). |
| Sección 16. Ranking de revisores reservado a la fase 2 | Ranking incorporado con las reglas de FR-028 a FR-033. |

### Key Entities

- **Carrera o área académica**. Elemento del catálogo institucional validado, con nombre único y estado activo o inactivo. Se asocia a manuscritos y a perfiles de revisor.
- **Perfil de revisor**. Carreras, disponibilidad, puntaje de ranking y métricas de cumplimiento de una cuenta con rol Revisor.
- **Asignación**. Vínculo entre un revisor y una versión en un cupo (primero, segundo o desempate), con su creación, su vencimiento, su estado (Activa, Completada, Revocada o Vencida) y su causa de cierre.
- **Ajuste de ranking**. Registro inmutable de una bonificación o penalización con su causa, asignación, fecha y puntaje resultante.
- **Evaluación**. Borrador privado y luego evaluación final inmutable con los cinco criterios, el dictamen y los comentarios para el autor. Las evaluaciones históricas conservan los criterios anteriores.
- **Veredicto**. Decisión inmutable sobre una versión, automática o corregida por el Administrador, con las evaluaciones consideradas.
- **Manuscrito**. Incorpora sus carreras y los estados Cambios solicitados y En desempate a su ciclo de vida.
- **Reporte de incidente**. Reporte confidencial de un revisor que ahora resuelve el Administrador.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**. En el 100 % de los envíos de prueba con dos o más revisores elegibles, las dos asignaciones existen en el minuto siguiente al envío y corresponden a los dos primeros candidatos según FR-012. Hay cero asignaciones a revisores de otra carrera o con relación de autoría.
- **SC-002**. En una prueba de 20 envíos simultáneos de una misma carrera, ningún revisor supera cinco asignaciones activas y los cupos sin candidato quedan pendientes. Cada cupo que se libera se cubre en un máximo de dos minutos.
- **SC-003**. El 100 % de los envíos finales de prueba que incumplen la justificación obligatoria se rechaza y el 100 % de los que la cumplen se acepta, incluidos los límites de 99 y 100 caracteres.
- **SC-004**. Todas las combinaciones de las tablas de decisión producen el resultado esperado, con exactamente un veredicto ordinario por versión. Los artículos aceptados aparecen en el catálogo en un máximo de cinco minutos.
- **SC-005**. El 100 % de las asignaciones vencidas de prueba se revoca, penaliza y reasigna en un máximo de dos minutos desde el vencimiento. El puntaje de cada revisor coincide con su historial: 100 más 10 por evaluación a tiempo y menos 20 por vencimiento, con mínimo 0.
- **SC-006**. Se detectan cero rutas, operaciones, permisos, avisos o textos vigentes del rol Editor. El 100 % de los accesos de una cuenta exeditora sin otros roles se deniega y el 100 % de los reportes de prueba se resuelve desde el módulo del Administrador.
- **SC-007**. Se detectan cero exposiciones de identidad entre Autor y Revisor y entre revisores en respuestas, DOM, árbol accesible, documentos y avisos, incluidas las cuentas multirrol y el revisor de desempate. El puntaje no se expone fuera del propio revisor y del Administrador.
- **SC-008**. Al menos el 90 % de los revisores de prueba completa la rúbrica en menos de 15 minutos. Las vistas nuevas y modificadas presentan cero infracciones automáticas A/AA y cumplen 4.5:1 en texto normal y 3:1 en elementos no textuales.
- **SC-009**. El 100 % de los manuscritos en curso al activar la funcionalidad continúa su proceso sin intervención manual. Las evaluaciones finales, veredictos, versiones, eventos de estado y registros de auditoría previos presentan cero modificaciones.

## Assumptions

- La constitución y la especificación funcional vigente siguen siendo la referencia, salvo las reglas que sustituye esta funcionalidad. Se mantienen el envío solo en PDF, el versionado inmutable, la baja lógica, la auditoría append-only y el catálogo público. [Constitución](../../.spec-kit/constitution.md) · [Especificación funcional](../../.spec-kit/specify.md#6-reglas-de-negocio).
- La coincidencia exacta compara elementos del catálogo, no textos similares ni áreas afines. Basta compartir una carrera con el manuscrito y todos los candidatos se ordenan con la misma regla.
- Un manuscrito admite hasta tres carreras para no diluir la especialización. El catálogo inicial incluye las carreras institucionales y los valores de área que ya usan los manuscritos y los perfiles. Así las coincidencias vigentes se mantienen.
- Todos los revisores empiezan con 100 puntos al activarse la funcionalidad, sin aplicar retroactivamente las evaluaciones ni los vencimientos anteriores. El revisor de desempate recibe las mismas bonificaciones y penalizaciones.
- El plazo de 20 días calendario, la zona horaria institucional (America/Guayaquil) y la regla de corte del instante exacto no cambian.
- En cada versión nueva todos los revisores elegibles compiten de nuevo con la misma regla, sin preferencia por quienes evaluaron la versión anterior.
- El revisor de desempate evalúa de forma independiente, sin acceso a las evaluaciones anteriores ni indicación de que su asignación es de desempate. Su asignación es igual a las demás en la interfaz.
- El Autor ve el estado En desempate de su manuscrito, sin los dictámenes ni el motivo del desacuerdo.
- El Administrador puede conocer las identidades, conforme a RN-06, y solo accede al documento sanitizado dentro de la resolución de un incidente.
- A las cuentas exeditoras no se les asigna automáticamente otro rol. La institución asigna los roles que correspondan.
- Los avisos usan el panel y el correo institucional vigentes.
- Quedan fuera de alcance la apelación o el ajuste manual del puntaje, la asignación manual por el Administrador, las invitaciones con aceptación o rechazo del revisor, la ponderación de criterios con umbrales automáticos, la gestión de carreras por el propio revisor y los reportes analíticos.
