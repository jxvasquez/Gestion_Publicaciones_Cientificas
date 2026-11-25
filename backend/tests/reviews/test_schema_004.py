"""Barreras de la base de datos del esquema 004 (T006): lo que el servicio no puede saltarse."""

from __future__ import annotations

import pytest
from django.db import IntegrityError, transaction
from django.db.utils import DatabaseError

from apps.publications.models import Verdict, VerdictEvaluation
from apps.reviews.models import Assignment, Evaluation, RankingAdjustment
from apps.users.models import AcademicArea
from tests.factories import (
    AcademicAreaFactory,
    AssignmentFactory,
    EvaluationFactory,
    FinalEvaluationFactory,
    ManuscriptFactory,
    ManuscriptVersionFactory,
    ReviewerProfileFactory,
    UserFactory,
    VerdictFactory,
    area,
)
from tests.reviews.support import make_assignment, make_reviewer, seeded_roles, submitted  # noqa: F401

pytestmark = pytest.mark.django_db


def fails(match: str):
    return pytest.raises((IntegrityError, DatabaseError), match=match)


@pytest.fixture
def case(seeded_roles):
    manuscript = submitted(status="UNDER_REVIEW")
    return manuscript, manuscript.versions.get()


class TestAssignmentBarriers:
    def test_the_slot_is_one_two_or_three(self, case) -> None:
        manuscript, _ = case
        with fails("ck_assignment_slot"), transaction.atomic():
            make_assignment(manuscript, make_reviewer(), slot=4)

    def test_one_live_assignment_per_slot_of_a_version(self, case) -> None:
        manuscript, _ = case
        make_assignment(manuscript, make_reviewer(), slot=1)
        with fails("uq_assignment_live_slot"), transaction.atomic():
            make_assignment(manuscript, make_reviewer(), slot=1)

    def test_one_live_assignment_per_reviewer_of_a_version(self, case) -> None:
        manuscript, _ = case
        reviewer = make_reviewer()
        make_assignment(manuscript, reviewer, slot=1)
        with fails("uq_assignment_live_reviewer"), transaction.atomic():
            make_assignment(manuscript, reviewer, slot=2)

    def test_a_revoked_assignment_frees_its_slot(self, case) -> None:
        manuscript, _ = case
        first = make_assignment(manuscript, make_reviewer(), slot=1)
        Assignment.objects.filter(pk=first.pk).update(status="REVOKED")

        assert make_assignment(manuscript, make_reviewer(), slot=1).status == "ACTIVE"

    def test_the_sixth_active_assignment_of_a_reviewer_is_refused(self, case) -> None:
        reviewer = make_reviewer()
        for _ in range(5):
            make_assignment(submitted(status="UNDER_REVIEW"), reviewer)
        with fails("5 asignaciones activas"), transaction.atomic():
            make_assignment(submitted(status="UNDER_REVIEW"), reviewer)

    def test_reactivating_a_closed_assignment_also_hits_the_cap(self, case) -> None:
        reviewer = make_reviewer()
        for _ in range(5):
            make_assignment(submitted(status="UNDER_REVIEW"), reviewer)
        closed = make_assignment(submitted(status="UNDER_REVIEW"), reviewer, status="COMPLETED")
        with fails("5 asignaciones activas"), transaction.atomic():
            Assignment.objects.filter(pk=closed.pk).update(status="ACTIVE")


class TestEvaluationBarriers:
    def final(self, assignment, **overrides):
        return FinalEvaluationFactory(assignment=assignment, **overrides)

    def test_a_rubric_score_outside_1_to_5_is_refused(self, case) -> None:
        manuscript, _ = case
        with fails("ck_evaluation_methodological_rigor"), transaction.atomic():
            EvaluationFactory(
                assignment=make_assignment(manuscript, make_reviewer()), methodological_rigor=6
            )

    def test_the_legacy_recommendation_is_not_valid_in_the_rubric_2(self, case) -> None:
        manuscript, _ = case
        with fails("ck_evaluation_recommendation"), transaction.atomic():
            EvaluationFactory(
                assignment=make_assignment(manuscript, make_reviewer()), recommendation="ACCEPT"
            )

    def test_a_final_with_a_low_criterion_needs_100_characters(self, case) -> None:
        manuscript, _ = case
        short = "x" * 99
        with fails("ck_evaluation_rubric_justification"), transaction.atomic():
            self.final(
                make_assignment(manuscript, make_reviewer()),
                literature_grounding=3,
                comments_for_author=short,
            )
        ok = self.final(
            make_assignment(manuscript, make_reviewer(), slot=2),
            literature_grounding=3,
            comments_for_author="x" * 100,
        )
        assert ok.status == Evaluation.Status.FINAL

    @pytest.mark.parametrize("recommendation", ["MAJOR_REVISION", "REJECTED"])
    def test_a_major_revision_or_a_rejection_needs_100_characters(self, case, recommendation) -> None:
        manuscript, _ = case
        with fails("ck_evaluation_rubric_justification"), transaction.atomic():
            self.final(
                make_assignment(manuscript, make_reviewer()),
                recommendation=recommendation,
                comments_for_author="x" * 99,
            )

    def test_a_legacy_final_keeps_its_old_rules(self, case) -> None:
        manuscript, _ = case
        legacy = FinalEvaluationFactory(
            assignment=make_assignment(manuscript, make_reviewer()), legacy=True,
            comments_for_author="breve",
        )
        assert legacy.rubric_version == 1


