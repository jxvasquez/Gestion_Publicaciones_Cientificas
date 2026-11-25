"""Ranking de revisores: +10 a tiempo, −20 al vencer, mínimo 0 y bitácora append-only (T076)."""

from __future__ import annotations

import pytest

from apps.audit.models import AuditLog
from apps.reviews.models import Assignment, RankingAdjustment
from apps.reviews.services import ranking
from apps.reviews.services.assignments import release_assignment
from tests.publications.test_manuscript_api import client_for
from tests.reviews.support import make_assignment, make_reviewer, seeded_roles, submitted  # noqa: F401

pytestmark = pytest.mark.django_db

BASE = "/api/v1/reviewer/assignments/"
GOOD = {
    "scientific_contribution": 4, "methodological_rigor": 4, "literature_grounding": 4,
    "results_conclusions": 4, "academic_writing": 4, "recommendation": "ACCEPTED",
    "comments_for_author": "Buen trabajo.",
}


def score(reviewer) -> int:
    reviewer.reviewer_profile.refresh_from_db()
    return reviewer.reviewer_profile.ranking_score


@pytest.fixture
def case(seeded_roles):  # noqa: F811
    reviewer = make_reviewer()
    return reviewer, make_assignment(submitted(status="UNDER_REVIEW"), reviewer)


def submit_in_time(reviewer, assignment):
    client = client_for(reviewer)
    saved = client.put(f"{BASE}{assignment.pk}/evaluation/", GOOD, format="json", HTTP_IF_MATCH='"0"')
    return client.post(f"{BASE}{assignment.pk}/evaluation/submit/", HTTP_IF_MATCH=saved["ETag"])


class TestOnTimeBonus:
    def test_a_final_evaluation_before_the_deadline_adds_ten_in_the_same_transaction(self, case) -> None:
        reviewer, assignment = case

        assert submit_in_time(reviewer, assignment).status_code == 200

        assert score(reviewer) == 110
        adjustment = RankingAdjustment.objects.get(assignment=assignment)
        assert (adjustment.cause, adjustment.delta, adjustment.score_before, adjustment.score_after) == (
            "ON_TIME_EVALUATION", 10, 100, 110,
        )
        audit = AuditLog.objects.get(action="RANKING_ADJUSTED")
        assert audit.details["score_after"] == 110 and audit.actor_id is None

    def test_a_late_submission_gets_no_bonus(self, case) -> None:
        reviewer, assignment = case
        Assignment.objects.filter(pk=assignment.pk).update(status="EXPIRED")

        response = client_for(reviewer).post(
            f"{BASE}{assignment.pk}/evaluation/submit/", HTTP_IF_MATCH='"0"'
        )

        assert response.status_code in (404, 409, 410)
        assert score(reviewer) == 100 and not RankingAdjustment.objects.exists()


class TestAdjust:
    def test_the_deadline_penalty_subtracts_twenty(self, case) -> None:
        reviewer, assignment = case

        adjustment = ranking.adjust(
            reviewer_id=reviewer.pk, assignment=assignment, cause="DEADLINE_MISSED"
        )

        assert (adjustment.delta, adjustment.score_after) == (-20, 80) and score(reviewer) == 80

    def test_the_score_never_goes_below_zero_but_the_delta_is_nominal(self, seeded_roles) -> None:  # noqa: F811
        reviewer = make_reviewer(ranking_score=10)
        assignment = make_assignment(submitted(status="UNDER_REVIEW"), reviewer)

        adjustment = ranking.adjust(
            reviewer_id=reviewer.pk, assignment=assignment, cause="DEADLINE_MISSED"
        )

        assert (adjustment.score_before, adjustment.delta, adjustment.score_after) == (10, -20, 0)
        assert score(reviewer) == 0

    def test_each_adjustment_is_applied_once_per_assignment(self, case) -> None:
        reviewer, assignment = case

        first = ranking.adjust(reviewer_id=reviewer.pk, assignment=assignment, cause="ON_TIME_EVALUATION")
        second = ranking.adjust(reviewer_id=reviewer.pk, assignment=assignment, cause="ON_TIME_EVALUATION")

        assert first is not None and second is None
        assert score(reviewer) == 110 and RankingAdjustment.objects.count() == 1

    def test_the_score_reconciles_with_the_log(self, seeded_roles) -> None:  # noqa: F811
        reviewer = make_reviewer()
        causes = ["ON_TIME_EVALUATION"] * 3 + ["DEADLINE_MISSED"] * 2
        for cause in causes:
            assignment = make_assignment(submitted(status="UNDER_REVIEW"), reviewer, status="COMPLETED")
            ranking.adjust(reviewer_id=reviewer.pk, assignment=assignment, cause=cause)

        assert score(reviewer) == max(0, 100 + 10 * 3 - 20 * 2)


class TestReleasesDoNotPenalize:
    @pytest.mark.parametrize(
        "cause",
        ["CONFLICT_OF_INTEREST", "INCIDENT_REASSIGN", "ANONYMIZATION_REQUESTED", "MANUSCRIPT_WITHDRAWN"],
    )
    def test_a_release_not_attributable_to_the_reviewer_keeps_the_score(self, case, cause) -> None:
        reviewer, assignment = case

        release_assignment(assignment, cause=cause, actor=None, actor_role=None, context={})

        assert score(reviewer) == 100 and not RankingAdjustment.objects.exists()
