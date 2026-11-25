"""Automatic verdict by consensus or tie-break (spec 004, FR-022 to FR-026).

``outcome`` is the pure decision table. ``decide_version`` applies it to a
manuscript, under its lock, once the evaluations of the required slots are
final; ``reconcile_pending_verdicts`` retries the versions that were left
without a verdict (for example after a storage failure).

Decision of two evaluations: two acceptances → accepted; two rejections →
rejected; a rejection with any other opinion → tie-break (a third
reviewer); in every other case → changes requested. With three evaluations
a majority of rejections rejects; otherwise it is accepted only if both
non-rejecting opinions accept, and changes are requested in the rest.
"""

from __future__ import annotations

import logging
from enum import StrEnum
from uuid import UUID

from django.db import transaction

from apps.publications.models import Manuscript, StatusEvent, Verdict
from apps.publications.services.verdicts import (
    CONSENSUS_OBSERVATIONS,
    REJECTION_JUSTIFICATION,
    apply_decision,
)
from apps.publications.services.versions import run_formal_write
from apps.reviews.models import Assignment, Evaluation, IncidentReport
from apps.reviews.policy import REVIEWERS_PER_VERSION, TIE_BREAKER_SLOT
from apps.reviews.services.assignments import fill_review_slots, record_review_audit
from apps.reviews.signals import announce, tie_break_started

logger = logging.getLogger(__name__)


class Group(StrEnum):
    """Opinion group of a reviewer recommendation."""

    ACCEPT = "ACCEPT"
    CHANGES = "CHANGES"
    REJECT = "REJECT"


class Outcome(StrEnum):
    """Result of the decision tables."""

    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    CHANGES_REQUESTED = "CHANGES_REQUESTED"
    TIE_BREAKER = "TIE_BREAKER"


#: Group of every recommendation of both rubric versions.
GROUP_BY_RECOMMENDATION = {
    "ACCEPTED": Group.ACCEPT,
    "MINOR_REVISION": Group.CHANGES,
    "MAJOR_REVISION": Group.CHANGES,
    "REJECTED": Group.REJECT,
    # Rúbrica 1: solo evaluaciones heredadas de la transición.
    "ACCEPT": Group.ACCEPT,
    "REQUIRES_CORRECTIONS": Group.CHANGES,
    "REJECT": Group.REJECT,
}


def recommendation_group(recommendation: str) -> Group:
    return GROUP_BY_RECOMMENDATION[recommendation]


def outcome(groups: list[Group]) -> Outcome:
    """Decision table over the groups of two or three final evaluations.

    The order never matters. With two groups the result may be
    ``TIE_BREAKER``; with three it is always final.
    """
    rejections = sum(1 for group in groups if group == Group.REJECT)
    if len(groups) == REVIEWERS_PER_VERSION:
        if rejections == 2:
            return Outcome.REJECTED
        if rejections == 1:
            return Outcome.TIE_BREAKER
        if all(group == Group.ACCEPT for group in groups):
            return Outcome.ACCEPTED
        return Outcome.CHANGES_REQUESTED
    # Tres dictámenes: dos o más rechazos rechazan.
    if rejections >= 2:
        return Outcome.REJECTED
    non_rejecting = [group for group in groups if group != Group.REJECT]
    if all(group == Group.ACCEPT for group in non_rejecting):
        return Outcome.ACCEPTED
    return Outcome.CHANGES_REQUESTED


def _final_evaluations(version) -> list[tuple[int, Evaluation]]:
    """``(slot, evaluation)`` of the final evaluations of live assignments, by slot."""
    rows = (
        Evaluation.objects.filter(
            version=version,
            status=Evaluation.Status.FINAL,
            assignment__status=Assignment.Status.COMPLETED,
        )
        .select_related("assignment")
        .order_by("assignment__slot")
    )
    return [(row.assignment.slot, row) for row in rows]


def _ready(manuscript: Manuscript) -> bool:
    """The manuscript can be decided now (``decide_version`` conditions)."""
    if not manuscript.is_active:
        return False
    if manuscript.status not in (Manuscript.Status.UNDER_REVIEW, Manuscript.Status.TIE_BREAKER):
        return False
    return not IncidentReport.objects.filter(
        manuscript=manuscript, status=IncidentReport.Status.OPEN
    ).exists()


