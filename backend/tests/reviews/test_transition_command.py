"""``apply_auto_review_transition``: los expedientes en curso continúan solos (T097, FR-039)."""

from __future__ import annotations

from io import StringIO

import pytest
from django.core.management import call_command

from apps.audit.models import AuditLog
from apps.publications.models import Manuscript
from apps.reviews.models import Assignment, RankingAdjustment
from apps.users.models import Role, UserRole
from tests.factories import FinalEvaluationFactory, UserFactory
from tests.reviews.support import make_assignment, make_reviewer, seeded_roles, submitted  # noqa: F401

pytestmark = pytest.mark.django_db


@pytest.fixture
def transition(django_capture_on_commit_callbacks, seeded_roles):  # noqa: F811
    def run() -> str:
        out = StringIO()
        with django_capture_on_commit_callbacks(execute=True):
            call_command("apply_auto_review_transition", stdout=out)
        return out.getvalue()

    return run


def test_editor_roles_are_revoked_with_an_audit_event_and_the_role_is_retired(transition) -> None:
    Role.objects.create(code="EDITOR", name="Editor")
    editor = UserFactory()
    row = UserRole.objects.create(user=editor, role=Role.objects.get(code="EDITOR"))

    transition()

    row.refresh_from_db()
    assert row.is_active is False and row.revoked_at is not None
    assert Role.objects.get(code="EDITOR").is_active is False
    audit = AuditLog.objects.get(action="ROLE_REVOKED")
    assert audit.entity_id == row.pk and audit.actor_id is None


def test_the_legacy_expired_assignments_are_closed_without_penalty(transition) -> None:
    reviewer = make_reviewer()
    manuscript = submitted(status="UNDER_REVIEW")
    legacy = make_assignment(manuscript, reviewer, days_ago=40, status="EXPIRED")
    new_style = make_assignment(manuscript, make_reviewer(), slot=2, days_ago=40, status="EXPIRED", release_cause="OVERDUE")

    transition()

    legacy.refresh_from_db(), new_style.refresh_from_db()
    assert (legacy.status, legacy.release_cause) == ("REVOKED", "LEGACY_TRANSITION")
    assert new_style.status == "EXPIRED" and new_style.release_cause == "OVERDUE"
    assert not RankingAdjustment.objects.exists()
    reviewer.reviewer_profile.refresh_from_db()
    assert reviewer.reviewer_profile.ranking_score == 100


def test_the_submitted_manuscripts_receive_their_assignments(transition) -> None:
    make_reviewer(), make_reviewer()
    manuscript = submitted()

    transition()

    manuscript.refresh_from_db()
    assert manuscript.status == Manuscript.Status.UNDER_REVIEW
    assert Assignment.objects.filter(manuscript=manuscript, status="ACTIVE").count() == 2


def test_an_under_review_manuscript_with_one_legacy_evaluation_completes_slot_2_and_is_decided(transition) -> None:
    manuscript = submitted(status="UNDER_REVIEW")
    first = make_assignment(manuscript, make_reviewer(), status="COMPLETED")
    FinalEvaluationFactory(assignment=first, legacy=True, recommendation="REJECT", comments_for_author="No.")
    free = make_reviewer()

    transition()

    second = Assignment.objects.get(manuscript=manuscript, slot=2)
    assert second.reviewer_id == free.pk and second.status == "ACTIVE"
    # La segunda evaluación (rúbrica 2) llega después; con la primera heredada «REJECT» se decide por la clasificación.
    FinalEvaluationFactory(
        assignment=second, recommendation="REJECTED", comments_for_author="x" * 120
    )
    Assignment.objects.filter(pk=second.pk).update(status="COMPLETED")

    transition()

    manuscript.refresh_from_db()
    assert manuscript.status == "REJECTED"
    assert manuscript.verdicts.get().origin == "CONSENSUS"


def test_running_it_twice_has_no_effect(transition) -> None:
    Role.objects.create(code="EDITOR", name="Editor")
    UserRole.objects.create(user=UserFactory(), role=Role.objects.get(code="EDITOR"))
    make_reviewer(), make_reviewer()
    submitted()

    first = transition()
    audits = AuditLog.objects.count()
    second = transition()

    assert first and second == ""
    assert AuditLog.objects.count() == audits
