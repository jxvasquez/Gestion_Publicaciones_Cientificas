"""Administrator endpoints of the career catalog (FR-007, FR-009).

``GET/POST /api/v1/admin/areas/`` and ``PATCH /api/v1/admin/areas/{code}/``
need the active ``ADMIN`` role. Every write is audited in its own
transaction: if the audit trail is unavailable nothing is kept (``503``).
The ``code`` is generated from the name on creation and never changes.
"""

from __future__ import annotations

from django.db import IntegrityError, transaction
from django.db.models import Count
from django.db.models.functions import Lower
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.audit.models import AuditLog
from apps.audit.services import AuditService
from apps.reviews.services.assignments import run_audited
from apps.users.models import AcademicArea, Role
from apps.users.permissions import IsAdmin
from apps.users.serializers import AdminAcademicAreaSerializer, AdminAcademicAreaWriteSerializer
from config.exceptions import DomainError, ErrorCode
from config.openapi import error_response
from config.request_context import audit_request_context

DUPLICATE_MESSAGE = "Ya existe una carrera con ese nombre."
NAME_REQUIRED_MESSAGE = "Indique el nombre de la carrera."


def _validation_error(field: str, message: str) -> DomainError:
    return DomainError(message, code=ErrorCode.VALIDATION_ERROR, details={field: [message]})


def _unique_code(name: str) -> str:
    """``slugify(name)``, with a numeric suffix if the code is already taken."""
    base = slugify(name)[:70] or "carrera"
    code, counter = base, 2
    while AcademicArea.objects.filter(code=code).exists():
        code = f"{base}-{counter}"
        counter += 1
    return code


def annotated_areas():
    """Every career with the counters of manuscripts and reviewer profiles."""
    return AcademicArea.objects.annotate(
        manuscript_count=Count("manuscripts", distinct=True),
        reviewer_count=Count("reviewer_profiles", distinct=True),
    ).order_by("name", "id")


def _record(action: str, area: AcademicArea, admin, context: dict, **details) -> None:
    AuditService.record(
        action=action,
        entity_type="ACADEMIC_AREA",
        entity_id=area.pk,
        result=AuditLog.Result.SUCCESS,
        actor=admin,
        actor_role=Role.Code.ADMIN,
        details={"code": area.code, "name": area.name, **details},
        **context,
    )


@extend_schema_view(
    get=extend_schema(
        tags=["Administración"],
        operation_id="admin_areas_list",
        summary="Catálogo de carreras",
        description="Todas las carreras, activas e inactivas, con sus conteos de uso.",
        responses={200: AdminAcademicAreaSerializer(many=True)},
    ),
    post=extend_schema(
        tags=["Administración"],
        operation_id="admin_areas_create",
        summary="Crear una carrera",
        request=AdminAcademicAreaWriteSerializer,
        responses={201: AdminAcademicAreaSerializer, 400: error_response("Nombre vacío o repetido.")},
    ),
)
class AdminAreaListView(GenericAPIView):
    permission_classes = [IsAuthenticated, IsAdmin]
    pagination_class = None
    serializer_class = AdminAcademicAreaWriteSerializer

    def get(self, request: Request) -> Response:
        return Response(AdminAcademicAreaSerializer(annotated_areas(), many=True).data)

    def post(self, request: Request) -> Response:
        body = AdminAcademicAreaWriteSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        name = " ".join((body.validated_data.get("name") or "").split())
        if not name:
            raise _validation_error("name", NAME_REQUIRED_MESSAGE)
        context = audit_request_context(request)

        def work() -> AcademicArea:
            if AcademicArea.objects.annotate(lowered=Lower("name")).filter(
                lowered=name.lower()
            ).exists():
                raise _validation_error("name", DUPLICATE_MESSAGE)
            try:
                with transaction.atomic():
                    area = AcademicArea.objects.create(code=_unique_code(name), name=name)
            except IntegrityError as exc:
                raise _validation_error("name", DUPLICATE_MESSAGE) from exc
            _record("ACADEMIC_AREA_CREATED", area, request.user, context)
            return area

        area = run_audited(work)
        return Response(
            AdminAcademicAreaSerializer(annotated_areas().get(pk=area.pk)).data,
            status=status.HTTP_201_CREATED,
        )


@extend_schema_view(
    patch=extend_schema(
        tags=["Administración"],
        operation_id="admin_areas_update",
        summary="Renombrar, desactivar o reactivar una carrera",
        description="El `code` no cambia. Las asociaciones existentes se conservan.",
        parameters=[OpenApiParameter("code", OpenApiTypes.STR, OpenApiParameter.PATH)],
        request=AdminAcademicAreaWriteSerializer,
        responses={200: AdminAcademicAreaSerializer, 400: error_response("Nombre vacío o repetido.")},
    ),
)
class AdminAreaDetailView(GenericAPIView):
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = AdminAcademicAreaWriteSerializer

    def patch(self, request: Request, code: str) -> Response:
        get_object_or_404(AcademicArea, code=code)
        body = AdminAcademicAreaWriteSerializer(data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        context = audit_request_context(request)

        def work() -> AcademicArea:
            area = AcademicArea.objects.select_for_update().get(code=code)
            changes: dict = {}
            if "name" in body.validated_data:
                name = " ".join(body.validated_data["name"].split())
                if not name:
                    raise _validation_error("name", NAME_REQUIRED_MESSAGE)
                if (
                    AcademicArea.objects.annotate(lowered=Lower("name"))
                    .filter(lowered=name.lower())
                    .exclude(pk=area.pk)
                    .exists()
                ):
                    raise _validation_error("name", DUPLICATE_MESSAGE)
                if name != area.name:
                    changes["name"] = {"from": area.name, "to": name}
                    area.name = name
            if "is_active" in body.validated_data and body.validated_data["is_active"] != area.is_active:
                changes["is_active"] = {"from": area.is_active, "to": body.validated_data["is_active"]}
                area.is_active = body.validated_data["is_active"]
            if changes:
                try:
                    with transaction.atomic():
                        area.save(update_fields=("name", "is_active", "updated_at"))
                except IntegrityError as exc:
                    raise _validation_error("name", DUPLICATE_MESSAGE) from exc
                _record("ACADEMIC_AREA_UPDATED", area, request.user, context, changes=changes)
            return area

        area = run_audited(work)
        return Response(AdminAcademicAreaSerializer(annotated_areas().get(pk=area.pk)).data)