def decide_version(manuscript_id: UUID, *, context: dict | None = None) -> Verdict | None:
    """Decide the current version when its required evaluations are final.

    Returns the new verdict, or ``None`` if there is nothing to decide:
    slots still waiting, an open incident, a withdrawn manuscript or a
    version that already has its ordinary verdict. Idempotent and safe
    under concurrency: the manuscript lock serializes the callers.
    """
    context = context or {}

    def work(rollback) -> Verdict | None:
        manuscript = Manuscript.objects.select_for_update(of=("self",)).get(pk=manuscript_id)
        if not _ready(manuscript):
            return None
        version = manuscript.versions.get(version_number=manuscript.current_version)
        if Verdict.objects.filter(version=version, previous_verdict__isnull=True).exists():
            return None
        evaluations = _final_evaluations(version)
        in_tie_break = manuscript.status == Manuscript.Status.TIE_BREAKER
        needed = REVIEWERS_PER_VERSION + (1 if in_tie_break else 0)
        if len(evaluations) < needed:
            return None
        considered = evaluations[:needed]
        result = outcome([recommendation_group(item.recommendation) for _, item in considered])

        if result == Outcome.TIE_BREAKER:
            _open_tie_break(manuscript, version, context)
            return None

        origin = Verdict.Origin.TIE_BREAK if in_tie_break else Verdict.Origin.CONSENSUS
        applied = apply_decision(
            manuscript=manuscript,
            version=version,
            decision=result.value,
            origin=origin,
            basis=[(item, slot) for slot, item in considered],
            decided_by=None,
            justification=REJECTION_JUSTIFICATION if result == Outcome.REJECTED else None,
            observations=CONSENSUS_OBSERVATIONS if result == Outcome.CHANGES_REQUESTED else None,
            previous_verdict=None,
            correction=None,
            context=context,
            rollback=rollback,
        )
        return applied.verdict

    return run_formal_write(
        action="VERDICT_REGISTERED",
        manuscript_id=manuscript_id,
        user=None,
        context=context,
        work=work,
        actor_role=None,
    )


def _open_tie_break(manuscript: Manuscript, version, context: dict) -> None:
    """Move to ``TIE_BREAKER`` and schedule the assignment of the third slot."""
    manuscript.status = Manuscript.Status.TIE_BREAKER
    manuscript.lock_version += 1
    manuscript.save(update_fields=("status", "lock_version", "updated_at"))
    StatusEvent.objects.create(
        manuscript=manuscript,
        from_status=Manuscript.Status.UNDER_REVIEW,
        to_status=Manuscript.Status.TIE_BREAKER,
        actor=None,
        metadata={"version_number": version.version_number, "slot": TIE_BREAKER_SLOT},
    )
    record_review_audit(
        None,
        None,
        "TIE_BREAK_STARTED",
        "MANUSCRIPT",
        manuscript.pk,
        context,
        details={"code": manuscript.code, "version_number": version.version_number},
    )
    transaction.on_commit(
        lambda: announce(tie_break_started, manuscript_id=manuscript.pk, version_id=version.pk)
    )
    transaction.on_commit(lambda: _fill_after_commit(manuscript.pk))


def _fill_after_commit(manuscript_id: UUID) -> None:
    try:
        fill_review_slots(manuscript_id)
    except Exception:  # noqa: BLE001 - el motor reintenta en el siguiente ciclo
        logger.exception("No se pudo asignar el revisor de desempate de %s", manuscript_id)


def reconcile_pending_verdicts() -> int:
    """Decide every version that is complete but has no verdict yet.

    Covers a verdict that failed after its evaluation committed (storage or
    audit unavailable) and the versions inherited from the Editor flow.
    Returns how many verdicts were issued.
    """
    decided = 0
    candidates = Manuscript.objects.filter(
        is_active=True,
        status__in=(Manuscript.Status.UNDER_REVIEW, Manuscript.Status.TIE_BREAKER),
    ).values_list("pk", flat=True)
    for manuscript_id in list(candidates):
        try:
            if decide_version(manuscript_id) is not None:
                decided += 1
        except Exception:  # noqa: BLE001 - un manuscrito no bloquea a los demás
            logger.exception("No se pudo decidir el manuscrito %s", manuscript_id)
    return decided
