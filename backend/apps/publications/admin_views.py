"""Administrator endpoint of the verdict correction (plan section 2.7, spec 004 R-14).

``POST /api/v1/admin/verdicts/{id}/correct/`` replaces the latest verdict
of a manuscript with a new decision (CA-HU-13-12). It needs the active
``ADMIN`` role, ``Idempotency-Key``, a ``decision``, a ``reason`` of 10 to
1000 characters and ``observations`` when the decision is
``CHANGES_REQUESTED``. The answer carries the new verdict and the
correction: public code, decisions and dates, never authors, evaluations,
comments or the PDF.
"""

from __future__ import annotations

import json

from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import serializers, status
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import JSONRenderer
from rest_framework.request import Request
from rest_framework.response import Response

from apps.publications.models import Verdict
from apps.publications.services.corrections import correct_verdict
from apps.publications.services.idempotency import IdempotencyScope, IdempotentReplay, request_hash
from apps.publications.services.verdicts import VerdictResult
from apps.publications.views import parse_idempotency_key, replayed
from apps.users.permissions import IsAdmin
from config.openapi import IDEMPOTENCY_KEY, error_response
from config.request_context import audit_request_context

REASON_MIN, REASON_MAX = 10, 1000


class CorrectVerdictSerializer(serializers.Serializer):
    """Body: the new decision, the administrator's reason and, if needed, observations."""

    decision = serializers.ChoiceField(
        choices=[
            (Verdict.Decision.ACCEPTED, "Aceptado"),
            (Verdict.Decision.REJECTED, "Rechazado"),
            (Verdict.Decision.CHANGES_REQUESTED, "Cambios solicitados"),
        ]
    )
    reason = serializers.CharField(
        min_length=REASON_MIN,
        max_length=REASON_MAX,
        trim_whitespace=True,
        error_messages={
            "required": "Indique el motivo de la corrección.",
            "blank": "Indique el motivo de la corrección.",
            "min_length": f"El motivo debe tener al menos {REASON_MIN} caracteres.",
            "max_length": f"El motivo no puede superar {REASON_MAX} caracteres.",
        },
    )
    observations = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=5000
    )


class VerdictSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    decision = serializers.CharField(read_only=True)
    origin = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    previous_verdict = serializers.UUIDField(read_only=True, allow_null=True)


class CorrectionSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    reason = serializers.CharField(read_only=True)
    authorized_at = serializers.DateTimeField(read_only=True)
    consumed_at = serializers.DateTimeField(read_only=True)


class CorrectionResultSerializer(serializers.Serializer):
    """Answer: the new verdict and the consumed correction."""

    manuscript_code = serializers.CharField(read_only=True)
    verdict = VerdictSummarySerializer(read_only=True)
    correction = CorrectionSummarySerializer(read_only=True)


def render_correction(result: VerdictResult) -> tuple[int, dict]:
    """``(status, body)`` of a correction; the body is what gets stored."""
    verdict, correction = result.verdict, result.correction
    data = {
        "manuscript_code": result.manuscript.code,
        "verdict": {
            "id": str(verdict.pk),
            "decision": verdict.decision,
            "origin": verdict.origin,
            "created_at": verdict.created_at,
            "previous_verdict": str(verdict.previous_verdict_id),
        },
        "correction": {
            "id": str(correction.pk),
            "reason": correction.reason,
            "authorized_at": correction.authorized_at,
            "consumed_at": correction.consumed_at,
        },
    }
    return status.HTTP_201_CREATED, json.loads(JSONRenderer().render(data))


@extend_schema_view(
    post=extend_schema(
        tags=["Administración"],
        operation_id="admin_verdicts_correct",
        summary="Corregir un veredicto",
        description=(
            "Reemplaza el último veredicto por una nueva decisión del Administrador "
            "(`ADMIN_CORRECTION`); el original se conserva. Exige `Idempotency-Key`, `decision`, "
            "`reason` de 10 a 1000 caracteres y `observations` con `CHANGES_REQUESTED`."
        ),
        parameters=[
            IDEMPOTENCY_KEY,
            OpenApiParameter("id", OpenApiTypes.UUID, OpenApiParameter.PATH),
        ],
        request=CorrectVerdictSerializer,
        responses={
            201: CorrectionResultSerializer,
            403: error_response("El Administrador tiene relación de autoría con el manuscrito."),
            409: error_response("El veredicto ya no es el último o el manuscrito fue dado de baja."),
        },
    ),
)
class CorrectVerdictView(GenericAPIView):
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = CorrectVerdictSerializer

    def post(self, request: Request, pk) -> Response:
        verdict = get_object_or_404(Verdict, pk=pk)
        body = CorrectVerdictSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        key = parse_idempotency_key(request)

        scope = IdempotencyScope(
            user=request.user,
            endpoint=f"{request.method} {request.path}",
            key=key,
            request_hash=lambda: request_hash(
                str(verdict.pk), data["decision"], data["reason"], data.get("observations") or ""
            ),
            render=render_correction,
        )
        if (stored := scope.find()) is not None:
            return replayed(stored)
        try:
            result = correct_verdict(
                verdict_id=verdict.pk,
                admin=request.user,
                decision=data["decision"],
                reason=data["reason"],
                observations=data.get("observations"),
                context=audit_request_context(request),
                idempotency=scope,
            )
        except IdempotentReplay as replay:
            return replayed(replay.stored)
        status_code, response_body = render_correction(result)
        return Response(response_body, status=status_code)
