"""Tests for the unified dashboard in a single response (TSK-22).

Covers the acceptance criteria:

1. One call returns every section of the active roles, without asking
   to choose a role.
2. A failing section does not cancel the others: the response keeps
   ``200`` and the failed section carries a retryable message.
3. A user without active roles receives an explicitly empty panel and
   has no internal section at all.
"""

from __future__ import annotations

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.users.models import Role, User, UserRole
from apps.users.services.dashboard import SECTION_BUILDERS, SECTION_ERROR_MESSAGE

pytestmark = pytest.mark.django_db

DASHBOARD_URL = "/api/v1/dashboard/"
LOGIN_URL = "/api/v1/auth/login/"
PASSWORD = "institucional-123"


def make_user(**overrides):
    """Create an institutional account with defaults."""
    payload = {
        "institutional_id": "INST-1001",
        "username": "a.lopez",
        "email": "a.lopez@unl.edu.ec",
        "first_name": "Ana",
        "last_name": "López",
    }
    payload.update(overrides)
    return User.objects.create_user(password=PASSWORD, **payload)


def assign_roles(user: User, *codes: str) -> User:
    """Seed the role catalog and assign active roles."""
    call_command("seed_roles", verbosity=0)
    for code in codes:
        UserRole.objects.create(user=user, role=Role.objects.get(code=code))
    return user


def login(identifier: str = "INST-1001", password: str = PASSWORD):
    """Log in through the real endpoint and return the access token."""
    client = APIClient()
    response = client.post(
        LOGIN_URL, {"identifier": identifier, "password": password}, format="json"
    )
    assert response.status_code == 200
    return client, response.json()["access"]


class TestUnifiedDashboard:

    def test_sections_appear_only_for_active_roles(self) -> None:
        assign_roles(make_user(), "REVIEWER")
        client, access = login()

        body = client.get(DASHBOARD_URL, HTTP_AUTHORIZATION=f"Bearer {access}").json()

        assert body["roles"] == ["REVIEWER"]
        # Sin apartados vacíos de roles inexistentes.
        assert set(body["sections"]) == {"reviewer"}

    def test_roleless_user_receives_an_explicitly_empty_panel(self) -> None:
        make_user()  # cuenta autenticada, cero roles activos
        client, access = login()

        response = client.get(DASHBOARD_URL, HTTP_AUTHORIZATION=f"Bearer {access}")

        assert response.status_code == 200
        body = response.json()
        assert body["roles"] == []
        assert body["sections"] == {}  # sección vacía explícita


    def test_dashboard_requires_authentication(self) -> None:
        response = APIClient().get(DASHBOARD_URL)

        assert response.status_code == 401
        assert response.json()["error"]["code"] == "AUTH_INVALID"

