"""Ayudas compartidas por las pruebas del flujo de revisión (spec 004).

Sustituyen a las que vivían en la suite del Editor: cuentas de revisor con sus carreras,
manuscritos enviados y asignaciones con el plazo exacto. Nada aquí usa el rol Editor.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.publications.models import Manuscript
from apps.reviews.models import Assignment
from apps.users.models import ReviewerProfile
from tests.factories import (
    ManuscriptAuthorFactory,
    ManuscriptFactory,
    ManuscriptVersionFactory,
    area,
)
from tests.publications.test_manuscript_api import actor

#: Código de la carrera que usan por defecto los manuscritos y los revisores de las pruebas.
AREA = "agronomia"


@pytest.fixture
def seeded_roles(db) -> None:
    call_command("seed_roles", verbosity=0)


def make_reviewer(*, areas=(AREA,), available=True, ranking_score=100, **overrides):
    """Revisor activo con su perfil y sus carreras (códigos del catálogo)."""
    user = actor("REVIEWER", **overrides)
    profile = ReviewerProfile.objects.create(
        user=user, is_available=available, ranking_score=ranking_score
    )
    profile.areas.set([area(code) for code in areas])
    return user


def submitted(owner=None, *, status="SUBMITTED", **overrides) -> Manuscript:
    """Un manuscrito enviado: fila de autor, versión 1 y sus carreras."""
    owner = owner or actor("AUTHOR")
    areas = overrides.pop("areas", [overrides.pop("area", AREA)])
    manuscript = ManuscriptFactory(
        created_by=owner, status=status, current_version=1, areas=list(areas), **overrides
    )
    ManuscriptAuthorFactory(
        manuscript=manuscript,
        user=owner,
        email=owner.email,
        is_corresponding=True,
        author_order=1,
    )
    ManuscriptVersionFactory(manuscript=manuscript, submitted_by=owner)
    return manuscript


def make_assignment(manuscript, reviewer, *, days_ago=0, slot=1, **overrides) -> Assignment:
    """Asignación con el plazo exacto de 20 días; ``assigned_by=None`` es el sistema."""
    assigned_at = timezone.now() - timedelta(days=days_ago)
    values = {
        "manuscript": manuscript,
        "version": manuscript.versions.get(version_number=manuscript.current_version or 1),
        "reviewer": reviewer,
        "slot": slot,
        "assigned_by": None,
        "assigned_at": assigned_at,
        "due_at": assigned_at + timedelta(days=20),
        **overrides,
    }
    return Assignment.objects.create(**values)


def results(response) -> list[dict]:
    return response.json()["results"]
