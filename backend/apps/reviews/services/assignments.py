"""Automatic assignment engine: slots, release and withdrawal (spec 004).

The system, not an editor, assigns reviewers. ``fill_review_slots`` covers
the missing slots of the current version of a manuscript (1 and 2, plus 3
while it is in ``TIE_BREAKER``) with the best eligible candidates;
``fill_pending_slots`` walks the waiting manuscripts first-come-first-served.

Concurrency (R-06): every transaction that creates assignments takes
ONE advisory lock first and the manuscript row afterwards, so two engines
never interleave and the load count of a reviewer is exact. Transactions
that only free slots (evaluation, expiration, conflict, incident,
withdrawal) never assign: they schedule ``fill_pending_slots`` with
``transaction.on_commit``. The partial unique indexes and the capacity
trigger of ``reviews_assignment`` stay as the last barrier.

The deadline is fixed by PostgreSQL (``now() + 20 days``), never by the
client clock. Every change is audited inside its transaction (the actor is
empty for the system) and announced after the commit
(:mod:`apps.reviews.signals`).
"""

from __future__ import annotations

import logging
from datetime import timedelta
from uuid import UUID

from django.db import IntegrityError, connection, transaction
from django.db.models import Count, F, OuterRef, Q, Subquery, Case, IntegerField, Value, When
from django.db.models.functions import Now

from apps.audit.models import AuditLog
from apps.audit.services import AuditService, AuditUnavailable
from apps.publications.models import Manuscript, ManuscriptVersion, StatusEvent
from apps.reviews.models import Assignment
from apps.reviews.policy import ASSIGNMENT_DAYS, REVIEWERS_PER_VERSION, TIE_BREAKER_SLOT
from apps.reviews.services.eligibility import eligible_candidates
from apps.reviews.signals import (
    announce,
    assignment_created,
    assignment_revoked,
    review_started,
    slot_unfilled,
)
from apps.users.models import Role
from apps.users.services.auth import AUDIT_UNAVAILABLE_MESSAGE
from config.exceptions import DomainError, ErrorCode

logger = logging.getLogger(__name__)

#: Key of the advisory lock shared by every transaction that creates assignments.
ASSIGNMENT_LOCK_KEY = "reviews_assignment_engine"

#: Statuses whose manuscripts can wait for reviewers.
ENGINE_STATUSES = (
    Manuscript.Status.SUBMITTED,
    Manuscript.Status.UNDER_REVIEW,
    Manuscript.Status.TIE_BREAKER,
)

#: Statuses of an assignment that covers its slot.
LIVE_STATUSES = (Assignment.Status.ACTIVE, Assignment.Status.COMPLETED)

#: Fixed reason stored with every release: it never repeats free text.
RELEASE_REASONS = {
    Assignment.ReleaseCause.OVERDUE: "Venció el plazo de 20 días de la asignación.",
    Assignment.ReleaseCause.CONFLICT_OF_INTEREST: "El revisor declaró un conflicto de interés.",
    Assignment.ReleaseCause.INCIDENT_REASSIGN: "Liberada al resolver un incidente confidencial.",
    Assignment.ReleaseCause.ANONYMIZATION_REQUESTED: (
        "Liberada al solicitar una versión anonimizada."
    ),
    Assignment.ReleaseCause.MANUSCRIPT_WITHDRAWN: "Baja lógica del manuscrito por su Autor.",
    Assignment.ReleaseCause.LEGACY_TRANSITION: (
        "Cerrada en la transición a la asignación automática."
    ),
}
NOT_RELEASABLE_MESSAGE = "Solo una asignación activa o completada puede liberarse."


def record_review_audit(
    actor,
    actor_role: str | None,
    action: str,
    entity_type: str,
    entity_id: UUID,
    context: dict | None = None,
    **extra,
) -> None:
    """Append an audit event of the review flow to the current transaction.

    ``actor`` and ``actor_role`` are ``None`` when the system acts.
    """
    AuditService.record(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        result=AuditLog.Result.SUCCESS,
        actor=actor,
        actor_role=actor_role,
        **extra,
        **(context or {}),
    )


