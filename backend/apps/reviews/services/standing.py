"""Performance of the reviewers and counters of the dashboards (FR-033, FR-038).

Everything is derived from the assignments and the ranking log, without
extra columns, and without N+1: :func:`annotate_standing` adds the three
counters to a page of profiles in ONE query.
"""

from __future__ import annotations

from typing import Any

from django.db.models import Count, Q, QuerySet

from apps.reviews.models import Assignment, IncidentReport, RankingAdjustment
from apps.reviews.policy import MAX_ACTIVE_ASSIGNMENTS
from apps.reviews.services.assignments import awaiting_reviewers
from apps.users.models import ReviewerProfile


def annotate_standing(queryset: QuerySet) -> QuerySet:
    """Annotate ``active_assignments``, ``on_time_evaluations`` and ``missed_deadlines``.

    ``queryset`` is a queryset of :class:`ReviewerProfile`.
    """
    return queryset.annotate(
        active_assignments=Count(
            "user__review_assignments",
            filter=Q(user__review_assignments__status=Assignment.Status.ACTIVE),
            distinct=True,
        ),
        on_time_evaluations=Count(
            "user__ranking_adjustments",
            filter=Q(
                user__ranking_adjustments__cause=RankingAdjustment.Cause.ON_TIME_EVALUATION
            ),
            distinct=True,
        ),
        missed_deadlines=Count(
            "user__ranking_adjustments",
            filter=Q(user__ranking_adjustments__cause=RankingAdjustment.Cause.DEADLINE_MISSED),
            distinct=True,
        ),
    )


def reviewer_standing(user) -> dict[str, Any]:
    """The performance of one reviewer, as ``GET /reviewer/standing/`` shows it."""
    profile = (
        annotate_standing(ReviewerProfile.objects.filter(user=user))
        .prefetch_related("areas")
        .first()
    )
    if profile is None:
        return {
            "ranking_score": 0,
            "active_assignments": 0,
            "max_active_assignments": MAX_ACTIVE_ASSIGNMENTS,
            "on_time_evaluations": 0,
            "missed_deadlines": 0,
            "is_available": False,
            "areas": [],
        }
    return {
        "ranking_score": profile.ranking_score,
        "active_assignments": profile.active_assignments,
        "max_active_assignments": MAX_ACTIVE_ASSIGNMENTS,
        "on_time_evaluations": profile.on_time_evaluations,
        "missed_deadlines": profile.missed_deadlines,
        "is_available": profile.is_available,
        "areas": list(profile.areas.filter(is_active=True).order_by("name")),
    }


def reviewer_dashboard(user) -> dict[str, Any]:
    """REVIEWER section of the unified dashboard."""
    standing = reviewer_standing(user)
    pending = Assignment.objects.for_reviewer(user).filter(
        status=Assignment.Status.ACTIVE
    ).exclude(evaluation__status="FINAL").count()
    return {
        "ranking_score": standing["ranking_score"],
        "active_assignments": standing["active_assignments"],
        "max_active_assignments": standing["max_active_assignments"],
        "pending_evaluations": pending,
        "on_time_evaluations": standing["on_time_evaluations"],
        "missed_deadlines": standing["missed_deadlines"],
    }


def admin_dashboard(user) -> dict[str, Any]:
    """ADMIN section: open reports and manuscripts with a pending slot."""
    return {
        "open_incidents": IncidentReport.objects.for_admin(user)
        .filter(status=IncidentReport.Status.OPEN)
        .count(),
        "awaiting_reviewers": awaiting_reviewers().count(),
    }
