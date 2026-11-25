"""Políticas fijas de la asignación automática, el ranking y la rúbrica (spec 004).

Son constantes de negocio: no se configuran por entorno ni por perfil. Este
módulo no importa modelos, de modo que los modelos y las migraciones de
cualquier aplicación pueden importarlo sin ciclos.
"""

from __future__ import annotations

#: Cupo estricto de asignaciones ``ACTIVE`` por revisor (FR-013).
MAX_ACTIVE_ASSIGNMENTS = 5

#: Cupos iniciales de cada versión (FR-010).
REVIEWERS_PER_VERSION = 2

#: Cupo del revisor de desempate (FR-023).
TIE_BREAKER_SLOT = 3

#: Plazo de cada asignación en días calendario (FR-015).
ASSIGNMENT_DAYS = 20

#: Puntaje de ranking inicial de todo revisor (FR-028).
RANKING_BASE_SCORE = 100

#: Bonificación por una evaluación final enviada antes de ``due_at`` (FR-029).
ON_TIME_BONUS = 10

#: Penalización por vencer sin evaluación final (FR-030).
MISSED_DEADLINE_PENALTY = -20

#: Carreras o áreas máximas por manuscrito (FR-008).
MAX_AREAS_PER_MANUSCRIPT = 3

#: Caracteres mínimos de los comentarios para el autor cuando se exigen (FR-019).
JUSTIFICATION_MIN_LENGTH = 100

#: Un criterio con este valor o menos exige justificación.
JUSTIFICATION_SCORE_THRESHOLD = 3
