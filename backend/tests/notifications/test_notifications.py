"""Tests for the notifications of Phase 5 (TSK-75, HU-24, RF-20).

Acceptance criteria: each recipient gets one notice per event; the
notices for the reviewer carry no author data and the ones for the author
no reviewer data (checked on the notice already built, plan section 2.9
point 3); and the panel works while the mail is still ``PENDING`` or
``FAILED``.
"""

from __future__ import annotations

import json
from datetime import timedelta

import pytest
from django.core import mail
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.notifications.models import Notification
from apps.notifications.payloads import PAYLOAD_FIELDS, build_payload
from apps.publications.models import Manuscript
from apps.publications.signals import (
    manuscript_submitted,
    manuscript_withdrawn,
    new_version_submitted,
    verdict_registered,
)
from apps.reviews.models import IncidentReport
from apps.reviews.signals import (
    announce,
    assignment_created,
    assignment_expired,
    assignment_revoked,
    evaluation_submitted,
    incident_reported,
    incident_resolved,
)
from tests.factories import ManuscriptAuthorFactory, UserFactory
from tests.publications.test_manuscript_api import actor, client_for
from tests.reviews.support import make_assignment, make_reviewer, submitted

pytestmark = pytest.mark.django_db

AUTHOR_NAME = "Marcela Quizhpe Ordóñez"
AUTHOR_SECRETS = ("Marcela", "Quizhpe", "Ordóñez", "marcela.autora", "Instituto Secreto")
REVIEWER_NAME = "Rodrigo Valarezo Cueva"
REVIEWER_SECRETS = ("Rodrigo", "Valarezo", "Cueva", "rodrigo.revisor")


@pytest.fixture(autouse=True)
def seeded_roles(db) -> None:
    call_command("seed_roles", verbosity=0)


@pytest.fixture(autouse=True)
def media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    return tmp_path


@pytest.fixture
def author():
    return actor("AUTHOR", first_name="Marcela", last_name="Quizhpe Ordóñez", email="marcela.autora@unl.edu.ec")


@pytest.fixture
def reviewer():
    return make_reviewer(first_name="Rodrigo", last_name="Valarezo Cueva", email="rodrigo.revisor@unl.edu.ec")


@pytest.fixture
def manuscript(author) -> Manuscript:
    item = submitted(author, status="UNDER_REVIEW")
    item.authors.update(full_name=AUTHOR_NAME, affiliation="Instituto Secreto")
    return item


@pytest.fixture
def assignment(manuscript, reviewer):
    return make_assignment(manuscript, reviewer)


def panel(user, **filters):
    return list(Notification.objects.filter(recipient=user, channel="PANEL", **filters))


def mails(user):
    return list(Notification.objects.filter(recipient=user, channel="EMAIL"))


def text_of(notices) -> str:
    return json.dumps([n.payload for n in notices], ensure_ascii=False)


class TestPayload:
    def test_only_allowlisted_fields_are_accepted(self) -> None:
        with pytest.raises(ValueError, match="reviewer_name"):
            build_payload(title="T", message="M", link="/x", reviewer_name="Rodrigo")

    def test_required_fields(self) -> None:
        with pytest.raises(ValueError, match="link"):
            build_payload(title="T", message="M")

    def test_payload_has_exactly_the_planned_keys(self) -> None:
        payload = build_payload(title="T", message="M", link="/x")

        assert tuple(payload) == PAYLOAD_FIELDS
        assert payload["due_at"] is None


