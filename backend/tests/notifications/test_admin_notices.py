"""Avisos del Administrador y de la revisión automática (T100, FR-036)."""

from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.notifications.models import Notification
from apps.notifications.payloads import PAYLOAD_FIELDS
from apps.notifications.services import admins_for
from apps.reviews.services.assignments import release_assignment
from apps.reviews.services.eligibility import eligible_candidates
from tests.factories import IncidentReportFactory, ManuscriptAuthorFactory, UserFactory
from tests.publications.test_manuscript_api import actor, client_for
from tests.reviews.support import make_assignment, make_reviewer, seeded_roles, submitted  # noqa: F401

pytestmark = pytest.mark.django_db


@pytest.fixture
def manuscript(seeded_roles):  # noqa: F811
    return submitted(status="UNDER_REVIEW")


class TestAdminsFor:
    def test_only_active_admins_without_authorship_relation_are_recipients(self, manuscript) -> None:
        free = actor("ADMIN")
        inactive = actor("ADMIN")
        type(inactive).objects.filter(pk=inactive.pk).update(is_active=False)
        registrant = actor("ADMIN")
        type(manuscript).objects.filter(pk=manuscript.pk).update(created_by=registrant)
        coauthor = actor("ADMIN")
        ManuscriptAuthorFactory(manuscript=manuscript, user=coauthor, email="otro@x.edu", author_order=2)
        by_email = actor("ADMIN", email="Mismo@unl.edu.ec")
        ManuscriptAuthorFactory(manuscript=manuscript, user=None, email="mismo@unl.edu.ec", author_order=3)
        actor("AUTHOR"), actor("REVIEWER")
        manuscript.refresh_from_db()

        assert admins_for(manuscript) == [free] and by_email.pk != free.pk

    def test_a_retired_editor_row_never_receives_anything(self, manuscript) -> None:
        from apps.users.models import Role, UserRole

        Role.objects.get_or_create(code="EDITOR", defaults={"name": "Editor", "is_active": False})
        editor = UserFactory()
        UserRole.objects.create(user=editor, role=Role.objects.get(code="EDITOR"))

        assert editor not in admins_for(manuscript)


class TestEvents:
    def test_an_incident_notifies_the_admins_with_the_incidents_link_and_no_text(
        self, manuscript, django_capture_on_commit_callbacks
    ) -> None:
        from apps.reviews.signals import announce, incident_reported

        admin = actor("ADMIN")
        reviewer = make_reviewer()
        assignment = make_assignment(manuscript, reviewer)
        incident = IncidentReportFactory(
            assignment=assignment, manuscript=manuscript, reporter=reviewer, description="TEXTO_LIBRE"
        )

        announce(
            incident_reported, incident_id=incident.pk, assignment_id=assignment.pk,
            manuscript_id=manuscript.pk, report_type="IDENTITY_LEAK",
        )

        (notice,) = Notification.objects.filter(recipient=admin, channel="PANEL")
        assert notice.event_type == "INCIDENT_REPORTED" and notice.payload["link"] == "/app/admin/incidents"
        assert "TEXTO_LIBRE" not in str(notice.payload) and set(notice.payload) <= set(PAYLOAD_FIELDS)

    def test_a_release_tells_the_reviewer_there_is_no_penalty(
        self, manuscript, django_capture_on_commit_callbacks
    ) -> None:
        reviewer = make_reviewer()
        assignment = make_assignment(manuscript, reviewer)

        with django_capture_on_commit_callbacks(execute=True):
            release_assignment(
                assignment, cause="INCIDENT_REASSIGN", actor=None, actor_role=None, context={}
            )

        (notice,) = Notification.objects.filter(recipient=reviewer, channel="PANEL", event_type="ASSIGNMENT_REVOKED")
        assert "sin penalización" in notice.payload["message"]
        assert notice.payload["link"] == "/app/reviewer/assignments"


def test_eligible_candidates_query_count_does_not_grow_with_the_reviewers(manuscript) -> None:
    version = manuscript.versions.get()
    for _ in range(2):
        make_reviewer()
    with CaptureQueriesContext(connection) as small:
        list(eligible_candidates(manuscript, version))
    for _ in range(7):
        make_reviewer()
    with CaptureQueriesContext(connection) as large:
        list(eligible_candidates(manuscript, version))

    # Las carreras y los correos de autores son dos lecturas fijas; los candidatos, una sola consulta.
    assert len(small) == len(large) == 3