def run_audited(work):
    """Run ``work`` atomically; a missing audit trail aborts it with ``503``."""
    try:
        with transaction.atomic():
            return work()
    except AuditUnavailable as exc:
        raise DomainError(AUDIT_UNAVAILABLE_MESSAGE, code=ErrorCode.AUDIT_UNAVAILABLE) from exc


def lock_assignment_engine() -> None:
    """Take the transaction-scoped advisory lock of the engine (before any row)."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", [ASSIGNMENT_LOCK_KEY])


# --- Slots ------------------------------------------------------------------


def required_slots(manuscript: Manuscript) -> tuple[int, ...]:
    """Slots the current version needs: 1 and 2, plus the tie-break while it lasts."""
    slots = tuple(range(1, REVIEWERS_PER_VERSION + 1))
    if manuscript.status == Manuscript.Status.TIE_BREAKER:
        slots += (TIE_BREAKER_SLOT,)
    return slots


def covered_slots(version: ManuscriptVersion) -> set[int]:
    """Slots of the version with an ``ACTIVE`` or ``COMPLETED`` assignment."""
    return set(
        Assignment.objects.filter(version=version, status__in=LIVE_STATUSES).values_list(
            "slot", flat=True
        )
    )


def awaiting_reviewers():
    """Active manuscripts whose current version lacks at least one required slot.

    Ordered first-come-first-served by the submission of the current
    version and then by ``id`` (FR-014). A manuscript with all its slots
    covered, withdrawn, or outside the engine statuses never appears.
    """
    version_submitted_at = ManuscriptVersion.objects.filter(
        manuscript=OuterRef("pk"), version_number=OuterRef("current_version")
    ).values("submitted_at")[:1]
    required = Case(
        When(status=Manuscript.Status.TIE_BREAKER, then=Value(REVIEWERS_PER_VERSION + 1)),
        default=Value(REVIEWERS_PER_VERSION),
        output_field=IntegerField(),
    )
    return (
        Manuscript.objects.filter(is_active=True, status__in=ENGINE_STATUSES)
        .annotate(
            live_slots=Count(
                "assignments",
                filter=Q(
                    assignments__version__version_number=F("current_version"),
                    assignments__status__in=LIVE_STATUSES,
                ),
                distinct=True,
            ),
            required_slots=required,
            version_submitted_at=Subquery(version_submitted_at),
        )
        .filter(live_slots__lt=F("required_slots"))
        .order_by("version_submitted_at", "id")
    )


# --- Engine -----------------------------------------------------------------


def _slot_already_reported(manuscript: Manuscript, version: ManuscriptVersion, slot: int) -> bool:
    return AuditLog.objects.filter(
        action="ASSIGNMENT_SLOT_UNFILLED",
        entity_id=manuscript.pk,
        details__version_number=version.version_number,
        details__slot=slot,
    ).exists()


def _create_assignment(
    manuscript: Manuscript, version: ManuscriptVersion, reviewer, slot: int, context: dict
) -> Assignment | None:
    """Insert one assignment; ``None`` if a barrier of the database refused it."""
    try:
        with transaction.atomic():
            assignment = Assignment.objects.create(
                manuscript=manuscript,
                version=version,
                reviewer=reviewer,
                slot=slot,
                assigned_by=None,
                # `Now()` es el instante de la transacción: ambos campos
                # coinciden con la restricción `due_at = assigned_at + 20 días`.
                assigned_at=Now(),
                due_at=Now() + timedelta(days=ASSIGNMENT_DAYS),
            )
    except IntegrityError:
        logger.warning("La base rechazó la asignación del cupo %s de %s", slot, manuscript.pk)
        return None
    assignment.refresh_from_db()
    record_review_audit(
        None,
        None,
        "AUTO_ASSIGNMENT_CREATED",
        "ASSIGNMENT",
        assignment.pk,
        context,
        details={
            "manuscript_id": str(manuscript.pk),
            "code": manuscript.code,
            "reviewer_id": str(reviewer.pk),
            "version_number": version.version_number,
            "slot": slot,
            "due_at": assignment.due_at.isoformat(),
        },
    )
    transaction.on_commit(
        lambda: announce(
            assignment_created,
            assignment_id=assignment.pk,
            manuscript_id=manuscript.pk,
            reviewer_id=reviewer.pk,
        )
    )
    return assignment


def _start_review(manuscript: Manuscript, version: ManuscriptVersion) -> None:
    """``SUBMITTED`` → ``UNDER_REVIEW`` with the first assignment of the version."""
    manuscript.status = Manuscript.Status.UNDER_REVIEW
    manuscript.lock_version += 1
    manuscript.save(update_fields=("status", "lock_version", "updated_at"))
    StatusEvent.objects.create(
        manuscript=manuscript,
        from_status=Manuscript.Status.SUBMITTED,
        to_status=Manuscript.Status.UNDER_REVIEW,
        actor=None,
        metadata={"round_number": manuscript.current_round},
    )
    transaction.on_commit(
        lambda: announce(
            review_started, manuscript_id=manuscript.pk, version_id=version.pk
        )
    )


def fill_review_slots(manuscript_id: UUID, *, context: dict | None = None) -> list[Assignment]:
    """Cover the missing slots of the current version with the best candidates.

    Idempotent: with every slot covered, a withdrawn manuscript or a status
    outside the engine, it does nothing. A slot without a candidate stays
    pending (audited and announced once) and a later run covers it.
    """
    context = context or {}

    def work() -> list[Assignment]:
        lock_assignment_engine()
        manuscript = Manuscript.objects.select_for_update(of=("self",)).get(pk=manuscript_id)
        if not manuscript.is_active or manuscript.status not in ENGINE_STATUSES:
            return []
        version = manuscript.versions.get(version_number=manuscript.current_version)
        missing = [slot for slot in required_slots(manuscript) if slot not in covered_slots(version)]
        if not missing:
            return []

        candidates = list(eligible_candidates(manuscript, version)[: len(missing)])
        created: list[Assignment] = []
        unfilled: list[int] = []
        remaining = iter(candidates)
        for slot in missing:
            reviewer = next(remaining, None)
            assignment = (
                _create_assignment(manuscript, version, reviewer, slot, context)
                if reviewer is not None
                else None
            )
            if assignment is None:
                unfilled.append(slot)
                continue
            if manuscript.status == Manuscript.Status.SUBMITTED:
                _start_review(manuscript, version)
            created.append(assignment)

        for slot in unfilled:
            if _slot_already_reported(manuscript, version, slot):
                continue
            record_review_audit(
                None,
                None,
                "ASSIGNMENT_SLOT_UNFILLED",
                "MANUSCRIPT",
                manuscript.pk,
                context,
                details={
                    "code": manuscript.code,
                    "version_number": version.version_number,
                    "slot": slot,
                },
            )
            transaction.on_commit(
                lambda slot=slot: announce(
                    slot_unfilled,
                    manuscript_id=manuscript.pk,
                    version_id=version.pk,
                    slot=slot,
                )
            )
        return created

    return run_audited(work)


def fill_pending_slots(*, context: dict | None = None) -> int:
    """Cover the pending slots of every waiting manuscript, oldest submission first.

    Each manuscript is its own transaction: if the audit trail fails for
    one, it stays pending for the next run and the rest are still served.
    Returns how many assignments were created.
    """
    total = 0
    for manuscript_id in list(awaiting_reviewers().values_list("pk", flat=True)):
        try:
            total += len(fill_review_slots(manuscript_id, context=context))
        except DomainError as error:
            if error.code != ErrorCode.AUDIT_UNAVAILABLE:
                raise
            logger.error("No se pudo auditar la asignación del manuscrito %s", manuscript_id)
    return total


def schedule_fill_pending_slots() -> None:
    """Run :func:`fill_pending_slots` once the current transaction commits."""
    transaction.on_commit(_fill_pending_after_commit)


def _fill_pending_after_commit() -> None:
    try:
        fill_pending_slots()
    except Exception:  # noqa: BLE001 - la reasignación nunca revierte lo ya confirmado
        logger.exception("Falló la reasignación automática de cupos")


# --- Release ----------------------------------------------------------------


def mark_released(
    assignment: Assignment, *, status: str, cause: str, actor, reason: str | None = None
) -> None:
    """Close ``assignment`` as ``REVOKED`` or ``EXPIRED``; the instant is the database's."""
    assignment.status = status
    assignment.release_cause = cause
    assignment.revoked_by = actor
    assignment.revocation_reason = reason or RELEASE_REASONS.get(cause)
    assignment.revoked_at = Now()
    assignment.lock_version += 1
    assignment.save(
        update_fields=(
            "status",
            "release_cause",
            "revoked_by",
            "revoked_at",
            "revocation_reason",
            "lock_version",
            "updated_at",
        )
    )
    assignment.refresh_from_db()