class TestReviewerNotices:
    def test_assignment_created_tells_the_reviewer_the_deadline(self, assignment, reviewer) -> None:
        announce(assignment_created, assignment_id=assignment.pk, manuscript_id=assignment.manuscript_id,
                 reviewer_id=reviewer.pk)

        (notice,) = panel(reviewer)
        assert notice.event_type == "ASSIGNMENT_CREATED"
        assert notice.status == "SENT" and notice.sent_at is not None
        assert notice.payload["manuscript_code"] == assignment.manuscript.code
        assert notice.payload["manuscript_title"] == assignment.manuscript.title
        assert notice.payload["due_at"] == assignment.due_at.isoformat()
        assert notice.payload["action"]
        assert notice.payload["link"] == f"/app/reviewer/assignments/{assignment.pk}"

    @pytest.mark.parametrize("cause", ["OVERDUE", "CONFLICT_OF_INTEREST", "MANUSCRIPT_WITHDRAWN"])
    def test_revocation_tells_the_reviewer_without_the_free_text(self, assignment, reviewer, cause) -> None:
        announce(assignment_revoked, assignment_id=assignment.pk, manuscript_id=assignment.manuscript_id,
                 reviewer_id=reviewer.pk, cause=cause)

        (notice,) = panel(reviewer)
        assert notice.event_type == "ASSIGNMENT_REVOKED"
        assert notice.payload["link"] == "/app/reviewer/assignments"

    def test_an_inactive_reviewer_gets_nothing(self, assignment, reviewer) -> None:
        type(reviewer).objects.filter(pk=reviewer.pk).update(is_active=False)

        announce(assignment_created, assignment_id=assignment.pk, manuscript_id=assignment.manuscript_id,
                 reviewer_id=reviewer.pk)

        assert Notification.objects.count() == 0




class TestAuthorNotices:


    @pytest.mark.parametrize(
        ("decision", "title", "has_action"),
        [
            ("ACCEPTED", "Manuscrito aceptado", False),
            ("REJECTED", "Manuscrito rechazado", False),
            ("CHANGES_REQUESTED", "Se solicitan cambios", True),
        ],
    )
    def test_verdict_notifies_the_author(self, manuscript, author, decision, title, has_action) -> None:
        announce(verdict_registered, manuscript_id=manuscript.pk,
                 verdict_id="33333333-3333-3333-3333-333333333333", decision=decision)

        (notice,) = panel(author)
        assert notice.payload["title"] == title
        assert bool(notice.payload["action"]) is has_action



    def test_anonymized_version_request_reaches_the_author_without_the_report(
        self, assignment, author, reviewer
    ) -> None:
        incident = IncidentReport.objects.create(
            assignment=assignment, manuscript=assignment.manuscript, reporter=reviewer,
            report_type="IDENTITY_LEAK", description="DESCRIPCION_CONFIDENCIAL",
        )

        announce(incident_resolved, incident_id=incident.pk, assignment_id=assignment.pk,
                 manuscript_id=assignment.manuscript_id, resolution="REQUEST_ANONYMIZED_VERSION",
                 correction_round_id=None)

        (notice,) = panel(author)
        body = text_of([notice]).lower()
        assert notice.event_type == "ANONYMIZED_VERSION_REQUESTED"
        assert notice.payload["action"]
        for word in ("reporte", "fuga", "incidente", "revisor", "confidencial", "descripcion"):
            assert word not in body
        for secret in REVIEWER_SECRETS:
            assert secret not in text_of([notice])

    @pytest.mark.parametrize("resolution", ["REASSIGN", "DISMISS"])
    def test_other_resolutions_do_not_notify_the_author(self, assignment, author, reviewer, resolution) -> None:
        incident = IncidentReport.objects.create(
            assignment=assignment, manuscript=assignment.manuscript, reporter=reviewer,
            report_type="OTHER", description="x" * 30,
        )

        announce(incident_resolved, incident_id=incident.pk, assignment_id=assignment.pk,
                 manuscript_id=assignment.manuscript_id, resolution=resolution, correction_round_id=None)

        assert panel(author) == []


class TestOneNoticePerEvent:
    def fire(self, assignment, reviewer):
        announce(assignment_created, assignment_id=assignment.pk, manuscript_id=assignment.manuscript_id,
                 reviewer_id=reviewer.pk)

    def test_the_same_event_twice_creates_one_panel_and_one_mail_notice(self, assignment, reviewer) -> None:
        self.fire(assignment, reviewer)
        self.fire(assignment, reviewer)

        assert len(panel(reviewer)) == 1 and len(mails(reviewer)) == 1

    def test_the_mail_twin_is_pending_and_never_listed_in_the_panel(self, assignment, reviewer) -> None:
        self.fire(assignment, reviewer)

        (twin,) = mails(reviewer)
        assert twin.status == "PENDING" and twin.attempts == 0
        assert twin.payload == panel(reviewer)[0].payload



    def test_a_failing_receiver_never_breaks_the_business_action(self, manuscript, monkeypatch) -> None:
        from apps.notifications import receivers

        def boom(*args, **kwargs):
            raise RuntimeError("fallo simulado")

        monkeypatch.setattr(receivers, "authors_of", boom)

        announce(verdict_registered, manuscript_id=manuscript.pk,
                 verdict_id="44444444-4444-4444-4444-444444444444", decision="ACCEPTED")

        assert Notification.objects.count() == 0






