# Feature Specification: Tema claro y oscuro descansado y pulido visual de las vistas

**Feature Branch**: `005-ui-theme-polish` (nombre de referencia; el trabajo se integra en `dev/jostin-setup`)

**Created**: 2026-11-25

**Status**: Draft

**Input**: Incorporar un tema claro y un tema oscuro descansados, con superficies suaves en claro y tonos pizarra en oscuro, contraste WCAG 2.1 AA en ambos y arranque sin parpadeo compatible con la CSP `script-src 'self'`. Enriquecer las vistas sin saturarlas de botones: avatar con iniciales en la cabecera, iconos en las métricas del Administrador, progreso por etapas del manuscrito para el Autor y barras de plazo restante y de cupo `X/5` para el Revisor. Aplicar la regla de una sola acción primaria destacada por vista o tarjeta y agrupar las acciones secundarias y los filtros extensos en controles compactos o paneles plegables. No cambia el inicio de sesión, los correos, la API ni la lógica de negocio. Reutiliza el sistema de diseño de `003-ui-ux-overhaul` y las vistas de `004-auto-assign-ranking-rubric`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Elegir un tema claro u oscuro y conservarlo (Priority: P1)

Como persona que trabaja muchas horas en el sistema, quiero alternar entre un tema claro y uno oscuro desde la cabecera y que mi elección se conserve, para leer con comodidad según la luz de mi entorno.

**Why this priority**: Es el núcleo de la funcionalidad. Las demás historias se diseñan y se verifican sobre los dos temas.

**Independent Test**: Con el sistema operativo en modo claro y luego en oscuro, abrir la aplicación sin preferencia guardada, alternar el tema desde la cabecera, recargar, abrir otra pestaña y bloquear el almacenamiento del navegador. Comprobar el tema de cada pantalla desde el primer pintado.

**Acceptance Scenarios**:

1. **Given** un navegador sin preferencia guardada y el sistema operativo en modo oscuro, **When** la persona abre cualquier pantalla, **Then** la ve en tema oscuro desde el primer pintado, sin destello del tema claro.
2. **Given** un navegador sin preferencia guardada y el sistema operativo en modo claro o sin preferencia, **When** abre cualquier pantalla, **Then** la ve en tema claro.
3. **Given** una sesión iniciada, **When** activa el botón de tema junto a la campana de avisos, **Then** toda la interfaz cambia de tema al instante, sin recargar ni perder lo que estaba escribiendo, y el botón comunica su estado a las tecnologías de asistencia.
4. **Given** un tema elegido con el botón, **When** recarga la página, abre otra pestaña o vuelve otro día en el mismo navegador, **Then** ve el tema elegido aunque el sistema operativo indique lo contrario.
5. **Given** un navegador que no permite guardar datos locales, **When** alterna el tema, **Then** el cambio se aplica en la pestaña y el sistema sigue funcionando sin errores visibles. Al recargar vuelve a la preferencia del sistema operativo.

### User Story 2 - Leer cualquier vista con contraste suficiente en ambos temas (Priority: P1)

Como persona con baja visión o que trabaja con poca luz, quiero que textos, insignias, controles y estados mantengan su contraste y su significado en los dos temas, para no perder información ni confundir estados editoriales.

**Why this priority**: Un tema oscuro con contraste insuficiente sería una regresión de accesibilidad frente a 003 y 004. Ningún tema puede publicarse sin cumplir AA.

**Independent Test**: Recorrer con axe-core las pantallas públicas y de los tres roles, con diálogos abiertos, en ambos temas. Medir los pares de color de las insignias semánticas, los ajustes del ranking, los controles y el foco.

**Acceptance Scenarios**:

1. **Given** el tema oscuro, **When** se analizan las vistas públicas y las de Autor, Revisor y Administrador, incluidos sus diálogos, **Then** no hay infracciones WCAG A/AA y el contraste de texto es de al menos 4.5:1.
2. **Given** las insignias Aceptado (`ACCEPTED`), Cambios solicitados (`CHANGES_REQUESTED`), En desempate (`TIE_BREAKER`) y Rechazado (`REJECTED`) y los ajustes «+10 a tiempo» y «−20 vencida», **When** se muestran en cualquiera de los temas, **Then** conservan su color semántico institucional, su texto y un contraste de al menos 4.5:1.
3. **Given** un botón primario, de éxito o destructivo, **When** se muestra en reposo, al pasar el puntero o con foco en cualquiera de los temas, **Then** su texto y su icono contrastan al menos 4.5:1 con el relleno y el anillo de foco contrasta al menos 3:1 con su entorno.
4. **Given** un campo de formulario, un diálogo o una tabla en tema oscuro, **When** se usan, **Then** los controles nativos (fechas, listas, casillas y barras de desplazamiento) adoptan el esquema oscuro y sus bordes contrastan al menos 3:1.

### User Story 3 - Reconocer la sesión y el estado general de un vistazo (Priority: P2)

Como persona autenticada, quiero identificar mi cuenta y mis roles en la cabecera y, como Administrador, ver en mi tarjeta del panel cuántos reportes y manuscritos requieren atención, para orientarme sin leer cada detalle.

**Why this priority**: Mejora la orientación diaria sin cambiar el contenido. Depende del sistema de temas de US1 y US2.

**Independent Test**: Iniciar sesión con cuentas de un rol, multirrol y Administrador, con nombres cortos, compuestos y con tildes, en anchos de 320 a 1920 px. Revisar la cabecera y la tarjeta del Administrador con conteos en cero, positivos y ausentes.

**Acceptance Scenarios**:

1. **Given** una cuenta con nombre «Marcela» y apellidos «Quizhpe Ordóñez», **When** inicia sesión, **Then** el botón de cuenta muestra un avatar circular con las iniciales «MQ», conserva el nombre accesible «Mi cuenta» y su menú muestra el nombre completo.
2. **Given** una cuenta multirrol, **When** ve la cabecera, **Then** cada rol activo se muestra como insignia informativa, sin selector ni conmutador de rol.
3. **Given** un Administrador con reportes abiertos y manuscritos esperando revisores, **When** abre el panel unificado, **Then** su tarjeta muestra cada conteo junto a un icono temático, un acceso principal a Incidentes y accesos compactos a Revisores, Carreras y Auditoría.
4. **Given** un conteo en cero o ausente en la tarjeta del Administrador, **When** se muestra el panel, **Then** el cero se presenta como cero y el dato ausente no se presenta como cero, igual que en 003.

### User Story 4 - Seguir el progreso de mi manuscrito (Priority: P2)

Como Autor, quiero ver en el detalle de mi manuscrito en qué etapa del ciclo editorial se encuentra y cuáles ya superó, para saber qué falta sin interpretar códigos de estado.

**Why this priority**: Complementa la «Siguiente acción» vigente con una referencia visual. No cambia los estados ni las transiciones.

**Independent Test**: Abrir el detalle de manuscritos en cada estado del ciclo y uno dado de baja. Comprobar la etapa actual, las completadas y las pendientes con la vista y con un lector de pantalla.

**Acceptance Scenarios**:

1. **Given** un manuscrito En revisión, **When** el Autor abre su detalle, **Then** ve Borrador y Enviado como completadas, En revisión como etapa actual y Decisión como pendiente, con texto e icono además del color.
2. **Given** un manuscrito En desempate, **When** el Autor abre su detalle, **Then** la etapa actual se rotula «En desempate», sin dictámenes ni datos de los revisores.
3. **Given** un manuscrito con Cambios solicitados, **When** el Autor abre su detalle, **Then** la etapa Decisión se muestra como actual con el rótulo «Cambios solicitados» en tono de advertencia y se indica que una nueva versión vuelve a la etapa En revisión.
4. **Given** un manuscrito Aceptado o Rechazado, **When** el Autor abre su detalle, **Then** todas las etapas se muestran completadas y la última se rotula con el veredicto en su tono semántico.
5. **Given** un manuscrito dado de baja, **When** el Autor abre su detalle, **Then** el indicador conserva la etapa alcanzada y la rotula «Dado de baja», sin etapas futuras activas.

### User Story 5 - Medir mi plazo y mi cupo como Revisor (Priority: P2)

