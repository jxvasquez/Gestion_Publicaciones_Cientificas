# Dossier Técnico Grupal y Cierre del Proyecto

**Sistema de Gestión de Publicaciones Científicas — UNL**

| Campo | Valor |
|---|---|
| Universidad | Universidad Nacional de Loja |
| Facultad | Facultad de la Energía, las Industrias y los Recursos Naturales No Renovables |
| Carrera | Computación |
| Asignatura | Desarrollo Basado en Plataformas |
| Docente | Edison Leonardo Coronel Romero |
| Repositorio | `https://github.com/RichardC022/Gestion_Publicaciones_Cientificas` |
| Rama verificada | `dev/richard-setup` (integra `origin/main`; el portal Quarto y los ADR están en `origin/dev/ismael-setup`, aún sin fusionar) |
| Commit verificado | `4ea4de1` (`4ea4de170f600574b86440c95142639babf8413a`, merge de `origin/main`) |
| Fecha de verificación | 2026-11-06 |
| Alcance | Backend Django/DRF, frontend Angular, PostgreSQL 16, Nginx 1.27, Docker Compose, CI, artefactos SDD, pruebas, OpenAPI/Swagger y documentación |

> **Cómo leer las capturas.** Cada punto indica, cuando corresponde, una marca `[CAPTURA Px-xx]` con la pantalla o evidencia exacta que debe fotografiarse. Las capturas deben ocultar contraseñas, tokens, cookies y datos personales reales. Al final se incluye un **Anexo A** con la lista consolidada.

---

## Resumen ejecutivo de verificación

| Verificación | Resultado | Evidencia |
|---|---|---|
| Backend `pytest` | **1690 aprobadas, 11 omitidas, 0 fallos** (18:17) | Corrida del 2026-11-06 contra PostgreSQL 16 en `proyecto_gpc_backend_net` |
| Django system check | **0 incidencias** | `python manage.py check` |
| Frontend unit tests | **1308 pruebas aprobadas / 75 archivos spec** | `npx ng test --watch=false` en `node:22-alpine` |
| Build de producción Angular | **Correcto**, sin `sourceMap` en producción | `ng build --configuration production` + `scripts/check_frontend_build.py` |
| OpenAPI runtime | **44 rutas, 5590 líneas, validado sin advertencias** | `manage.py spectacular --validate --fail-on-warn` |
| Swagger UI | **Disponible en desarrollo**; `/api/v1/docs/`, `/api/v1/schema/`, `/api/health/` y `/api/v1/` responden `200` | `API_DOCS_ENABLED=1`; `drf-spectacular` |
| Docker Compose | **Configuración válida** | `docker compose config --quiet` |
| Runbook | **Validación estática correcta** | `scripts/check_runbook.py` |
| Aislamiento de medios | **Correcto según corrida previa**; no re-ejecutado hoy | `scripts/smoke_media_isolation.sh` |
| E2E Playwright | **No re-ejecutado en esta corrida**; 7 archivos con 26 bloques estáticos que se expanden por parametrización | `frontend/e2e/*.e2e.ts`; el histórico documenta 34 casos |
| Cobertura | **98 % documentada** en `.spec-kit/compliance.md` y `.spec-kit/HANDOFF.md`; no recalculada en esta corrida | `backend/.coveragerc`, CI con umbral 80 % |
| Portal Quarto / ADR | **Existen en `origin/dev/ismael-setup`**, ausentes en `dev/richard-setup`; `check_docs_site.py` falla en HEAD por falta de `_quarto.yml` | `git ls-tree origin/dev/ismael-setup docs-site/` |

**Conclusión de funcionamiento:** el sistema levanta y responde; las suites de backend y frontend pasan; el build de producción es correcto; Compose y runbook se validan; OpenAPI y Swagger UI funcionan en desarrollo. Los riesgos abiertos son operativos y de integración documental, no fallos del flujo editorial principal: certificado institucional, respaldo cifrado externo, YAML histórico, contadores del panel, portal Quarto/ADR sin fusionar y `conftest.py` ausente en la imagen de pruebas.

---

## 1. Distribución de Responsabilidades del Equipo

### 1.1 Criterio de asignación

La asignación combina el rol declarado en `dossier/dossier_requisitos.md` con la huella observable en Git (`git shortlog -sne --all` y commits por ruta). No se inventan contribuciones: cuando el repositorio no permite atribuir una tarea con precisión, se indica.

### 1.2 Tabla de responsabilidades

| Integrante | Rol en el equipo | Componentes clave | Contribución técnica observable en el repositorio | Evidencia principal |
|---|---|---|---|---|
| **Jostin Vasquez** (`xDylok`) | Coordinador / líder técnico | Arquitectura, API/OpenAPI, seguridad, pruebas, despliegue, integración backend-frontend | 165 commits. Implementación mayoritaria del backend Django/DRF, modelos, servicios, permisos, auditoría, notificaciones, seguridad, scripts de verificación, Nginx y CI. También frontend e integración. | `git shortlog -sne --all`; `backend/apps/`; `backend/config/`; `nginx/`; `scripts/`; `.github/workflows/ci.yml` |
| **Richard Cajas** (`Richard22`, `Richard`, `Richard Cajas`) | Repositorio y configuración | Repositorio, Compose, entorno, CI/CD, documentación de operación | 68 commits sumando tres identidades (`Richard22` 31, `Richard Cajas` 23, `Richard` 14). Configuración de repositorio, Compose, variables de entorno, README, runbook, apoyo en infraestructura y merges. | `docker-compose*.yml`; `.env.example`; `README.md`; `docs/RUNBOOK.md`; merges de ramas |
| **Gyna Yupanqui** (`gyna-22`) | Diseño y vistas | Frontend Angular, estilos, accesibilidad, responsive | 19 commits. Aportes en frontend, configuración, estilos, scripts de verificación y pruebas de revisor; la mayor parte del frontend fue integrada por el coordinador. | `frontend/src/`; `frontend/src/styles.scss`; `scripts/verify/`; `scripts/load/` |
| **Miguel Veintimilla** (`migdev11`, `Miguel Veintimilla`) | Base de datos y pruebas | Especificaciones, modelo de datos, PostgreSQL, pruebas | 30 commits sumando dos identidades (`migdev11` 19, `Miguel Veintimilla` 11). Aportes en `specs/`, Compose, settings, requirements y documentación de base de datos/pruebas. | `specs/`; `backend/config/settings/`; `backend/requirements/`; `docker-compose.yml` |
| **Ismael González** (`IsmaelGonz`) | Documentación SDD | Portal de documentación, ADR, guías por rol, documentación técnica y trazabilidad | 5 commits. Autor del portal Quarto y de los 7 ADR en `origin/dev/ismael-setup` (26 archivos bajo `docs-site/`), aún no fusionados en `dev/richard-setup`. | `docs-site/index.qmd`; `docs-site/_quarto.yml`; `docs-site/ingenieria/adr/`; `docs-site/usuarios/` (rama remota) |

### 1.3 Distribución por componente

| Componente | Responsable principal | Corresponsables | Estado de atribución |
|---|---|---|---|
| Artefactos SDD (`constitution`, `specify`, `plan`, `tasks`, `compliance`) | Ismael González | Jostin Vasquez | Compartida; Git concentra la mayoría en `xDylok` |
| Trazabilidad HU/RF/CA | Ismael González | Jostin Vasquez | Compartida |
| Arquitectura backend y modelo de datos | Jostin Vasquez | Miguel Veintimilla | Clara en Git |
| API/OpenAPI | Jostin Vasquez | Miguel Veintimilla | API implementada; OpenAPI histórico desactualizado |
| Seguridad y doble ciego | Jostin Vasquez | Richard Cajas | Clara en Git y pruebas |
| Pruebas backend/frontend/E2E | Jostin Vasquez | Miguel Veintimilla, Gyna Yupanqui | Clara en Git |
| Despliegue, Nginx, Compose y CI | Richard Cajas | Jostin Vasquez | Compartida |
| Documentación técnica y runbook | Richard Cajas | Jostin Vasquez, Ismael González | Compartida |
| Reflexión de estándares web | Ismael González | Jostin Vasquez | Documental; se consolida en este dossier |

> **Nota de transparencia:** la atribución por Git es una aproximación. El historial muestra una concentración fuerte en `xDylok` (165 commits) y una identidad fragmentada en Richard Cajas, por lo que la evaluación grupal debe complementarse con la defensa oral y la evidencia de ramas `dev/<integrante>-setup`. La documentación de Ismael González está íntegra en `origin/dev/ismael-setup`; ese trabajo no aparece en el árbol de `dev/richard-setup` porque la rama aún no se fusionó.

**[CAPTURA P1-01]** Capturar la salida de `git shortlog -sne --all` o la gráfica de contribuyentes de GitHub, mostrando nombres y número de commits. No es necesario mostrar correos completos.

---

## 2. Revisión de Artefactos SDD del Proyecto

### 2.1 Inventario auditado

| Documento / artefacto | Ruta real | Estado | Qué representa hoy | Veredicto |
|---|---|---|---|---|
| Constitución | `.spec-kit/constitution.md` | Vigente | Reglas de arquitectura, stack, idioma, UI, doble ciego, archivos y versionado | **Coherente**, con observaciones menores de idioma en docstrings |
| Mapa de features | `.spec-kit/feature-map.md` | **No existe** | No hay archivo con ese nombre | **Ausente**; el mapa funcional está en `.spec-kit/specify.md` §9 y en `specs/*/spec.md` |
| Especificación funcional | `.spec-kit/specify.md` | Vigente | 24 HU, 22 RF, reglas de negocio, criterios de éxito y decisiones D-01…D-06 | **Coherente** con el flujo implementado |
| Especificaciones por feature | `specs/001-editorial-workflow/spec.md`, `specs/001-institutional-auth/spec.md`, `specs/002-manuscript-registration/spec.md` | Vigentes con material histórico | Especificaciones derivadas de SDD | **Parcialmente coherentes**; `specs/001-editorial-workflow/plan.md`, `research.md`, `quickstart.md` y `openapi.yaml` conservan decisiones antiguas |
| Plan de implementación | `.spec-kit/plan.md` | Vigente | Arquitectura, modelos, endpoints, almacenamiento, seguridad, pruebas y despliegue | **Coherente en lo esencial**; usa prefijo `/api/` mientras el código monta `/api/v1/` |
| Tareas | `.spec-kit/tasks.md` | Vigente | 92 tareas TSK-01 a TSK-92 en 7 fases | **Completo**: las 92 tareas están tratadas; la Fase 6 cierra el endurecimiento |
| ADR | `docs-site/ingenieria/adr/0001…0007*.qmd` + `index.qmd` en `origin/dev/ismael-setup` | **Existentes en rama remota, fuera de HEAD** | 7 ADR: JWT/cookie, PostgreSQL única, doble ciego por diseño, versiones inmutables SHA-256, auditoría encadenada, Admin apagado y contrato JSON universal | **Completo en la rama de documentación**; `dev/richard-setup` aún no los integra |
| Diagramas C4/UML/BPMN | `docs-site/diagrams/workspace.dsl` (C4 niveles 1–3), `c4-codigo-envio.puml` (nivel 4), `proceso-editorial.bpmn`, `bpmn.html` | **Vigentes** | Modelo C4 con contexto, contenedores, componentes y código del envío; proceso editorial BPMN con visor | **Completo**; los SVG se generan con `scripts/build_docs_diagrams.sh` |
| Contrato OpenAPI | `backend/config/api.py` (schema en ejecución) y `specs/001-editorial-workflow/contracts/openapi.yaml` (histórico) | **Runtime vigente; YAML histórico desactualizado** | `manage.py spectacular` genera 44 rutas y 5590 líneas validadas; Swagger UI en `/api/v1/docs/` con `API_DOCS_ENABLED=1` | **Vigente en ejecución**; el YAML de `specs/` debe regenerarse o marcarse obsoleto |
| Portal Quarto | `docs-site/_quarto.yml`, `index.qmd`, `usuarios/`, `ingenieria/` en `origin/dev/ismael-setup` | **Existe en rama remota, ausente en HEAD** | 26 archivos: guías por rol, guía de ingeniería, API y ADR | **Brecha de integración**: el workflow `docs.yml` de HEAD referencia `_quarto.yml` y páginas que no están en esta rama, por lo que su job `build` fallaría |
| Matriz de trazabilidad | `.spec-kit/plan.md` §9; `dossier/dossier_requisitos.md` §9 | Vigente | 24/24 HU y 22/22 RF mapeados; matriz de requisitos del dossier | **Coherente**, con detalle desigual por HU |
| Modelo de amenazas | `.spec-kit/plan.md` §6.8 | Vigente | 11 amenazas y mitigaciones | **Coherente**; conviene formalizarlo como artefacto propio |
| Pruebas | `backend/tests/`, `backend/apps/*/tests.py`, `frontend/src/**/*.spec.ts`, `frontend/e2e/` | Vigente | Pruebas unitarias, integración, seguridad, rendimiento y E2E | **Coherente y ejecutable**; E2E no se re-ejecutó en esta corrida |
| README | `README.md` | Vigente | Instalación, operación, pruebas, seguridad, estado y metodología | **Coherente**; algunas cifras históricas requieren actualización |
| Documentación técnica | `docs/RUNBOOK.md`, `QUICKSTART.md`, `project_status.md` | Vigente con deuda | Runbook de 14 secciones, guía rápida y estado del proyecto | **Coherente**; `project_status.md` está desactualizado en cifras de pruebas (D-15) |

