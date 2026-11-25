"""Notifications over a whole editorial cycle (TSK-79, HU-24).

Acceptance criterion: the notifications do not duplicate events. The cycle
runs through the real endpoints; the tests then count what each person got,
replay the domain signals, and look for the other side's identity in every
notice, panel response and mail.
"""

from __future__ import annotations

from collections import Counter

import pytest
from django.core import mail
from django.core.management import call_command

from apps.notifications.models import Notification
from apps.publications.models import Manuscript
from apps.publications.signals import manuscript_submitted, verdict_registered
from apps.reviews.models import Evaluation
from apps.reviews.signals import announce, assignment_created, evaluation_submitted
from tests.factories import UserFactory
from tests.phase5 import AUTHOR_TOKENS, EVALUATION, REVIEWER_TOKENS, Lifecycle
from tests.publications.test_manuscript_api import actor, client_for
from tests.publications.test_submission import media_root, seeded_roles, submit  # noqa: F401

pytestmark = pytest.mark.django_db


@pytest.fixture
def flow(django_capture_on_commit_callbacks, submit) -> Lifecycle:  # noqa: F811
    return Lifecycle.create(django_capture_on_commit_callbacks, submit)


def panel(user) -> list[Notification]:
    return list(Notification.objects.filter(recipient=user, channel="PANEL").order_by("created_at", "id"))


def mails(user) -> list[Notification]:
    return list(Notification.objects.filter(recipient=user, channel="EMAIL").order_by("created_at", "id"))


def kinds(notices) -> list[str]:
    return sorted(n.event_type for n in notices)


def blob(notices) -> str:
    return " ".join(str(n.payload) for n in notices)


def replay_signals(flow: Lifecycle) -> None:
    """Fire again the signals of the cycle, with the real identifiers."""
    manuscript = flow.manuscript
    version = manuscript.versions.get()
    assignment = flow.assignment_of(flow.reviewer)
    evaluation = Evaluation.objects.get(assignment=assignment)
    verdict = manuscript.verdicts.get()
    manuscript_submitted.send_robust(
        sender=Manuscript, manuscript_id=manuscript.pk, version_id=version.pk,
        submitted_by_id=flow.author.pk,
    )
    announce(
        assignment_created, assignment_id=assignment.pk, manuscript_id=manuscript.pk,
        reviewer_id=flow.reviewer.pk,
    )
    announce(
        evaluation_submitted, evaluation_id=evaluation.pk, assignment_id=assignment.pk,
        manuscript_id=manuscript.pk, reviewer_id=flow.reviewer.pk,
    )
    verdict_registered.send_robust(
        sender=Manuscript, manuscript_id=manuscript.pk, verdict_id=verdict.pk,
        decision="ACCEPTED",
    )


class TestOneNoticePerEvent:


    def test_no_recipient_has_the_same_event_twice(self, flow) -> None:
        flow.accepted()
        replay_signals(flow)

        pairs = Counter(Notification.objects.values_list("recipient_id", "event_key"))
        assert pairs and max(pairs.values()) == 1

    def test_replaying_every_signal_creates_nothing_new(self, flow) -> None:
        flow.accepted()
        before = set(Notification.objects.values_list("pk", flat=True))

        replay_signals(flow)

        assert set(Notification.objects.values_list("pk", flat=True)) == before

    def test_the_assignment_notice_carries_the_deadline_once(self, flow) -> None:
        flow.accepted()

        (notice,) = [n for n in panel(flow.reviewer) if n.event_type == "ASSIGNMENT_CREATED"]
        assert notice.payload["due_at"] == flow.assignment_of(flow.reviewer).due_at.isoformat()
        assert notice.payload["manuscript_code"] == flow.manuscript.code




class TestCorrectionNotices:


    def test_the_administrators_reason_never_reaches_a_notice(self, flow) -> None:
        manuscript = flow.accepted()
        flow.correct(manuscript.verdicts.get().pk, decision="REJECTED", key="c-0")

        everything = blob(Notification.objects.all())

        assert "evaluación equivocada" not in everything


class TestNoCrossIdentity:
    def test_nothing_for_the_reviewer_names_the_author_in_the_whole_cycle(self, flow) -> None:
        manuscript = flow.accepted()
        flow.correct(manuscript.verdicts.get().pk, decision="REJECTED", key="c-1")
        flow.withdraw()

        text = blob(panel(flow.reviewer) + mails(flow.reviewer))
        response = client_for(flow.reviewer).get("/api/v1/notifications/").content.decode()

        assert panel(flow.reviewer)
        for token in AUTHOR_TOKENS:
            assert token not in text and token not in response

    def test_nothing_for_the_author_names_the_reviewer_or_the_confidential_text(self, flow) -> None:
        manuscript = flow.accepted()
        flow.correct(manuscript.verdicts.get().pk, decision="REJECTED", key="c-1")

        text = blob(panel(flow.author) + mails(flow.author))
        response = client_for(flow.author).get("/api/v1/notifications/").content.decode()

        assert len(panel(flow.author)) >= 3
        for token in (*REVIEWER_TOKENS, "evaluación equivocada"):
            assert token not in text and token not in response
        assert str(flow.reviewer.pk) not in response and flow.reviewer.email not in response


class TestMailDelivery:
    def test_mail_goes_out_once_and_the_panel_is_unchanged(self, flow) -> None:
        flow.accepted()
        twins = Notification.objects.filter(channel="EMAIL").count()
        panel_before = list(Notification.objects.filter(channel="PANEL").values_list("pk", "status", "read_at"))

        call_command("send_pending_notifications")
        call_command("send_pending_notifications")

        assert len(mail.outbox) == twins
        assert not Notification.objects.filter(channel="EMAIL").exclude(status="SENT").exists()
        assert list(Notification.objects.filter(channel="PANEL").values_list("pk", "status", "read_at")) == panel_before
        recipients = Counter(address for message in mail.outbox for address in message.to)
        assert recipients[flow.reviewer.email] == 1

    def test_the_mails_keep_the_double_blind(self, flow) -> None:
        flow.accepted()
        call_command("send_pending_notifications")

        for message in mail.outbox:
            text = message.subject + message.body
            if message.to == [flow.reviewer.email]:
                assert not any(token in text for token in AUTHOR_TOKENS)
            if message.to == [flow.author.email]:
                assert not any(token in text for token in REVIEWER_TOKENS)
            assert EVALUATION["comments_for_author"] not in message.subject

    def test_reading_one_notice_does_not_touch_the_others_or_the_mail(self, flow) -> None:
        flow.accepted()
        notice = panel(flow.author)[0]
        client = client_for(flow.author)

        assert client.patch(f"/api/v1/notifications/{notice.pk}/read/").status_code == 200

        assert client.get("/api/v1/notifications/").json()["unread_count"] == len(panel(flow.author)) - 1
        assert not mails(flow.author)[0].read_at
        assert client_for(UserFactory()).get("/api/v1/notifications/").json()["count"] == 0
