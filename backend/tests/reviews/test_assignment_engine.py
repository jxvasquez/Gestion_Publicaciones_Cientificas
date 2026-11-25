"""``fill_review_slots()`` y ``fill_pending_slots()``: dos revisores por versión (T033)."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.notifications.models import Notification
from apps.publications.models import Manuscript, StatusEvent
from apps.reviews.models import Assignment
from apps.reviews.services.assignments import (
    awaiting_reviewers,
    fill_pending_slots,
    fill_review_slots,
    release_assignment,
)
from tests.reviews.support import make_assignment, make_reviewer, seeded_roles, submitted  # noqa: F401
from tests.publications.test_manuscript_api import actor

pytestmark = pytest.mark.django_db


@pytest.fixture
def fill(django_capture_on_commit_callbacks):
    def run(manuscript):
        with django_capture_on_commit_callbacks(execute=True):
            return fill_review_slots(manuscript.pk)

    return run


@pytest.fixture
def manuscript(seeded_roles):  # noqa: F811
    return submitted()


class TestTwoSlots:
    def test_two_distinct_reviewers_and_the_manuscript_goes_under_review(self, manuscript, fill) -> None:
        best, second, _ = (make_reviewer(ranking_score=score) for score in (120, 110, 100))

        created = fill(manuscript)

        assert [(a.slot, a.reviewer_id) for a in created] == [(1, best.pk), (2, second.pk)]
        manuscript.refresh_from_db()
        assert manuscript.status == Manuscript.Status.UNDER_REVIEW
        event = StatusEvent.objects.get(manuscript=manuscript, to_status="UNDER_REVIEW")
        assert event.from_status == "SUBMITTED" and event.actor_id is None

    def test_the_deadline_is_twenty_days_from_the_database_clock(self, manuscript, fill) -> None:
        make_reviewer(), make_reviewer()

        for assignment in fill(manuscript):
            assert assignment.due_at - assignment.assigned_at == timedelta(days=20)
            assert assignment.assigned_by_id is None
            assert abs(assignment.assigned_at - timezone.now()) < timedelta(minutes=1)

    def test_every_assignment_is_audited_with_the_system_as_actor(self, manuscript, fill) -> None:
        make_reviewer(), make_reviewer()

        fill(manuscript)

        events = AuditLog.objects.filter(action="AUTO_ASSIGNMENT_CREATED")
        assert events.count() == 2 and all(e.actor_id is None and e.actor_role is None for e in events)

    def test_the_reviewers_and_the_author_are_told(self, manuscript, fill) -> None:
        first, second = make_reviewer(), make_reviewer()

        fill(manuscript)

        kinds = sorted(Notification.objects.filter(channel="PANEL").values_list("event_type", flat=True))
        assert kinds.count("ASSIGNMENT_CREATED") == 2 and kinds.count("REVIEW_STARTED") == 1


class TestPendingSlots:
    def test_a_single_candidate_leaves_slot_2_pending(self, manuscript, fill) -> None:
        make_reviewer()

        created = fill(manuscript)

        assert [a.slot for a in created] == [1]
        manuscript.refresh_from_db()
        assert manuscript.status == Manuscript.Status.UNDER_REVIEW
        assert list(awaiting_reviewers()) == [manuscript]

    def test_without_candidates_it_stays_submitted_and_one_notice_per_slot_goes_to_the_admin(
        self, manuscript, fill
    ) -> None:
        admin = actor("ADMIN")

        fill(manuscript), fill(manuscript), fill(manuscript)

        manuscript.refresh_from_db()
        assert manuscript.status == Manuscript.Status.SUBMITTED
        assert AuditLog.objects.filter(action="ASSIGNMENT_SLOT_UNFILLED").count() == 2  # cupos 1 y 2
        notices = Notification.objects.filter(recipient=admin, event_type="SLOT_UNFILLED", channel="PANEL")
        assert notices.count() == 2
        assert all(n.payload["link"] == "/app/admin/reviewers" for n in notices)

    def test_a_pending_slot_is_covered_as_soon_as_a_reviewer_appears(self, manuscript, fill) -> None:
        make_reviewer()
        fill(manuscript)
        late = make_reviewer()

        with_late = fill(manuscript)

        assert [(a.slot, a.reviewer_id) for a in with_late] == [(2, late.pk)]
        assert list(awaiting_reviewers()) == []

    def test_the_queue_is_first_come_first_served(self, seeded_roles, django_capture_on_commit_callbacks) -> None:  # noqa: F811
        newest, oldest = submitted(), submitted()

        only = make_reviewer()
        with django_capture_on_commit_callbacks(execute=True):
            # Dos cupos libres en total para un solo revisor: la cola decide quién lo recibe.
            fill_pending_slots()

        assert Assignment.objects.count() == 2
        assert Assignment.objects.filter(reviewer=only).count() == 2
        assert {a.manuscript_id for a in Assignment.objects.all()} == {newest.pk, oldest.pk}

    def test_a_withdrawn_manuscript_is_skipped(self, manuscript, fill) -> None:
        make_reviewer(), make_reviewer()
        Manuscript.objects.filter(pk=manuscript.pk).update(is_active=False, withdrawn_at=timezone.now())

        assert fill(manuscript) == [] and Assignment.objects.count() == 0

    def test_running_twice_creates_no_duplicates(self, manuscript, fill) -> None:
        make_reviewer(), make_reviewer(), make_reviewer()

        fill(manuscript)
        again = fill(manuscript)

        assert again == [] and Assignment.objects.count() == 2


class TestRelease:
    def test_a_released_slot_is_covered_by_the_next_candidate_and_not_by_the_same_reviewer(
        self, manuscript, fill, django_capture_on_commit_callbacks
    ) -> None:
        first, second, third = (make_reviewer(ranking_score=score) for score in (120, 110, 100))
        fill(manuscript)
        assignment = Assignment.objects.get(reviewer=first)

        with django_capture_on_commit_callbacks(execute=True):
            release_assignment(
                assignment, cause="CONFLICT_OF_INTEREST", actor=first, actor_role="REVIEWER", context={}
            )

        assignment.refresh_from_db()
        assert assignment.status == "REVOKED" and assignment.release_cause == "CONFLICT_OF_INTEREST"
        slot_one = Assignment.objects.get(manuscript=manuscript, slot=1, status="ACTIVE")
        assert slot_one.reviewer_id == third.pk