### 2.2 Auditoría documento por documento

#### 2.2.1 `constitution.md`

La constitución fija cinco bloques: arquitectura cliente-servidor SPA + API, estructura `/backend` y `/frontend`, Docker obligatorio, stack Django/DRF + Angular + PostgreSQL, código en inglés con documentación/comentarios/commits en español, paleta visual, doble ciego, validación PDF, versiones inmutables y borrado lógico.

**Contraste con la implementación:**

- La estructura `/backend` y `/frontend` existe y está versionada.
- `docker-compose.yml` orquesta `db`, `backend` y `web`; `db` y `backend` no publican puertos.
- El backend usa Django 5.2.18, DRF 3.18.3 y PostgreSQL 16; no hay MySQL ni SQLite en ejecución.
- El frontend es Angular 22 y consume la API por `/api/v1/`.
- El doble ciego se implementa en QuerySet, serializadores, permisos por objeto y PDF sanitizado.
- La validación PDF está en `apps/publications/services/pdf.py` y en el frontend.
- Las versiones son inmutables y no hay endpoint `DELETE`; la baja es lógica.

**Observación menor:** varios docstrings de servicios están en inglés (`apps/users/services/auth.py`, `apps/publications/services/*.py`), mientras la constitución pide comentarios y documentación en español. No afecta la funcionalidad, pero debe corregirse si se audita el cumplimiento al pie de la letra.

#### 2.2.2 `feature-map.md`

No existe. El mapa funcional real está en:

- `.spec-kit/specify.md` §9 (resumen de 24 historias y módulos).
- `.spec-kit/plan.md` §9.1 (HU -> módulo/endpoint).
- `specs/001-editorial-workflow/spec.md` (flujo editorial).
- `specs/002-manuscript-registration/spec.md` (registro de manuscrito).
- `specs/001-institutional-auth/spec.md` (autenticación).

**Recomendación:** crear `.spec-kit/feature-map.md` con las 24 HU, su RF, su estado y su módulo. Mientras no exista, la fuente de verdad es `specify.md` §9 y la matriz de este dossier.

#### 2.2.3 `spec.md` / `specify.md`

`.spec-kit/specify.md` es la especificación funcional vigente y contiene:

- 24 HU con prioridad y trazabilidad.
- 22 RF.
- Reglas de negocio RN-01…RN-20.
- Decisiones D-01…D-06 que ajustan el dossier original.
- Criterios de éxito SC-01…SC-15.

**Contraste:** el flujo implementado cubre las 24 HU y los 22 RF según `.spec-kit/plan.md` §9 y `.spec-kit/compliance.md`. Las divergencias no son funcionales, sino de contrato y nomenclatura.

#### 2.2.4 `plan.md`

El plan es el artefacto más completo: modelos, endpoints, frontend, almacenamiento, despliegue, seguridad, pruebas, fases, trazabilidad, riesgos y Definition of Done. La implementación sigue su arquitectura general.

**Divergencias detectadas:**

1. El plan usa prefijo `/api/`; el código monta `/api/v1/` y deja `/api/health/` sin versión.
2. El plan describe IDs numéricos en algunos ejemplos; el código usa UUID.
3. El plan menciona `switch-role` en material histórico de `specs/001-editorial-workflow/plan.md`; la decisión D-01 eliminó la selección de rol y el backend no expone ese endpoint.
4. El plan exige contadores reales en el dashboard; el backend devuelve `{}` en las cuatro secciones (D-11).
5. El plan describe el contrato de errores con una forma `{error: {...}}`; el renderer real usa `{success, message, data, errors, meta}`.

#### 2.2.5 `tasks.md`

Contiene 92 tareas (`TSK-01` a `TSK-92`) en 7 fases. La Fase 0 cubre fundación; Fase 1 identidad; Fase 2 autor; Fase 3 editor; Fase 4 revisor; Fase 5 catálogo/auditoría/avisos; Fase 6 endurecimiento.

**Estado:** las 92 tareas están tratadas. `.spec-kit/compliance.md` resume 67 filas de cumplimiento con un promedio global aproximado de 96,7 %. No quedan tareas de implementación abiertas; lo pendiente es aceptación del piloto y deuda técnica.

#### 2.2.6 ADR

La rama `origin/dev/ismael-setup` contiene un registro ADR completo en `docs-site/ingenieria/adr/`:

- `0001-jwt-con-cookie-de-renovacion.qmd`
- `0002-postgresql-como-unica-base-de-datos.qmd`
- `0003-doble-ciego-por-diseno.qmd`
- `0004-versiones-inmutables-con-sello-sha-256.qmd`
- `0005-auditoria-encadenada.qmd`
- `0006-django-admin-apagado.qmd`
- `0007-contrato-json-universal.qmd`

Cada ADR tiene título, contexto, decisión, alternativas y consecuencias. En `dev/richard-setup` no existe esa carpeta, porque la rama de documentación aún no se fusionó. Las decisiones también están en `.spec-kit/plan.md` Anexo A (Q1–Q5), `.spec-kit/specify.md` §1.1 (D-01…D-06) y `.spec-kit/compliance.md` §3 (D-01…D-31).

**Veredicto:** deuda de integración, no de contenido. La acción es fusionar `origin/dev/ismael-setup` o trasladar los ADR a la rama de entrega.

#### 2.2.7 Diagramas C4/UML/BPMN

Sí existen diagramas versionados en `docs-site/diagrams/`:

- `workspace.dsl`: modelo Structurizr con C4 nivel 1 (contexto), nivel 2 (contenedores) y nivel 3 (componentes del backend).
- `c4-codigo-envio.puml`: nivel 4 de código para el flujo de envío de manuscrito.
- `proceso-editorial.bpmn` + `bpmn.html` + `bpmn-viewer.js`: proceso editorial BPMN con visor.
- `scripts/build_docs_diagrams.sh`: genera los SVG (`c1-contexto.svg`, `c2-contenedores.svg`, `c3-backend.svg`, `c4-codigo-envio.svg`).

**Veredicto:** completo y reproducible. La captura debe mostrar el modelo C4 y el visor BPMN, no afirmar que faltan.

#### 2.2.8 OpenAPI y Swagger UI

Hay dos artefactos distintos y no deben confundirse:

1. **Contrato histórico** `specs/001-editorial-workflow/contracts/openapi.yaml`: conserva IDs enteros, `switch-role` y rutas antiguas. **No representa el backend actual** y no debe usarse para generar clientes.
2. **Schema en ejecución** generado con `drf-spectacular`:

```bash
docker run --rm --env-file .env gpc-backend-test sh -lc \
  'API_DOCS_ENABLED=1 python manage.py spectacular \
   --file /tmp/openapi.yaml --validate --fail-on-warn'
```

Resultado verificado el 2026-11-06: **44 rutas, 5590 líneas, validación sin advertencias**. En desarrollo, `API_DOCS_ENABLED` es `True` por defecto y estas rutas responden `200`:

| Ruta | Estado verificado |
|---|---|
| `/api/v1/schema/` | `200` (YAML) |
| `/api/v1/schema.json` | `200` (JSON) |
| `/api/v1/docs/` | `200` (Swagger UI, variante *split* compatible con CSP) |
| `/api/health/` | `200` |
| `/api/v1/` | `200` |

La copia estática `docs-site/api/index.html` usa `openapi.yaml` y los archivos de Swagger UI que genera `scripts/build_docs_api.sh`; esos archivos no se versionan. En producción la documentación está apagada por defecto (`API_DOCS_ENABLED=0`).

**Veredicto:** Swagger UI ya existe y el schema runtime es la fuente de verdad. El pendiente es regenerar el YAML de `specs/` o marcarlo obsoleto, y asegurar que el script de documentación se ejecute antes de publicar `docs-site/api/`.

#### 2.2.9 Matriz de trazabilidad

La matriz de `.spec-kit/plan.md` §9 declara cobertura 24/24 HU y 22/22 RF. `dossier/dossier_requisitos.md` contiene una matriz RF -> HU -> criterio -> fuente -> estado. La trazabilidad es correcta a nivel de feature, pero no todas las HU tienen el mismo nivel de detalle de CA -> prueba. El punto 3 de este dossier profundiza en una HU completa.

#### 2.2.10 Modelo de amenazas

`.spec-kit/plan.md` §6.8 enumera 11 amenazas: fuerza bruta, acceso a manuscrito ajeno, fuga de identidad, PDF malicioso, sobrescritura de versión, alteración de auditoría, descarga directa del volumen, interrupción de auditoría, uso indebido de corrección administrativa, pérdida del servidor y enumeración de recursos. Cada una tiene mitigación implementada o documentada. El modelo es coherente, pero no usa formato STRIDE ni incluye probabilidad/impacto.

#### 2.2.11 Pruebas

- Backend: **70 archivos** de prueba en `backend/tests` y **5** en `backend/apps` (75 en total), con 1316 funciones `test_` que se expanden por parametrización. Corrida completa del 2026-11-06: **1690 aprobadas, 11 omitidas, 0 fallos**.
- Frontend: **75 archivos spec, 1308 pruebas aprobadas** (verificado el 2026-11-06 con `npx ng test --watch=false` en `node:22-alpine`).
- E2E: 7 archivos, 26 bloques estáticos que se expanden por parametrización; no re-ejecutados en esta corrida.
- Seguridad: matriz de rutas en `backend/tests/security/test_access_matrix.py`, que falla si una ruta no está clasificada.
- Rendimiento: `backend/tests/performance/test_query_scaling.py` exige el mismo número de consultas con 2 y 9 filas.
- CI: **9 jobs** en `.github/workflows/ci.yml` (`backend-check`, `backend-tests`, `backend-audit`, `frontend-tests`, `frontend-build`, `frontend-audit`, `compose-config`, `e2e`, `media-isolation`).

#### 2.2.12 `README.md` y documentación técnica

`README.md` cubre instalación, operación, seguridad, pruebas, load test, verificación de piloto y metodología. `docs/RUNBOOK.md` tiene 14 secciones y cubre despliegue, TLS, límites, volumen, PostgreSQL, `X-Accel-Redirect`, respaldos, restauración, cron, credenciales, incidentes y aceptación. El portal Quarto (`docs-site/`) añade guías por rol, guía de ingeniería, referencia de API y 7 ADR, pero solo existe en `origin/dev/ismael-setup`; en HEAD `scripts/check_docs_site.py` falla por falta de `_quarto.yml`.

**Deuda documental:** `project_status.md` afirma que no se ejecutaron pruebas; las cifras de HANDOFF/compliance (1580, 1623, 1643, 1660) no coinciden con la corrida actual (**1690 aprobadas, 11 omitidas**). Deben fecharse como instantáneas o actualizarse. El runbook también debe actualizarse: Swagger UI ya existe en desarrollo y pytest necesita el montaje de `conftest.py` mientras el Dockerfile no lo copie.

### 2.3 Divergencias y tratamiento

