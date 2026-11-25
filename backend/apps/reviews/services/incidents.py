"""Confidential incident reports and their resolution by the administrator (TSK-64, spec 004).

The reviewer files a report about an ``ACTIVE`` assignment; the
administrator resolves it exactly once (CA-HU-16-06). Both actions run in
ONE transaction that also records the audit: if the audit trail is
unavailable nothing is kept and the answer is ``503``.

Resolutions:

* ``REQUEST_ANONYMIZED_VERSION`` — the manuscript goes from
  ``UNDER_REVIEW`` or ``TIE_BREAKER`` to ``CHANGES_REQUESTED``, a new round
  opens (without a verdict: this is the audited, one-off exception to the
  ordinary transition) and every ``ACTIVE`` assignment of the version is
  released without penalty. The round is linked from the report.
* ``REASSIGN`` — the assignment of the reporter, even if already
  ``COMPLETED``, is released without penalty and the engine covers the
  slot; the manuscript keeps its status.
* ``DISMISS`` — the report is closed; no state and no assignment change.

An open report blocks the automatic verdict of its version; closing the
last one schedules it again. The author never learns who reported or that
a report exists: the status event the resolution writes carries a fixed
text. Locks are taken manuscript, then assignment, then report.
"""

from __future__ import annotations

import logging
from uuid import UUID

from django.db import IntegrityError, transaction
from django.db.models.functions import Now

from apps.audit.models import AuditLog
from apps.audit.services import AuditService
from apps.publications.models import CorrectionRound, Manuscript, StatusEvent
from apps.reviews.models import Assignment, IncidentReport
from apps.reviews.services.assignments import (
    record_review_audit,
    release_assignment,
    run_audited,
)
from apps.reviews.services.evaluations import NOT_FOUND_MESSAGE, locked_assignment
from apps.reviews.signals import announce, incident_reported, incident_resolved
from apps.users.models import Role, User
from config.exceptions import DomainError, ErrorCode

logger = logging.getLogger(__name__)

NOT_ACTIVE_MESSAGE = "Solo una asignación activa permite reportar un incidente."
ALREADY_OPEN_MESSAGE = "Ya existe un reporte abierto para esta asignación."
ALREADY_RESOLVED_MESSAGE = "El incidente ya fue resuelto."
NOT_UNDER_REVIEW_MESSAGE = (
    "Solo un manuscrito activo en revisión o en desempate admite solicitar una versión "
    "anonimizada o reasignar."
)
#: Shown to the author in the manuscript history: it names no reviewer and no report.
ANONYMIZED_REQUEST_REASON = "Se solicita una versión anonimizada del manuscrito."


def report_incident(
    *,
    assignment_id: UUID,
    reviewer: User,
    report_type: str,
    description: str,
    context: dict,
) -> IncidentReport:
    """File a confidential report; the evaluation, the PDF and the manuscript are not touched."""

    def work() -> IncidentReport:
        assignment = locked_assignment(assignment_id, reviewer)
        if assignment.status != Assignment.Status.ACTIVE:
            raise DomainError(
                NOT_ACTIVE_MESSAGE,
                code=ErrorCode.STATE_CONFLICT,
                details={"status": assignment.status},
            )
        if IncidentReport.objects.filter(
            assignment=assignment, status=IncidentReport.Status.OPEN
        ).exists():
            raise DomainError(ALREADY_OPEN_MESSAGE, code=ErrorCode.STATE_CONFLICT)
        try:
            with transaction.atomic():
                incident = IncidentReport.objects.create(
                    assignment=assignment,
                    manuscript=assignment.manuscript,
                    reporter=reviewer,
                    report_type=report_type,
                    description=description,
                )
        except IntegrityError as exc:
            raise DomainError(ALREADY_OPEN_MESSAGE, code=ErrorCode.STATE_CONFLICT) from exc

        AuditService.record(
            action="IDENTITY_LEAK_REPORTED",
            entity_type="INCIDENT_REPORT",
            entity_id=incident.pk,
            result=AuditLog.Result.SUCCESS,
            actor=reviewer,
            actor_role=Role.Code.REVIEWER,
            details={
                "manuscript_id": str(assignment.manuscript_id),
                "assignment_id": str(assignment.pk),
                "report_type": report_type,
            },
            **context,
        )
        transaction.on_commit(
            lambda: announce(
                incident_reported,
                incident_id=incident.pk,
                assignment_id=assignment.pk,
                manuscript_id=assignment.manuscript_id,
                report_type=report_type,
            )
        )
        return incident

    return run_audited(work)


def _open_anonymization_round(manuscript: Manuscript, admin: User) -> CorrectionRound:
    """Move the manuscript to ``CHANGES_REQUESTED`` and open the next round."""
    previous_status = manuscript.status
    manuscript.current_round += 1
    opened = CorrectionRound.objects.create(
        manuscript=manuscript,
        round_number=manuscript.current_round,
        opened_by_verdict=None,
    )
    manuscript.status = Manuscript.Status.CHANGES_REQUESTED
    manuscript.lock_version += 1
    manuscript.save(update_fields=("status", "current_round", "lock_version", "updated_at"))
    StatusEvent.objects.create(
        manuscript=manuscript,
        from_status=previous_status,
        to_status=Manuscript.Status.CHANGES_REQUESTED,
        actor=admin,
        reason=ANONYMIZED_REQUEST_REASON,
        metadata={
            "round_number": opened.round_number,
            "cause": IncidentReport.Resolution.REQUEST_ANONYMIZED_VERSION,
        },
    )
    return opened


