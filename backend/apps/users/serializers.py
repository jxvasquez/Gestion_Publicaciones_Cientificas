"""Serializers for the institutional auth endpoints (plan section 2.2)."""

from __future__ import annotations

from rest_framework import serializers

from apps.users.models import AcademicArea, Role, User


class LoginSerializer(serializers.Serializer):
    """Credentials for ``POST /api/v1/auth/login/``."""

    identifier = serializers.CharField(
        max_length=254,
        help_text="ID institucional, usuario o correo electrónico.",
    )
    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        style={"input_type": "password"},
    )


class SessionUserSerializer(serializers.ModelSerializer):
    """Identity of the authenticated institutional account."""

    full_name = serializers.CharField(source="get_full_name", read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "institutional_id",
            "username",
            "email",
            "first_name",
            "last_name",
            "full_name",
        )


class NavigationEntrySerializer(serializers.Serializer):
    """Módulo de navegación habilitado por un rol activo."""

    role = serializers.ChoiceField(choices=Role.Code.choices, read_only=True)
    label = serializers.CharField(read_only=True)
    route = serializers.CharField(read_only=True)


class SessionSerializer(serializers.Serializer):
    """Sesión abierta o renovada: token de acceso, identidad y roles activos."""

    access = serializers.CharField(
        read_only=True,
        help_text="Token de acceso (JWT). Se envía como `Authorization: Bearer`.",
    )
    user = SessionUserSerializer(read_only=True)
    roles = serializers.ListField(
        child=serializers.ChoiceField(choices=Role.Code.choices),
        read_only=True,
    )


class MeSerializer(serializers.Serializer):
    """Identidad del usuario autenticado, sus roles activos y su navegación."""

    user = SessionUserSerializer(read_only=True)
    roles = serializers.ListField(
        child=serializers.ChoiceField(choices=Role.Code.choices),
        read_only=True,
    )
    navigation = NavigationEntrySerializer(many=True, read_only=True)


class DashboardSectionSerializer(serializers.Serializer):
    """One role section of the unified dashboard (plan section 2.2).

    ``status`` is resolved independently per section; ``message``
    carries the retryable notice when the section failed and ``data``
    holds the section payload when it succeeded.
    """

    status = serializers.ChoiceField(choices=("ok", "error"), read_only=True)
    data = serializers.JSONField(read_only=True, allow_null=True)
    message = serializers.CharField(read_only=True, allow_null=True)


class DashboardSerializer(serializers.Serializer):
    """Single response of ``GET /api/v1/dashboard/`` (plan section 2.2).

    ``sections`` only contains the sections of the active roles; a
    person without roles receives it explicitly empty. The panel never
    asks to choose a role.
    """

    user = SessionUserSerializer(read_only=True)
    roles = serializers.ListField(child=serializers.CharField(), read_only=True)
    sections = serializers.DictField(child=DashboardSectionSerializer(), read_only=True)


# Módulos de navegación habilitados por rol activo: la SPA renderiza
# exactamente estas rutas con rolesGuard (plan section 3.3). Los permisos
# se derivan de los roles activos leídos de la base de datos.
NAVIGATION_BY_ROLE: dict[str, tuple[dict[str, str], ...]] = {
    Role.Code.AUTHOR: (
        {"label": "Mis manuscritos", "route": "/app/author/manuscripts"},
    ),
    Role.Code.REVIEWER: (
        {"label": "Mis asignaciones", "route": "/app/reviewer/assignments"},
        {"label": "Historial de evaluaciones", "route": "/app/reviewer/history"},
    ),
    Role.Code.ADMIN: (
        {"label": "Auditoría", "route": "/app/admin/audit"},
        {"label": "Incidentes confidenciales", "route": "/app/admin/incidents"},
        {"label": "Revisores", "route": "/app/admin/reviewers"},
        {"label": "Carreras", "route": "/app/admin/areas"},
    ),
}


def navigation_permissions(role_codes: list[str]) -> list[dict[str, str]]:
    """Navigation permissions derived from the active roles."""
    entries: list[dict[str, str]] = []
    for code in role_codes:
        for entry in NAVIGATION_BY_ROLE.get(code, ()):
            entries.append({"role": code, **entry})
    return entries


class AcademicAreaSerializer(serializers.ModelSerializer):
    """Career of the catalog as the public API shows it: ``{code, name}``."""

    class Meta:
        model = AcademicArea
        fields = ("code", "name")
        read_only_fields = fields


class AdminAcademicAreaSerializer(serializers.ModelSerializer):
    """Career with its state and usage counters, for the administrator.

    ``manuscript_count`` and ``reviewer_count`` are annotated by the view.
    """

    manuscripts = serializers.IntegerField(source="manuscript_count", read_only=True)
    reviewers = serializers.IntegerField(source="reviewer_count", read_only=True)

    class Meta:
        model = AcademicArea
        fields = ("code", "name", "is_active", "manuscripts", "reviewers")
        read_only_fields = fields


class AdminAcademicAreaWriteSerializer(serializers.Serializer):
    """Body of ``POST``/``PATCH /admin/areas/``: the code never changes."""

    name = serializers.CharField(max_length=120, trim_whitespace=True, required=False)
    is_active = serializers.BooleanField(required=False)