def release_assignment(
    assignment: Assignment,
    *,
    cause: str,
    actor,
    actor_role: str | None,
    context: dict | None = None,
) -> Assignment:
    """Release an assignment without touching the ranking (FR-031).

    Runs inside the caller's transaction, with the assignment already
    locked. It audits ``ASSIGNMENT_RELEASED``, announces the release after
    the commit and schedules the engine to cover the freed slot. The
    evaluation of a ``COMPLETED`` assignment is kept untouched.
    """
    if assignment.status not in (Assignment.Status.ACTIVE, Assignment.Status.COMPLETED):
        raise DomainError(
            NOT_RELEASABLE_MESSAGE,
            code=ErrorCode.STATE_CONFLICT,
            details={"status": assignment.status},
        )
    previous_status = assignment.status
    mark_released(assignment, status=Assignment.Status.REVOKED, cause=cause, actor=actor)
    record_review_audit(
        actor,
        actor_role,
        "ASSIGNMENT_RELEASED",
        "ASSIGNMENT",
        assignment.pk,
        context,
        reason=assignment.revocation_reason,
        details={
            "manuscript_id": str(assignment.manuscript_id),
            "cause": cause,
            "slot": assignment.slot,
            "previous_status": previous_status,
        },
    )
    transaction.on_commit(
        lambda: announce(
            assignment_revoked,
            assignment_id=assignment.pk,
            manuscript_id=assignment.manuscript_id,
            reviewer_id=assignment.reviewer_id,
            cause=str(cause),
        )
    )
    schedule_fill_pending_slots()
    return assignment


