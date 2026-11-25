"""Ranking score of the reviewers: bonus on time, penalty when overdue (spec 004).

Only :func:`adjust` modifies ``ReviewerProfile.ranking_score``. It runs inside
the transaction of the event that causes it (the final evaluation or the
expiration), locks the profile, clamps the score at 0 and writes the
append-only :class:`RankingAdjustment`. ``UNIQUE (assignment, cause)``
makes every adjustment idempotent. Releases not attributable to the
reviewer (conflict, incident, anonymization, withdrawal) never call it.
"""

from __future__ import annotations

from uuid import UUID

from django.db import IntegrityError, transaction

from apps.reviews.models import Assignment, RankingAdjustment
from apps.reviews.policy import MISSED_DEADLINE_PENALTY, ON_TIME_BONUS
from apps.reviews.services.assignments import record_review_audit
from apps.users.models import ReviewerProfile

#: Nominal change of each cause.
DELTAS = {
    RankingAdjustment.Cause.ON_TIME_EVALUATION: ON_TIME_BONUS,
    RankingAdjustment.Cause.DEADLINE_MISSED: MISSED_DEADLINE_PENALTY,
}


def adjust(
    *, reviewer_id: UUID, assignment: Assignment, cause: str, context: dict | None = None
) -> RankingAdjustment | None:
    """Apply the adjustment of ``cause`` once per assignment.

    Returns the new :class:`RankingAdjustment`, or ``None`` if that
    assignment already received it.
    """
    if RankingAdjustment.objects.filter(assignment=assignment, cause=cause).exists():
        return None
    profile = ReviewerProfile.objects.select_for_update().filter(user_id=reviewer_id).first()
    if profile is None:
        return None
    delta = DELTAS[cause]
    score_before = profile.ranking_score
    score_after = max(0, score_before + delta)
    try:
        with transaction.atomic():
            adjustment = RankingAdjustment.objects.create(
                reviewer_id=reviewer_id,
                assignment=assignment,
                cause=cause,
                delta=delta,
                score_before=score_before,
                score_after=score_after,
            )
    except IntegrityError:
        return None
    profile.ranking_score = score_after
    profile.save(update_fields=("ranking_score", "updated_at"))
    record_review_audit(
        None,
        None,
        "RANKING_ADJUSTED",
        "RANKING_ADJUSTMENT",
        reviewer_id,
        context,
        details={
            "assignment_id": str(assignment.pk),
            "manuscript_id": str(assignment.manuscript_id),
            "cause": cause,
            "delta": delta,
            "score_before": score_before,
            "score_after": score_after,
        },
    )
    return adjustment
