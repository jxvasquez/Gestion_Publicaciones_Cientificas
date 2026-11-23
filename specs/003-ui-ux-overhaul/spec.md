# Feature Specification: Rediseño integral de la interfaz y experiencia de usuario

**Feature Branch**: `003-ui-ux-overhaul` (nombre de referencia)

**Created**: 2026-11-23

**Status**: Draft

**Input**: Rediseñar todas las vistas del frontend Angular con una estructura de navegación renovada, un panel unificado con tarjetas de métricas, un catálogo público legible, componentes de gestión coherentes y un sistema de diseño común. Preservar la lógica de negocio, los servicios, los guards, las llamadas a la API, la navegación sin selector de rol y el aislamiento doble ciego. Cumplir el contraste WCAG AA.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Orientarse y navegar con una sola sesión (Priority: P1)

Como persona autenticada, quiero identificar mi ubicación, acceder a todos mis módulos, consultar mis avisos y cerrar sesión desde una estructura común.

**Why this priority**: La navegación y las acciones de sesión se usan en todos los recorridos internos y deben conservar la visibilidad simultánea de los roles autorizados.

**Independent Test**: Iniciar sesión con una cuenta Autor–Revisor, recorrer ambos módulos y usar la cabecera en escritorio y en una pantalla estrecha.

**Acceptance Scenarios**:

1. **Given** una cuenta con roles Autor y Revisor, **When** inicia sesión o navega entre sus módulos, **Then** ambos grupos de enlaces siguen disponibles, la ruta actual queda identificada y no aparece ningún selector ni conmutador de rol.
2. **Given** una persona con nombre largo y avisos sin leer, **When** usa la cabecera, **Then** puede leer su nombre completo en el menú, identificar sus roles como etiquetas informativas, abrir sus propios avisos desde la campana y cerrar sesión con el flujo vigente.
3. **Given** una sesión sin permiso para un módulo, **When** se intenta abrir su ruta directamente, **Then** se mantiene la denegación vigente. Todas las rutas autorizadas siguen siendo alcanzables con teclado y en pantalla estrecha.

### User Story 2 - Priorizar el trabajo desde el panel unificado (Priority: P1)

Como Autor, Revisor, Editor o Administrador, quiero reconocer mi carga de trabajo y acceder a los módulos que tengo habilitados desde el mismo panel.

**Why this priority**: El panel es el punto de entrada a las tareas de cada rol y debe distinguir la falta de datos de un conteo real de cero.

**Independent Test**: Abrir el panel con cuentas de un rol y multirrol, y comprobar respuestas con métricas de prueba, secciones vacías y fallos parciales.

**Acceptance Scenarios**:

1. **Given** una cuenta con varios roles y secciones habilitadas, **When** se carga el panel, **Then** aparecen juntas sus tarjetas, cada una con la cabecera e icono de su rol, los conteos disponibles y accesos a sus destinos existentes.
2. **Given** una respuesta del panel con una sección sin métricas, otra con un conteo real de cero y otra fallida, **When** se presentan los resultados, **Then** cada tarjeta distingue esos estados, las secciones sanas siguen disponibles y la fallida ofrece el reintento vigente.
3. **Given** una cuenta sin roles habilitados, **When** se abre el panel, **Then** aparece el estado informativo correspondiente y no se ofrecen tarjetas ni accesos de módulos internos.

### User Story 3 - Buscar y leer publicaciones como visitante (Priority: P1)

Como visitante, quiero filtrar y explorar el catálogo público para encontrar publicaciones y acceder a su ficha sin iniciar sesión.

**Why this priority**: El catálogo es el recorrido público principal y el rediseño debe preservar sus criterios de publicación y búsqueda.

**Independent Test**: Aplicar filtros combinados, navegar entre páginas y abrir una ficha en una sesión anónima desde escritorio y móvil.

**Acceptance Scenarios**:

1. **Given** el catálogo público, **When** se combinan filtros y se ordenan o paginan los resultados, **Then** los campos conservan etiquetas legibles, los resultados corresponden a los criterios vigentes y la consulta puede recuperarse desde su URL.
2. **Given** un artículo aceptado y vigente, **When** aparece en los resultados, **Then** su tarjeta distingue título, área temática, idioma y demás metadatos públicos disponibles, y permite abrir la ficha y acceder al PDF según el flujo vigente.
3. **Given** una búsqueda sin coincidencias, **When** finaliza la consulta, **Then** aparece un estado vacío ilustrado con un mensaje acorde y la acción existente para limpiar filtros. Si la consulta está cargando o falla, se muestra el estado correspondiente.

