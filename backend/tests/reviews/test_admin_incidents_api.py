"""Incidentes en el módulo del Administrador (T095, FR-004 y FR-005)."""

from __future__ import annotations

import pytest

from apps.audit.models import AuditLog
from apps.notifications.models import Notification
from apps.publications.models import CorrectionRound, Manuscript, StatusEvent
from apps.reviews.models import Assignment, IncidentReport, RankingAdjustment
from tests.factories import FinalEvaluationFactory, IncidentReportFactory, ManuscriptAuthorFactory
from tests.phase5 import Lifecycle
from tests.publications.test_manuscript_api import actor, client_for
from tests.publications.test_submission import media_root, seeded_roles, submit  # noqa: F401
from tests.reviews.support import make_assignment, make_reviewer, submitted

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/incidents/"
LONG = "Comentarios detallados del revisor sobre el manuscrito. " * 3


@pytest.fixture
def admin(seeded_roles):  # noqa: F811
    return actor("ADMIN")


def reported(manuscript=None, *, status="ACTIVE", **overrides):
    manuscript = manuscript or submitted(status="UNDER_REVIEW")
    reviewer = make_reviewer()
    assignment = make_assignment(manuscript, reviewer, status=status)
    return IncidentReportFactory(assignment=assignment, manuscript=manuscript, reporter=reviewer, **overrides)


def resolve(admin, incident, resolution):
    return client_for(admin).post(f"{BASE}{incident.pk}/resolve/", {"resolution": resolution}, format="json")


class TestList:
    def test_it_lists_with_the_reporter_and_the_manuscript_context(self, admin) -> None:
        incident = reported()

        (row,) = client_for(admin).get(BASE).json()["results"]

        assert row["id"] == str(incident.pk) and row["status"] == "OPEN"
        assert row["reporter"]["email"] == incident.reporter.email
        assert {"manuscript_code", "manuscript_title", "manuscript_status", "version_number"} <= set(row)
        assert row["manuscript_status"] == "UNDER_REVIEW" and row["version_number"] == 1

    def test_the_status_filter_and_an_invalid_one(self, admin) -> None:
        open_one = reported()
        done = reported()
        IncidentReport.objects.filter(pk=done.pk).update(
            status="RESOLVED", resolution="DISMISS", resolved_at=done.created_at
        )

        only_open = client_for(admin).get(BASE, {"status": "OPEN"}).json()["results"]
        assert [r["id"] for r in only_open] == [str(open_one.pk)]
        assert client_for(admin).get(BASE, {"status": "X"}).status_code == 400

    def test_a_report_over_a_manuscript_the_admin_co_authored_answers_404(self, admin) -> None:
        incident = reported()
        ManuscriptAuthorFactory(manuscript=incident.manuscript, user=admin, email=admin.email, author_order=5)

        assert client_for(admin).get(BASE).json()["results"] == []
        assert resolve(admin, incident, "DISMISS").status_code == 404
        assert client_for(admin).get(f"{BASE}{incident.pk}/document/").status_code == 404

    @pytest.mark.parametrize("role", ["AUTHOR", "REVIEWER"])
    def test_other_roles_answer_403(self, seeded_roles, role) -> None:  # noqa: F811
        assert client_for(actor(role)).get(BASE).status_code == 403


class TestDocument:
    def test_it_serves_the_sanitized_pdf_with_a_generic_name_and_audits_it(
        self, admin, django_capture_on_commit_callbacks, submit, media_root  # noqa: F811
    ) -> None:
        flow = Lifecycle.create(django_capture_on_commit_callbacks, submit)
        flow.submit_manuscript()
        assignment = flow.assignment_of(flow.reviewer)
        incident = IncidentReportFactory(
            assignment=assignment, manuscript=flow.manuscript, reporter=flow.reviewer
        )

        response = client_for(admin).get(f"{BASE}{incident.pk}/document/")

        assert response.status_code == 200
        assert response["X-Accel-Redirect"].endswith("/sanitized.pdf")
        assert f"manuscript-{flow.manuscript.code}-v1.pdf" in response["Content-Disposition"]
        assert "original" not in response["X-Accel-Redirect"]
        audit = AuditLog.objects.get(action="INCIDENT_DOCUMENT_VIEWED")
        assert audit.actor_id == admin.pk and audit.actor_role == "ADMIN"