Como Revisor, quiero ver con una barra cuánto plazo me queda en una asignación y cuánto de mi cupo de cinco asignaciones activas está ocupado, para priorizar mi trabajo.

**Why this priority**: Hace visible la información de plazo y cupo de 004 sin nuevos datos. Depende de US1 y US2 para sus colores.

**Independent Test**: Con asignaciones a distintas distancias de su vencimiento, incluida una con menos de 24 horas y otra vencida, abrir su detalle. Consultar «Mi desempeño» y el panel con 0, 3 y 5 asignaciones activas.

**Acceptance Scenarios**:

1. **Given** una asignación activa a mitad de su plazo, **When** el Revisor abre su detalle, **Then** ve una tarjeta de plazo con la barra a la mitad, el tiempo restante, la fecha de asignación y la fecha límite, y la barra anuncia «Queda el 50 % del plazo».
2. **Given** una asignación con menos de 24 horas para vencer, **When** el Revisor abre su detalle, **Then** la barra y la tarjeta usan el tono de advertencia junto al texto «Próximo a vencer».
3. **Given** una asignación vencida según el servidor, **When** el Revisor abre su detalle, **Then** la barra queda vacía en tono de peligro junto al texto «Plazo vencido» y el acceso a la evaluación sigue deshabilitado como hoy.
4. **Given** un Revisor con 3 de 5 asignaciones activas, **When** consulta «Mi desempeño» o su tarjeta del panel, **Then** ve «3/5» con el nombre accesible «3 de 5» y una barra al 60 %.
5. **Given** un Revisor con 5 de 5 asignaciones activas, **When** consulta su desempeño, **Then** la barra queda llena en tono de advertencia junto al texto «Cupo completo».

### User Story 6 - Actuar sin fatiga de botones (Priority: P2)

Como persona que usa a diario los listados y detalles, quiero reconocer de inmediato la acción principal de cada pantalla y encontrar las secundarias sin que compitan con ella, para trabajar con menos esfuerzo y menos errores.

**Why this priority**: Reduce la carga visual que suman los temas y los indicadores nuevos. No elimina ninguna acción ni destino existente.

**Independent Test**: Recorrer cada vista del inventario de E2E y contar las acciones destacadas visibles a la vez. Usar los filtros, «Dar de baja» y los accesos secundarios con teclado y con ratón.

**Acceptance Scenarios**:

1. **Given** cualquier vista o tarjeta, **When** se muestra, **Then** tiene como máximo una acción primaria destacada visible a la vez. Las demás acciones se presentan como botones con borde, como acciones compactas o dentro de un panel plegable.
2. **Given** el detalle de un manuscrito activo, **When** el Autor busca «Dar de baja», **Then** la encuentra en «Más acciones», la abre con un clic o una tecla, confirma en el diálogo vigente y al cerrar el diálogo el foco vuelve al botón que lo abrió.
3. **Given** el listado de manuscritos, la auditoría o la búsqueda avanzada del catálogo, **When** no hay filtros aplicados, **Then** los filtros quedan plegados en un panel «Filtros». Con filtros aplicados o con un error de validación el panel se muestra abierto y su resumen indica cuántos filtros están activos.
4. **Given** el detalle de una asignación, **When** el Revisor lo abre, **Then** «Evaluar manuscrito» es la única acción primaria. Ver y descargar el documento son acciones secundarias y «Reportar posible fuga de identidad» es una acción compacta siempre visible.

### Edge Cases

