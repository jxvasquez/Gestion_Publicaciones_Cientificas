"""Reviewer endpoints (plan section 2.5, TSK-61) and their performance read-outs.

The reviewer's views start at :meth:`Assignment.objects.for_reviewer`,
never at the global manuscript repository: a foreign assignment, a
withdrawn manuscript or one the reviewer authored answers ``404``.
Reviewers never see the author, the other reviewers, nor their evaluations
(double blind). The administrator's views live in ``admin_views.py``.
"""

from __future__ import annotations

from django.db.models import OuterRef, Q, QuerySet, Subquery
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.publications.models import Verdict
from apps.publications.services.downloads import authorize_sanitized_download, xaccel_response
from apps.publications.views import etag_for, parse_if_match
from apps.reviews.models import Assignment, Evaluation, RankingAdjustment
from apps.reviews.permissions import IsActiveAssignedReviewer, IsAssignedReviewer
from apps.reviews.serializers import (
    DeclareConflictSerializer,
    EvaluationDraftSerializer,
    RankingAdjustmentSerializer,
    ReportIncidentSerializer,
    ReviewerAssignmentDetailSerializer,
    ReviewerAssignmentSerializer,
    ReviewerConflictSerializer,
    ReviewerEvaluationHistoryDetailSerializer,
    ReviewerEvaluationHistorySerializer,
    ReviewerEvaluationSerializer,
    ReviewerIncidentSerializer,
    ReviewerStandingSerializer,
)
from apps.reviews.services.evaluations import declare_conflict, save_draft, submit_evaluation
from apps.reviews.services.incidents import report_incident
from apps.reviews.services.standing import reviewer_standing
from apps.users.permissions import IsReviewer
from config.exceptions import DomainError, ErrorCode
from config.openapi import IF_MATCH, PAGINATION, error_response
from config.request_context import audit_request_context


# --- Documentación OpenAPI: piezas que comparten varias vistas -------------------------
ID = OpenApiParameter("id", OpenApiTypes.UUID, OpenApiParameter.PATH)
STATE_409 = error_response("La acción no es válida en el estado actual (STATE_CONFLICT).")
ETAG = {
    "ETag": OpenApiParameter(
        "ETag",
        location=OpenApiParameter.HEADER,
        response=True,
        description='Versión actual del recurso (por ejemplo `"3"`); úsela en `If-Match`.',
    )
}

class ReviewerBaseView(GenericAPIView):
    """Shared permissions and assignment scope of the reviewer module."""

    permission_classes = [IsAuthenticated, IsReviewer, IsAssignedReviewer]

    def scoped_assignments(self) -> QuerySet:
        return (
            Assignment.objects.for_reviewer(self.request.user)
            .prefetch_related("manuscript__areas")
            .with_overdue()
            .with_evaluation_started()
        )

    def get_assignment(self, pk) -> Assignment:
        """The reviewer's own assignment; anything else answers ``404``."""
        return get_object_or_404(self.scoped_assignments(), pk=pk)


@extend_schema_view(
    get=extend_schema(
        tags=["Revisor"],
        operation_id="reviewer_assignments_list",
        summary="Mis asignaciones",
        description="Bandeja del revisor. Nunca incluye manuscritos retirados ni los que el revisor coescribió.",
        parameters=PAGINATION,
        responses={200: ReviewerAssignmentSerializer(many=True)},
    ),
)
class ReviewerAssignmentListView(ReviewerBaseView):
    """``GET /api/v1/reviewer/assignments/``: the reviewer's own inbox."""

    def get(self, request: Request) -> Response:
        page = self.paginate_queryset(self.scoped_assignments())
        return self.get_paginated_response(ReviewerAssignmentSerializer(page, many=True).data)


@extend_schema_view(
    get=extend_schema(
        tags=["Revisor"],
        operation_id="reviewer_assignments_retrieve",
        summary="Detalle ciego de una asignación",
        description=(
            "Doble ciego: la respuesta nunca contiene nombre, correo ni filiación del Autor. Una "
            "asignación ajena responde 404."
        ),
        parameters=[ID],
        responses={200: ReviewerAssignmentDetailSerializer},
    ),
)
class ReviewerAssignmentDetailView(ReviewerBaseView):
    """``GET /api/v1/reviewer/assignments/{id}/``: blind detail of an ``ACTIVE`` or ``COMPLETED`` one."""

    def get(self, request: Request, pk) -> Response:
        assignment = self.get_assignment(pk)
        self.check_object_permissions(request, assignment)
        return Response(
            ReviewerAssignmentDetailSerializer(assignment, context={"request": request}).data
        )


