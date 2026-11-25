"""Administrator endpoints of incidents and the reviewer roster (spec 004).

* ``GET /api/v1/admin/incidents/`` and ``POST .../{id}/resolve/`` — the
  confidential reports and their single resolution (FR-004, FR-005).
* ``GET /api/v1/admin/incidents/{id}/document/`` — the SANITIZED PDF of
  the reported version, with a generic name and an audited download.
* ``GET /api/v1/admin/reviewers/`` and ``PATCH .../{user_id}/`` — the
  roster: careers, availability and performance (FR-009).

All of them need the active ``ADMIN`` role. An object outside the scope
(a manuscript the administrator registered or co-authored) answers
``404``. ``IsAdmin`` never opens manuscripts, evaluations or PDFs in general.
"""

from __future__ import annotations

from django.db import transaction
from django.db.models import Q, QuerySet
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import serializers
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.publications.services.downloads import authorize_sanitized_download, xaccel_response
from apps.reviews.models import IncidentReport
from apps.reviews.serializers import (
    AdminIncidentSerializer,
    AdminReviewerSerializer,
    AdminReviewerUpdateSerializer,
    ResolveIncidentSerializer,
)
from apps.reviews.services.assignments import record_review_audit, run_audited
from apps.reviews.services.incidents import resolve_incident
from apps.reviews.services.standing import annotate_standing
from apps.users.models import AcademicArea, ReviewerProfile, Role
from apps.users.permissions import IsAdmin
from config.exceptions import DomainError, ErrorCode
from config.openapi import PAGINATION, error_response
from config.request_context import audit_request_context

STATE_409 = error_response("La acción no es válida en el estado actual (STATE_CONFLICT).")
ID = OpenApiParameter("id", OpenApiTypes.UUID, OpenApiParameter.PATH)
AREAS_MESSAGE = "Una de las carreras no existe o está inactiva."


