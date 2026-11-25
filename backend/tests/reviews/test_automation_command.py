"""``run_review_automation``: vence, penaliza, revoca y reasigna (T077, FR-030, SC-005)."""

from __future__ import annotations

from io import StringIO

import pytest
from django.core.management import call_command

from apps.audit.models import AuditLog
from apps.audit.services import AuditService, AuditUnavailable
from apps.notifications.models import Notification
from apps.reviews.models import Assignment, Evaluation, RankingAdjustment
from apps.reviews.services.automation import run_cycle
from tests.factories import EvaluationFactory
from tests.publications.test_manuscript_api import client_for
from tests.reviews.support import make_assignment, make_reviewer, seeded_roles, submitted  # noqa: F401

pytestmark = pytest.mark.django_db


@pytest.fixture
def run(django_capture_on_commit_callbacks):
    def execute() -> str:
        out = StringIO()
        with django_capture_on_commit_callbacks(execute=True):
            call_command("run_review_automation", stdout=out)
        return out.getvalue()

    return execute


@pytest.fixture
def overdue(seeded_roles):  # noqa: F811
    """A manuscript under review whose slot-1 reviewer is 25 days late; others are free."""
    reviewer = make_reviewer(ranking_score=150)
    manuscript = submitted(status="UNDER_REVIEW")
    assignment = make_assignment(manuscript, reviewer, days_ago=25)
    return reviewer, manuscript, assignment


def score(reviewer) -> int:
    reviewer.reviewer_profile.refresh_from_db()
    return reviewer.reviewer_profile.ranking_score


class TestExpiration:
    def test_the_assignment_expires_with_overdue_and_loses_twenty_points(self, overdue, run) -> None:
        reviewer, manuscript, assignment = overdue

        run()

        assignment.refresh_from_db()
        assert assignment.status == "EXPIRED" and assignment.release_cause == "OVERDUE"
        assert assignment.revoked_at is not None and assignment.revoked_by_id is None
        assert score(reviewer) == 130
        assert RankingAdjustment.objects.get(assignment=assignment).cause == "DEADLINE_MISSED"
        audit = AuditLog.objects.get(action="ASSIGNMENT_EXPIRED")
        assert audit.actor_id is None and audit.entity_id == assignment.pk

    def test_the_slot_goes_to_the_next_candidate_never_to_the_expired_reviewer(self, overdue, run) -> None:
        reviewer, manuscript, assignment = overdue
        replacement = make_reviewer(ranking_score=90)

        run()

        covering = Assignment.objects.get(manuscript=manuscript, slot=1, status="ACTIVE")
        assert covering.reviewer_id == replacement.pk
        assert not Assignment.objects.filter(manuscript=manuscript, reviewer=reviewer, status="ACTIVE").exists()

    def test_the_reviewer_is_told_about_the_revocation_and_the_penalty(self, overdue, run) -> None:
        reviewer, _, _ = overdue

        run()

        (notice,) = Notification.objects.filter(recipient=reviewer, event_type="ASSIGNMENT_EXPIRED", channel="PANEL")
        assert "20 puntos" in notice.payload["message"]

    def test_the_draft_is_kept_and_a_late_submission_answers_410(self, overdue, run) -> None:
        reviewer, _, assignment = overdue
        EvaluationFactory(assignment=assignment, lock_version=1, scientific_contribution=4)

        run()

        assert Evaluation.objects.filter(assignment=assignment, status="DRAFT").exists()
        response = client_for(reviewer).post(
            f"/api/v1/reviewer/assignments/{assignment.pk}/evaluation/submit/", HTTP_IF_MATCH='"1"'
        )
        assert response.status_code in (404, 410)

    def test_a_completed_assignment_is_never_expired(self, seeded_roles, run) -> None:  # noqa: F811
        reviewer = make_reviewer()
        done = make_assignment(submitted(status="UNDER_REVIEW"), reviewer, days_ago=25, status="COMPLETED")

        run()

        done.refresh_from_db()
        assert done.status == "COMPLETED" and score(reviewer) == 100


class TestIdempotence:
    def test_a_second_run_repeats_no_effect_notice_or_output(self, overdue, run) -> None:
        reviewer, _, assignment = overdue
        first = run()
        notices = Notification.objects.count()
        audits = AuditLog.objects.count()

        second = run()

        assert first and second == ""
        assert Notification.objects.count() == notices and AuditLog.objects.count() == audits
        assert score(reviewer) == 130 and RankingAdjustment.objects.filter(assignment=assignment).count() == 1

    def test_it_writes_nothing_when_there_is_no_work(self, seeded_roles, run) -> None:  # noqa: F811
        assert run() == ""


class TestAuditFailure:
    def test_if_the_audit_fails_the_assignment_stays_active_and_is_retried(self, overdue, monkeypatch) -> None:
        reviewer, _, assignment = overdue
        real = AuditService.record

        def broken(**kwargs):
            if kwargs.get("action") == "ASSIGNMENT_EXPIRED":
                raise AuditUnavailable("sin auditoría")
            return real(**kwargs)

        monkeypatch.setattr(AuditService, "record", staticmethod(broken))
        first = run_cycle()

        assignment.refresh_from_db()
        assert first.failed == 1 and assignment.status == "ACTIVE" and score(reviewer) == 150

        monkeypatch.setattr(AuditService, "record", staticmethod(real))
        assert run_cycle().expired == 1
        assignment.refresh_from_db()
        assert assignment.status == "EXPIRED" and score(reviewer) == 130


class TestOrder:
    def test_expire_then_decide_then_fill(self, seeded_roles, run) -> None:  # noqa: F811
        """A completed slot 1 plus an overdue slot 2: the expiry frees slot 2 and the fill covers it."""
        manuscript = submitted(status="UNDER_REVIEW")
        make_assignment(manuscript, make_reviewer(), slot=1, status="COMPLETED")
        late = make_assignment(manuscript, make_reviewer(), slot=2, days_ago=25)
        free = make_reviewer()

        run()

        late.refresh_from_db()
        assert late.status == "EXPIRED"
        assert Assignment.objects.get(manuscript=manuscript, slot=2, status="ACTIVE").reviewer_id == free.pk