class TestResolutions:
    def test_dismiss_changes_nothing_else(self, admin) -> None:
        incident = reported()

        response = resolve(admin, incident, "DISMISS")

        assert response.status_code == 200 and response.json()["resolution"] == "DISMISS"
        incident.assignment.refresh_from_db()
        assert incident.assignment.status == "ACTIVE"
        assert Manuscript.objects.get(pk=incident.manuscript_id).status == "UNDER_REVIEW"

    @pytest.mark.parametrize("status", ["ACTIVE", "COMPLETED"])
    def test_reassign_releases_the_assignment_without_penalty_and_covers_the_slot(
        self, admin, status, django_capture_on_commit_callbacks
    ) -> None:
        incident = reported(status=status)
        if status == "COMPLETED":
            FinalEvaluationFactory(assignment=incident.assignment, recommendation="ACCEPTED")
        free = make_reviewer()

        with django_capture_on_commit_callbacks(execute=True):
            response = resolve(admin, incident, "REASSIGN")

        assert response.status_code == 200
        incident.assignment.refresh_from_db()
        assert incident.assignment.status == "REVOKED"
        assert incident.assignment.release_cause == "INCIDENT_REASSIGN"
        assert not RankingAdjustment.objects.exists()
        assert Assignment.objects.get(manuscript=incident.manuscript, slot=1, status="ACTIVE").reviewer_id == free.pk

    def test_request_anonymized_version_releases_every_active_one_and_opens_a_round(
        self, admin, django_capture_on_commit_callbacks
    ) -> None:
        manuscript = submitted(status="UNDER_REVIEW")
        CorrectionRound.objects.create(manuscript=manuscript, round_number=0)
        incident = reported(manuscript)
        other = make_assignment(manuscript, make_reviewer(), slot=2)

        with django_capture_on_commit_callbacks(execute=True):
            response = resolve(admin, incident, "REQUEST_ANONYMIZED_VERSION")

        assert response.status_code == 200 and response.json()["correction_round_number"] == 1
        manuscript.refresh_from_db()
        assert manuscript.status == "CHANGES_REQUESTED" and manuscript.current_round == 1
        other.refresh_from_db(), incident.assignment.refresh_from_db()
        assert (other.status, other.release_cause) == ("REVOKED", "ANONYMIZATION_REQUESTED")
        assert incident.assignment.status == "REVOKED"
        event = StatusEvent.objects.get(manuscript=manuscript, to_status="CHANGES_REQUESTED")
        assert event.actor_id == admin.pk
        assert not Assignment.objects.filter(manuscript=manuscript, status="ACTIVE").exists()
        notice = Notification.objects.get(recipient=manuscript.created_by, event_type="ANONYMIZED_VERSION_REQUESTED", channel="PANEL")
        assert "reporte" not in str(notice.payload).lower()

    def test_a_second_resolution_answers_409(self, admin) -> None:
        incident = reported()
        resolve(admin, incident, "DISMISS")

        assert resolve(admin, incident, "DISMISS").status_code == 409

    @pytest.mark.parametrize("resolution", ["REASSIGN", "REQUEST_ANONYMIZED_VERSION"])
    def test_reassign_and_anonymization_need_an_active_review(self, admin, resolution) -> None:
        incident = reported(manuscript=submitted(status="ACCEPTED"))

        assert resolve(admin, incident, resolution).status_code == 409

    def test_the_resolution_is_audited_as_the_admin(self, admin) -> None:
        incident = reported()

        resolve(admin, incident, "DISMISS")

        audit = AuditLog.objects.get(action="INCIDENT_RESOLVED")
        assert audit.actor_id == admin.pk and audit.actor_role == "ADMIN"


class TestOpenReportBlocksTheVerdict:
    def test_resolving_the_last_report_resumes_the_verdict(self, admin, django_capture_on_commit_callbacks) -> None:
        manuscript = submitted(status="UNDER_REVIEW")
        first = make_assignment(manuscript, make_reviewer(), slot=1, status="COMPLETED")
        second = make_assignment(manuscript, make_reviewer(), slot=2, status="COMPLETED")
        for assignment in (first, second):
            FinalEvaluationFactory(
                assignment=assignment, recommendation="REJECTED", comments_for_author=LONG
            )
        incident = IncidentReportFactory(assignment=first, manuscript=manuscript, reporter=first.reviewer)
        assert not manuscript.verdicts.exists()

        with django_capture_on_commit_callbacks(execute=True):
            resolve(admin, incident, "DISMISS")

        manuscript.refresh_from_db()
        assert manuscript.status == "REJECTED" and manuscript.verdicts.count() == 1