### User Story 4 - Gestionar manuscritos y consultas con controles coherentes (Priority: P1)

Como participante del flujo editorial, quiero leer estados, completar formularios y confirmar acciones con claridad, manteniendo la confidencialidad que corresponde a cada vista.

**Why this priority**: Las pantallas de gestión concentran las acciones editoriales y el rediseño debe preservar su efecto y el doble ciego.

**Independent Test**: Recorrer listados, detalles, formularios y diálogos con cuentas de los cuatro roles. Comparar resultados funcionales con la versión anterior y comprobar las vistas opuestas de un mismo manuscrito.

**Acceptance Scenarios**:

1. **Given** un listado de gestión con filas, **When** se consulta con puntero o teclado, **Then** sus cabeceras, badges de estado y acciones por fila se identifican con claridad y conservan sus filtros y acciones autorizadas.
2. **Given** una acción con diálogo vigente, **When** se abre con teclado, se cancela o se confirma, **Then** el foco se mantiene en el diálogo mientras está abierto y vuelve al control de origen o a un destino lógico al cerrarse. Se conservan las validaciones y el resultado de la acción.
3. **Given** un manuscrito propio del Autor y asignado a otra cuenta como Revisor, incluidas cuentas que tengan otros roles, **When** cada persona consulta el detalle, el PDF autorizado, el historial y los avisos desde su módulo, **Then** el Revisor no recibe la identidad, correo ni filiación del Autor y el Autor no recibe la identidad del Revisor.

### User Story 5 - Usar una interfaz coherente y accesible en todas las vistas (Priority: P2)

Como persona que usa teclado, amplía el texto o navega en una pantalla estrecha, quiero reconocer los mismos controles y operar los recorridos públicos e internos.

**Why this priority**: Un sistema visual compartido reduce la variación entre módulos. El contraste AA y el acceso por teclado se aplican a todas las historias.

**Independent Test**: Revisar desde el inicio de sesión y el catálogo hasta notificaciones, gestión y páginas de error, con teclado, diferentes tamaños de pantalla y verificación de contraste.

**Acceptance Scenarios**:

1. **Given** vistas públicas e internas, **When** se comparan componentes con la misma función, **Then** comparten jerarquía tipográfica y estilos de controles, superficies, estados y foco.
2. **Given** una pantalla estrecha o texto ampliado, **When** se recorren un formulario, una tabla y un diálogo, **Then** siguen disponibles sus etiquetas, mensajes y acciones, sin desplazamiento horizontal de toda la página.
3. **Given** un control, un badge semántico o un enlace activo, **When** se comprueba en sus estados interactivos, **Then** cumple el contraste aplicable, se distingue por señales adicionales al color y su función se entiende con tecnologías de asistencia.

### Edge Cases