@extend_schema_view(
    get=extend_schema(
        tags=["Revisor"],
        operation_id="reviewer_assignments_document",
        summary="Descargar el PDF sanitizado",
        description=(
            "Solo con la asignación `ACTIVE`; en otro estado responde 410. Entrega la copia "
            "sanitizada con nombre genérico, así que el original ni el nombre del archivo del Autor "
            "llegan al revisor. La descarga se audita antes; si falla, 503 sin redirigir."
        ),
        parameters=[ID],
        responses={
            (200, "application/pdf"): OpenApiTypes.BINARY,
            410: error_response("La asignación ya no permite descargar el documento."),
            503: error_response("La auditoría no está disponible (AUDIT_UNAVAILABLE)."),
        },
    ),
)
class ReviewerAssignmentDocumentView(ReviewerBaseView):
    """``GET /api/v1/reviewer/assignments/{id}/document/``: the sanitized PDF.

    Only an ``ACTIVE`` assignment downloads; any other status of the
    reviewer's own assignment answers ``410``. The internal path always
    ends in ``sanitized.pdf`` and the name is generic, so the original
    and the author's file name never reach the reviewer. The download is
    audited first; if the audit fails the answer is ``503`` without redirect.
    """

    permission_classes = [IsAuthenticated, IsReviewer, IsActiveAssignedReviewer]

    def get(self, request: Request, pk) -> HttpResponse:
        assignment = self.get_assignment(pk)
        if assignment.status != Assignment.Status.ACTIVE:
            raise DomainError(
                "Esta asignación ya no permite descargar el documento.",
                code=ErrorCode.STATE_CONFLICT,
                status_code=410,
            )
        self.check_object_permissions(request, assignment)

        manuscript, version = assignment.manuscript, assignment.version
        internal_uri = authorize_sanitized_download(
            manuscript=manuscript,
            version=version,
            user=request.user,
            context=audit_request_context(request),
        )
        return xaccel_response(
            internal_uri, f"manuscript-{manuscript.code}-v{version.version_number}.pdf"
        )


def evaluation_response(evaluation: Evaluation) -> Response:
    """The reviewer's evaluation with its optimistic lock as the ``ETag``."""
    response = Response(ReviewerEvaluationSerializer(evaluation).data)
    response["ETag"] = etag_for(evaluation)
    return response


