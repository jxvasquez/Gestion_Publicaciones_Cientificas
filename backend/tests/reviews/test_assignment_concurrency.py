"""Asignación concurrente: tope de cinco activas y cupos sin duplicar (T034, SC-002)."""

from __future__ import annotations

import pytest
from django.db import IntegrityError, transaction
from django.db.utils import DatabaseError

from apps.reviews.models import Assignment
from apps.reviews.services.assignments import fill_review_slots
from tests.parallel import run_parallel
from tests.reviews.support import make_assignment, make_reviewer, seeded_roles, submitted  # noqa: F401

pytestmark = pytest.mark.django_db(transaction=True)


def task_for(manuscript_id):
    def run():
        return fill_review_slots(manuscript_id)

    return run


def test_twenty_simultaneous_submissions_never_exceed_five_active_per_reviewer(seeded_roles) -> None:  # noqa: F811
    reviewers = [make_reviewer() for _ in range(6)]
    manuscripts = [submitted() for _ in range(20)]

    run_parallel([task_for(m.pk) for m in manuscripts])

    for reviewer in reviewers:
        assert Assignment.objects.filter(reviewer=reviewer, status="ACTIVE").count() <= 5
    # 6 revisores × 5 cupos = 30 cupos para 40 requeridos: los demás quedan pendientes.
    assert Assignment.objects.filter(status="ACTIVE").count() == 30
    for manuscript in manuscripts:
        slots = list(Assignment.objects.filter(manuscript=manuscript, status="ACTIVE").values_list("slot", flat=True))
        assert len(slots) == len(set(slots))  # ningún cupo duplicado


def test_two_simultaneous_fills_of_the_same_manuscript_do_not_duplicate_slots(seeded_roles) -> None:  # noqa: F811
    for _ in range(4):
        make_reviewer()
    manuscript = submitted()

    run_parallel([task_for(manuscript.pk), task_for(manuscript.pk)])

    assert sorted(Assignment.objects.filter(manuscript=manuscript).values_list("slot", flat=True)) == [1, 2]


def test_a_direct_insert_of_the_sixth_active_assignment_fails_in_the_database(seeded_roles) -> None:  # noqa: F811
    reviewer = make_reviewer()
    for _ in range(5):
        make_assignment(submitted(status="UNDER_REVIEW"), reviewer)

    with pytest.raises((IntegrityError, DatabaseError), match="5 asignaciones activas"):
        with transaction.atomic():
            make_assignment(submitted(status="UNDER_REVIEW"), reviewer)