| ID | Documento | Divergencia | Impacto | Tratamiento |
|---|---|---|---|---|
| DIV-01 | `openapi.yaml` | IDs enteros, rutas y errores históricos | Alto para clientes generados | Actualizar el contrato o marcarlo obsoleto |
| DIV-02 | `specs/001-editorial-workflow/plan.md` | Menciona `switch-role` y selección de rol | Medio; contradice D-01 | Archivar como histórico y enlazar a `.spec-kit/specify.md` |
| DIV-03 | `.spec-kit/plan.md` | Prefijo `/api/` frente a `/api/v1/` | Bajo; no rompe el sistema | Normalizar el plan o documentar la versión |
| DIV-04 | `.spec-kit/compliance.md` | Cifras de pruebas históricas | Bajo; confunde el cierre | Fechar cada cifra o actualizarlas |
| DIV-05 | `project_status.md` | Dice que no hay pruebas | Bajo | Actualizar o marcar como instantánea |
| DIV-06 | `specs/001-editorial-workflow/contracts` | Contrato sin sobre universal | Medio | Regenerar desde el renderer real |
| DIV-07 | `.spec-kit/tasks.md` | Nombra Jasmine/Karma; el proyecto usa Vitest (D-12) | Bajo | Corregir el texto |
| DIV-08 | Documentación | Los 7 ADR y el portal Quarto están en `origin/dev/ismael-setup`, no en `dev/richard-setup`; `feature-map.md` sigue ausente en todas las ramas | Medio para auditoría SDD | Fusionar la rama de documentación y crear `feature-map.md` |
| DIV-09 | Dashboard | Plan exige contadores; backend devuelve `{}` (D-11) | Medio funcional | Implementar contadores |
| DIV-10 | Runbook / API | El runbook afirma que no hay Swagger UI; el código sí lo monta en desarrollo | Bajo para onboarding | Actualizar el runbook (hecho en §6.10) |
| DIV-11 | CI de documentación | `.github/workflows/docs.yml` ejecuta `check_docs_site.py` y `quarto render docs-site`, pero `docs-site/_quarto.yml` y las páginas `.qmd` no están en HEAD | Alto para CI documental | Integrar `origin/dev/ismael-setup` antes de ejecutar ese workflow |
| DIV-12 | Pruebas en Docker | `backend/Dockerfile` no copia `backend/conftest.py`; ejecutar pytest en la imagen sin montarlo produce fallos masivos | Alto para reproducibilidad | Añadir `COPY conftest.py ./` o documentar el montaje |

**[CAPTURA P2-01]** Capturar el árbol de artefactos: `.spec-kit/`, `specs/`, `dossier/`, `docs/` y `docs-site/`; señalar que `feature-map.md` no existe, que los ADR viven en la rama remota y que los diagramas C4/BPMN sí están versionados.
**[CAPTURA P2-02]** Capturar una comparación entre el YAML histórico de `specs/` y el schema runtime generado con `manage.py spectacular` (44 rutas), o entre las rutas del schema y `path(` de `backend/apps/*/urls.py`.
**[CAPTURA P2-03]** Capturar `/api/v1/docs/` con Swagger UI abierto y una operación desplegada, mostrando que el schema se genera desde el código.
**[CAPTURA P2-04]** Capturar el C4 (`docs-site/diagrams/workspace.dsl` renderizado) y el visor BPMN (`docs-site/diagrams/bpmn.html`).

---

## 3. Trazabilidad Integral SDD

### 3.1 Feature seleccionada

**Feature:** Registro y envío de manuscrito con metadatos y PDF válido.

**Justificación:** es la puerta de entrada del flujo editorial, concentra reglas de negocio, validación de archivos, auditoría, idempotencia y concurrencia, y tiene pruebas unitarias, de integración, de seguridad y E2E.

### 3.2 Cadena completa

| Eslabón | Elemento concreto | Evidencia |
|---|---|---|
| **Actor** | Autor (docente/estudiante de la UNL) | `.spec-kit/specify.md` §4; `dossier/dossier_requisitos.md` §3 |
| **Necesidad** | Registrar un manuscrito con metadatos obligatorios y un PDF válido para iniciar el proceso editorial y conservar una primera versión íntegra | HU-04, `.spec-kit/specify.md` §9 |
| **Feature** | Registro de manuscrito con metadatos y PDF válido | `specs/002-manuscript-registration/spec.md`; `specs/001-editorial-workflow/spec.md` US2 |
| **Requisito (RF)** | RF-02 (registro con metadatos y PDF) y RF-14 (validación estricta y límite de 50 MB) | `.spec-kit/plan.md` §9.2; `dossier/dossier_requisitos.md` |
| **Criterios de aceptación (CA)** | CA-HU-04-01 a CA-HU-04-10 | `.spec-kit/specify.md` HU-04 |
| **Componente lógico (C4/UML)** | SPA Angular (formulario + uploader) -> Nginx -> API DRF -> serializers -> servicios de manuscrito/draft/submission/PDF -> modelos -> PostgreSQL + volumen `media_data` + auditoría | `docs-site/diagrams/workspace.dsl` (C4 niveles 1–3), `c4-codigo-envio.puml` (nivel 4) y `proceso-editorial.bpmn` |
| **Endpoint REST** | `POST /api/v1/manuscripts/` (crear borrador), `POST /api/v1/manuscripts/{id}/draft-file/` (adjuntar/reemplazar PDF), `POST /api/v1/manuscripts/{id}/submit/` (envío formal), `PATCH /api/v1/manuscripts/{id}/` (editar metadatos) | `backend/apps/publications/urls.py`; `backend/config/api.py` |
| **Módulo de implementación** | `ManuscriptListCreateView`, `ManuscriptDraftFileView`, `ManuscriptSubmitView`, `ManuscriptDetailView`; servicios `create_manuscript`, `attach_draft_file`, `submit_manuscript`; `PdfService`; modelos `Manuscript`, `ManuscriptVersion`, `StatusEvent`, `Verdict`; `AuditLog` en `apps/audit` | `backend/apps/publications/views.py:231`, `:331`, `:382`, `:278`; `services/manuscripts.py:162`; `services/drafts.py:69`; `services/submission.py:81`; `services/pdf.py:137`; `models.py:136`, `:323`, `:442`, `:480` |
| **Prueba backend** | `backend/tests/publications/test_manuscript_api.py` (`TestCreateDraft`, `TestAuthorValidation`, `TestScopeAndPrivacy`), `test_draft_file.py` (`TestUpload`, `TestSizeLimit`, `TestUnsupportedContentType`), `test_submission.py` (`TestSubmission`, `TestStoredFiles`, `TestRollback`, `TestValidation`, `TestState`, `TestAccess`), `test_pdf.py` (`TestValidPdf`, `TestRejectedPdf`, `TestSanitize`, `TestSizeLimit`) | Archivos citados; el total de la corrida completa se registra en §12.1 |
| **Prueba de seguridad** | `TestAccessMatrix` verifica 46 combinaciones método+ruta con 8 actores; incluye `POST /api/v1/manuscripts/` y rutas de manuscrito | `backend/tests/security/test_access_matrix.py` |
| **Prueba E2E** | Flujo 2: el Autor crea el borrador, adjunta el PDF, lo envía y recibe el código | `frontend/e2e/02-ciclo-completo.e2e.ts`, test `2. El Autor crea el borrador...` |

### 3.3 Cobertura de criterios de aceptación

| CA | Resultado esperado | Implementación | Prueba | Estado |
|---|---|---|---|---|
| CA-HU-04-01 | Borrador sin versión formal | `create_manuscript` crea `DRAFT`; no crea `ManuscriptVersion` | `test_manuscript_api.py::TestCreateDraft::test_creates_a_draft_without_version_or_round` | Completa |
| CA-HU-04-02 | Metadatos obligatorios | `missing_metadata` y serializers | `TestAuthorValidation`, `test_submission.py::TestValidation` | Completa |
| CA-HU-04-03 | El registrante debe figurar como autor | `validate_author_roster` | `test_manuscript_api.py::test_the_registrant_must_be_listed`; `test_submission.py::test_the_registrant_must_still_be_listed` | Completa |
| CA-HU-04-04 | Envío formal crea v1 y ronda 0 | `submit_manuscript` | `test_submission.py::test_creates_exactly_v1_and_round_zero_and_answers_201` | Completa |
| CA-HU-04-05 | Campos incompletos conservan borrador | `missing_requirements`; respuesta `400` | `test_submission.py::test_incomplete_metadata_answers_400_listing_every_missing_field` | Completa |
| CA-HU-04-06 | PDF inválido no crea versión | `PdfService` + `attach_draft_file` | `test_pdf.py::TestRejectedPdf`; `test_draft_file.py::TestInvalidFile` | Completa |
| CA-HU-04-07 | Envío duplicado no duplica | Estado `DRAFT` + idempotencia + `409` | `test_submission.py::test_a_repeated_submission_answers_409_and_creates_nothing_more` | Completa |
| CA-HU-04-08 | Envío interrumpido no deja versión parcial | Transacción atómica y rollback | `test_submission.py::TestRollback` | Completa |
| CA-HU-04-09 | Autor que es Revisor no se autoasigna | Exclusión en `Assignment.objects.for_reviewer` y conflicto de interés | `test_reviewer_scope.py`, `test_double_blind.py::TestForeignAssignmentsAnswer404` | Completa a nivel de feature transversal; no está en `test_manuscript_api` |
| CA-HU-04-10 | Auditoría de creación y envío | `AuditService` en las transacciones | `test_manuscript_api.py::test_records_the_initial_status_event_and_the_audit`; `test_submission.py::TestAudit` | Completa |

### 3.4 Rupturas o inconsistencias detectadas

1. **El YAML histórico de `specs/` no refleja el contrato real:** no documenta `draft-file`, `submit` ni el sobre universal; usa IDs enteros y rutas de editor/revisor distintas. El schema runtime de `drf-spectacular` sí está actualizado (44 rutas), pero vive fuera del control de versiones.
2. **El portal Quarto y los ADR no están en HEAD:** están en `origin/dev/ismael-setup`. El workflow `docs.yml` de esta rama no puede construir el sitio mientras no se integren.
3. **CA-HU-04-09 se prueba en el módulo de revisor, no en el de manuscritos:** la trazabilidad es correcta, pero la ubicación de la prueba no es intuitiva.
4. **El plan usa `/api/` y el código `/api/v1/`:** no rompe el sistema, pero un lector del plan puede probar la URL equivocada.
5. **La imagen de pruebas no copia `conftest.py`:** ejecutar pytest dentro de `gpc-backend-test` sin montar `backend/conftest.py` produce fallos de envelope (`KeyError: 'access'`). El montaje usado en esta verificación está documentado en §12.1.

**[CAPTURA P3-01]** Capturar la pantalla del formulario de manuscrito del Autor y la confirmación con código `GPC-AAAA-######`, versión `v1` y ronda `0`.
**[CAPTURA P3-02]** Capturar la pestaña Network con `POST /api/v1/manuscripts/`, `POST .../draft-file/` y `POST .../submit/`, mostrando estados `201`, `201` y `201` (o los que correspondan).
**[CAPTURA P3-03]** Capturar la salida de pytest de los archivos `test_submission.py`, `test_draft_file.py`, `test_pdf.py` y `test_access_matrix.py`.

---

## 4. Coherencia SDD

### 4.1 Regla constitucional -> evidencia -> veredicto

| Regla de `constitution.md` | Evidencia en el código | Veredicto |
|---|---|---|
| Arquitectura cliente-servidor SPA + API REST | `frontend/src/app/` consume `/api/v1/`; `backend/config/api.py` | Cumple |
| Aislamiento `/backend` y `/frontend` | Carpetas versionadas y Dockerfiles separados | Cumple |
| Docker y Compose obligatorios | `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.load.yml` | Cumple |
| Backend Django + DRF | `backend/config/settings/base.py`, `requirements/base.txt` | Cumple |
| Frontend Angular + TypeScript | `frontend/package.json`, `frontend/src/` | Cumple |
| PostgreSQL obligatorio | `DATABASES` en `base.py` y `production.py`; `postgres:16-alpine` | Cumple |
| Código en inglés; comentarios/docs/commits en español | Identificadores en inglés; mayoría de comentarios y documentación en español | Cumple con observación: varios docstrings en inglés |
| Principios SOLID/KISS/DRY/YAGNI | Separación apps/servicios/serializers/permisos; sin ORM alternativo | Cumple en lo observable |
| README exhaustivo | `README.md` + `QUICKSTART.md` + `docs/RUNBOOK.md` | Cumple |
| Paleta visual | Variables `--gpc-primary`, `--gpc-success`, `--gpc-warning`, `--gpc-danger` en `frontend/src/styles.scss` | Cumple |
| Doble ciego estricto | QuerySet, serializadores allowlist, permisos por objeto y PDF sanitizado | Cumple |
| Validación exclusiva de PDF | `PdfService`, `pdf-file.validation.ts`, `test_pdf.py` | Cumple |
| Versiones inmutables | `ManuscriptVersion`, `O_CREAT|O_EXCL`, directorio exclusivo, trigger append-only | Cumple |
| Borrado lógico, no `DELETE` | `withdraw_manuscript`, `is_active`, sin endpoint `DELETE` | Cumple |

