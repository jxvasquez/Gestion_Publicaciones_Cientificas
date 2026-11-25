"""Tests for the confidential identity-leak report and its resolution (TSK-64).

Covers the acceptance criteria: only the owner of an ``ACTIVE`` assignment
reports, privately, without changing the evaluation; ``REQUEST_ANONYMIZED_VERSION``
leaves the manuscript in ``CHANGES_REQUESTED``, opens the round and stores
``correction_round_id``, ``REASSIGN`` revokes and keeps ``UNDER_REVIEW`` and
``DISMISS`` changes no state; and the resolution is recorded once (``409``
when repeated) and never exposes the reviewer to the author.

The author-side checks read the real author endpoints and look at the
serialized text, so a value under any key would fail too.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.audit.services import AuditService, AuditUnavailable
from apps.publications.models import CorrectionRound, Manuscript, StatusEvent, Verdict
from apps.reviews.models import Assignment, Evaluation, IncidentReport
from apps.reviews.signals import (
    assignment_revoked,
    incident_reported,
    incident_resolved,
)
from tests.factories import EvaluationFactory, ManuscriptAuthorFactory
from tests.publications.test_manuscript_api import (  # noqa: F401
    actor,
    client_for,
    detail_url as manuscript_url,
    error_code,
)
from tests.publications.test_new_version import send  # noqa: F401
from tests.publications.test_submission import (  # noqa: F401
    media_root,
    owner,
    ready_draft,
    seeded_roles,
    submit,
)
from tests.reviews.support import make_assignment, make_reviewer, submitted

pytestmark = pytest.mark.django_db

DESCRIPTION = "El PDF menciona la afiliación del grupo de investigación en la página 3."
REVIEWER_BASE = "/api/v1/reviewer/assignments/"
ADMIN_BASE = "/api/v1/admin/incidents/"


@pytest.fixture
def admin():
    return actor("ADMIN")


@pytest.fixture
def reviewer():
    return make_reviewer()


@pytest.fixture
def assignment(owner, reviewer) -> Assignment:
    """An ``ACTIVE`` assignment over a manuscript ``UNDER_REVIEW``."""
    manuscript = submitted(owner, status="UNDER_REVIEW")
    return make_assignment(manuscript, reviewer)


def leak_url(assignment) -> str:
    return f"{REVIEWER_BASE}{assignment.pk}/identity-leak/"


def report(user, assignment, body: dict | None = None):
    payload = {"report_type": "IDENTITY_LEAK", "description": DESCRIPTION}
    payload.update(body or {})
    return client_for(user).post(leak_url(assignment), payload, format="json")


def resolve_url(incident_id) -> str:
    return f"{ADMIN_BASE}{incident_id}/resolve/"


def resolve(user, incident_id, resolution: str | None):
    body = {} if resolution is None else {"resolution": resolution}
    return client_for(user).post(resolve_url(incident_id), body, format="json")


def open_incident(reviewer, assignment) -> IncidentReport:
    assert report(reviewer, assignment).status_code == 201
    return IncidentReport.objects.get(assignment=assignment)


@contextmanager
def listening(signal):
    received: list[dict] = []

    def listener(sender, **kwargs) -> None:
        kwargs.pop("signal", None)
        received.append(kwargs)

    signal.connect(listener, weak=False)
    try:
        yield received
    finally:
        signal.disconnect(listener)


def failing_audit(monkeypatch) -> None:
    def fail(**kwargs):
        raise AuditUnavailable("sin auditoría")

    monkeypatch.setattr(AuditService, "record", staticmethod(fail))


def set_status(assignment, status: str) -> None:
    Assignment.objects.filter(pk=assignment.pk).update(status=status)


class TestReportAccess:
    def test_anonymous_requests_answer_401(self, assignment) -> None:
        assert APIClient().post(leak_url(assignment), {}, format="json").status_code == 401


    def test_a_foreign_assignment_answers_404(self, assignment) -> None:
        response = report(make_reviewer(), assignment)

        assert response.status_code == 404 and error_code(response) == "NOT_FOUND"
        assert not IncidentReport.objects.exists()

    def test_a_coauthor_reviewer_gets_404(self, reviewer, assignment) -> None:
        ManuscriptAuthorFactory(manuscript=assignment.manuscript, user=reviewer, author_order=9)

        assert report(reviewer, assignment).status_code == 404

    def test_only_post_is_allowed(self, reviewer, assignment) -> None:
        client = client_for(reviewer)

        assert client.get(leak_url(assignment)).status_code == 405
        assert client.put(leak_url(assignment), {}, format="json").status_code == 405
        assert client.delete(leak_url(assignment)).status_code == 405


class TestReport:
    def test_creates_an_open_report_and_returns_only_the_receipt(self, reviewer, assignment) -> None:
        response = report(reviewer, assignment, {"description": f"  {DESCRIPTION}  "})

        assert response.status_code == 201
        body = response.json()
        assert set(body) == {"id", "assignment", "report_type", "status", "created_at"}
        assert body["status"] == "OPEN" and body["report_type"] == "IDENTITY_LEAK"
        incident = IncidentReport.objects.get()
        assert str(incident.pk) == body["id"] and incident.description == DESCRIPTION
        assert incident.reporter_id == reviewer.pk
        assert incident.manuscript_id == assignment.manuscript_id
        assert incident.resolution is None and incident.correction_round_id is None
        assert DESCRIPTION not in response.content.decode()

    def test_other_is_a_valid_type(self, reviewer, assignment) -> None:
        assert report(reviewer, assignment, {"report_type": "OTHER"}).status_code == 201

    @pytest.mark.parametrize(
        "body",
        [
            {"report_type": "SPAM"},
            {"report_type": None},
            {"description": ""},
            {"description": "    "},
            {"description": "x" * 5001},
        ],
    )
    def test_an_invalid_body_answers_400(self, reviewer, assignment, body) -> None:
        response = report(reviewer, assignment, body)

        assert response.status_code == 400 and error_code(response) == "VALIDATION_ERROR"
        assert not IncidentReport.objects.exists()

    def test_missing_fields_answer_400(self, reviewer, assignment) -> None:
        response = client_for(reviewer).post(leak_url(assignment), {}, format="json")

        assert response.status_code == 400
        assert set(response.json()["error"]["details"]) == {"report_type", "description"}

    def test_a_second_open_report_answers_409(self, reviewer, assignment) -> None:
        open_incident(reviewer, assignment)

        response = report(reviewer, assignment)

        assert response.status_code == 409 and error_code(response) == "STATE_CONFLICT"
        assert IncidentReport.objects.count() == 1


    @pytest.mark.parametrize("status", ["COMPLETED", "REVOKED", "EXPIRED"])
    def test_a_non_active_assignment_answers_409(self, reviewer, assignment, status) -> None:
        set_status(assignment, status)

        response = report(reviewer, assignment)

        assert response.status_code == 409 and error_code(response) == "STATE_CONFLICT"
        assert not IncidentReport.objects.exists()

    def test_an_active_assignment_past_its_deadline_can_still_report(
        self, reviewer, assignment
    ) -> None:
        due_at = timezone.now() - timedelta(days=1)
        Assignment.objects.filter(pk=assignment.pk).update(
            due_at=due_at, assigned_at=due_at - timedelta(days=20)
        )

        assert report(reviewer, assignment).status_code == 201

    def test_it_changes_neither_the_evaluation_nor_the_manuscript_nor_the_assignment(
        self, reviewer, assignment
    ) -> None:
        draft = EvaluationFactory(assignment=assignment, lock_version=1, literature_grounding=3)
        manuscript_before = Manuscript.objects.get(pk=assignment.manuscript_id)
        assignment_before = Assignment.objects.get(pk=assignment.pk)
        events_before = StatusEvent.objects.count()

        report(reviewer, assignment)

        draft.refresh_from_db()
        assert (draft.status, draft.lock_version, draft.literature_grounding, draft.conflict_declared) == (
            "DRAFT", 1, 3, False,
        )
        manuscript_after = Manuscript.objects.get(pk=assignment.manuscript_id)
        assert (manuscript_after.status, manuscript_after.lock_version) == (
            manuscript_before.status, manuscript_before.lock_version,
        )
        assignment_after = Assignment.objects.get(pk=assignment.pk)
        assert (assignment_after.status, assignment_after.lock_version) == (
            assignment_before.status, assignment_before.lock_version,
        )
        assert StatusEvent.objects.count() == events_before

    def test_the_reviewer_keeps_evaluating_after_reporting(self, reviewer, assignment) -> None:
        open_incident(reviewer, assignment)

        response = client_for(reviewer).put(
            f"{REVIEWER_BASE}{assignment.pk}/evaluation/",
            {"literature_grounding": 4},
            format="json",
            HTTP_IF_MATCH='"0"',
        )

        assert response.status_code == 200
        assert Evaluation.objects.get(assignment=assignment).literature_grounding == 4

    def test_the_report_is_audited_without_the_description(self, reviewer, assignment) -> None:
        incident = open_incident(reviewer, assignment)

        row = AuditLog.objects.get(action="IDENTITY_LEAK_REPORTED")
        assert row.actor_id == reviewer.pk and row.actor_role == "REVIEWER"
        assert row.entity_type == "INCIDENT_REPORT" and row.entity_id == incident.pk
        assert row.request_id
        assert row.details == {
            "manuscript_id": str(assignment.manuscript_id),
            "assignment_id": str(assignment.pk),
            "report_type": "IDENTITY_LEAK",
        }
        assert DESCRIPTION not in str(row.details) + str(row.reason)

    def test_an_unavailable_audit_answers_503_and_keeps_nothing(
        self, reviewer, assignment, monkeypatch
    ) -> None:
        failing_audit(monkeypatch)

        response = report(reviewer, assignment)

        assert response.status_code == 503 and error_code(response) == "AUDIT_UNAVAILABLE"
        assert not IncidentReport.objects.exists()


    def test_no_event_is_sent_when_the_report_fails(
        self, reviewer, assignment, django_capture_on_commit_callbacks
    ) -> None:
        set_status(assignment, "REVOKED")

        with listening(incident_reported) as received:
            with django_capture_on_commit_callbacks(execute=True):
                report(reviewer, assignment)

        assert received == []




class TestResolveAccess:
    @pytest.mark.parametrize("role", ["AUTHOR", "REVIEWER"])
    def test_other_roles_answer_403(self, reviewer, assignment, role) -> None:
        incident = open_incident(reviewer, assignment)
        user = make_reviewer() if role == "REVIEWER" else actor(role)

        assert resolve(user, incident.pk, "DISMISS").status_code == 403
        incident.refresh_from_db()
        assert incident.status == "OPEN"

    def test_the_reporter_cannot_resolve_their_own_report(self, reviewer, assignment) -> None:
        incident = open_incident(reviewer, assignment)

        assert resolve(reviewer, incident.pk, "DISMISS").status_code == 403
















class TestAuthorNeverLearns:
    """CA-HU-16-06: the author reads nothing of the report nor of the reviewer."""

    @pytest.fixture
    def secrets(self, reviewer, assignment) -> list[str]:
        return [
            reviewer.get_full_name(),
            reviewer.email,
            reviewer.institutional_id,
            DESCRIPTION,
            "IDENTITY_LEAK",
            "identity-leak",
            "incident",
            "fuga",
        ]

    def author_text(self, owner, assignment) -> str:
        client = client_for(owner)
        manuscript = assignment.manuscript
        responses = [
            client.get(manuscript_url(manuscript)),
            client.get(f"{manuscript_url(manuscript)}history/"),
            client.get(f"{manuscript_url(manuscript)}versions/"),
            client.get("/api/v1/manuscripts/"),
        ]
        assert all(r.status_code == 200 for r in responses)
        return "".join(r.content.decode() + str(r.headers) for r in responses)

    def test_while_the_report_is_open(self, owner, reviewer, assignment, secrets) -> None:
        incident = open_incident(reviewer, assignment)

        text = self.author_text(owner, assignment)

        for secret in [*secrets, str(incident.pk)]:
            assert secret.lower() not in text.lower()



    def test_the_author_cannot_reach_the_incident_endpoints(
        self, owner, reviewer, assignment
    ) -> None:
        incident = open_incident(reviewer, assignment)
        client = client_for(owner)

        assert client.get(ADMIN_BASE).status_code == 403
        assert client.post(resolve_url(incident.pk), {}, format="json").status_code == 403
        assert client.post(leak_url(assignment), {}, format="json").status_code == 403