class TestRankingAndVerdictBarriers:
    def test_the_ranking_score_never_goes_below_zero(self) -> None:
        profile = ReviewerProfileFactory()
        with fails("ck_reviewer_ranking_score"), transaction.atomic():
            type(profile).objects.filter(pk=profile.pk).update(ranking_score=-1)

    def adjustment(self, assignment, **overrides):
        values = {
            "reviewer": assignment.reviewer, "assignment": assignment,
            "cause": "ON_TIME_EVALUATION", "delta": 10, "score_before": 100, "score_after": 110,
            **overrides,
        }
        return RankingAdjustment.objects.create(**values)

    def test_the_log_is_append_only(self, case) -> None:
        manuscript, _ = case
        adjustment = self.adjustment(make_assignment(manuscript, make_reviewer()))

        with pytest.raises(ValueError):
            adjustment.save()
        with fails("inmutable|append"), transaction.atomic():
            RankingAdjustment.objects.filter(pk=adjustment.pk).update(delta=10, score_after=111)
        with fails("inmutable|append"), transaction.atomic():
            RankingAdjustment.objects.filter(pk=adjustment.pk).delete()

    def test_each_cause_has_its_delta_and_one_adjustment_per_assignment(self, case) -> None:
        manuscript, _ = case
        assignment = make_assignment(manuscript, make_reviewer())
        with fails("ck_ranking_delta_cause"), transaction.atomic():
            self.adjustment(assignment, cause="DEADLINE_MISSED", delta=10)
        self.adjustment(assignment)
        with fails("uq_ranking_assignment_cause"), transaction.atomic():
            self.adjustment(assignment)
        with fails("ck_ranking_score_after"), transaction.atomic():
            self.adjustment(
                make_assignment(manuscript, make_reviewer(), slot=2),
                cause="DEADLINE_MISSED", delta=-20, score_after=-5,
            )

    def test_the_system_verdict_has_no_decider_and_the_origin_matches(self, case) -> None:
        manuscript, version = case
        VerdictFactory(manuscript=manuscript, version=version)  # consenso, sin decisor
        other = submitted()
        with fails("ck_verdict_decider"), transaction.atomic():
            VerdictFactory(manuscript=other, version=other.versions.get(), decided_by=UserFactory())

    def test_requires_corrections_exists_only_for_legacy_verdicts(self, case) -> None:
        manuscript, version = case
        with fails("ck_verdict_decision"), transaction.atomic():
            VerdictFactory(
                manuscript=manuscript, version=version, decision="REQUIRES_CORRECTIONS",
                observations="x",
            )

    def test_changes_requested_needs_observations_and_a_rejection_a_justification(self, case) -> None:
        manuscript, version = case
        with fails("ck_verdict_corrections_observations"), transaction.atomic():
            VerdictFactory(manuscript=manuscript, version=version, decision="CHANGES_REQUESTED")
        with fails("ck_verdict_rejected_justification"), transaction.atomic():
            VerdictFactory(manuscript=manuscript, version=version, decision="REJECTED")

    def test_the_verdict_basis_is_append_only_and_unique(self, case) -> None:
        manuscript, version = case
        evaluation = FinalEvaluationFactory(
            assignment=make_assignment(manuscript, make_reviewer())
        )
        verdict = VerdictFactory(manuscript=manuscript, version=version)
        link = VerdictEvaluation.objects.create(verdict=verdict, evaluation=evaluation, slot=1)
        with fails("uq_verdict_evaluation"), transaction.atomic():
            VerdictEvaluation.objects.create(verdict=verdict, evaluation=evaluation, slot=2)
        with fails("inmutable|append"), transaction.atomic():
            VerdictEvaluation.objects.filter(pk=link.pk).update(slot=2)
        assert Verdict.objects.filter(pk=verdict.pk).exists()


class TestCareerCatalog:
    def test_the_name_is_unique_ignoring_case(self) -> None:
        AcademicAreaFactory(code="derecho", name="Derecho")
        with fails("uq_academic_area_name_lower"), transaction.atomic():
            AcademicArea.objects.create(code="otro", name="DERECHO")