### 4.2 Diferencias entre especificación y código

| Diferencia | Justificación técnica | Estado |
|---|---|---|
| `/api/` en el plan vs `/api/v1/` en el código | Versionado explícito para permitir evolución sin romper clientes; `/api/health/` queda sin versión para operación | Justificada; documentar en el plan |
| IDs enteros en OpenAPI vs UUID en código | UUID evita enumeración y facilita integración entre tablas | Justificada; actualizar OpenAPI |
| `switch-role` histórico vs roles aditivos | D-01: el panel unificado muestra todos los roles a la vez; elimina fricción y evita selección incorrecta | Justificada; archivar material histórico |
| Contrato de error `{error: {...}}` vs sobre universal | El sobre `{success, message, data, errors, meta}` unifica éxito y error y añade `request_id` | Justificada; actualizar OpenAPI |
| Dashboard con contadores vs `{}` | La estructura existe, pero las secciones no se implementaron | **No justificada**: D-11 |
| HSTS en Django, no en Nginx | Evita bloquear navegadores con certificado autofirmado durante el piloto | Justificada; D-06 |
| Sin CORS | La SPA se sirve desde el mismo origen que la API a través de Nginx | Justificada; si se separan dominios, habrá que añadirlo |
| Sin HTTP/2 | Nginx no declara `http2`; el upstream usa HTTP/1.1 | **Limitación**, no violación constitucional |

**[CAPTURA P4-01]** Capturar la tabla de cumplimiento de `.spec-kit/compliance.md` o la sección de constitución junto con las pruebas que la respaldan.

---

## 5. Estructura del Dossier Técnico Integrado

### 5.1 Las 13 secciones solicitadas

#### (1) Contexto y problema

Las facultades de la UNL gestionan la revisión de artículos por correo y archivos dispersos. Eso produce pérdida de versiones, evaluación no anónima, falta de trazabilidad y dificultad para conocer el estado editorial. La solución es una plataforma web centralizada que automatiza recepción, revisión doble ciego, correcciones, veredicto, catálogo y auditoría. Fuente: `dossier/dossier_requisitos.md` §1–§2; `.spec-kit/specify.md` §2.

#### (2) Actores y necesidades

| Actor | Necesidad principal | HU representativas |
|---|---|---|
| Autor | Registrar manuscritos, adjuntar PDF, consultar estado, corregir y dar de baja | HU-04…HU-09, HU-22, HU-23 |
| Revisor | Recibir asignaciones anónimas, evaluar y reportar conflictos o fuga de identidad | HU-14…HU-17 |
| Editor | Ver envíos, asignar revisor, solicitar correcciones, emitir veredicto | HU-10…HU-13 |
| Administrador | Consultar auditoría global y habilitar correcciones de veredicto | HU-20, HU-21 |
| Público | Buscar y descargar artículos aceptados | HU-18, HU-19 |
| Sistema | Notificar, auditar, validar archivos y proteger el doble ciego | HU-24, RN, RNF |

#### (3) Mapa de features

| Módulo | Features | Estado |
|---|---|---|
| Autenticación y panel | Login, refresh, logout, `/me`, dashboard unificado, roles aditivos | Funcional; contadores del panel parciales (D-11) |
| Autor | Registro, borrador, PDF, envío, versiones, edición, baja, historial | Completa |
| Editor | Bandeja, inicio de revisión, asignación única, revocación, veredicto, corrección administrativa | Completa |
| Revisor | Bandeja, detalle anonimizado, descarga sanitizada, evaluación, conflicto, fuga de identidad, historial | Completa |
| Catálogo | Búsqueda, ficha, descarga pública | Completa |
| Auditoría | Registro append-only, consulta administrativa, cadena de hashes, integridad | Completa |
| Notificaciones | Panel y correo con reintentos | Completa |
| Infraestructura | Docker, Nginx, TLS, respaldos, restauración, runbook, CI | Funcional; certificado y respaldo externo pendientes |

#### (4) Especificaciones principales

Las especificaciones vigentes son `.spec-kit/specify.md` (funcional), `.spec-kit/plan.md` (técnica), `specs/001-editorial-workflow/spec.md` (flujo), `specs/002-manuscript-registration/spec.md` (registro) y `specs/001-institutional-auth/spec.md` (autenticación). Las 24 HU y los 22 RF están mapeados en `.spec-kit/plan.md` §9.

#### (5) Arquitectura

- **Cliente:** SPA Angular 22, rutas lazy, guards por rol, interceptor de envelope, servicios por módulo.
- **Borde:** Nginx 1.27 con TLS 1.2/1.3, redirección 80->443, CSP, cabeceras de seguridad, `client_max_body_size 60m`, ubicaciones internas `/_protected/` y `/_catalog/`, `deny all` en `/media/`.
- **Aplicación:** Django 5.2 + DRF 3.18, Gunicorn con 3 workers y timeout 120 s.
- **Datos:** PostgreSQL 16, migraciones, roles separados `gpc_app` (administrador) y `gpc_runtime` (aplicación), trigger append-only en auditoría.
- **Archivos:** volumen `media_data`; backend escribe, web lee en solo lectura; originales y sanitizados en rutas privadas; copia pública en catálogo.
- **Operación:** Docker Compose, healthchecks, cron, backups, runbook.

#### (6) Decisiones arquitectónicas (ADRs)

Los 7 ADR formales están en `docs-site/ingenieria/adr/` de `origin/dev/ismael-setup`: JWT con cookie de renovación, PostgreSQL como única base, doble ciego por diseño, versiones inmutables con SHA-256, auditoría encadenada, Django Admin apagado y contrato JSON universal. En HEAD las decisiones siguen dispersas en `.spec-kit/plan.md`, `.spec-kit/specify.md` y `.spec-kit/compliance.md`.

Decisiones principales:

- D-01: sin selección de rol; roles aditivos.
- D-02: un solo Revisor activo por manuscrito.
- D-03: catálogo público.
- D-04: plazo exacto de 20 días con revocación editorial.
- D-05: snapshot inmutable de PDF y metadatos por iteración.
- D-06: contador de rondas visible.
- Q1–Q5: volumen local, 50/60 MB, un servidor on-premise, `X-Accel-Redirect`, respaldo diario local.
- D-31: Django Admin apagado en producción; cuentas por comando.

El punto 9 desarrolla tres decisiones con el formato problema/estándar/alternativa/decisión/consecuencia.

#### (7) Contrato de API

- Prefijo versionado `/api/v1/`; salud sin versión `/api/health/`.
- Matriz de seguridad que clasifica todas las combinaciones método+ruta y falla si aparece una ruta sin clasificar.
- Sobre universal de éxito y error.
- JWT Bearer; refresh en cookie HttpOnly.
- `Idempotency-Key` en POST críticos; `ETag`/`If-Match` en ediciones.
- Schema runtime generado con `drf-spectacular`: **44 rutas, 5590 líneas, validado sin advertencias**; Swagger UI en `/api/v1/docs/` con `API_DOCS_ENABLED=1`.
- YAML histórico: `specs/001-editorial-workflow/contracts/openapi.yaml`, **desactualizado**; no usarlo para clientes.

#### (8) Seguridad (hallazgos SEC-01 a SEC-09)

No existían artefactos llamados `SEC-01`…`SEC-09` en el repositorio. Para este dossier se consolidan nueve hallazgos con base en la implementación y en `.spec-kit/compliance.md`:

| ID | Hallazgo | Evidencia | Estado |
|---|---|---|---|
| SEC-01 | Access token en memoria y refresh en cookie `HttpOnly`, `Secure`, `SameSite=Strict`, con rotación y revocación | `apps/users/views.py`, `services/auth.py`, pruebas `users/test_session_flow.py` | Mitigado |
| SEC-02 | Autorización por rol y por objeto; objeto ajeno responde `404` uniforme; `403` solo por rol de módulo | `permissions.py`, `tests/security/test_access_matrix.py` | Mitigado |
| SEC-03 | Doble ciego en cuatro capas: QuerySet, serializadores allowlist, permisos y PDF sanitizado | `reviews/serializers.py`, `publications/services/pdf.py`, `tests/reviews/test_double_blind.py` | Mitigado |
| SEC-04 | Validación estricta de PDF: contenido, cifrado, páginas, contenido activo y límite de 50 MB | `publications/services/pdf.py`, `test_pdf.py`, `test_draft_file.py` | Mitigado |
| SEC-05 | Auditoría append-only con cadena de hashes y fallo cerrado `503` | `audit/services.py`, `audit/integrity.py`, `tests/audit/` | Mitigado |
| SEC-06 | Aislamiento de archivos con `X-Accel-Redirect`, ubicaciones `internal`, volumen `:ro` y `/media/ deny all` | `nginx/conf.d/default.conf`, `services/downloads.py`, `scripts/smoke_media_isolation.sh` | Mitigado |
| SEC-07 | Límite de intentos 5/15 min, mensaje genérico, bloqueo `429` y Admin apagado en producción | `users/services/auth.py`, `config/settings/production.py`, `nginx/conf.d/default.conf` | Mitigado |
| SEC-08 | TLS 1.2/1.3, HSTS desde Django, CSP, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`; sin CORS por mismo origen | Nginx + `production.py` + `verify_pilot.sh` | Mitigado; HTTP/2 ausente |
| SEC-09 | Secretos en `.env` con permisos `0600`, variables obligatorias y separación de roles de BD; `credentials.txt` estuvo en el historial y fue rotado | `.env.example`, `production.py`, `.spec-kit/compliance.md` D-01 | Riesgo residual aceptado y documentado |

#### (9) Pruebas

- Backend: **1690 aprobadas, 11 omitidas, 0 fallos**; 70 archivos en `backend/tests` y 5 en `backend/apps`; incluye seguridad, concurrencia, rendimiento, auditoría, PDF y ciclo completo.
- Frontend: **1308 aprobadas**; 75 archivos; Vitest.
- E2E: 26 bloques en 7 archivos que se expanden por parametrización; no re-ejecutados en esta corrida.
- CI: 9 jobs (`backend-check`, `backend-tests`, `backend-audit`, `frontend-tests`, `frontend-build`, `frontend-audit`, `compose-config`, `e2e`, `media-isolation`).
- Cobertura documentada: 98 %; umbral 80 %.

#### (10) Despliegue

Docker Compose con `db`, `backend` y `web`. Solo `web` publica 80/443. `backend` ejecuta migraciones, privilegios, `collectstatic` y Gunicorn. Nginx sirve la SPA, proxya `/api/` y entrega PDF internos. Runbook de 14 secciones. Certificado institucional y respaldo cifrado externo pendientes.

#### (11) Trazabilidad

La matriz de `.spec-kit/plan.md` §9 cubre 24/24 HU y 22/22 RF. El punto 3 de este dossier profundiza HU-04. Las brechas restantes son de formato e integración (YAML histórico, ADR y portal Quarto en rama remota, `feature-map.md` ausente), no de cobertura funcional.

#### (12) Estado actual del incremento

Fases 0–6 completas. El flujo editorial funciona de punta a punta: registro, envío, revisión, asignación, evaluación, veredicto, catálogo, baja, auditoría y notificaciones. El sistema es funcional para piloto controlado. La deuda se concentra en dashboard, YAML histórico, integración del portal documental/ADR, respaldo externo, certificado, CI no ejecutado en GitHub y reproducibilidad de pytest dentro de la imagen.

#### (13) Pendientes y limitaciones

Ver punto 10. Los bloqueantes para producción son: certificado institucional, respaldo cifrado externo (Q5/D-30), instalación de cron/logrotate, primera corrida real de GitHub Actions y contadores del panel. Los bloqueantes documentales son: integrar `origin/dev/ismael-setup`, regenerar el YAML de `specs/`, crear `feature-map.md` y corregir el `Dockerfile` para que pytest sea reproducible sin montar `conftest.py`.

### 5.2 Hallazgos SEC-01 a SEC-09: lectura ejecutiva

Los nueve hallazgos no son vulnerabilidades abiertas: son controles implementados o riesgos residuales documentados. El único riesgo residual de credenciales es el historial de Git (`credentials.txt`), que el responsable declara rotado. No se debe reescribir el historial sin autorización; la mitigación correcta es mantener la credencial rotada y usar un gestor de secretos.

**[CAPTURA P5-01]** Capturar el índice de las 13 secciones de este dossier y, si se presenta en PDF, la portada y la tabla de contenido.

---

## 6. Documentación de Ejecución (Runbook / Onboarding)

Esta guía asume un desarrollador sin conocimiento previo. Todos los comandos se ejecutan desde la raíz del repositorio.

### 6.1 Requisitos previos

| Herramienta | Versión mínima | Verificación |
|---|---|---|
| Git | 2.30+ | `git --version` |
| Docker Engine | 24+ | `docker --version` |
| Docker Compose | v2 | `docker compose version` |
| OpenSSL | 1.1+ | `openssl version` |
| Node.js (solo si se trabaja fuera de Docker) | 22.22.3 o 24.15+ para Angular 22 | `node --version` |
| Python (solo si se trabaja fuera de Docker) | 3.12 | `python3 --version` |

> El proyecto compila el frontend dentro de `node:22-alpine`; no es obligatorio instalar Node en el host. Para pruebas locales del frontend se usó el contenedor porque el host tenía Node 22.22.1, insuficiente para Angular CLI.

### 6.2 Clonar el repositorio

```bash
git clone https://github.com/RichardC022/Gestion_Publicaciones_Cientificas.git
cd Gestion_Publicaciones_Cientificas
git checkout develop
```

Para trabajar por integrante:

```bash
git checkout -b dev/<integrante>-setup
```

### 6.3 Configurar `.env`

```bash
cp .env.example .env
chmod 600 .env
```

Editar como mínimo:

- `DJANGO_SECRET_KEY`
- `POSTGRES_PASSWORD`
- `APP_DB_PASSWORD`
- `EMAIL_HOST_PASSWORD`
- `ALLOWED_HOSTS`
- `CSRF_TRUSTED_ORIGINS`
- `EMAIL_HOST`, `EMAIL_HOST_USER`, `DEFAULT_FROM_EMAIL`

No usar `change-me` en producción. `POSTGRES_USER` es el administrador de la base; `APP_DB_USER` es el rol de ejecución sin privilegios sobre la auditoría.

### 6.4 Validar la configuración

```bash
docker compose config --quiet
```

### 6.5 Construir imágenes

```bash
docker compose build
```

### 6.6 Levantar PostgreSQL y migrar

```bash
docker compose up -d db
docker compose run --rm -e DB_USE_ADMIN=1 backend python manage.py migrate --noinput
docker compose run --rm -e DB_USE_ADMIN=1 backend python manage.py apply_db_privileges
```

El contenedor `backend` repite migraciones y privilegios al arrancar.

### 6.7 Sembrar roles y cuentas

```bash
docker compose run --rm backend python manage.py seed_roles
docker compose run --rm backend python manage.py create_user <identificador> \
  --first-name <Nombre> --last-name <Apellidos> \
  --email <correo> --role EDITOR [--role REVIEWER] [--areas "Agronomía,Medicina"]