- **Almacenamiento no disponible o valor inválido**. Si el navegador bloquea el almacenamiento local o guarda un valor distinto de `light` o `dark`, se usa la preferencia del sistema operativo y el botón sigue funcionando en la pestaña, sin errores ni avisos.
- **Cambio de preferencia del sistema con la aplicación abierta**. Sin elección guardada, la interfaz sigue el cambio al instante. Con elección guardada, la conserva.
- **Varias pestañas abiertas**. Al cambiar el tema en una pestaña, las demás del mismo navegador lo adoptan sin recargar.
- **Script de arranque no disponible**. Si `theme-init.js` no carga, la interfaz arranca en tema claro y Angular aplica la preferencia al iniciar. Nunca queda sin estilos ni bloqueada.
- **Movimiento reducido**. El cambio de tema no anima colores ni fondos. Las transiciones vigentes siguen desactivadas con `prefers-reduced-motion: reduce`.
- **Colores forzados del sistema**. Con `forced-colors: active` se respetan los colores del sistema. Las barras, el avatar y el indicador de etapas conservan un borde visible y su texto.
- **Iniciales**. Con un solo nombre se muestra una inicial. Las tildes y la eñe se conservan en mayúsculas («Á», «Ñ»). Sin nombre ni apellidos se muestra un icono genérico de persona. El avatar tiene tamaño fijo con cualquier longitud de nombre.
- **Pantallas estrechas**. A 320 px la cabecera reparte avatar, tema, campana y cierre de sesión en varias líneas sin desplazamiento horizontal. El texto «Mi cuenta» puede ocultarse visualmente, pero el nombre accesible se conserva.
- **Plazo con datos atípicos**. Si la fecha límite no es posterior a la de asignación, no se muestra la barra y se conservan el contador y las fechas. El cálculo usa la corrección del reloj del servidor vigente, de modo que un reloj local desajustado no altera la barra. Las asignaciones completadas no muestran barra.
- **Cupo atípico**. Un máximo ausente o inválido omite la barra, como hoy omite «/5». Un valor superior al máximo llena la barra sin desbordarla y conserva el texto real.
- **Diálogos desde paneles plegables**. Al cerrarse un diálogo abierto desde «Más acciones», el panel sigue abierto y el foco vuelve a su botón.
- **Filtros desde la URL**. Si la página se abre con filtros en la consulta, el panel «Filtros» se muestra abierto y con el conteo correcto.
- **Documento PDF en el visor**. El contenido del PDF conserva sus propios colores en ambos temas. Solo se tematizan el marco y las acciones del visor.

## Requirements *(mandatory)*

### Functional Requirements

#### Sistema de tema claro y oscuro

- **FR-001**. El tema claro DEBE usar `#F8FAFC` como fondo base del documento y del área de trabajo, `#FFFFFF` para tarjetas, diálogos, cabecera y barra lateral, y `#E2E8F0` para bordes de superficie y divisores. DEBE conservar el azul institucional `#1D4E89`, los tonos semánticos de 003 y el borde de controles `#64748B`.
- **FR-002**. El tema oscuro DEBE activarse con `data-theme="dark"` en el elemento `<html>`. DEBE usar `#0F172A` como fondo base, `#1E293B` para tarjetas, diálogos, cabecera y barra lateral, `#334155` para bordes y divisores y `#F1F5F9` para el texto principal. Las escalas semánticas DEBEN conservar el nombre y el rol de cada token, con tonos de primer plano claros y fondos oscuros. Cada tema DEBE declarar su `color-scheme` para que los controles nativos lo adopten.
- **FR-003**. Todos los colores DEBEN provenir de los tokens `--gpc-*` de `frontend/src/styles/_tokens.scss`. El texto y los iconos sobre rellenos de acción (botones primarios, de éxito y destructivos, contador de la campana, filtro activo y enlace de salto) DEBEN usar `--gpc-on-accent`. Ninguna hoja DEBE usar un color de superficie como color de texto, colores literales ni valores de respaldo de tokens inexistentes.
- **FR-004**. En ambos temas, el texto normal DEBE contrastar al menos 4.5:1 y el texto grande y los elementos no textuales necesarios (bordes de controles, anillo de foco, barras e indicadores de etapa) al menos 3:1, en reposo, al pasar el puntero, con foco, activos y con error. Las insignias de `ACCEPTED`, `CHANGES_REQUESTED`, `TIE_BREAKER` y `REJECTED` y los ajustes «+10» y «−20» DEBEN cumplir 4.5:1 y mostrarse siempre con texto.
- **FR-005**. El tema inicial DEBE resolverse así: la preferencia guardada en `localStorage` con la clave `gpc-theme` y el valor `light` o `dark`; si no existe o no es válida, `prefers-color-scheme: dark` selecciona el oscuro; en otro caso, el claro. La resolución DEBE ocurrir antes del primer pintado mediante `frontend/public/theme-init.js`, un script externo del mismo origen que `frontend/src/index.html` carga de forma síncrona en `<head>`. No DEBE existir ningún `<script>` en línea y la CSP `script-src 'self'` de Nginx no DEBE modificarse.
- **FR-006**. Un `ThemeService` DEBE ser la única fuente del tema dentro de la SPA. DEBE partir del atributo que fijó el script de arranque, aplicar y guardar la elección del botón, seguir los cambios de `prefers-color-scheme` mientras no exista una elección guardada, adoptar los cambios de otras pestañas del mismo navegador y tolerar sin errores un almacenamiento no disponible.
- **FR-007**. La cabecera interna DEBE ofrecer, junto a la campana de avisos, un botón nativo de tema con nombre accesible constante «Tema oscuro» y `aria-pressed` que refleja si el oscuro está activo. Su icono de sol o luna es decorativo. DEBE operarse por teclado, mostrar foco visible y medir al menos 40 × 40 px.