- **Nombre largo y varios roles**. El menú de usuario permite leer el nombre íntegro sin puntos suspensivos y las etiquetas pueden distribuirse en varias líneas sin ocultar controles.
- **Avisos sin leer**. Con cero avisos se conserva el acceso a la bandeja sin badge numérico. Por encima de 99 se conserva la convención visual `99+` y el nombre accesible comunica el conteo exacto.
- **Carga, vacío y error**. Una consulta en curso o fallida no se presenta como lista vacía. Un conteo ausente no se presenta como cero. Un fallo parcial del panel no suprime las secciones sanas.
- **Contenido largo y tablas anchas**. Títulos, metadatos y errores admiten ajuste de línea. Si una tabla necesita desplazamiento horizontal para preservar su estructura, este se limita al área de la tabla y permite alcanzar sus acciones con teclado.
- **Campos públicos opcionales**. La tarjeta omite los metadatos ausentes. Un manuscrito no aceptado o dado de baja sigue fuera del catálogo y conserva la respuesta vigente si se intenta abrir directamente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**. El rediseño DEBE abarcar inicio de sesión, catálogo y ficha pública, panel y avisos, las vistas de Autor, Revisor, Editor y Administrador, páginas de acceso denegado y página no encontrada. Incluye formularios, listados, detalles, diálogos, visor PDF, historial, paginación y estados compartidos.
- **FR-002**. En escritorio, el área autenticada DEBE tener una barra lateral izquierda fija de `260px`, con fondo `#ffffff` o `#f8fafc` y divisor derecho `1px solid #e2e8f0`. Cada enlace DEBE combinar texto e icono SVG minimalista. La ruta activa DEBE tener un indicador lateral de acento, un estado actual reconocible por tecnologías de asistencia y una transición suave que respete la preferencia de movimiento reducido.
- **FR-003**. La cabecera interna DEBE tener una altura base de `64px` en escritorio y una separación visual clara del área de trabajo. DEBE mostrar etiquetas informativas tipo pill para los roles, una campana con el contador vigente de avisos propios sin leer, un menú que permita leer el nombre completo y un botón de cierre de sesión con icono. El área de trabajo DEBE usar fondo `#f1f5f9` con tarjetas blancas, sombras sutiles mediante `box-shadow` y radios de `8px` o `12px`.
- **FR-004**. La navegación y el panel DEBEN presentar simultáneamente los módulos habilitados por los roles activos y mantener los permisos por ruta, acción y documento. Debe haber cero selectores, conmutadores o pantallas de elección de rol antes o después de iniciar sesión. Las etiquetas de rol son informativas.
- **FR-005**. El panel DEBE mostrar una tarjeta KPI por sección habilitada con título, icono temático, badges para los conteos disponibles y accesos directos autorizados. Los accesos DEBEN llevar a destinos existentes, como Mis manuscritos, Mis asignaciones, Nuevos envíos o Auditoría. Las tarjetas DEBEN usar exclusivamente datos ya disponibles en la carga vigente del panel, distinguir cero de dato ausente y usar un estado informativo ilustrado cuando falten métricas. Se conservan el estado sin roles y los reintentos vigentes.
- **FR-006**. La búsqueda pública DEBE usar una cuadrícula CSS alineada y responsiva, iconos dentro de los campos de búsqueda pertinentes, etiquetas persistentes y acciones con jerarquía visual clara. Se DEBEN conservar búsqueda de texto, área, palabra clave, idioma, intervalo de fechas, orden, paginación y sincronización de la consulta con la URL.
- **FR-007**. Las tarjetas del catálogo DEBEN dar jerarquía editorial al título y separar visualmente el resumen y los metadatos públicos disponibles, con badges para área temática e idioma. El catálogo y la ficha DEBEN seguir siendo públicos y mostrar únicamente artículos aceptados y vigentes, con el mismo acceso al PDF público y sin exponer información interna.
- **FR-008**. Las tablas de gestión DEBEN conservar sus datos, encabezados semánticos, filtros, orden, paginación y acciones donde existan. DEBEN presentar cabeceras destacadas, resaltado de fila al pasar el puntero y al enfocar controles, acciones alineadas y badges con texto de estado. La semántica institucional DEBE usar verde para éxito o guardado, amarillo para advertencia, rojo para rechazo, error o acción destructiva, y azul o gris para estados o acciones neutros.
- **FR-009**. Los diálogos y formularios DEBEN compartir estilos de títulos, etiquetas, validaciones y acciones primarias, secundarias o destructivas. Cada diálogo DEBE poder operarse por teclado, tener nombre accesible y gestionar el foco de entrada, permanencia y retorno. Se DEBEN conservar las reglas de confirmación, cancelación y aviso por cambios sin guardar.
- **FR-010**. Los listados, el catálogo y las secciones de panel sin datos DEBEN usar un componente reutilizable de estado vacío con ilustración, mensaje contextual y una acción cuando exista un destino autorizado y pertinente. La ilustración decorativa DEBE quedar fuera de la lectura asistida. Las cargas y errores DEBEN seguir siendo estados diferenciados con sus acciones vigentes.
- **FR-011**. El sistema de diseño DEBE centralizar en variables CSS globales de `:root` los colores institucionales y semánticos, la escala tipográfica, los espaciados, los radios y las sombras. Las vistas públicas e internas DEBEN compartir estos valores y patrones de presentación, con los recursos del proyecto y sin incorporar librerías externas pesadas de interfaz o iconografía.
- **FR-012**. La interfaz DEBE cumplir el contraste WCAG 2.2 AA aplicable, con un mínimo de `4.5:1` para texto normal, `3:1` para texto grande y `3:1` frente a colores adyacentes para los elementos no textuales necesarios para identificar controles y estados. Se DEBEN ofrecer foco visible, etiquetas accesibles y señales adicionales al color. [WCAG 2.2, contraste de texto](https://www.w3.org/TR/WCAG22/#contrast-minimum) · [WCAG 2.2, contraste no textual](https://www.w3.org/TR/WCAG22/#non-text-contrast).
- **FR-013**. La interfaz DEBE adaptarse a móvil, tableta y escritorio. En anchos donde la barra fija impediría usar el contenido, la navegación DEBE seguir disponible mediante un control accesible. A `320px` de ancho de ventana, los controles y mensajes DEBEN conservarse sin desplazamiento horizontal de página, con desplazamiento local para contenido intrínsecamente bidimensional como tablas.
- **FR-014**. El rediseño DEBE limitarse a la presentación y sus interacciones visuales. Se DEBEN preservar la lógica de negocio, los servicios, los guards, las rutas existentes y la secuencia y los contratos de las llamadas a la API. Se mantienen las validaciones de PDF, los estados y transiciones editoriales, los plazos, el versionado e historial inmutables, la baja lógica y la auditoría.
- **FR-015**. La presentación DEBE preservar el doble ciego en listados, detalles, formularios, avisos, diálogos, historial y acceso al PDF autorizado. Los datos de identidad restringidos DEBEN quedar fuera del contenido visible, del contenido accesible y del DOM de la vista. Se preserva la exclusión de nombres, correos y filiación del Autor en las respuestas de revisión, así como la restricción de identidad del Revisor ante el Autor. Cada vista mantiene su ámbito autorizado con cuentas multirrol, incluidas las vistas de Editor o Administrador.

### Key Entities

- **Usuario y roles activos**. Determinan qué navegación y secciones del panel están disponibles, según los permisos vigentes.
- **Sección del panel**. Resumen de un rol con datos, conteos cuando existan, estado de disponibilidad y destinos autorizados.
- **Artículo público**. Publicación aceptada y vigente con una ficha, metadatos autorizados y acceso al PDF público.
- **Manuscrito y registros de gestión**. Envíos, asignaciones, evaluaciones, incidentes, versiones y eventos de auditoría, cada uno con el estado, acciones y visibilidad que le corresponden.
- **Aviso**. Notificación propia cuyo estado de lectura contribuye al contador vigente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**. En el 100 % de las cuentas de prueba de un rol y multirrol, la navegación y el panel muestran los módulos habilitados y omiten los demás, sin solicitar selección de rol. Con cero roles se presenta el estado informativo. Los nombres largos de prueba son legibles íntegramente y la campana comunica el conteo exacto de avisos propios sin leer a tecnologías de asistencia y aplica la convención visual indicada.
- **SC-002**. El 100 % de las tarjetas de prueba con conteo disponible, cero real, dato ausente o error parcial presentan el estado correcto y los accesos autorizados previstos para ese estado. Las secciones sanas permanecen disponibles ante un fallo parcial.
- **SC-003**. El 100 % de las consultas públicas de referencia devuelve los mismos resultados, orden y páginas que antes del rediseño. Las fichas de prueba conservan su visibilidad y solo se muestran artículos aceptados y vigentes.
- **SC-004**. El 100 % de los escenarios de regresión de autenticación, avisos, registro, evaluación, edición, veredicto, baja lógica y auditoría conserva los resultados y restricciones previos. Se detectan cero exposiciones de identidades restringidas al recorrer las vistas y avisos de Autor y Revisor, incluso con cuentas multirrol.
- **SC-005**. El 100 % de las combinaciones de contraste aplicables en las vistas y estados inventariados cumple WCAG AA. En ventanas de `320px`, `768px` y `1366px` se completan con teclado la navegación, una búsqueda pública y la apertura y cierre de diálogos, sin controles inaccesibles ni desplazamiento horizontal de página.
- **SC-006**. El 100 % de las vistas y componentes compartidos del inventario usa el sistema visual común. Cada listado sin datos y cada búsqueda sin coincidencias presenta un estado ilustrado distinguible de carga y error.

## Assumptions

- La constitución y la especificación funcional vigente son la referencia para la semántica visual, el acceso multirrol y el doble ciego. El alcance es el frontend Angular existente y sus rutas actuales. [Constitución](../../.spec-kit/constitution.md) · [Especificación funcional, reglas RN-02, RN-06, RN-14 y RN-16](../../.spec-kit/specify.md#6-reglas-de-negocio).
- Los proveedores actuales del panel entregan secciones sin métricas para los cuatro roles. Las tarjetas mostrarán accesos y un estado de datos no disponibles con esa respuesta. Incorporar nuevas fuentes de conteos requeriría ampliar el alcance acordado. [Composición vigente del panel](../../backend/apps/users/services/dashboard.py).
- En pantallas estrechas se asume una navegación plegable, manteniendo la barra fija de `260px` y la cabecera de `64px` como referencias de escritorio. La tipografía concreta, los puntos de quiebre y la selección de iconos e ilustraciones se definen en la planificación dentro de los requisitos visuales.