```

Para desarrollo, cuentas de prueba:

```bash
docker compose exec -e ALLOW_DEV_USERS=1 backend python manage.py seed_dev_users
```

### 6.8 Crear certificado y levantar el sistema

```bash
./scripts/make_dev_cert.sh
docker compose up -d
docker compose ps
```

La aplicación queda en `https://localhost` (certificado autofirmado; el navegador advierte). Solo `web` publica 80/443.

### 6.9 Verificar el servidor

```bash
docker compose exec backend python manage.py check
curl -k https://localhost/api/health/
docker compose logs backend
```

Respuesta esperada de salud: sobre universal con `data.status = "ok"`.

### 6.10 Acceder a Swagger/OpenAPI

**Estado real (verificado el 2026-11-06):** el proyecto usa `drf-spectacular`. En desarrollo, `API_DOCS_ENABLED` es `True` por defecto y responde `200`:

| Ruta | Contenido |
|---|---|
| `https://localhost/api/v1/docs/` | Swagger UI interactivo (*split*, compatible con CSP) |
| `https://localhost/api/v1/schema/` | Schema OpenAPI en YAML |
| `https://localhost/api/v1/schema.json` | Schema OpenAPI en JSON |

Para generarlo desde el código sin abrir la base de datos:

```bash
docker run --rm --env-file .env gpc-backend-test sh -lc \
  'API_DOCS_ENABLED=1 python manage.py spectacular \
   --file /tmp/openapi.yaml --validate --fail-on-warn'
```

Resultado: 44 rutas y 5590 líneas, sin advertencias. Para la copia estática del portal:

```bash
./scripts/build_docs_api.sh
# genera docs-site/api/openapi.yaml y copia Swagger UI desde drf-spectacular-sidecar
```

En producción la documentación está apagada por defecto (`API_DOCS_ENABLED=0`). Si se habilita, el schema se sirve igual, pero conviene protegerlo o publicarlo solo en la red interna.

**Advertencia:** `specs/001-editorial-workflow/contracts/openapi.yaml` es un contrato histórico y no debe usarse para generar clientes. La fuente de verdad es el schema runtime.

### 6.11 Ejecutar pruebas backend

Con la imagen de pruebas y la red de Compose:

```bash
docker run --rm --network proyecto_gpc_backend_net --env-file .env \
  -v "$PWD/backend/conftest.py:/app/conftest.py:ro" \
  gpc-backend-test python -m pytest -q
```

Solo un módulo:

```bash
docker run --rm --network proyecto_gpc_backend_net --env-file .env \
  -v "$PWD/backend/conftest.py:/app/conftest.py:ro" \
  gpc-backend-test python -m pytest tests/publications -q
```

Con cobertura:

```bash
docker run --rm --network proyecto_gpc_backend_net --env-file .env \
  -v "$PWD/backend/conftest.py:/app/conftest.py:ro" \
  gpc-backend-test python -m pytest --cov=. --cov-report=term-missing
```

> **Trampa conocida:** `backend/Dockerfile` copia `manage.py`, `pytest.ini`, `config/`, `apps/` y `tests/`, pero **no** `conftest.py`. Sin el montaje `-v "$PWD/backend/conftest.py:/app/conftest.py:ro"`, los tests fallan de forma masiva (por ejemplo, `KeyError: 'access'`) porque falta el fixture que desenvuelve el sobre JSON. La corrección definitiva es añadir `COPY conftest.py ./` al Dockerfile. No lanzar dos `pytest` simultáneos: comparten la base `test_gpc`.

### 6.12 Ejecutar pruebas y build del frontend

```bash
docker run --rm -v "$PWD/frontend:/app" -w /app node:22-alpine \
  sh -c "npm ci && npx ng test --watch=false"

docker run --rm -v "$PWD/frontend:/app" -w /app node:22-alpine \
  sh -c "npm ci && npm run build -- --configuration production"
```

Verificación del build:

```bash
python3 scripts/check_frontend_build.py
```

### 6.13 Desplegar con Docker Compose

```bash
docker compose up -d --build --remove-orphans
docker compose ps
```

Operación diaria:

```bash
docker compose logs -f backend
docker compose restart backend
docker compose down
```

No usar `docker-compose.dev.yml` en el servidor del piloto: publica PostgreSQL y Adminer en `127.0.0.1`.

### 6.14 Verificación completa del piloto

```bash
./scripts/check_runbook.py
./scripts/smoke_media_isolation.sh
./scripts/verify_pilot.sh
```

`verify_pilot.sh` levanta un stack aislado y comprueba restauración, integridad, puertos, TLS, cookies, cabeceras y superficie expuesta.

**[CAPTURA P6-01]** Capturar `.env` con los valores sensibles tapados y `docker compose config --quiet` sin errores.
**[CAPTURA P6-02]** Capturar `docker compose ps` con `db`, `backend` y `web` en estado `healthy`/`running`.
**[CAPTURA P6-03]** Capturar la respuesta JSON de `https://localhost/api/health/`.
**[CAPTURA P6-04]** Capturar la pantalla de login y el panel unificado después de iniciar sesión.
**[CAPTURA P6-05]** Capturar el resumen final de `pytest` con `1690 passed, 11 skipped, 0 failed`.
**[CAPTURA P6-06]** Capturar el resumen final de `ng test` con `75 archivos / 1308 passed`.
**[CAPTURA P6-07]** Capturar la salida de `npm run build -- --configuration production` y `check_frontend_build.py`.

---

## 7. Revisión de Estándares Web

### 7.1 Protocolo, URIs, JSON, REST, OpenAPI y CORS

| Estándar | Dónde se usó | Decisión que condicionó | Beneficio aportado | Problema si no se respetara |
|---|---|---|---|---|
| **HTTP/1.1 y HTTP/2** | Nginx `proxy_http_version 1.1`; TLS 1.2/1.3; no hay directiva `http2` | Upstream HTTP/1.1; navegador también HTTP/1.1 | Compatibilidad amplia y simplicidad operativa | Sin multiplexación ni compresión de cabeceras; mayor latencia con muchos recursos. No es un fallo funcional, pero es una mejora pendiente |
| **URIs** | `/api/v1/...`, UUID, `/api/health/` sin versión | Versionado explícito y recursos identificados por UUID | Evolución de API sin romper clientes; URLs no enumerables | Clientes acoplados a rutas viejas; colisiones de caché; enumeración si se usaran IDs secuenciales |
| **JSON** | Sobre `{success, message, data, errors, meta}` | Contrato único para éxito y error | Parsing uniforme, errores predecibles, `request_id` para soporte | Cada endpoint devolvería formas distintas; el frontend duplicaría lógica |
| **REST** | `GET`, `POST`, `PATCH`, `PUT`, `204` en logout, `201` en creación, sin `DELETE` | Recursos y transiciones explícitas; baja lógica | Semántica clara, idempotencia y trazabilidad | Métodos incorrectos, duplicados y pérdida de historial |
| **OpenAPI** | Schema runtime con `drf-spectacular` (44 rutas) y Swagger UI en `/api/v1/docs/`; YAML histórico en `specs/` | Contrato generado desde el código y validado con `--fail-on-warn`; el YAML histórico queda como referencia | Clientes y pruebas pueden contrastar el contrato real; Swagger permite exploración interactiva en desarrollo | Si se usara el YAML histórico, los clientes fallarían; el schema runtime debe regenerarse y publicarse con cada cambio |
| **CORS** | No se usa; SPA y API comparten origen en Nginx | No se instaló `django-cors-headers` | Menor superficie de ataque y menos configuración | Si la SPA se sirviera desde otro dominio, el navegador bloquearía las peticiones |

### 7.2 Códigos de estado

| Código | Uso real en el proyecto | Evidencia |
|---|---|---|
| `200` | Consultas, actualizaciones, logout no aplica | Vistas de manuscritos, catálogo, auditoría |
| `201` | Creación de manuscrito, versión, asignación, veredicto, autorización de corrección, reporte de incidente | `views.py`, `reviews/views.py`, `admin_views.py` |
| `204` | Logout y marcado masivo de avisos | `users/views.py`, `notifications/views.py` |
| `400` | Validación, PDF inválido, filtros mal formados, transición por datos | `config/exceptions.py`, serializers |
| `401` | Falta de autenticación o token inválido | `AUTH_INVALID` |
| `403` | Rol sin permiso de módulo | `FORBIDDEN` |
| `404` | Objeto inexistente o fuera del ámbito; no revela existencia | `NOT_FOUND`; pruebas de acceso |
| `409` | Conflicto de estado, versión, asignación o veredicto | `STATE_CONFLICT`, `VERSION_CONFLICT`, `ASSIGNMENT_CONFLICT`, `VERDICT_CONFLICT` |
| `410` | Plazo vencido, PDF retirado o recurso público no disponible | `reviews/services/evaluations.py`, catálogo |
| `413` | PDF mayor a 50 MB | `PDF_TOO_LARGE`; Nginx 60 MB |
| `415` | `Content-Type` distinto de `multipart/form-data` | `PDF_UNSUPPORTED`; `test_draft_file.py` |
| `429` | Límite de intentos de login | `AUTH_LOCKED`; `Retry-After` |
| `500` | Error no clasificado, sin detalles internos | `SERVER_ERROR` |
| `503` | Auditoría, base de datos o almacenamiento no disponible | `AUDIT_UNAVAILABLE`, `STORAGE_UNAVAILABLE` |

### 7.3 Cabeceras y autenticación