#### Cabecera y panel unificado

- **FR-008**. El botón «Mi cuenta» DEBE mostrar un avatar circular decorativo con las iniciales de la persona autenticada: la primera letra del nombre y la del primer apellido, en mayúsculas del español; con un solo dato, una letra; sin datos, un icono genérico. El botón DEBE conservar el nombre accesible «Mi cuenta» y su menú el nombre completo. Los roles activos DEBEN seguir como insignias informativas, sin selector ni conmutador de rol.
- **FR-009**. `KpiCardComponent` DEBE admitir un icono decorativo opcional por métrica. La tarjeta del Administrador DEBE mostrar «Reportes abiertos» con el icono de incidentes y «Manuscritos esperando revisores» con un icono de espera. DEBE ofrecer un acceso principal a Incidentes y accesos compactos a Revisores, Carreras y Auditoría, con los mismos destinos y el mismo orden de 004. Se conservan las reglas de cero, dato ausente y estado vacío de 003.
- **FR-010**. Una métrica con máximo válido DEBE mostrar, además de «X/Y» con nombre accesible «X de Y», una barra decorativa proporcional. Con el valor igual o superior al máximo, la barra DEBE usar el tono de advertencia junto al texto visible «Cupo completo». Aplica a la tarjeta del Revisor del panel y a «Mi desempeño».

#### Progreso del manuscrito (Autor)

- **FR-011**. El detalle del manuscrito DEBE mostrar un indicador de progreso del ciclo editorial con cuatro etapas: Borrador, Enviado, En revisión y Decisión, según la tabla de etapas. DEBE ser una lista ordenada con nombre accesible, `aria-current="step"` en la etapa actual y un texto para cada etapa que indique si está completada, es la actual o está pendiente, además del color y del icono. No DEBE mostrar datos de los revisores, dictámenes individuales ni puntajes.

#### Plazo y cupo (Revisor)

- **FR-012**. Una asignación activa DEBE mostrar una barra del plazo restante, calculada entre `assigned_at` y `due_at` con el reloj corregido del servidor que ya usa el contador. La barra DEBE exponer `role="meter"`, el nombre «Plazo restante» y un valor textual «Queda el N % del plazo» redondeado a entero. Usa el tono neutro, el de advertencia por debajo de 24 horas y el de peligro al vencer. El contador, el aviso de vencimiento y el bloqueo de la evaluación no cambian.
- **FR-013**. El detalle de la asignación DEBE agrupar al inicio una tarjeta de plazo, con la barra, el tiempo restante, la fecha de asignación y la fecha límite, junto a la nota del doble ciego. Los datos del manuscrito y del documento conservan su contenido.
- **FR-014**. «Mi desempeño» DEBE mostrar el cupo con la barra de FR-010 en su tarjeta «Ranking y cupo». El historial de ajustes conserva su tabla, sus insignias con texto y su paginación.

#### Acciones y filtros