@extend_schema_view(
    get=extend_schema(
        tags=["Revisor"],
        operation_id="reviewer_assignment_evaluation_retrieve",
        summary="Ver mi evaluación (borrador o final)",
        description="Antes del primer guardado devuelve un borrador vacío con ETag `\"0\"`.",
        parameters=[ID],
        responses={200: ReviewerEvaluationSerializer},
    ),
    put=extend_schema(
        tags=["Revisor"],
        operation_id="reviewer_assignment_evaluation_save_draft",
        summary="Guardar el borrador",
        description=(
            "Cambia solo los campos enviados. Exige `If-Match` con el ETag leído (`\"0\"` para el "
            "borrador vacío). El servicio decide si la asignación todavía admite escritura."
        ),
        parameters=[ID, IF_MATCH],
        request=EvaluationDraftSerializer,
        responses={200: ReviewerEvaluationSerializer, 409: STATE_409},
    ),
)
class ReviewerEvaluationView(ReviewerBaseView):
    """``GET``/``PUT /api/v1/reviewer/assignments/{id}/evaluation/``: the private draft or the final.

    ``GET`` answers an empty draft before the first save. ``PUT`` needs
    ``If-Match`` with the ``ETag`` read (``"0"`` for the empty draft) and
    changes only the fields sent; the service decides whether the
    assignment still accepts writes. Neither shows the draft to anyone
    but the reviewer who owns the assignment.
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return super().get_permissions()
        return [IsAuthenticated(), IsReviewer()]

    def get(self, request: Request, pk) -> Response:
        assignment = self.get_assignment(pk)
        self.check_object_permissions(request, assignment)
        evaluation = Evaluation.objects.filter(assignment=assignment).first()
        if evaluation is None:
            evaluation = Evaluation(id=None, assignment=assignment)
        return evaluation_response(evaluation)

    def put(self, request: Request, pk) -> Response:
        self.get_assignment(pk)
        body = EvaluationDraftSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        evaluation = save_draft(
            assignment_id=pk,
            reviewer=request.user,
            values=body.validated_data,
            expected_lock_version=parse_if_match(request, "de la evaluación"),
        )
        return evaluation_response(evaluation)


@extend_schema_view(
    post=extend_schema(
        tags=["Revisor"],
        operation_id="reviewer_assignment_evaluation_submit",
        summary="Enviar la evaluación final",
        description="La evaluación final es inmutable. Exige `If-Match` con el ETag del borrador.",
        parameters=[ID, IF_MATCH],
        request=None,
        responses={200: ReviewerEvaluationSerializer, 409: STATE_409},
    ),
)
class ReviewerEvaluationSubmitView(ReviewerBaseView):
    """``POST /api/v1/reviewer/assignments/{id}/evaluation/submit/``: the immutable final."""

    permission_classes = [IsAuthenticated, IsReviewer]

    def post(self, request: Request, pk) -> Response:
        self.get_assignment(pk)
        evaluation = submit_evaluation(
            assignment_id=pk,
            reviewer=request.user,
            expected_lock_version=parse_if_match(request, "de la evaluación"),
            context=audit_request_context(request),
        )
        return evaluation_response(evaluation)


@extend_schema_view(
    post=extend_schema(
        tags=["Revisor"],
        operation_id="reviewer_assignment_conflict",
        summary="Declarar un conflicto de interés",
        description=(
            "Libera la asignación sin penalización (`REVOKED` con causa `CONFLICT_OF_INTEREST`), "
            "cubre el cupo con otro revisor y conserva el borrador marcado. Después el detalle "
            "responde 404."
        ),
        parameters=[ID],
        request=DeclareConflictSerializer,
        responses={200: ReviewerConflictSerializer, 409: STATE_409},
    ),
)
class ReviewerConflictView(ReviewerBaseView):
    """``POST /api/v1/reviewer/assignments/{id}/conflict/``: declare a conflict of interest.

    The assignment is released without penalty and the slot is covered
    again by the automatic engine.
    """

    permission_classes = [IsAuthenticated, IsReviewer]

    def post(self, request: Request, pk) -> Response:
        self.get_assignment(pk)
        body = DeclareConflictSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        assignment = declare_conflict(
            assignment_id=pk,
            reviewer=request.user,
            reason=(body.validated_data.get("reason") or "").strip() or None,
            context=audit_request_context(request),
        )
        return Response(ReviewerConflictSerializer(assignment).data)


@extend_schema_view(
    get=extend_schema(
        tags=["Revisor"],
        operation_id="reviewer_standing",
        summary="Mi desempeño",
        description=(
            "Puntaje de ranking, cupo, evaluaciones a tiempo y vencimientos del propio revisor. "
            "Nunca identifica a autores ni a otros revisores."
        ),
        responses={200: ReviewerStandingSerializer},
    ),
)
class ReviewerStandingView(GenericAPIView):
    """``GET /api/v1/reviewer/standing/``: the reviewer's own performance."""

    permission_classes = [IsAuthenticated, IsReviewer]

    def get(self, request: Request) -> Response:
        return Response(ReviewerStandingSerializer(reviewer_standing(request.user)).data)


@extend_schema_view(
    get=extend_schema(
        tags=["Revisor"],
        operation_id="reviewer_standing_adjustments",
        summary="Historial de ajustes de mi ranking",
        description="Paginado, el más reciente primero.",
        parameters=PAGINATION,
        responses={200: RankingAdjustmentSerializer(many=True)},
    ),
)
class ReviewerStandingAdjustmentsView(GenericAPIView):
    """``GET /api/v1/reviewer/standing/adjustments/``: the log of ranking adjustments."""

    permission_classes = [IsAuthenticated, IsReviewer]

    def get(self, request: Request) -> Response:
        adjustments = (
            RankingAdjustment.objects.filter(reviewer=request.user)
            .select_related("assignment__manuscript", "assignment__version")
            .order_by("-created_at", "-id")
        )
        page = self.paginate_queryset(adjustments)
        return self.get_paginated_response(RankingAdjustmentSerializer(page, many=True).data)


