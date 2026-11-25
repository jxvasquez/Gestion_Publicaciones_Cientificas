"""Retirada del rol Editor: sin rutas, sin permisos, historial intacto (T098, FR-001 y FR-002)."""

from __future__ import annotations

import pytest
from django.core.management import call_command
from django.urls import get_resolver
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.users.models import Role, UserRole
from tests.factories import UserFactory, UserRoleFactory
from tests.publications.test_manuscript_api import actor, client_for
from tests.reviews.support import seeded_roles  # noqa: F401

pytestmark = pytest.mark.django_db

OLD_ROUTES = [
    ("get", "submissions/"),
    ("post", "submissions/{id}/start-review/"),
    ("get", "reviewers/"),
    ("get", "manuscripts/{id}/assignments/"),
    ("post", "manuscripts/{id}/assignments/"),
    ("get", "manuscripts/{id}/evaluations/"),
    ("get", "manuscripts/{id}/verdicts/"),
    ("post", "manuscripts/{id}/verdicts/"),
    ("get", "assignments/expired/"),
    ("post", "assignments/{id}/revoke/"),
    ("get", "incidents/"),
]


def legacy_editor():
    """A former editor: the retired role row is inactive and the account kept an active row on it."""
    Role.objects.get_or_create(code="EDITOR", defaults={"name": "Editor", "is_active": False})
    user = UserFactory()
    UserRole.objects.create(user=user, role=Role.objects.get(code="EDITOR"))
    return user


class TestNoEditorRoutes:
    @pytest.mark.parametrize(("method", "path"), OLD_ROUTES)
    def test_the_eleven_old_routes_answer_404(self, seeded_roles, method, path) -> None:  # noqa: F811
        user = legacy_editor()
        url = "/api/v1/editor/" + path.format(id="00000000-0000-0000-0000-000000000001")

        assert getattr(client_for(user), method)(url).status_code == 404

    def test_no_route_of_the_urlconf_mentions_the_editor(self) -> None:
        patterns = [str(p.pattern) for p in get_resolver().url_patterns]
        assert not [p for p in patterns if "editor" in p]


class TestFormerEditor:
    def test_the_account_logs_in_with_no_roles_and_an_empty_panel(self, seeded_roles) -> None:  # noqa: F811
        user = legacy_editor()
        response = APIClient().post(
            "/api/v1/auth/login/", {"identifier": user.institutional_id, "password": "institucional-123"},
            format="json", secure=True,
        )

        assert response.status_code == 200
        client = client_for(user)
        assert client.get("/api/v1/auth/me/").json()["roles"] == []
        dashboard = client.get("/api/v1/dashboard/").json()
        assert dashboard["roles"] == [] and dashboard["sections"] == {}

    def test_an_active_row_of_an_inactive_role_grants_no_permission(self, seeded_roles) -> None:  # noqa: F811
        user = legacy_editor()
        client = client_for(user)

        assert client.get("/api/v1/manuscripts/").status_code == 403
        assert client.get("/api/v1/reviewer/assignments/").status_code == 403
        assert client.get("/api/v1/admin/incidents/").status_code == 403

    def test_the_role_can_no_longer_be_provisioned(self, seeded_roles) -> None:  # noqa: F811
        from apps.users.services.provisioning import ProvisioningError, provision_user

        with pytest.raises(ProvisioningError):
            provision_user(
                institutional_id="e1", first_name="E", last_name="E", email="e@unl.edu.ec", roles=["EDITOR"]
            )

    def test_seed_roles_creates_three_roles_and_retires_the_legacy_row(self) -> None:
        Role.objects.create(code="EDITOR", name="Editor")

        call_command("seed_roles", verbosity=0)

        assert set(Role.objects.filter(is_active=True).values_list("code", flat=True)) == {
            "AUTHOR", "REVIEWER", "ADMIN",
        }
        assert Role.objects.get(code="EDITOR").is_active is False