| Elemento | Dónde se usó | Decisión / beneficio | Riesgo si se omite |
|---|---|---|---|
| **HSTS** | Django `SECURE_HSTS_SECONDS=31536000`, `includeSubDomains`, `preload`; Nginx no lo emite | Fuerza HTTPS en clientes que ya confían | Ataques de degradación a HTTP; con certificado autofirmado puede bloquear el acceso (D-06) |
| **X-Accel-Redirect** | Django autoriza y audita; Nginx entrega desde `/_protected/` y `/_catalog/` | Descarga eficiente sin exponer rutas; el backend no sirve el archivo | Descarga directa del volumen, path traversal o agotamiento de workers |
| **X-Forwarded-For** | Nginx -> Django; auditoría y `client_ip` | IP real del cliente detrás del proxy | Auditoría con IP del proxy; pérdida de trazabilidad |
| **X-Request-ID** | Middleware `RequestIdMiddleware`; respuesta y logs | Correlación extremo a extremo | Diagnóstico lento; eventos no correlacionables |
| **CSP** | Nginx `Content-Security-Policy` | Reduce XSS y carga de recursos no autorizados | Mayor superficie de inyección |
| **X-Content-Type-Options** | Nginx y Django en PDF/API | Evita MIME sniffing | Ejecución de contenido mal interpretado |
| **X-Frame-Options / frame-ancestors** | Nginx | Evita clickjacking | La SPA podría embeberse en un sitio malicioso |
| **Referrer-Policy** | Nginx | Limita fuga de URLs | Fuga de rutas internas a terceros |
| **Permissions-Policy** | Nginx | Deshabilita cámara, micrófono y geolocalización | Permisos innecesarios |
| **JWT Bearer** | `Authorization: Bearer <access>`; access 15 min | Autenticación stateless para la API | Robo de token si se almacena mal; sin revocación si no hay refresh controlado |
| **Refresh en cookie** | `gpc_refresh`, `HttpOnly`, `Secure`, `SameSite=Strict`, path `/api/v1/auth/` | JavaScript no puede leerlo; mitiga CSRF y XSS | Robo de sesión, CSRF o persistencia indebida |
| **CORS** | Ausente por mismo origen | Menos superficie y configuración | Bloqueo si se separan dominios |

**[CAPTURA P7-01]** Capturar DevTools -> Network -> una respuesta de la API mostrando `Content-Type`, `Strict-Transport-Security`, `Content-Security-Policy`, `X-Request-ID`, `X-Content-Type-Options` y `Referrer-Policy`; mostrar también `Protocol: http/1.1`.
**[CAPTURA P7-02]** Capturar una tabla o colección de Postman/cURL con respuestas `401`, `403`, `404`, `409`, `410`, `413`, `415`, `429` y `503`, sin datos personales.

---

## 8. Reflexión Técnica Grupal

**¿Cómo influyen los estándares web en la calidad, interoperabilidad, seguridad y mantenibilidad del backend desarrollado?**

Los estándares web no fueron un adorno documental: condicionaron decisiones concretas del proyecto. El sobre JSON universal (`success`, `message`, `data`, `errors`, `meta`) obligó a que todas las vistas y excepciones hablaran el mismo idioma. Eso redujo la lógica del frontend: el interceptor de envelope y el modelo `ApiError` tratan igual un `404` de manuscrito ajeno, un `409` de versión y un `503` de auditoría. La calidad mejora porque los errores dejan de ser cadenas improvisadas y se convierten en códigos estables (`STATE_CONFLICT`, `PDF_TOO_LARGE`, `AUDIT_UNAVAILABLE`) que las pruebas pueden afirmar.

La interoperabilidad se apoya en REST y en los códigos de estado. Usar `201` al crear, `204` al cerrar sesión, `409` al duplicar un envío y `410` al vencer un plazo permite que cualquier cliente —Angular, cURL, Playwright o un futuro consumidor móvil— entienda el resultado sin leer la implementación. El proyecto incluso clasifica 46 combinaciones método+ruta en una matriz de acceso; esa matriz es una forma de contrato ejecutable: si se añade una ruta sin clasificarla, la suite falla. Aquí los estándares funcionan como mecanismo de coordinación del equipo, no solo como especificación técnica.

La seguridad es donde los estándares tienen consecuencia directa. JWT en memoria para el access token y refresh en cookie `HttpOnly`/`SameSite=Strict` separan el riesgo de XSS del riesgo de CSRF; el `404` uniforme para objetos ajenos evita enumeración; `X-Accel-Redirect` con ubicaciones `internal` impide descargar el volumen directamente; y la auditoría append-only con `503` cuando no puede escribirse convierte la trazabilidad en una condición de la operación, no en un registro best-effort. Ninguna de estas decisiones sería verificable sin pruebas que las fijen.

La mantenibilidad muestra una lección concreta: el YAML histórico de `specs/` ya no describe la API, pero el schema runtime generado con `drf-spectacular` sí (44 rutas validadas) y Swagger UI lo hace explorable en desarrollo. La lección no es “OpenAPI no sirve”, sino que un contrato debe generarse en el mismo ciclo que el código. Lo mismo ocurre con los ADR y el portal Quarto: existen y son de calidad, pero están en una rama sin fusionar, así que la entrega no los muestra. El proyecto compensa parcialmente con pruebas, runbook y `compliance.md`, pero esos artefactos no sustituyen un contrato vivo ni una documentación integrada.

Finalmente, los estándares facilitan el trabajo colaborativo porque reducen las decisiones implícitas. Un revisor sabe que un objeto ajeno debe dar `404`; un autor sabe que un PDF inválido da `400` o `413`; un operador sabe que `/media/` debe dar `deny all`; un tester sabe que el envelope siempre trae `request_id`. Esa previsibilidad es la diferencia entre un backend que funciona en la demo y un backend que otro equipo puede operar, auditar y extender sin preguntar al autor original.

**[CAPTURA P8-01]** Opcional: capturar una reunión de retrospectiva o el tablero de acuerdos del equipo. No es una captura de sistema; si no existe, omitir.

---

## 9. Análisis de Decisiones Concretas

### 9.1 Decisión A — JWT en memoria + refresh en cookie HttpOnly

| Aspecto | Desarrollo |
|---|---|
| **Problema existente** | Guardar el access y el refresh en `localStorage` los expone a XSS; guardar solo el access en memoria obliga a resolver la persistencia de sesión y la revocación; un refresh en cookie puede ser vulnerable a CSRF si no se configuran atributos. |
| **Estándar / principio influyente** | RFC 7519 (JWT), RFC 6750 (Bearer), RFC 6265 (cookies), OWASP ASVS y principio de mínimo privilegio. |
| **Alternativa considerada** | a) Ambos tokens en `localStorage`; b) sesión de servidor con cookie de sesión; c) access en memoria y refresh en cookie `HttpOnly`. |
| **Decisión adoptada** | Access token de 15 minutos en memoria; refresh de 7 días en cookie `gpc_refresh` con `HttpOnly`, `Secure` en producción, `SameSite=Strict` y path `/api/v1/auth/`; rotación de refresh, revocación en base de datos y relectura de roles en cada solicitud. |
| **Consecuencia técnica** | XSS no puede leer el refresh; CSRF se mitiga con `SameSite=Strict`; el logout revoca el refresh; la sesión se puede cerrar por inactividad. Coste: más complejidad de rotación, multi-pestaña y recuperación tras expiración; pruebas específicas en `users/test_session_flow.py` y `test_auth_flow_chain.py`. |

### 9.2 Decisión B — `404 Not Found` para objetos ajenos en lugar de `403 Forbidden`

| Aspecto | Desarrollo |
|---|---|
| **Problema existente** | Un `403` sobre un manuscrito ajeno confirma que el recurso existe; un atacante puede enumerar IDs y descubrir material confidencial. |
| **Estándar / principio influyente** | OWASP Authorization/IDOR, RFC 9110 (semántica de `403` y `404`) y principio de mínima revelación. |
| **Alternativa considerada** | a) `403` para todo acceso no autorizado; b) `404` para objetos fuera del ámbito; c) `403` solo cuando falta el rol del módulo. |
| **Decisión adoptada** | `404` uniforme para objetos ajenos, inexistentes o fuera de ámbito; `403` reservado a roles sin permiso de módulo. La matriz de acceso exige que el `404` de un objeto ajeno sea indistinguible del de un objeto inexistente. |
| **Consecuencia técnica** | Se elimina la enumeración por diferencia de código; el cliente no puede saber si el recurso existe. Coste: depuración menos explícita y necesidad de pruebas que comparen cuerpos y estados; implementado en `permissions.py`, `views.py` y `test_access_matrix.py`. |

### 9.3 Decisión C — `X-Accel-Redirect` para PDF en lugar de servir archivos con Django

| Aspecto | Desarrollo |
|---|---|
| **Problema existente** | Servir PDF de hasta 50 MB con Django/Gunicorn ocupa workers y expone rutas; publicar `/media/` directamente permite descargas no autorizadas y path traversal. |
| **Estándar / principio influyente** | Nginx `internal` locations, RFC 9110 (`Content-Disposition`, `Content-Type`), OWASP File Upload y mínimo privilegio. |
| **Alternativa considerada** | a) `FileResponse` de Django; b) `location /media/` público; c) Django autoriza/audita y Nginx entrega desde una ubicación interna. |
| **Decisión adoptada** | Django valida permisos y audita; responde con `X-Accel-Redirect` a `/_protected/` o `/_catalog/`; Nginx entrega el archivo; `/media/` responde `deny all`; el volumen se monta `:ro` en `web`. |
| **Consecuencia técnica** | Descarga eficiente y sin exponer el volumen; el backend no se bloquea con archivos grandes; la auditoría ocurre antes de la entrega y un fallo de auditoría devuelve `503`. Coste: acoplamiento a Nginx, necesidad de probar `X-Accel-Redirect` y de que el header no llegue al cliente; pendiente D-21 sobre el visor del PDF. |

**[CAPTURA P9-01]** Capturar DevTools -> Application -> Cookies, mostrando `gpc_refresh` con `HttpOnly`, `Secure` y `SameSite=Strict`; tapar el valor.
**[CAPTURA P9-02]** Capturar dos respuestas: un manuscrito ajeno que devuelve `404` y una ruta de módulo sin rol que devuelve `403`.
**[CAPTURA P9-03]** Capturar la respuesta de descarga de un PDF con `Content-Type: application/pdf` y `Content-Disposition: attachment`; si se muestra código, incluir `services/downloads.py` con la construcción de `X-Accel-Redirect`.

---

## 10. Pendientes y Limitaciones

