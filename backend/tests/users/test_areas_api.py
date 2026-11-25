"""Carreras: catálogo público y administración (T036, T115, FR-007 y FR-009)."""

from __future__ import annotations

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.users.models import AcademicArea
from tests.factories import AcademicAreaFactory, ManuscriptFactory
from tests.publications.test_manuscript_api import actor, client_for
from tests.reviews.support import make_reviewer, seeded_roles  # noqa: F401

pytestmark = pytest.mark.django_db

PUBLIC = "/api/v1/areas/"
ADMIN = "/api/v1/admin/areas/"


class TestPublicList:
    def test_it_is_anonymous_ordered_by_name_and_lists_only_active_ones(self) -> None:
        AcademicAreaFactory(code="medicina", name="Medicina")
        AcademicAreaFactory(code="derecho", name="Derecho")
        AcademicAreaFactory(code="arte", name="Arte", is_active=False)

        response = APIClient().get(PUBLIC)

        assert response.status_code == 200
        rows = response.json()
        # El catálogo inicial (migración 0004) ya trae Derecho, Computación y Agropecuaria.
        assert [r["name"] for r in rows] == sorted(r["name"] for r in rows)
        assert {"derecho", "medicina"} <= {r["code"] for r in rows} and "arte" not in {r["code"] for r in rows}
        assert all(set(r) == {"code", "name"} for r in rows)

    def test_it_is_read_only(self) -> None:
        client = APIClient()

        assert client.post(PUBLIC, {"name": "X"}, format="json").status_code == 405
        assert client.patch(PUBLIC, {}, format="json").status_code == 405
        assert client.delete(PUBLIC).status_code == 405


class TestAdminCatalog:
    @pytest.fixture
    def admin(self, seeded_roles):  # noqa: F811
        return actor("ADMIN")

    def test_the_list_has_every_career_with_its_counters(self, admin) -> None:
        AcademicAreaFactory(code="inactiva", name="Inactiva", is_active=False)
        make_reviewer(areas=("agronomia",))
        ManuscriptFactory(areas=["agronomia"])

        rows = {r["code"]: r for r in client_for(admin).get(ADMIN).json()}

        assert rows["agronomia"]["manuscripts"] == 1 and rows["agronomia"]["reviewers"] == 1
        assert rows["inactiva"]["is_active"] is False and rows["inactiva"]["manuscripts"] == 0

    def test_creating_one_generates_the_code_with_slugify_and_audits_it(self, admin) -> None:
        response = client_for(admin).post(ADMIN, {"name": "  Ingeniería   Civil "}, format="json")

        assert response.status_code == 201
        assert response.json()["code"] == "ingenieria-civil" and response.json()["name"] == "Ingeniería Civil"
        audit = AuditLog.objects.get(action="ACADEMIC_AREA_CREATED")
        assert audit.actor_id == admin.pk and audit.details["code"] == "ingenieria-civil"

    @pytest.mark.parametrize("name", ["derecho", "DERECHO", " Derecho "])
    def test_a_repeated_name_ignoring_case_answers_400(self, admin, name) -> None:
        AcademicAreaFactory(code="derecho", name="Derecho")

        response = client_for(admin).post(ADMIN, {"name": name}, format="json")

        assert response.status_code == 400 and "name" in response.json()["error"]["details"]

    def test_an_empty_name_answers_400(self, admin) -> None:
        assert client_for(admin).post(ADMIN, {"name": "  "}, format="json").status_code == 400

    def test_renaming_keeps_the_code_and_deactivating_hides_it_from_the_public_list(self, admin) -> None:
        AcademicAreaFactory(code="derecho", name="Derecho")
        client = client_for(admin)

        renamed = client.patch(f"{ADMIN}derecho/", {"name": "Derecho y Ciencias"}, format="json")
        deactivated = client.patch(f"{ADMIN}derecho/", {"is_active": False}, format="json")

        assert renamed.json()["code"] == "derecho" and renamed.json()["name"] == "Derecho y Ciencias"
        assert deactivated.json()["is_active"] is False
        assert "derecho" not in {r["code"] for r in APIClient().get(PUBLIC).json()}
        assert AuditLog.objects.filter(action="ACADEMIC_AREA_UPDATED").count() == 2

    def test_deactivating_keeps_the_associations_and_the_ongoing_matching(self, admin) -> None:
        reviewer = make_reviewer(areas=("derecho",))
        manuscript = ManuscriptFactory(areas=["derecho"])

        client_for(admin).patch(f"{ADMIN}derecho/", {"is_active": False}, format="json")

        from apps.reviews.services.eligibility import eligible_candidates
        from tests.factories import ManuscriptVersionFactory

        version = ManuscriptVersionFactory(manuscript=manuscript)
        assert [a.code for a in reviewer.reviewer_profile.areas.all()] == ["derecho"]
        assert list(eligible_candidates(manuscript, version)) == [reviewer]
        assert AcademicArea.objects.get(code="derecho").is_active is False

    def test_an_unknown_code_answers_404(self, admin) -> None:
        assert client_for(admin).patch(f"{ADMIN}nada/", {"name": "X"}, format="json").status_code == 404

    @pytest.mark.parametrize("role", ["AUTHOR", "REVIEWER"])
    def test_other_roles_answer_403(self, seeded_roles, role) -> None:  # noqa: F811
        client = client_for(actor(role))

        assert client.get(ADMIN).status_code == 403
        assert client.post(ADMIN, {"name": "X"}, format="json").status_code == 403
        assert client.patch(f"{ADMIN}derecho/", {}, format="json").status_code == 403