class AdminBaseView(GenericAPIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def scoped_incidents(self) -> QuerySet:
        """Reports over manuscripts without an authorship relation with the administrator."""
        return IncidentReport.objects.for_admin(self.request.user).select_related(
            "manuscript", "reporter", "resolved_by", "correction_round", "assignment__version"
        )


@extend_schema_view(
    get=extend_schema(
        tags=["Administración"],
        operation_id="admin_incidents_list",
        summary="Reportes confidenciales",
        description="Abiertos primero. `?status=OPEN|RESOLVED` filtra; otro valor responde 400.",
        parameters=[
            OpenApiParameter(
                "status", OpenApiTypes.STR, enum=["OPEN", "RESOLVED"], description="Filtra por estado."
            ),
            *PAGINATION,
        ],
        responses={200: AdminIncidentSerializer(many=True)},
    ),
)
class AdminIncidentListView(AdminBaseView):
    """``GET /api/v1/admin/incidents/``: the confidential reports, open ones first."""

    def get(self, request: Request) -> Response:
        incidents = self.scoped_incidents()
        status_filter = request.query_params.get("status")
        if status_filter is not None:
            if status_filter not in IncidentReport.Status.values:
                raise DomainError(
                    "El estado debe ser OPEN o RESOLVED.",
                    code=ErrorCode.VALIDATION_ERROR,
                    details={"status": ["El estado debe ser OPEN o RESOLVED."]},
                )
            incidents = incidents.filter(status=status_filter)
        # "OPEN" va antes que "RESOLVED" en orden alfabético.
        page = self.paginate_queryset(incidents.order_by("status", "-created_at", "-id"))
        return self.get_paginated_response(AdminIncidentSerializer(page, many=True).data)


@extend_schema_view(
    post=extend_schema(
        tags=["Administración"],
        operation_id="admin_incidents_resolve",
        summary="Resolver un incidente",
        description="Se resuelve una sola vez: la segunda responde 409.",
        parameters=[ID],
        request=ResolveIncidentSerializer,
        responses={200: AdminIncidentSerializer, 409: STATE_409},
    ),
)
class AdminIncidentResolveView(AdminBaseView):
    """``POST /api/v1/admin/incidents/{id}/resolve/``: resolve once (``409`` the second time)."""

    serializer_class = ResolveIncidentSerializer

    def post(self, request: Request, pk) -> Response:
        get_object_or_404(self.scoped_incidents(), pk=pk)
        body = ResolveIncidentSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        resolve_incident(
            incident_id=pk,
            admin=request.user,
            resolution=body.validated_data["resolution"],
            context=audit_request_context(request),
        )
        resolved = self.scoped_incidents().get(pk=pk)
        return Response(AdminIncidentSerializer(resolved).data)


@extend_schema_view(
    get=extend_schema(
        tags=["Administración"],
        operation_id="admin_incidents_document",
        summary="PDF sanitizado de la versión reportada",
        description=(
            "Entrega la copia sanitizada con nombre genérico y audita la descarga "
            "(`INCIDENT_DOCUMENT_VIEWED`). El original ni el nombre del archivo del Autor "
            "se exponen. Si la auditoría falla, 503 sin redirigir."
        ),
        parameters=[ID],
        responses={
            (200, "application/pdf"): OpenApiTypes.BINARY,
            503: error_response("La auditoría no está disponible (AUDIT_UNAVAILABLE)."),
        },
    ),
)
class AdminIncidentDocumentView(AdminBaseView):
    """``GET /api/v1/admin/incidents/{id}/document/``: the reported version, sanitized."""

    def get(self, request: Request, pk) -> HttpResponse:
        incident = get_object_or_404(self.scoped_incidents(), pk=pk)
        manuscript, version = incident.manuscript, incident.assignment.version
        internal_uri = authorize_sanitized_download(
            manuscript=manuscript,
            version=version,
            user=request.user,
            context=audit_request_context(request),
            role=Role.Code.ADMIN,
            action="INCIDENT_DOCUMENT_VIEWED",
        )
        return xaccel_response(
            internal_uri, f"manuscript-{manuscript.code}-v{version.version_number}.pdf"
        )


class RosterFilterSerializer(serializers.Serializer):
    area = serializers.SlugField(max_length=80, required=False)
    # `true|false`: un BooleanField sin valor se leería como `false` en una consulta GET.
    available = serializers.ChoiceField(choices=("true", "false"), required=False)
    search = serializers.CharField(max_length=200, required=False, allow_blank=True)


def roster() -> QuerySet:
    """Reviewer profiles with performance counters, ranked: best first."""
    return (
        annotate_standing(
            ReviewerProfile.objects.filter(
                user__is_active=True,
                user__role_assignments__is_active=True,
                user__role_assignments__role__code=Role.Code.REVIEWER,
                user__role_assignments__role__is_active=True,
            )
        )
        .select_related("user")
        .prefetch_related("areas")
        .order_by("-ranking_score", "active_assignments", "user__last_name", "user__first_name", "pk")
    )


@extend_schema_view(
    get=extend_schema(
        tags=["Administración"],
        operation_id="admin_reviewers_list",
        summary="Padrón de revisores",
        description="Filtros `area` (código), `available` y `search`. Orden: ranking, carga y nombre.",
        parameters=[RosterFilterSerializer, *PAGINATION],
        responses={200: AdminReviewerSerializer(many=True)},
    ),
)
class AdminReviewerListView(AdminBaseView):
    """``GET /api/v1/admin/reviewers/``: the roster with metrics."""

    def get(self, request: Request) -> Response:
        filters = RosterFilterSerializer(data=request.query_params)
        filters.is_valid(raise_exception=True)
        params = filters.validated_data
        profiles = roster()
        if "area" in params:
            profiles = profiles.filter(areas__code=params["area"])
        if "available" in params:
            profiles = profiles.filter(is_available=params["available"] == "true")
        if params.get("search"):
            term = params["search"]
            profiles = profiles.filter(
                Q(user__first_name__icontains=term)
                | Q(user__last_name__icontains=term)
                | Q(user__email__icontains=term)
                | Q(user__institutional_id__icontains=term)
            )
        page = self.paginate_queryset(profiles)
        return self.get_paginated_response(AdminReviewerSerializer(page, many=True).data)


@extend_schema_view(
    patch=extend_schema(
        tags=["Administración"],
        operation_id="admin_reviewers_update",
        summary="Modificar carreras y disponibilidad de un revisor",
        description=(
            "Ambos campos son opcionales. Las carreras nuevas deben estar activas; una inactiva "
            "ya asignada se conserva. No modifica asignaciones vigentes."
        ),
        parameters=[OpenApiParameter("user_id", OpenApiTypes.UUID, OpenApiParameter.PATH)],
        request=AdminReviewerUpdateSerializer,
        responses={200: AdminReviewerSerializer},
    ),
)
class AdminReviewerDetailView(AdminBaseView):
    serializer_class = AdminReviewerUpdateSerializer

    def patch(self, request: Request, user_id) -> Response:
        get_object_or_404(roster(), user_id=user_id)
        body = AdminReviewerUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        context = audit_request_context(request)

        def work() -> ReviewerProfile:
            profile = ReviewerProfile.objects.select_for_update().get(user_id=user_id)
            changes: dict = {}
            if "areas" in data:
                current = {area.code: area for area in profile.areas.all()}
                wanted = list(dict.fromkeys(data["areas"]))
                found = {
                    area.code: area
                    for area in AcademicArea.objects.filter(code__in=wanted)
                    if area.is_active or area.code in current
                }
                if len(found) != len(wanted):
                    raise DomainError(
                        AREAS_MESSAGE,
                        code=ErrorCode.VALIDATION_ERROR,
                        details={"areas": [AREAS_MESSAGE]},
                    )
                if set(wanted) != set(current):
                    changes["areas"] = {"from": sorted(current), "to": sorted(wanted)}
                    profile.areas.set([found[code] for code in wanted])
            if "is_available" in data and data["is_available"] != profile.is_available:
                changes["is_available"] = {
                    "from": profile.is_available,
                    "to": data["is_available"],
                }
                profile.is_available = data["is_available"]
                profile.save(update_fields=("is_available", "updated_at"))
            if changes:
                record_review_audit(
                    request.user,
                    Role.Code.ADMIN,
                    "REVIEWER_PROFILE_UPDATED",
                    "REVIEWER_PROFILE",
                    profile.pk,
                    context,
                    details={"reviewer_id": str(user_id), "changes": changes},
                )
            return profile

        run_audited(work)
        return Response(AdminReviewerSerializer(roster().get(user_id=user_id)).data)