class ReviewerHistoryBaseView(GenericAPIView):
    """The reviewer's own final evaluations, through the same scope as the inbox.

    Starting from :meth:`Assignment.objects.for_reviewer` keeps a
    withdrawn manuscript and one the reviewer co-authored out of the
    history. Drafts are never listed. The permission of the module role is
    enough here: :class:`IsAssignedReviewer` reads an object with a
    ``reviewer_id`` as an assignment, which an evaluation is not.
    """

    permission_classes = [IsAuthenticated, IsReviewer]

    def scoped_evaluations(self) -> QuerySet:
        own = Assignment.objects.for_reviewer(self.request.user).values("pk")
        # Un veredicto nuevo enlaza sus evaluaciones por `VerdictEvaluation`; el heredado, por `evaluation`.
        latest_verdict = Verdict.objects.filter(
            Q(evaluation=OuterRef("pk")) | Q(evaluations__evaluation=OuterRef("pk"))
        ).order_by("-created_at", "-id")
        return (
            Evaluation.objects.filter(assignment__in=own, status=Evaluation.Status.FINAL)
            .select_related("manuscript", "version")
            .prefetch_related("manuscript__areas")
            .annotate(
                editorial_decision=Subquery(latest_verdict.values("decision")[:1]),
                editorial_decided_at=Subquery(latest_verdict.values("created_at")[:1]),
            )
            .order_by("-submitted_at", "-id")
        )


@extend_schema_view(
    get=extend_schema(
        tags=["Revisor"],
        operation_id="reviewer_evaluations_list",
        summary="Historial de mis evaluaciones",
        description="Solo evaluaciones finales propias; los borradores nunca se listan.",
        parameters=PAGINATION,
        responses={200: ReviewerEvaluationHistorySerializer(many=True)},
    ),
)
class ReviewerEvaluationListView(ReviewerHistoryBaseView):
    """``GET /api/v1/reviewer/evaluations/``: history of the reviewer's final evaluations."""

    def get(self, request: Request) -> Response:
        page = self.paginate_queryset(self.scoped_evaluations())
        return self.get_paginated_response(
            ReviewerEvaluationHistorySerializer(page, many=True).data
        )


@extend_schema_view(
    get=extend_schema(
        tags=["Revisor"],
        operation_id="reviewer_evaluations_retrieve",
        summary="Ver una evaluación final",
        description="Solo lectura. Una evaluación ajena responde 404.",
        parameters=[ID],
        responses={200: ReviewerEvaluationHistoryDetailSerializer},
    ),
)
class ReviewerEvaluationDetailView(ReviewerHistoryBaseView):
    """``GET /api/v1/reviewer/evaluations/{id}/``: one final evaluation, read-only."""

    def get(self, request: Request, pk) -> Response:
        evaluation = get_object_or_404(self.scoped_evaluations(), pk=pk)
        return Response(ReviewerEvaluationHistoryDetailSerializer(evaluation).data)


@extend_schema_view(
    post=extend_schema(
        tags=["Revisor"],
        operation_id="reviewer_assignment_identity_leak",
        summary="Reportar una filtración de identidad",
        description=(
            "Reporte confidencial: no cambia la evaluación, el PDF ni el manuscrito, y el Autor "
            "nunca se entera. Solo el dueño de una asignación `ACTIVE`; un segundo reporte abierto "
            "responde 409."
        ),
        parameters=[ID],
        request=ReportIncidentSerializer,
        responses={201: ReviewerIncidentSerializer, 409: STATE_409},
    ),
)
class ReviewerIdentityLeakView(ReviewerBaseView):
    """``POST /api/v1/reviewer/assignments/{id}/identity-leak/``: a confidential report.

    Private: it changes neither the evaluation, the PDF nor the manuscript,
    and the author never learns it exists. Only the owner of an ``ACTIVE``
    assignment files it; a second open report answers ``409``.
    """

    permission_classes = [IsAuthenticated, IsReviewer]

    def post(self, request: Request, pk) -> Response:
        self.get_assignment(pk)
        body = ReportIncidentSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        incident = report_incident(
            assignment_id=pk,
            reviewer=request.user,
            report_type=body.validated_data["report_type"],
            description=body.validated_data["description"],
            context=audit_request_context(request),
        )
        return Response(ReviewerIncidentSerializer(incident).data, status=status.HTTP_201_CREATED)