- **FR-015**. Cada vista y cada tarjeta DEBE tener como máximo una acción primaria destacada visible a la vez. Cuentan como destacadas las acciones con relleno de color: primaria, de éxito o destructiva. Las demás DEBEN presentarse con borde (`.btn--ghost`), como acción compacta (`.btn--subtle`) o dentro de un panel plegable. Los diálogos y el contenido de un panel «Más acciones» que la persona abrió son contextos propios y conservan su acción, incluido el relleno rojo de las acciones destructivas que exige la constitución.
- **FR-016**. Las acciones destructivas poco frecuentes de un detalle, como «Dar de baja», DEBEN agruparse en un panel plegable «Más acciones» (`<details class="disclosure">`), operable por teclado. Su diálogo de confirmación no cambia y al cerrarse DEBE devolver el foco al botón que lo abrió.
- **FR-017**. Los filtros extensos del listado de manuscritos, de la auditoría y de la búsqueda avanzada del catálogo DEBEN agruparse en un panel plegable «Filtros» cuyo resumen indique cuántos filtros están activos. El panel DEBE abrirse solo cuando haya filtros aplicados, incluidos los que llegan por la URL, o un error de validación. El campo de búsqueda principal del catálogo DEBE seguir visible. Se conservan la sincronización con la URL, el orden, la paginación y la limpieza de filtros.
- **FR-018**. Las acciones repetidas en cada fila de una tabla o en cada elemento de una lista, como renombrar, activar o desactivar una carrera, editar un revisor del padrón o quitar un autor del formulario, DEBEN ser acciones compactas. La destructiva conserva el tono de peligro en su texto y su confirmación vigente. Las tres resoluciones de cada reporte de incidente DEBEN presentarse como botones con borde de igual peso, las destructivas con texto en tono de peligro, porque ninguna es la recomendada. El diálogo de confirmación de cada resolución conserva su relleno rojo.

#### Alcance y preservación

- **FR-019**. La funcionalidad DEBE limitarse a la presentación. Se conservan la API, los servicios, los guards, las rutas, las validaciones, los estados editoriales, el doble ciego en DOM y árbol accesible, la navegación sin selector de rol y los textos y destinos de todas las acciones. El inicio de sesión y los correos no cambian de comportamiento ni de estructura: solo reciben los tokens de color.

### Tabla de etapas del ciclo editorial

| Estado del manuscrito | Borrador | Enviado | En revisión | Decisión |
| --- | --- | --- | --- | --- |
| `DRAFT` | Actual | Pendiente | Pendiente | Pendiente |
| `SUBMITTED` | Completada | Actual («En espera de revisores») | Pendiente | Pendiente |
| `UNDER_REVIEW` | Completada | Completada | Actual | Pendiente |
| `TIE_BREAKER` | Completada | Completada | Actual («En desempate») | Pendiente |
| `CHANGES_REQUESTED` | Completada | Completada | Completada | Actual («Cambios solicitados», advertencia) |
| `ACCEPTED` | Completada | Completada | Completada | Completada («Aceptado», éxito) |
| `REJECTED` | Completada | Completada | Completada | Completada («Rechazado», peligro) |
| Dado de baja (`is_active = false`) | Según su estado | Según su estado | Según su estado | La etapa alcanzada se rotula «Dado de baja», en tono neutro |

### Reglas vigentes que se sustituyen

| Regla de 003 | Regla de esta funcionalidad |
| --- | --- |
| FR-003. Área de trabajo `#f1f5f9` con tarjetas blancas. | Fondo base y área de trabajo `#F8FAFC` con tarjetas `#FFFFFF` en claro (FR-001), y `#0F172A` con tarjetas `#1E293B` en oscuro (FR-002). |
| FR-002. Barra lateral con fondo `#ffffff` o `#f8fafc`. | Barra lateral `#FFFFFF` en claro y `#1E293B` en oscuro, con divisor del token de borde. |
| FR-011 y plan de 003. Un único bloque `:root` de tokens. | `:root` define el tema claro y `:root[data-theme='dark']` redefine solo los colores. Tipografía, espaciado, radios y geometría siguen en un único lugar. |
| FR-005. Accesos directos de la tarjeta como botones. | Un acceso principal por tarjeta y los demás como accesos compactos, con los mismos destinos (FR-009 y FR-015). |

### Key Entities