| ID | Clasificación | Elemento | Evidencia | Impacto | Acción |
|---|---|---|---|---|---|
| PT-01 | Pendiente técnico | YAML histórico de OpenAPI desactualizado | `specs/001-editorial-workflow/contracts/openapi.yaml`; schema runtime actual en `/api/v1/schema/` | Medio para integración | Regenerar el YAML desde `manage.py spectacular` o marcarlo obsoleto |
| PT-02 | Pendiente técnico | Dashboard con secciones `{}` | D-11, `apps/users/services/dashboard.py` | Medio funcional | Implementar contadores por rol |
| PT-03 | Resuelto en desarrollo | Swagger UI y `/api/v1/schema/` disponibles con `API_DOCS_ENABLED=1` | `backend/config/api.py`; `drf-spectacular`; respuestas `200` verificadas | Bajo | Mantener apagado en producción o protegerlo |
| PT-04 | Pendiente de integración | ADR y portal Quarto existen en `origin/dev/ismael-setup`, no en HEAD; `feature-map.md` sigue ausente | `git ls-tree origin/dev/ismael-setup docs-site/` | Medio para auditoría SDD | Fusionar la rama y crear `feature-map.md` |
| PT-05 | Pendiente técnico | Respaldo cifrado y externo (Q5) | D-30, `scripts/backup.sh` | Alto operativo | Automatizar cifrado y copia externa |
| PT-06 | Pendiente técnico | Certificado institucional | D-02, `nginx/certs/` | Alto para piloto real | Instalar `fullchain.pem` y `privkey.pem` |
| PT-07 | Pendiente técnico | Cron y logrotate no instalados en servidor | D-18, `scripts/cron/` | Medio operativo | Instalar y verificar primera ejecución |
| PT-08 | Pendiente de integración | `docs.yml` referencia `_quarto.yml` y páginas `.qmd` ausentes en HEAD; el job `build` fallaría | `.github/workflows/docs.yml`; `scripts/check_docs_site.py`; `origin/dev/ismael-setup` | Alto para CI documental | Fusionar la rama de documentación antes de ejecutar el workflow |
| PT-09 | Pendiente técnico | `backend/Dockerfile` no copia `conftest.py`; pytest no es reproducible en la imagen sin montaje | `backend/Dockerfile`; `backend/conftest.py` | Alto para CI/reproducibilidad | Añadir `COPY conftest.py ./` y reconstruir la imagen |
| DT-01 | Deuda técnica | `environment.production.ts` con `production: false` y claves duplicadas | D-04 | Bajo | Corregir y probar build |
| DT-02 | Deuda técnica | Sin linter Python (`ruff`) | D-16 | Bajo | Añadir dependencia y job CI |
| DT-03 | Deuda técnica | `toApiError` no usa estado HTTP si falta `code` | D-24 | Bajo | Corregir y probar `502` |
| DT-04 | Deuda técnica | Vulnerabilidad alta en `vite`/`launch-editor` de desarrollo | D-25 | Bajo en producción | `npm audit fix` o actualizar `@angular/build` |
| DT-05 | Deuda técnica | Imagen de producción copia `tests/` | D-08 | Bajo | Etapa de pruebas o exclusión |
| DT-06 | Deuda técnica | `LoadingSpinnerComponent` sin uso | D-13 | Bajo | Quitar import |
| DT-07 | Deuda técnica | Gunicorn definido dos veces | D-14 | Bajo | Unificar |
| DT-08 | Deuda técnica | Contador de campana sin sondeo | D-23 | Bajo | Refrescar al navegar o por intervalo |
| LIM-01 | Limitación del entorno | Node local 22.22.1 insuficiente para Angular 22 | Verificación local | Bajo | Usar `node:22-alpine` o actualizar Node |
| LIM-02 | Limitación del entorno | PostgreSQL local en 5432 ocupado por otro servicio | Verificación local | Bajo | Usar contenedor o cambiar puerto |
| LIM-03 | Limitación del entorno | Certificado autofirmado | `nginx/certs/` | Medio | Instalar certificado institucional |
| LIM-04 | Limitación del entorno | GitHub Actions no ejecutado en GitHub | `.github/workflows/ci.yml` | Medio | Revisar primera corrida real |
| LIM-05 | Limitación del entorno | Sin SMTP real probado | `notifications/delivery.py` | Medio | Probar con SMTP institucional |
| LIM-06 | Limitación del entorno | Sin revisión manual con lector de pantalla | E2E axe | Bajo | Prueba NVDA/VoiceOver |
| LIM-07 | Limitación del entorno | E2E no re-ejecutado en esta corrida | `frontend/e2e/` | Bajo | Ejecutar `./scripts/e2e.sh` |
| RIESGO-01 | Riesgo aceptado | `credentials.txt` en historial; credencial rotada | D-01 | Medio | Mantener rotación; no reescribir historial sin autorización |
| RIESGO-02 | Riesgo aceptado | HSTS `preload` con certificado autofirmado | D-06 | Medio | Decidir con certificado institucional |
| RIESGO-03 | Riesgo aceptado | Sin HTTP/2 | `nginx/conf.d/default.conf` | Bajo | Evaluar `listen 443 ssl http2` o HTTP/3 |
| RIESGO-04 | Riesgo aceptado | Admin apagado en producción | D-31 | Bajo | Usar `create_user` y runbook |
| RIESGO-05 | Riesgo aceptado | Sin revocación automática a los 20 días | D-04 | Bajo | Revocación manual del Editor |
| FUT-01 | Feature futura | Ranking de revisores | `.spec-kit/plan.md` Fuera de alcance | Bajo | Fase 2 |
| FUT-02 | Feature futura | Evaluación paralela por dos revisores | `.spec-kit/plan.md` Fuera de alcance | Bajo | Fase 2 |
| FUT-03 | Feature futura | Identidad externa, nube, móvil, analítica | `.spec-kit/plan.md` Fuera de alcance | Bajo | Fase 2 |
| DOC-01 | Mejora de documentación | `project_status.md` desactualizado | D-15 | Bajo | Fechar o actualizar |
| DOC-02 | Mejora de documentación | Cifras de pruebas dispersas | HANDOFF/compliance | Bajo | Unificar con la corrida actual |
| DOC-03 | Mejora de documentación | `tasks.md` menciona Jasmine/Karma | D-12 | Bajo | Corregir a Vitest |
| DOC-04 | Mejora de documentación | Runbook original afirmaba que no había Swagger UI | `docs/RUNBOOK.md`; §6.10 de este dossier | Bajo | Actualizar el runbook con las rutas `/api/v1/docs/` y `/api/v1/schema/` |

**[CAPTURA P10-01]** Capturar la tabla de deuda técnica de `.spec-kit/compliance.md` §3 o esta tabla, resaltando los ítems de prioridad alta/media.

---

## 11. Matriz de Cierre del Proyecto

| Elemento | Estado | Evidencia (ruta/test/commit) | Responsable | Acción pendiente |
|---|---|---|---|---|
| Constitución y reglas SDD | Completa | `.spec-kit/constitution.md` | Ismael González | Corregir docstrings en inglés |
| Especificación funcional 24 HU / 22 RF | Completa | `.spec-kit/specify.md`; `.spec-kit/plan.md` §9 | Ismael González | Crear `feature-map.md` |
| Plan técnico | Completa | `.spec-kit/plan.md` | Jostin Vasquez | Normalizar prefijo `/api/v1/` |
| Tareas TSK-01…TSK-92 | Completa | `.spec-kit/tasks.md`; `compliance.md` | Jostin Vasquez | Ninguna de implementación |
| ADR formales | Completa en rama remota | `docs-site/ingenieria/adr/0001…0007*.qmd` en `origin/dev/ismael-setup` | Ismael González | Fusionar la rama en `dev/richard-setup` |
| Diagramas C4/UML/BPMN | Completa | `docs-site/diagrams/workspace.dsl`, `c4-codigo-envio.puml`, `proceso-editorial.bpmn`; SVG con `build_docs_diagrams.sh` | Jostin Vasquez | Ninguna; regenerar SVG al cambiar arquitectura |
| OpenAPI runtime | Completa | `drf-spectacular`: 44 rutas, 5590 líneas, validado; `/api/v1/schema/` | Jostin Vasquez | Mantener generación en CI |
| OpenAPI histórico | Parcial | `specs/001-editorial-workflow/contracts/openapi.yaml` desactualizado | Jostin Vasquez | Regenerar o marcar obsoleto |
| Swagger UI | Completa en desarrollo | `/api/v1/docs/` responde `200` con `API_DOCS_ENABLED=1` | Jostin Vasquez | Apagado/protegido en producción |
| Portal Quarto | Pendiente de integración | 26 archivos en `origin/dev/ismael-setup`; ausente en HEAD | Ismael González | Fusionar antes de ejecutar `docs.yml` |
| Autenticación JWT | Completa | `users/views.py`, `services/auth.py`, `test_auth.py` | Jostin Vasquez | Ninguna |
| RBAC y permisos por objeto | Completa | `permissions.py`, `test_access_matrix.py` | Jostin Vasquez | Mantener matriz al añadir rutas |
| Doble ciego | Completa | `reviews/serializers.py`, `test_double_blind.py` | Jostin Vasquez | Ninguna |
| PDF: validación y sanitización | Completa | `publications/services/pdf.py`, `test_pdf.py` | Jostin Vasquez | Ninguna |
| Ciclo de manuscrito | Completa | `publications/views.py`, `services/submission.py`, `test_submission.py` | Jostin Vasquez | Ninguna |
| Editor: asignación y veredicto | Completa | `reviews/views.py`, `services/assignments.py`, `services/verdicts.py` | Jostin Vasquez | Ninguna |
| Revisor: evaluación e incidentes | Completa | `reviews/services/evaluations.py`, `incidents.py` | Jostin Vasquez | Ninguna |
| Catálogo público | Completa | `catalog_views.py`, `catalog_urls.py`, `test_catalog_api.py` | Jostin Vasquez | Verificar visor en navegador (D-21) |
| Auditoría append-only | Completa | `audit/services.py`, `audit/integrity.py`, `tests/audit/` | Jostin Vasquez | Ninguna |
| Notificaciones panel/correo | Completa | `notifications/`, `test_notifications.py` | Jostin Vasquez | Probar SMTP real |
| Dashboard con contadores | Parcial | `services/dashboard.py` devuelve `{}` | Jostin Vasquez | D-11 |
| Frontend SPA | Completa | `frontend/src/app/features/` | Gyna Yupanqui / Jostin Vasquez | Ninguna funcional |
| Pruebas backend | Completa | 1690 passed, 11 skipped, 0 failed | Jostin Vasquez / Miguel Veintimilla | Corregir `conftest.py` en la imagen y repetir en CI |
| Pruebas frontend | Completa | 1308 passed / 75 archivos | Gyna Yupanqui / Jostin Vasquez | Ninguna |
| E2E Playwright | Funcional | `frontend/e2e/` | Jostin Vasquez | Re-ejecutar `./scripts/e2e.sh` |
| CI/CD | Funcional | `.github/workflows/ci.yml`, 9 jobs | Richard Cajas | Primera corrida en GitHub |
| Docker Compose | Completa | `docker-compose.yml`; `docker compose config` | Richard Cajas | Ninguna |
| Nginx/TLS | Funcional | `nginx/conf.d/default.conf`; `verify_pilot.sh` | Richard Cajas | Certificado institucional; evaluar HTTP/2 |
| PostgreSQL y roles | Completa | `docker-compose.yml`; `apply_db_privileges` | Miguel Veintimilla | Ninguna |
| Respaldos y restauración | Funcional | `scripts/backup.sh`, `restore.sh`, `verify_pilot.sh` | Richard Cajas | D-30 respaldo externo cifrado |
| Runbook y onboarding | Completa | `docs/RUNBOOK.md`, `README.md`, `QUICKSTART.md` | Richard Cajas | Actualizar Swagger y montaje de `conftest.py` |
| Documentación de cierre | Completa | Este dossier | Ismael González / Richard Cajas | Capturas y revisión final |
| Reproducibilidad de pruebas | Parcial | `backend/Dockerfile` sin `COPY conftest.py` | Richard Cajas / Jostin Vasquez | Corregir Dockerfile y reconstruir imagen |

**[CAPTURA P11-01]** Capturar esta matriz de cierre o un tablero equivalente con los estados `Completa`, `Funcional` y `Parcial`.

---

## 12. Validación del Repositorio y Referencias

### 12.1 Validación ejecutada

| Comando | Resultado |
|---|---|
| `docker run --rm --network proyecto_gpc_backend_net --env-file .env -v "$PWD/backend/conftest.py:/app/conftest.py:ro" gpc-backend-test python -m pytest -q` | **1690 passed, 11 skipped, 0 failed** (18:17) |
| `docker run --rm --env-file .env gpc-backend-test python manage.py check` | 0 issues |
| `npx ng test --watch=false` en `node:22-alpine` | **1308 passed / 75 archivos** |
| `npx ng build --configuration production` en `node:22-alpine` | Correcto (1 warning de import sin uso: `LoadingSpinnerComponent`) |
| `python3 scripts/check_frontend_build.py` | Correcto (14 comprobaciones) |
| `manage.py spectacular --validate --fail-on-warn` | **44 rutas, 5590 líneas, sin advertencias** |
| `Client().get(...)` con `API_DOCS_ENABLED=1` | `/api/v1/docs/` 200, `/api/v1/schema/` 200, `/api/health/` 200, `/api/v1/` 200 |
| `docker compose config --quiet` | Correcto |
| `python3 scripts/check_runbook.py` | Correcto |
| `python3 scripts/check_docs_site.py` | **Falla**: no existe `docs-site/_quarto.yml` en HEAD |
| `./scripts/smoke_media_isolation.sh` | Correcto según corrida previa; no re-ejecutado hoy |
| `./scripts/e2e.sh` | No re-ejecutado en esta corrida |
| `git status --short` | Solo el dossier nuevo sin seguimiento (`?? dossier/DOSSIER_TECNICO_CIERRE.md`); sin cambios en código |