class TestApi:
    URL = "/api/v1/notifications/"

    def make(self, user, key="k1", read=False, **overrides):
        return Notification.objects.create(
            recipient=user, event_key=key, event_type="ASSIGNMENT_CREATED", channel="PANEL",
            status="SENT", sent_at=timezone.now(), read_at=timezone.now() if read else None,
            payload=build_payload(title="T", message="M", link="/app/x"), **overrides,
        )

    def test_anonymous_gets_401(self) -> None:
        assert APIClient().get(self.URL).status_code == 401
        assert APIClient().post(self.URL + "read-all/").status_code == 401

    def test_lists_only_own_panel_notices_newest_first_with_unread_count(self) -> None:
        user, other = UserFactory(), UserFactory()
        old = self.make(user, "old", read=True)
        Notification.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=1))
        new = self.make(user, "new")
        self.make(other, "foreign")
        Notification.objects.create(
            recipient=user, event_key="new#email", event_type="X", channel="EMAIL", payload={}, status="PENDING"
        )

        body = client_for(user).get(self.URL).json()

        assert [row["id"] for row in body["results"]] == [str(new.pk), str(old.pk)]
        assert body["count"] == 2 and body["unread_count"] == 1

    def test_response_fields_are_the_planned_ones(self) -> None:
        user = UserFactory()
        self.make(user)

        row = client_for(user).get(self.URL).json()["results"][0]

        assert set(row) == {"id", "event_type", "payload", "is_read", "read_at", "created_at"}
        assert set(row["payload"]) == set(PAYLOAD_FIELDS)

    def test_read_filter(self) -> None:
        user = UserFactory()
        unread, read = self.make(user, "a"), self.make(user, "b", read=True)
        client = client_for(user)

        assert [r["id"] for r in client.get(self.URL, {"read": "false"}).json()["results"]] == [str(unread.pk)]
        assert [r["id"] for r in client.get(self.URL, {"read": "true"}).json()["results"]] == [str(read.pk)]
        assert client.get(self.URL, {"read": "quizas"}).status_code == 400

    def test_mark_one_read_is_idempotent(self) -> None:
        user = UserFactory()
        notice = self.make(user)
        client = client_for(user)

        first = client.patch(f"{self.URL}{notice.pk}/read/")
        stamp = Notification.objects.get(pk=notice.pk).read_at
        second = client.patch(f"{self.URL}{notice.pk}/read/")

        assert first.status_code == second.status_code == 200
        assert first.json()["is_read"] is True
        assert Notification.objects.get(pk=notice.pk).read_at == stamp

    def test_someone_elses_notice_answers_404_and_stays_unread(self) -> None:
        owner, intruder = UserFactory(), UserFactory()
        notice = self.make(owner)

        response = client_for(intruder).patch(f"{self.URL}{notice.pk}/read/")

        assert response.status_code == 404
        assert Notification.objects.get(pk=notice.pk).read_at is None

    def test_the_mail_twin_cannot_be_marked_through_the_api(self) -> None:
        user = UserFactory()
        twin = Notification.objects.create(
            recipient=user, event_key="e#email", event_type="X", channel="EMAIL", payload={}
        )

        assert client_for(user).patch(f"{self.URL}{twin.pk}/read/").status_code == 404

    def test_read_all_marks_only_own_notices(self) -> None:
        user, other = UserFactory(), UserFactory()
        self.make(user, "a"), self.make(user, "b")
        foreign = self.make(other, "c")

        response = client_for(user).post(self.URL + "read-all/")

        assert response.status_code == 204
        assert client_for(user).get(self.URL).json()["unread_count"] == 0
        assert Notification.objects.get(pk=foreign.pk).read_at is None