def _release_for_resolution(incident: IncidentReport, resolution: str, admin: User, context: dict) -> int:
    """Release what the resolution closes; returns how many assignments were released."""
    if resolution == IncidentReport.Resolution.REASSIGN:
        assignment = incident.assignment
        if assignment.status not in (Assignment.Status.ACTIVE, Assignment.Status.COMPLETED):
            return 0
        release_assignment(
            assignment,
            cause=Assignment.ReleaseCause.INCIDENT_REASSIGN,
            actor=admin,
            actor_role=Role.Code.ADMIN,
            context=context,
        )
        return 1
    released = 0
    live = Assignment.objects.select_for_update().filter(
        version=incident.assignment.version, status=Assignment.Status.ACTIVE
    )
    for assignment in live:
        release_assignment(
            assignment,
            cause=Assignment.ReleaseCause.ANONYMIZATION_REQUESTED,
            actor=admin,
            actor_role=Role.Code.ADMIN,
            context=context,
        )
        released += 1
    return released


def resolve_incident(
    *, incident_id: UUID, admin: User, resolution: str, context: dict
) -> IncidentReport:
    """Resolve an open report once; a second attempt answers ``409``."""

    def work() -> IncidentReport:
        try:
            manuscript_id = (
                IncidentReport.objects.for_admin(admin)
                .values_list("manuscript_id", flat=True)
                .get(pk=incident_id)
            )
        except IncidentReport.DoesNotExist as exc:
            raise DomainError(NOT_FOUND_MESSAGE, code=ErrorCode.NOT_FOUND) from exc
        manuscript = Manuscript.objects.select_for_update(of=("self",)).get(pk=manuscript_id)
        incident = (
            IncidentReport.objects.select_for_update(of=("self", "assignment"))
            .select_related("assignment__version")
            .get(pk=incident_id)
        )
        if incident.status != IncidentReport.Status.OPEN:
            raise DomainError(
                ALREADY_RESOLVED_MESSAGE,
                code=ErrorCode.STATE_CONFLICT,
                details={"status": incident.status},
            )

        opened_round = None
        released = 0
        if resolution != IncidentReport.Resolution.DISMISS:
            if not manuscript.is_active or manuscript.status not in (
                Manuscript.Status.UNDER_REVIEW,
                Manuscript.Status.TIE_BREAKER,
            ):
                raise DomainError(
                    NOT_UNDER_REVIEW_MESSAGE,
                    code=ErrorCode.STATE_CONFLICT,
                    details={"status": manuscript.status, "is_active": manuscript.is_active},
                )
            released = _release_for_resolution(incident, resolution, admin, context)
            if resolution == IncidentReport.Resolution.REQUEST_ANONYMIZED_VERSION:
                opened_round = _open_anonymization_round(manuscript, admin)

        incident.status = IncidentReport.Status.RESOLVED
        incident.resolution = resolution
        incident.resolved_by = admin
        incident.resolved_at = Now()
        incident.correction_round = opened_round
        incident.save(
            update_fields=("status", "resolution", "resolved_by", "resolved_at", "correction_round")
        )
        record_review_audit(
            admin,
            Role.Code.ADMIN,
            "INCIDENT_RESOLVED",
            "INCIDENT_REPORT",
            incident.pk,
            context,
            details={
                "manuscript_id": str(manuscript.pk),
                "assignment_id": str(incident.assignment_id),
                "resolution": resolution,
                "assignments_released": released,
                "correction_round_id": str(opened_round.pk) if opened_round else None,
                "round_number": opened_round.round_number if opened_round else None,
            },
        )
        transaction.on_commit(
            lambda: announce(
                incident_resolved,
                incident_id=incident.pk,
                assignment_id=incident.assignment_id,
                manuscript_id=manuscript.pk,
                resolution=resolution,
                correction_round_id=opened_round.pk if opened_round else None,
            )
        )
        if not IncidentReport.objects.filter(
            manuscript=manuscript, status=IncidentReport.Status.OPEN
        ).exists():
            # Un reporte abierto bloqueaba el veredicto de la versión: se reanuda.
            transaction.on_commit(lambda: _decide_after_commit(manuscript.pk))
        incident.refresh_from_db()
        return incident

    return run_audited(work)


def _decide_after_commit(manuscript_id: UUID) -> None:
    from apps.reviews.services.consensus import decide_version

    try:
        decide_version(manuscript_id)
    except Exception:  # noqa: BLE001 - el ciclo programado reintenta
        logger.exception("No se pudo decidir el manuscrito %s tras resolver el incidente", manuscript_id)
