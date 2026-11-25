"""Who can review a manuscript version: eligible candidates and conflicts of interest.

A reviewer is eligible (FR-011) when the account and the ``REVIEWER`` role
are active, the profile marks them as available, they share at least one
career with the manuscript, they have no authorship relation with it
(registrant, author or co-author, by account or by e-mail), they never took
part in the version (with any assignment status) and they have fewer than
``MAX_ACTIVE_ASSIGNMENTS`` active assignments.

Candidates are ordered (FR-012) by ``-ranking_score``, lowest active load,
oldest last assignment (never assigned first) and ``id``. The match uses
the careers of the manuscript even if they were deactivated later.
"""

from __future__ import annotations

from django.db.models import Count, F, Max, Q, QuerySet
from django.db.models.functions import Lower

from apps.publications.models import Manuscript, ManuscriptVersion
from apps.reviews.models import Assignment
from apps.reviews.policy import MAX_ACTIVE_ASSIGNMENTS
from apps.users.models import Role, User


def author_emails(manuscript: Manuscript) -> list[str]:
    """Lower-cased e-mails of the manuscript's authors."""
    return [email.lower() for email in manuscript.authors.values_list("email", flat=True)]


def has_conflict(manuscript: Manuscript, user: User) -> bool:
    """The user registered the manuscript or is one of its authors."""
    if user.pk == manuscript.created_by_id:
        return True
    return manuscript.authors.filter(Q(user=user) | Q(email__iexact=user.email)).exists()


def eligible_candidates(manuscript: Manuscript, version: ManuscriptVersion) -> QuerySet:
    """Eligible reviewers of ``version``, best candidate first, in ONE query.

    Each row carries ``active_assignments`` and ``last_assigned_at`` (the
    values the order uses). The caller must hold the assignment advisory
    lock so the load count cannot change before the assignment is written.
    """
    area_ids = list(manuscript.areas.values_list("pk", flat=True))
    return (
        User.objects.filter(
            is_active=True,
            role_assignments__is_active=True,
            role_assignments__role__code=Role.Code.REVIEWER,
            role_assignments__role__is_active=True,
            reviewer_profile__is_available=True,
            reviewer_profile__areas__in=area_ids,
        )
        .exclude(pk=manuscript.created_by_id)
        .exclude(authorships__manuscript=manuscript)
        .exclude(review_assignments__version=version)
        .annotate(email_lower=Lower("email"))
        .exclude(email_lower__in=author_emails(manuscript))
        .annotate(
            ranking_score=F("reviewer_profile__ranking_score"),
            active_assignments=Count(
                "review_assignments",
                filter=Q(review_assignments__status=Assignment.Status.ACTIVE),
                distinct=True,
            ),
            last_assigned_at=Max("review_assignments__assigned_at"),
        )
        .filter(active_assignments__lt=MAX_ACTIVE_ASSIGNMENTS)
        .order_by(
            "-ranking_score",
            "active_assignments",
            F("last_assigned_at").asc(nulls_first=True),
            "id",
        )
        .distinct()
    )