def release_on_withdrawal(*, manuscript_id: UUID, withdrawn_by_id: UUID) -> list[Assignment]:
    """Release every ``ACTIVE`` assignment of a manuscript its author withdrew.

    Runs inside the withdrawal's transaction (the ``manuscript_withdrawing``
    signal): if the audit cannot be written the whole withdrawal aborts.
    ``revoked_by`` stays empty so the author's identity never reaches the
    assignment. Evaluations are left untouched.
    """
    released = []
    assignments = Assignment.objects.select_for_update().filter(
        manuscript_id=manuscript_id, status=Assignment.Status.ACTIVE
    )
    for assignment in assignments:
        mark_released(
            assignment,
            status=Assignment.Status.REVOKED,
            cause=Assignment.ReleaseCause.MANUSCRIPT_WITHDRAWN,
            actor=None,
        )
        AuditService.record(
            action="ASSIGNMENT_RELEASED",
            entity_type="ASSIGNMENT",
            entity_id=assignment.pk,
            result=AuditLog.Result.SUCCESS,
            actor_id=withdrawn_by_id,
            actor_role=Role.Code.AUTHOR,
            reason=assignment.revocation_reason,
            details={
                "manuscript_id": str(manuscript_id),
                "cause": Assignment.ReleaseCause.MANUSCRIPT_WITHDRAWN,
                "slot": assignment.slot,
                "previous_status": Assignment.Status.ACTIVE,
            },
        )
        transaction.on_commit(
            lambda assignment=assignment: announce(
                assignment_revoked,
                assignment_id=assignment.pk,
                manuscript_id=assignment.manuscript_id,
                reviewer_id=assignment.reviewer_id,
                cause=str(Assignment.ReleaseCause.MANUSCRIPT_WITHDRAWN),
            )
        )
        released.append(assignment)
    return released
