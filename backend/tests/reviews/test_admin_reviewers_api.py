"""Padrón de revisores del Administrador (T116, FR-009)."""

from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.audit.models import AuditLog
from apps.reviews.models import RankingAdjustment
from tests.factories import AcademicAreaFactory, area
from tests.publications.test_manuscript_api import actor, client_for
from tests.reviews.support import make_assignment, make_reviewer, seeded_roles, submitted  # noqa: F401

pytestmark = pytest.mark.django_db

BASE = "/api/v1/admin/reviewers/"


@pytest.fixture
def admin(seeded_roles):  # noqa: F811
    return actor("ADMIN")


def rows(admin, **params):
    return client_for(admin).get(BASE, params).json()["results"]


class TestList:
    def test_the_rows_carry_identity_careers_and_metrics_ordered_by_ranking(self, admin) -> None:
        low = make_reviewer(ranking_score=80, areas=("derecho",))
        top = make_reviewer(ranking_score=140)
        make_assignment(submitted(status="UNDER_REVIEW"), top)
        done = make_assignment(submitted(status="UNDER_REVIEW"), top, status="COMPLETED")
        RankingAdjustment.objects.create(
            reviewer=top, assignment=done, cause="ON_TIME_EVALUATION", delta=10, score_before=130, score_after=140
        )

        result = rows(admin)

        assert [r["id"] for r in result] == [str(top.pk), str(low.pk)]
        first = result[0]
        assert first["email"] == top.email and first["ranking_score"] == 140
        assert (first["active_assignments"], first["max_active_assignments"]) == (1, 5)
        assert (first["on_time_evaluations"], first["missed_deadlines"]) == (1, 0)
        assert [a["code"] for a in first["areas"]] == ["agronomia"]

    def test_the_filters(self, admin) -> None:
        law = make_reviewer(areas=("derecho",), first_name="Lucía", last_name="Legal")
        busy = make_reviewer(available=False, first_name="Mario", last_name="Ocupado")

        assert [r["id"] for r in rows(admin, area="derecho")] == [str(law.pk)]
        assert [r["id"] for r in rows(admin, available="false")] == [str(busy.pk)]
        assert [r["id"] for r in rows(admin, available="true")] == [str(law.pk)]
        assert [r["id"] for r in rows(admin, search="ocupado")] == [str(busy.pk)]
        assert len(rows(admin)) == 2  # sin filtros, todos

    def test_the_query_count_does_not_grow_with_the_rows(self, admin) -> None:
        for _ in range(2):
            make_reviewer()
        client = client_for(admin)
        with CaptureQueriesContext(connection) as small:
            client.get(BASE)
        for _ in range(7):
            make_reviewer()
        with CaptureQueriesContext(connection) as large:
            client.get(BASE)

        assert len(large) == len(small)


class TestUpdate:
    def test_the_careers_and_the_availability_are_updated_and_audited(self, admin) -> None:
        reviewer = make_reviewer()
        area("derecho")

        response = client_for(admin).patch(
            f"{BASE}{reviewer.pk}/", {"areas": ["derecho"], "is_available": False}, format="json"
        )

        assert response.status_code == 200
        body = response.json()
        assert [a["code"] for a in body["areas"]] == ["derecho"] and body["is_available"] is False
        audit = AuditLog.objects.get(action="REVIEWER_PROFILE_UPDATED")
        assert audit.actor_id == admin.pk and set(audit.details["changes"]) == {"areas", "is_available"}

    def test_a_new_inactive_career_is_refused_but_an_already_assigned_one_is_kept(self, admin) -> None:
        reviewer = make_reviewer(areas=("agronomia",))
        AcademicAreaFactory(code="arte", name="Arte", is_active=False)
        client = client_for(admin)

        refused = client.patch(f"{BASE}{reviewer.pk}/", {"areas": ["arte"]}, format="json")
        type(area("agronomia")).objects.filter(code="agronomia").update(is_active=False)
        kept = client.patch(f"{BASE}{reviewer.pk}/", {"areas": ["agronomia"]}, format="json")

        assert refused.status_code == 400 and "areas" in refused.json()["error"]["details"]
        assert kept.status_code == 200 and [a["code"] for a in kept.json()["areas"]] == ["agronomia"]

    def test_both_fields_are_optional(self, admin) -> None:
        reviewer = make_reviewer()

        response = client_for(admin).patch(f"{BASE}{reviewer.pk}/", {}, format="json")

        assert response.status_code == 200 and not AuditLog.objects.filter(action="REVIEWER_PROFILE_UPDATED")

    def test_an_unavailable_reviewer_gets_no_new_assignments_but_keeps_the_current_ones(self, admin) -> None:
        from apps.reviews.services.assignments import fill_review_slots

        reviewer = make_reviewer()
        current = make_assignment(submitted(status="UNDER_REVIEW"), reviewer)
        client_for(admin).patch(f"{BASE}{reviewer.pk}/", {"is_available": False}, format="json")
        waiting = submitted()

        assert fill_review_slots(waiting.pk) == []
        current.refresh_from_db()
        assert current.status == "ACTIVE"

    def test_an_unknown_reviewer_answers_404(self, admin) -> None:
        from uuid import uuid4

        assert client_for(admin).patch(f"{BASE}{uuid4()}/", {}, format="json").status_code == 404

    @pytest.mark.parametrize("role", ["AUTHOR", "REVIEWER"])
    def test_other_roles_answer_403(self, seeded_roles, role) -> None:  # noqa: F811
        client = client_for(actor(role))

        assert client.get(BASE).status_code == 403