- **Preferencia de tema**. Valor `light` o `dark` guardado por navegador en `localStorage` con la clave `gpc-theme`. No pertenece a la cuenta, no se envía al servidor y su ausencia significa seguir al sistema operativo.
- **Tokens de tema**. Variables `--gpc-*` con el mismo nombre y rol en ambos temas, incluido `--gpc-on-accent` para el contenido sobre rellenos de acción.
- **Etapa del ciclo editorial**. Derivada en la SPA del estado y de `is_active` del manuscrito según la tabla de etapas. No se almacena.
- **Plazo de una asignación**. Intervalo entre `assigned_at` y `due_at` que ya entrega la API del Revisor, corregido con la diferencia de reloj del servidor.
- **Cupo del Revisor**. Asignaciones activas sobre el máximo de cinco que ya entrega la sección del panel y `GET /reviewer/standing/`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**. axe-core con las etiquetas WCAG 2.x A/AA, contraste incluido, reporta cero infracciones en el 100 % de las pantallas y diálogos del inventario de `frontend/e2e/05-accesibilidad.e2e.ts`, tanto en tema claro como en tema oscuro.
- **SC-002**. El 100 % de los pares de color inventariados cumple 4.5:1 en texto y 3:1 en elementos no textuales en ambos temas, incluidas las cuatro insignias de estado de FR-004 y los ajustes «+10» y «−20». Los ratios quedan registrados por tema en `tasks.md`.
- **SC-003**. En el 100 % de las cargas de prueba con preferencia guardada, con preferencia del sistema y sin ninguna, el atributo `data-theme` correcto existe antes de que se ejecute el paquete de Angular, sin destello del otro tema. La elección persiste tras recargar y en una pestaña nueva.
- **SC-004**. A 320, 768, 1024, 1366 y 1920 px, la cabecera con avatar, botón de tema, campana y cierre de sesión, el indicador de etapas, las barras y los paneles plegables no provocan desplazamiento horizontal ni controles tapados, y todos los controles se alcanzan con Tab y muestran foco visible.
- **SC-005**. El indicador de etapas es correcto en los siete estados y en el caso dado de baja. La barra de plazo es correcta al inicio, a la mitad, con menos de 24 horas y vencida. La barra de cupo es correcta con 0, 3 y 5 de 5. Las pruebas unitarias lo verifican.
- **SC-006**. Cero vistas o tarjetas del inventario presentan más de una acción destacada visible a la vez y ninguna acción ni destino existente desaparece.
- **SC-007**. El 100 % de las pruebas unitarias y de los flujos E2E vigentes pasa, con ajustes solo para abrir los paneles plegables. Se detectan cero exposiciones de identidad en `frontend/e2e/04-fuga-de-identidad.e2e.ts`. El build de producción no contiene `<script>` en línea en `index.html` y cumple los presupuestos de `frontend/angular.json`.

## Assumptions

- La constitución, la especificación funcional vigente y las funcionalidades 003 y 004 siguen siendo la referencia, salvo las reglas que sustituye esta funcionalidad. Se mantiene la semántica visual institucional: verde para éxito, amarillo para advertencia, rojo para acciones destructivas y azul o gris para acciones neutras. [Constitución](../../.spec-kit/constitution.md) · [Rediseño 003](../003-ui-ux-overhaul/spec.md) · [Funcionalidad 004](../004-auto-assign-ranking-rubric/spec.md).
- La preferencia de tema es del navegador, no de la cuenta, y no requiere cambios en el backend ni en la base de datos.
- El botón de tema solo existe en la cabecera interna. Las páginas públicas y el inicio de sesión aplican la preferencia guardada o la del sistema operativo, sin botón propio. Agregarlo a la cabecera pública queda fuera de alcance.
- El nivel exigido es WCAG 2.1 AA. La suite de axe conserva sus etiquetas vigentes, que incluyen WCAG 2.2 AA.
- No se incorporan dependencias, fuentes ni librerías de iconos. Los iconos nuevos se agregan al sprite `frontend/public/icons/ui.svg`.
- Las iniciales se calculan con los campos `first_name` y `last_name` de la sesión vigente, que ya conoce la SPA, sin nuevos datos de la API.
- Quedan fuera de alcance los temas adicionales o personalizables, la preferencia sincronizada entre dispositivos, el tema de los correos y los cambios en el flujo de inicio de sesión.
