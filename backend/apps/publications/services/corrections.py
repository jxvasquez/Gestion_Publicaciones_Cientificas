"""Administrative correction of a verdict (CA-HU-13-12, spec 004 R-14).

Only an administrator can replace a verdict that contains an error, and
only the LATEST verdict of the manuscript, while no later version exists.
:func:`correct_verdict` creates the :class:`VerdictCorrection`, applies the
new decision through :func:`apply_decision` (``origin='ADMIN_CORRECTION'``,
copying the evaluations the original considered) and consumes the
correction, all in ONE transaction. The original verdict is never edited
(append-only). An administrator who registered or co-authored the
manuscript has a conflict of interest and cannot correct it (``403``).

``consumption_problem`` is the single rule behind the ``409`` of the
endpoint and the ``can_correct`` flag of the audit detail, so the SPA
never infers it.
"""

from __future__ import annotations

import logging
from uuid import UUID

from django.utils import timezone

from apps.audit.models import AuditLog
from apps.publications.models import (
    Manuscript,
    ManuscriptVersion,
    Verdict,
    VerdictCorrection,
)
from apps.publications.services.idempotency import IdempotencyScope
from apps.publications.services.verdicts import VerdictResult, apply_decision
from apps.publications.services.versions import Rollback, audit_refusal, run_formal_write
from apps.reviews.services.eligibility import has_conflict
from apps.users.models import Role, User
from config.exceptions import DomainError, ErrorCode

logger = logging.getLogger(__name__)

ACTION = "VERDICT_CORRECTED"

WITHDRAWN_MESSAGE = "El manuscrito está dado de baja; no admite una nueva decisión."
STALE_MESSAGE = "El veredicto está desactualizado: ya existe una decisión más reciente."
LATER_VERSION_MESSAGE = "El manuscrito ya tiene una versión posterior al veredicto."
NOT_FOUND_MESSAGE = "Veredicto no encontrado."
CONFLICT_MESSAGE = "Un Administrador con conflicto de interés no puede corregir el veredicto."
OBSERVATIONS_REQUIRED_MESSAGE = "Indique las observaciones para solicitar cambios."
JUSTIFICATION_REQUIRED_MESSAGE = "Indique la justificación del rechazo."
DECISIONS = (
    Verdict.Decision.ACCEPTED,
    Verdict.Decision.REJECTED,
    Verdict.Decision.CHANGES_REQUESTED,
)


def consumption_problem(verdict: Verdict) -> str | None:
    """Why ``verdict`` can no longer be corrected, ignoring any authorization.

    Three rules: a withdrawn manuscript, a verdict that is not the latest,
    or a later version.
    """
    if not Manuscript.objects.filter(pk=verdict.manuscript_id, is_active=True).exists():
        return WITHDRAWN_MESSAGE
    latest = (
        Verdict.objects.filter(manuscript_id=verdict.manuscript_id)
        .order_by("-created_at", "-id")
        .values_list("pk", flat=True)
        .first()
    )
    if latest != verdict.pk:
        return STALE_MESSAGE
    if ManuscriptVersion.objects.filter(
        manuscript_id=verdict.manuscript_id,
        version_number__gt=verdict.version.version_number,
    ).exists():
        return LATER_VERSION_MESSAGE
    return None


def can_correct(verdict: Verdict) -> bool:
    return consumption_problem(verdict) is None


class _Refusal(DomainError):
    """A refused attempt that must leave an audit event of its own (written after the rollback)."""

    def __init__(self, message: str, *, audit_result: str, **kwargs) -> None:
        super().__init__(message, **kwargs)
        self.audit_result = audit_result


def _validation_error(field: str, message: str) -> DomainError:
    return DomainError(message, code=ErrorCode.VALIDATION_ERROR, details={field: [message]})


def correct_verdict(
    *,
    verdict_id: UUID,
    admin: User,
    decision: str,
    reason: str,
    observations: str | None,
    context: dict,
    idempotency: IdempotencyScope | None = None,
) -> VerdictResult:
    """Replace the latest verdict with a new decision, audited and idempotent."""
    manuscript_id = (
        Verdict.objects.filter(pk=verdict_id).values_list("manuscript_id", flat=True).first()
    )
    if manuscript_id is None:
        raise DomainError(NOT_FOUND_MESSAGE, code=ErrorCode.NOT_FOUND)
    observations = (observations or "").strip() or None
    if decision not in DECISIONS:
        raise _validation_error("decision", "Seleccione Aceptado, Rechazado o Cambios solicitados.")
    if decision == Verdict.Decision.CHANGES_REQUESTED and observations is None:
        raise _validation_error("observations", OBSERVATIONS_REQUIRED_MESSAGE)

    def work(rollback: Rollback) -> VerdictResult:
        # El mismo candado que toman el envío de versiones y el veredicto automático.
        manuscript = Manuscript.objects.select_for_update(of=("self",)).get(pk=manuscript_id)
        if has_conflict(manuscript, admin):
            raise _Refusal(
                CONFLICT_MESSAGE, code=ErrorCode.FORBIDDEN, audit_result=AuditLog.Result.DENIED
            )
        previous = (
            Verdict.objects.select_related("version")
            .prefetch_related("evaluations")
            .get(pk=verdict_id)
        )
        problem = consumption_problem(previous)
        if problem is not None:
            raise DomainError(
                problem,
                code=ErrorCode.CORRECTION_NOT_AUTHORIZED,
                details={"verdict_id": str(previous.pk)},
            )
        correction = VerdictCorrection.objects.create(
            manuscript=manuscript,
            original_verdict=previous,
            authorized_by=admin,
            reason=reason,
            authorized_at=timezone.now(),
        )
        # Una corrección copia la base del veredicto que sustituye.
        basis = [(link.evaluation, link.slot) for link in previous.evaluations.select_related("evaluation")]
        if not basis and previous.evaluation_id is not None:
            basis = [(previous.evaluation, 1)]
        justification = reason if decision == Verdict.Decision.REJECTED else None
        return apply_decision(
            manuscript=manuscript,
            version=previous.version,
            decision=decision,
            origin=Verdict.Origin.ADMIN_CORRECTION,
            basis=basis,
            decided_by=admin,
            justification=justification,
            observations=observations,
            previous_verdict=previous,
            correction=correction,
            context=context,
            rollback=rollback,
        )

    try:
        return run_formal_write(
            action=ACTION,
            manuscript_id=manuscript_id,
            user=admin,
            context=context,
            work=work,
            idempotency=idempotency,
            actor_role=Role.Code.ADMIN,
        )
    except _Refusal as refusal:
        audit_refusal(
            ACTION,
            manuscript_id,
            admin,
            context,
            str(refusal.detail),
            result=refusal.audit_result,
            actor_role=Role.Code.ADMIN,
        )
        raise