**Condiciones de la corrida backend:** PostgreSQL 16 en el contenedor `proyecto_gpc-db-1`, red `proyecto_gpc_backend_net`, variables cargadas desde `.env` y `conftest.py` montado desde el host. Sin ese montaje, la imagen `gpc-backend-test` falla porque el Dockerfile no copia `backend/conftest.py`. El PostgreSQL local en `127.0.0.1:5432` pertenece a otro servicio y no se usó. La corrida completa tardó 18:17 y emitió 61 advertencias, incluida la clave HMAC de pruebas de 24 bytes; no hubo fallos.

### 12.2 Referencias

**Estándares y RFC**

1. IETF. *RFC 9110 — HTTP Semantics*. 2022.
2. IETF. *RFC 9111 — HTTP Caching*. 2022.
3. IETF. *RFC 6750 — The OAuth 2.0 Authorization Framework: Bearer Token Usage*. 2012.
4. IETF. *RFC 7519 — JSON Web Token (JWT)*. 2015.
5. IETF. *RFC 6265 — HTTP State Management Mechanism*. 2011.
6. IETF. *RFC 3986 — Uniform Resource Identifier (URI): Generic Syntax*. 2005.
7. W3C. *Web Content Accessibility Guidelines (WCAG) 2.2*. 2023.

**Seguridad y gestión**

8. OWASP Foundation. *OWASP Top 10 — 2021*.
9. OWASP Foundation. *OWASP Application Security Verification Standard (ASVS)*, versión vigente.
10. OWASP Foundation. *REST Security Cheat Sheet*.
11. OWASP Foundation. *File Upload Cheat Sheet*.
12. ISO/IEC. *ISO/IEC 27001:2022 — Information security, cybersecurity and privacy protection — Information security management systems — Requirements*.
13. NIST. *SP 800-63B — Digital Identity Guidelines: Authentication and Lifecycle Management*.
14. NIST. *SP 800-53 Rev. 5 — Security and Privacy Controls for Information Systems and Organizations*.

**Tecnología**

15. Django Software Foundation. *Django 5.2 Documentation*.
16. Encode OSS. *Django REST Framework 3.18 Documentation*.
17. Jazzband. *djangorestframework-simplejwt Documentation*.
18. F5. *NGINX 1.27 Documentation*.
19. PostgreSQL Global Development Group. *PostgreSQL 16 Documentation*.
20. Google. *Angular 22 Documentation*.
21. Docker. *Docker Compose Documentation*.

**Repositorio**

22. `README.md` — instalación, operación y estado.
23. `QUICKSTART.md` — comandos rápidos.
24. `docs/RUNBOOK.md` — operación y aceptación del piloto.
25. `.spec-kit/constitution.md` — reglas del proyecto.
26. `.spec-kit/specify.md` — especificación funcional.
27. `.spec-kit/plan.md` — plan técnico.
28. `.spec-kit/tasks.md` — 92 tareas.
29. `.spec-kit/compliance.md` — matriz de cumplimiento y deuda.
30. `.spec-kit/HANDOFF.md` — estado histórico y trampas conocidas.
31. `specs/001-editorial-workflow/spec.md` — flujo editorial.
32. `specs/002-manuscript-registration/spec.md` — registro de manuscrito.
33. `specs/001-institutional-auth/spec.md` — autenticación.
34. `specs/001-editorial-workflow/contracts/openapi.yaml` — contrato histórico (desactualizado).
35. `backend/tests/security/test_access_matrix.py` — matriz de acceso.
36. `frontend/e2e/02-ciclo-completo.e2e.ts` — flujo E2E de registro a retiro.
37. `scripts/smoke_media_isolation.sh` — aislamiento de medios.
38. `scripts/verify_pilot.sh` — verificación de piloto.
39. `.github/workflows/ci.yml` — pipeline de calidad (9 jobs).
40. `docs-site/diagrams/workspace.dsl` — modelo C4 niveles 1–3.
41. `docs-site/diagrams/c4-codigo-envio.puml` — C4 nivel 4 del envío.
42. `docs-site/diagrams/proceso-editorial.bpmn` y `bpmn.html` — proceso editorial y visor.
43. `docs-site/ingenieria/adr/0001…0007*.qmd` (en `origin/dev/ismael-setup`) — registro ADR.
44. `docs-site/_quarto.yml` y páginas `.qmd` (en `origin/dev/ismael-setup`) — portal de documentación.

**[CAPTURA P12-01]** Capturar el árbol raíz del repositorio y los 9 jobs de `.github/workflows/ci.yml`, mostrando que el dossier es el único archivo nuevo sin seguimiento.

### 12.3 Lista de verificación pre-entrega

**Verificado**

- [x] Backend: 1690 pruebas aprobadas, 11 omitidas, 0 fallos.
- [x] `manage.py check` sin incidencias.
- [x] Frontend: 1308 pruebas aprobadas.
- [x] Build de producción correcto y sin `sourceMap`.
- [x] OpenAPI runtime validado (44 rutas, 5590 líneas).
- [x] Swagger UI y schema disponibles en desarrollo (`200`).
- [x] `docker compose config --quiet` válido.
- [x] Runbook validado con `check_runbook.py`.
- [x] Aislamiento de medios validado en corrida previa.
- [x] Sin cambios en código; el dossier es un archivo nuevo no versionado.
- [x] Constitución revisada contra implementación.
- [x] Trazabilidad de HU-04 revisada.
- [x] Hallazgos SEC-01…SEC-09 consolidados.
- [x] Decisiones JWT, 404 y `X-Accel-Redirect` documentadas.
- [x] Deuda y pendientes clasificados.
- [x] Matriz de cierre completa.

**Pendiente antes de entregar**

- [ ] Re-ejecutar E2E (`./scripts/e2e.sh`) y guardar evidencia.
- [ ] Regenerar `specs/.../openapi.yaml` desde el schema runtime o marcarlo obsoleto.
- [ ] Fusionar `origin/dev/ismael-setup` para integrar el portal Quarto y los 7 ADR.
- [ ] Crear `feature-map.md` (ausente en todas las ramas).
- [ ] Añadir `COPY conftest.py ./` al `backend/Dockerfile`.
- [ ] Implementar contadores del dashboard (D-11).
- [ ] Instalar certificado institucional.
- [ ] Automatizar respaldo cifrado externo (D-30).
- [ ] Instalar cron y logrotate en el servidor.
- [ ] Ejecutar CI en GitHub Actions y revisar la primera corrida.
- [ ] Probar SMTP institucional real.
- [ ] Revisar accesibilidad con lector de pantalla.
- [ ] Actualizar `project_status.md` y cifras históricas.
- [ ] Tomar las capturas del Anexo A.
- [ ] Revisar el documento en PDF y firmar la portada.

---

## Anexo A. Capturas consolidadas

**Total: 33 capturas** — 32 obligatorias y 1 opcional (`P8-01`). Las capturas `Px-yy` evidencian cada punto del dossier; las `UI-01…UI-06` documentan las pantallas principales por rol y pueden reutilizarse en los puntos 3 y 5.

| ID | Punto | Qué capturar | Qué debe verse |
|---|---|---|---|
| P1-01 | 1 | Contribuciones del equipo | `git shortlog -sne --all` o gráfica de GitHub con nombres y commits |
| P2-01 | 2 | Árbol de artefactos | `.spec-kit/`, `specs/`, `dossier/`, `docs/`, `docs-site/`; señalar `feature-map.md` ausente, ADR en rama remota y diagramas C4/BPMN versionados |
| P2-02 | 2 | OpenAPI histórico vs runtime | Comparación del YAML de `specs/` con el schema generado (44 rutas) o con `path(` de `backend/apps/*/urls.py` |
| P2-03 | 2 | Swagger UI | `/api/v1/docs/` abierto, con una operación desplegada y el schema cargado |
| P2-04 | 2 | C4 y BPMN | Render de `workspace.dsl` (contexto/contenedores/componentes) y visor `bpmn.html` |
| P3-01 | 3 | Registro de manuscrito | Formulario del Autor y confirmación con código, `v1` y ronda `0` |
| P3-02 | 3 | Llamadas API | Network con `POST /api/v1/manuscripts/`, `draft-file` y `submit` |
| P3-03 | 3 | Pruebas de la feature | pytest de `test_submission.py`, `test_draft_file.py`, `test_pdf.py`, `test_access_matrix.py` |
| P4-01 | 4 | Coherencia constitucional | Tabla de `compliance.md` o constitución junto a pruebas |
| P5-01 | 5 | Índice del dossier | Portada y tabla de contenido con las 13 secciones |
| P6-01 | 6 | `.env` y Compose | `.env` con secretos tapados y `docker compose config` sin errores |
| P6-02 | 6 | Servicios | `docker compose ps` con `db`, `backend` y `web` saludables |
| P6-03 | 6 | Salud | JSON de `https://localhost/api/health/` |
| P6-04 | 6 | Login y panel | Pantalla de login y panel unificado |
| P6-05 | 6 | pytest | Resumen final `1690 passed, 11 skipped, 0 failed` y el comando usado |
| P6-06 | 6 | ng test | Resumen `75 archivos / 1308 passed` |
| P6-07 | 6 | Build | Salida de build de producción y `check_frontend_build.py` |
| P6-08 | 6 | OpenAPI | `manage.py spectacular --validate --fail-on-warn` sin advertencias y las rutas `/api/v1/schema/`, `/api/v1/docs/` con `200` |
| P7-01 | 7 | Cabeceras y protocolo | DevTools con HSTS, CSP, `X-Request-ID`, `nosniff`, `Referrer-Policy`, `http/1.1` |
| P7-02 | 7 | Códigos de estado | Respuestas `401`, `403`, `404`, `409`, `410`, `413`, `415`, `429`, `503` |
| P8-01 | 8 | Retrospectiva (opcional) | Reunión o tablero de acuerdos del equipo |
| P9-01 | 9 | Cookie de refresh | `gpc_refresh` con `HttpOnly`, `Secure`, `SameSite=Strict` (valor tapado) |
| P9-02 | 9 | 404 vs 403 | Objeto ajeno `404` y módulo sin rol `403` |
| P9-03 | 9 | Descarga PDF | `Content-Type: application/pdf`, `Content-Disposition: attachment`; código de `X-Accel-Redirect` si se muestra |
| P10-01 | 10 | Deuda | Tabla de deuda de `compliance.md` §3 o la tabla del punto 10 |
| P11-01 | 11 | Matriz de cierre | Matriz con estados `Completa`, `Funcional`, `Parcial` |
| P12-01 | 12 | Repositorio y CI | Árbol raíz y jobs de `.github/workflows/ci.yml` |
| UI-01 | 3/5 | Formulario de manuscrito | Campos obligatorios, uploader PDF y botón de envío |
| UI-02 | 5 | Bandeja del Editor | Envío con código, estado y acción “Pasar a revisión” |
| UI-03 | 5 | Vista del Revisor | Manuscrito sin identidad del Autor y botón de descarga sanitizada |
| UI-04 | 5 | Catálogo público | Búsqueda, ficha y descarga sin sesión |
| UI-05 | 5 | Auditoría | Tabla de eventos con actor, acción, entidad y resultado |
| UI-06 | 5 | Panel unificado | Secciones de todos los roles activos sin selector de rol |

**Regla de captura:** usar datos de demostración, no personas reales. Tapar tokens, cookies, contraseñas, correos y cualquier dato personal. Si una captura incluye una terminal, ocultar rutas absolutas con nombres de usuario si no son relevantes.

---

## Cierre

El proyecto está **funcional y verificable**: el flujo editorial completo existe, las pruebas de backend y frontend pasan, el build de producción es correcto y la infraestructura se valida con Compose, runbook y aislamiento de medios. La entrega puede hacerse con un piloto controlado.

La diferencia entre “funciona” y “está listo para producción” está en los pendientes operativos: certificado institucional, respaldo cifrado externo, cron/logrotate, SMTP real y primera corrida de GitHub Actions. La diferencia entre “tiene documentación” y “tiene documentación SDD confiable” está en integrar el portal Quarto y los ADR de `origin/dev/ismael-setup`, regenerar el YAML histórico desde el schema runtime, crear `feature-map.md` y hacer reproducible pytest dentro de la imagen. Ambos frentes están identificados, con responsable y acción en la matriz de cierre.

No se realizaron commits ni cambios de código durante esta verificación; el único cambio es este dossier nuevo, sin commitear, en `dev/richard-setup` sobre `4ea4de170f600574b86440c95142639babf8413a`. La entrega debe decidir si fusiona `origin/dev/ismael-setup` para incorporar el portal Quarto y los ADR, y si corrige el `Dockerfile` para que pytest sea reproducible sin montar `conftest.py`.
