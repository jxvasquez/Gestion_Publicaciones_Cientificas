"""Dos evaluaciones finales simultáneas producen un solo veredicto (T063, SC-004)."""

from __future__ import annotations

import pytest

from apps.publications.models import StatusEvent, Verdict
from apps.reviews.models import Assignment
from apps.reviews.services.consensus import decide_version
from tests.factories import FinalEvaluationFactory
from tests.parallel import run_parallel
from tests.reviews.support import make_assignment, make_reviewer, seeded_roles, submitted  # noqa: F401

pytestmark = pytest.mark.django_db(transaction=True)

LONG = "Comentarios detallados del revisor sobre el manuscrito. " * 3


def test_two_simultaneous_decisions_leave_one_ordinary_verdict(seeded_roles) -> None:  # noqa: F811
    manuscript = submitted(status="UNDER_REVIEW")
    for slot in (1, 2):
        assignment = make_assignment(manuscript, make_reviewer(), slot=slot, status="COMPLETED")
        FinalEvaluationFactory(
            assignment=assignment, recommendation="REJECTED", comments_for_author=LONG
        )

    results = run_parallel([lambda: decide_version(manuscript.pk), lambda: decide_version(manuscript.pk)])

    assert len([r for r in results if r is not None]) == 1
    assert Verdict.objects.filter(manuscript=manuscript, previous_verdict__isnull=True).count() == 1
    assert StatusEvent.objects.filter(manuscript=manuscript, to_status="REJECTED").count() == 1
