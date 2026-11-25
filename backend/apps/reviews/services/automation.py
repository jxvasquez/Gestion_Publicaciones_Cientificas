"""Scheduled automation of the review flow: expire, decide and fill (spec 004, R-10).

``run_cycle`` is what the ``run_review_automation`` command runs every
minute, in this order (all steps idempotent):

1. :func:`expire_overdue` — every ``ACTIVE`` assignment with
   ``due_at <= now()`` (the database clock) becomes ``EXPIRED`` with the
   cause ``OVERDUE``, loses 20 ranking points and is audited and announced.
2. :func:`~apps.reviews.services.consensus.reconcile_pending_verdicts` —
   decides the versions that are complete but have no verdict.
3. :func:`~apps.reviews.services.assignments.fill_pending_slots` — covers
   the freed and pending slots, oldest submission first.

Each assignment expires in its own transaction together with its audit
event and ranking adjustment. Only an ``ACTIVE`` row is selected, so a
second run finds nothing to do and repeats no event or notice. If the
audit trail is unavailable for one assignment it stays ``ACTIVE`` and the
next run retries it, without blocking the rest.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from uuid import UUID

from django.db import transaction
from django.db.models.functions import Now

from apps.audit.services import AuditUnavailable
from apps.reviews.models import Assignment, RankingAdjustment
from apps.reviews.services import ranking
from apps.reviews.services.assignments import (
    fill_pending_slots,
    mark_released,
    record_review_audit,
)
from apps.reviews.services.consensus import reconcile_pending_verdicts
from apps.reviews.signals import announce, assignment_expired

logger = logging.getLogger(__name__)

EXPIRATION_REASON = "Venció el plazo de 20 días de la asignación."


@dataclass(frozen=True)
class ExpirationResult:
    """How many assignments were expired and how many could not be."""

    expired: int
    failed: int


@dataclass(frozen=True)
class CycleResult:
    """Counts of one automation cycle; all zero means there was no work."""

    expired: int
    failed: int
    decided: int
    assigned: int

    @property
    def worked(self) -> bool:
        return bool(self.expired or self.failed or self.decided or self.assigned)


def _expire(assignment_id: UUID) -> bool:
    """Expire one assignment; ``False`` if it is no longer due.

    The row is locked and the condition re-evaluated, so an assignment
    completed, revoked or already expired in the meantime is left alone,
    and one that another process is handling is skipped.
    """
    assignment = (
        Assignment.objects.select_for_update(skip_locked=True)
        .select_related("version")
        .filter(pk=assignment_id, status=Assignment.Status.ACTIVE, due_at__lte=Now())
        .first()
    )
    if assignment is None:
        return False
    mark_released(
        assignment,
        status=Assignment.Status.EXPIRED,
        cause=Assignment.ReleaseCause.OVERDUE,
        actor=None,
        reason=EXPIRATION_REASON,
    )
    ranking.adjust(
        reviewer_id=assignment.reviewer_id,
        assignment=assignment,
        cause=RankingAdjustment.Cause.DEADLINE_MISSED,
    )
    record_review_audit(
        None,
        None,
        "ASSIGNMENT_EXPIRED",
        "ASSIGNMENT",
        assignment.pk,
        reason=EXPIRATION_REASON,
        details={
            "manuscript_id": str(assignment.manuscript_id),
            "slot": assignment.slot,
            "due_at": assignment.due_at.isoformat(),
            "source": "scheduler",
        },
    )
    transaction.on_commit(
        lambda: announce(
            assignment_expired,
            assignment_id=assignment.pk,
            manuscript_id=assignment.manuscript_id,
            reviewer_id=assignment.reviewer_id,
        )
    )
    return True


def expire_overdue() -> ExpirationResult:
    """Expire every ``ACTIVE`` assignment whose deadline passed."""
    due_ids = list(
        Assignment.objects.filter(status=Assignment.Status.ACTIVE, due_at__lte=Now())
        .order_by("due_at", "id")
        .values_list("pk", flat=True)
    )
    expired = failed = 0
    for assignment_id in due_ids:
        try:
            with transaction.atomic():
                expired += _expire(assignment_id)
        except AuditUnavailable:
            failed += 1
            logger.error("No se pudo auditar el vencimiento de la asignación %s", assignment_id)
    return ExpirationResult(expired=expired, failed=failed)


def run_cycle() -> CycleResult:
    """Expire, reconcile verdicts and fill slots, in that order."""
    expiration = expire_overdue()
    decided = reconcile_pending_verdicts()
    assigned = fill_pending_slots()
    return CycleResult(
        expired=expiration.expired,
        failed=expiration.failed,
        decided=decided,
        assigned=assigned,
    )
