"""Common core of every verdict: state change, publication and audit (spec 004).

:func:`apply_decision` is the single place where a verdict is written. It
runs INSIDE the transaction of its caller — the automatic consensus
(``reviews.services.consensus``) or the administrative correction
(:mod:`apps.publications.services.corrections`) — and, under the manuscript
lock the caller already holds, it appends the :class:`Verdict` and the
:class:`VerdictEvaluation` rows of the evaluations it considered, moves the
manuscript to its new state and, by decision:

* ``ACCEPTED`` — publishes the public copy in the catalog, synchronously;
* ``REJECTED`` — publishes nothing;
* ``CHANGES_REQUESTED`` — opens the next correction round, keeps its
  reference to the verdict and increments ``current_round``.

If the public copy, the storage or the audit fail, nothing is kept: the
database rolls back and the copy this call wrote is removed by the caller's
``Rollback``. A version has a single ordinary verdict.

An administrative correction passes the :class:`VerdictCorrection` that
authorizes it: the new verdict links to the one it replaces
(``previous_verdict``), the correction is consumed in the same transaction
and the catalog follows the new decision: an accepted manuscript is
published (or its entry and copy restored), a rejected one or one with
changes requested leaves the catalog. The original verdict and
``current_version`` are never touched; the audit event is
``VERDICT_CORRECTED``. The system acts with an empty actor.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.publications.models import (
    CatalogEntry,
    CorrectionRound,
    Manuscript,
    ManuscriptVersion,
    StatusEvent,
    Verdict,
    VerdictCorrection,
    VerdictEvaluation,
)
from apps.publications.services.catalog import (
    discard_leftover_copy,
    ensure_public_copy,
    publish_version,
    remove_public_copy,
    retire_entry,
)
from apps.publications.services.pdf import PdfService
from apps.publications.services.versions import Rollback, record_audit
from apps.publications.signals import verdict_registered
from apps.users.models import Role

logger = logging.getLogger(__name__)

ACTION = "VERDICT_REGISTERED"
CORRECTED_ACTION = "VERDICT_CORRECTED"

#: Fixed texts of the automatic verdicts: they name nobody (double blind).
REJECTION_JUSTIFICATION = "Los revisores decidieron rechazar el manuscrito."
CONSENSUS_OBSERVATIONS = (
    "Los revisores solicitaron cambios. Revise los comentarios de cada evaluación."
)

#: Manuscript status that each decision produces.
STATUS_BY_DECISION = {
    Verdict.Decision.ACCEPTED: Manuscript.Status.ACCEPTED,
    Verdict.Decision.REJECTED: Manuscript.Status.REJECTED,
    Verdict.Decision.CHANGES_REQUESTED: Manuscript.Status.CHANGES_REQUESTED,
}


@dataclass(frozen=True)
class VerdictResult:
    """What registering a verdict created or changed."""

    manuscript: Manuscript
    verdict: Verdict
    catalog_entry: CatalogEntry | None
    opened_round: CorrectionRound | None
    correction: VerdictCorrection | None = None


def _announce(
    manuscript_id: UUID,
    verdict_id: UUID,
    decision: str,
    previous_verdict_id: UUID | None = None,
) -> None:
    # `previous_verdict_id` viaja solo en una corrección: el contrato del veredicto
    # normal no cambia.
    extra = {} if previous_verdict_id is None else {"previous_verdict_id": previous_verdict_id}
    for receiver, error in verdict_registered.send_robust(
        sender=Manuscript,
        manuscript_id=manuscript_id,
        verdict_id=verdict_id,
        decision=decision,
        **extra,
    ):
        if isinstance(error, Exception):
            logger.error("Un receptor del veredicto falló (%s): %s", receiver, error)


def apply_decision(
    *,
    manuscript: Manuscript,
    version: ManuscriptVersion,
    decision: str,
    origin: str,
    basis: list,
    decided_by,
    justification: str | None,
    observations: str | None,
    previous_verdict: Verdict | None,
    correction: VerdictCorrection | None,
    context: dict,
    rollback: Rollback,
) -> VerdictResult:
    """Append the verdict and apply its effects; ``manuscript`` is locked by the caller.

    ``basis`` is a list of ``(evaluation, slot)``: the evaluations the
    verdict considered, which define the «Revisor N» labels of the author.
    ``decided_by`` is ``None`` when the system decides.
    """
    pdf = PdfService()
    now = timezone.now()
    previous_status = manuscript.status
    verdict = Verdict.objects.create(
        manuscript=manuscript,
        version=version,
        evaluation=None,
        decided_by=decided_by,
        origin=origin,
        decision=decision,
        justification=justification,
        observations=observations,
        previous_verdict=previous_verdict,
    )
    VerdictEvaluation.objects.bulk_create(
        [VerdictEvaluation(verdict=verdict, evaluation=evaluation, slot=slot) for evaluation, slot in basis]
    )
    if correction is not None:
        correction.is_active = False
        correction.consumed_at = now
        correction.consumed_by_verdict = verdict
        correction.save(update_fields=("is_active", "consumed_at", "consumed_by_verdict"))

    catalog_entry = opened_round = None
    event_metadata = {
        "verdict_id": str(verdict.pk),
        "version_number": version.version_number,
        "origin": origin,
    }
    if correction is not None:
        event_metadata.update(
            previous_verdict_id=str(previous_verdict.pk), correction_id=str(correction.pk)
        )
    if decision == Verdict.Decision.ACCEPTED:
        manuscript.accepted_at = now
        active = (
            CatalogEntry.objects.select_for_update()
            .filter(manuscript=manuscript, is_active=True)
            .first()
            if correction is not None
            else None
        )
        if active is not None:
            catalog_entry = active
            ensure_public_copy(active, version, pdf=pdf, rollback=rollback)
        else:
            if correction is not None:
                discard_leftover_copy(manuscript.pk, version.pk)
            catalog_entry = publish_version(
                manuscript=manuscript, version=version, pdf=pdf, rollback=rollback
            )
    else:
        if correction is not None:
            # La decisión ya no es «aceptado»: el artículo sale del catálogo y
            # la copia pública se borra tras el commit (plan sección 4.8, paso 7).
            manuscript.accepted_at = None
            retired_copy = retire_entry(manuscript.pk, now=now)
            if retired_copy:
                transaction.on_commit(lambda path=retired_copy: remove_public_copy(path))
        if decision == Verdict.Decision.CHANGES_REQUESTED and not (
            correction is not None
            and CorrectionRound.objects.filter(manuscript=manuscript, closed_at__isnull=True).exists()
        ):
            manuscript.current_round += 1
            opened_round = CorrectionRound.objects.create(
                manuscript=manuscript,
                round_number=manuscript.current_round,
                opened_by_verdict=verdict,
                opened_at=now,
            )
            event_metadata["round_number"] = opened_round.round_number

    manuscript.status = STATUS_BY_DECISION[decision]
    manuscript.lock_version += 1
    manuscript.save(
        update_fields=("status", "current_round", "accepted_at", "lock_version", "updated_at")
    )
    StatusEvent.objects.create(
        manuscript=manuscript,
        from_status=previous_status,
        to_status=manuscript.status,
        actor=decided_by,
        metadata=event_metadata,
    )
    audit_details = {
        "code": manuscript.code,
        "verdict_id": str(verdict.pk),
        "decision": decision,
        "origin": origin,
        "version_number": version.version_number,
        "evaluation_ids": [str(evaluation.pk) for evaluation, _ in basis],
        "round_opened": opened_round.round_number if opened_round else None,
        "catalog_entry_id": str(catalog_entry.pk) if catalog_entry else None,
    }
    if correction is not None:
        audit_details.update(
            previous_verdict_id=str(previous_verdict.pk),
            previous_decision=previous_verdict.decision,
            correction_id=str(correction.pk),
        )
    record_audit(
        CORRECTED_ACTION if correction is not None else ACTION,
        manuscript.pk,
        decided_by,
        context,
        actor_role=Role.Code.ADMIN if decided_by is not None else None,
        details=audit_details,
    )
    previous_id = previous_verdict.pk if previous_verdict is not None else None
    transaction.on_commit(lambda: _announce(manuscript.pk, verdict.pk, decision, previous_id))
    return VerdictResult(
        manuscript=manuscript,
        verdict=verdict,
        catalog_entry=catalog_entry,
        opened_round=opened_round,
        correction=correction,
    )
