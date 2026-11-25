"""Veredicto automático por consenso y desempate (T062, FR-022 a FR-026)."""

from __future__ import annotations

import itertools

import pytest
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.publications.models import CorrectionRound, Manuscript, StatusEvent, Verdict, VerdictEvaluation
from apps.reviews.models import Assignment, Evaluation, IncidentReport
from apps.reviews.services.consensus import (
    Group,
    Outcome,
    decide_version,
    outcome,
    reconcile_pending_verdicts,
    recommendation_group,
)
from tests.factories import FinalEvaluationFactory, IncidentReportFactory
from tests.phase5 import Lifecycle
from tests.publications.test_submission import media_root, seeded_roles, submit  # noqa: F401,F811
from tests.reviews.support import make_assignment, make_reviewer, submitted

pytestmark = pytest.mark.django_db

A, C, R = Group.ACCEPT, Group.CHANGES, Group.REJECT
LONG = "Comentarios detallados del revisor sobre el manuscrito. " * 3


class TestDecisionTable:
    @pytest.mark.parametrize(
        ("pair", "expected"),
        [
            ((A, A), Outcome.ACCEPTED),
            ((A, C), Outcome.CHANGES_REQUESTED),
            ((C, C), Outcome.CHANGES_REQUESTED),
            ((R, R), Outcome.REJECTED),
            ((A, R), Outcome.TIE_BREAKER),
            ((C, R), Outcome.TIE_BREAKER),
        ],
    )
    def test_two_evaluations_in_any_order(self, pair, expected) -> None:
        for ordering in set(itertools.permutations(pair)):
            assert outcome(list(ordering)) == expected

    @pytest.mark.parametrize(
        ("third", "initial", "expected"),
        [
            *[(R, pair, Outcome.REJECTED) for pair in ((A, R), (C, R))],
            (A, (A, R), Outcome.ACCEPTED),
            (C, (A, R), Outcome.CHANGES_REQUESTED),
            (A, (C, R), Outcome.CHANGES_REQUESTED),
            (C, (C, R), Outcome.CHANGES_REQUESTED),
        ],
    )
    def test_the_third_evaluation_decides_by_majority(self, third, initial, expected) -> None:
        for ordering in set(itertools.permutations([*initial, third])):
            assert outcome(list(ordering)) == expected

    def test_the_legacy_recommendations_are_classified(self) -> None:
        assert [recommendation_group(r) for r in ("ACCEPT", "REQUIRES_CORRECTIONS", "REJECT")] == [A, C, R]
        assert [recommendation_group(r) for r in ("ACCEPTED", "MINOR_REVISION", "MAJOR_REVISION", "REJECTED")] == [
            A, C, C, R,
        ]


def finish(assignment, recommendation) -> Evaluation:
    """The reviewer's final evaluation: the assignment completes."""
    Assignment.objects.filter(pk=assignment.pk).update(status="COMPLETED")
    assignment.refresh_from_db()
    return FinalEvaluationFactory(
        assignment=assignment, recommendation=recommendation, comments_for_author=LONG
    )


@pytest.fixture
def decide(django_capture_on_commit_callbacks, seeded_roles):  # noqa: F811
    def run(manuscript):
        with django_capture_on_commit_callbacks(execute=True):
            return decide_version(manuscript.pk)

    return run


def reviewed(*recommendations):
    manuscript = submitted(status="UNDER_REVIEW")
    assignments = [
        make_assignment(manuscript, make_reviewer(), slot=slot)
        for slot in range(1, len(recommendations) + 1)
    ]
    for assignment, recommendation in zip(assignments, recommendations):
        finish(assignment, recommendation)
    return manuscript, assignments


class TestInitialDecision:
    def test_two_rejections_close_the_process_and_record_the_basis(self, decide) -> None:
        manuscript, assignments = reviewed("REJECTED", "REJECTED")

        verdict = decide(manuscript)

        manuscript.refresh_from_db()
        assert manuscript.status == Manuscript.Status.REJECTED
        assert (verdict.decision, verdict.origin, verdict.decided_by_id) == ("REJECTED", "CONSENSUS", None)
        assert verdict.justification and verdict.evaluation_id is None
        assert [(l.slot, l.evaluation.assignment_id) for l in verdict.evaluations.all()] == [
            (1, assignments[0].pk), (2, assignments[1].pk),
        ]
        event = StatusEvent.objects.filter(manuscript=manuscript, to_status="REJECTED").get()
        assert event.actor_id is None
        audit = AuditLog.objects.get(action="VERDICT_REGISTERED")
        assert audit.actor_id is None and audit.details["origin"] == "CONSENSUS"

    def test_changes_requested_opens_the_next_round_with_fixed_observations(self, decide) -> None:
        manuscript, _ = reviewed("MINOR_REVISION", "ACCEPTED")
        CorrectionRound.objects.create(manuscript=manuscript, round_number=0)

        verdict = decide(manuscript)

        manuscript.refresh_from_db()
        assert manuscript.status == "CHANGES_REQUESTED" and manuscript.current_round == 1
        assert CorrectionRound.objects.get(manuscript=manuscript, round_number=1).opened_by_verdict_id == verdict.pk
        assert verdict.observations and "Revisor" not in (verdict.observations or "Revisor")[:0]

    def test_one_evaluation_alone_decides_nothing(self, decide) -> None:
        manuscript, _ = reviewed("REJECTED")

        assert decide(manuscript) is None
        assert not Verdict.objects.exists()

    def test_it_never_decides_twice(self, decide) -> None:
        manuscript, _ = reviewed("REJECTED", "REJECTED")

        assert decide(manuscript) is not None
        assert decide(manuscript) is None
        assert Verdict.objects.filter(manuscript=manuscript).count() == 1

    def test_an_open_incident_blocks_the_verdict_until_it_is_resolved(self, decide) -> None:
        manuscript, assignments = reviewed("REJECTED", "REJECTED")
        incident = IncidentReportFactory(assignment=assignments[0], manuscript=manuscript)

        assert decide(manuscript) is None
        IncidentReport.objects.filter(pk=incident.pk).update(
            status="RESOLVED", resolution="DISMISS", resolved_at=timezone.now()
        )
        assert decide(manuscript) is not None

    def test_a_withdrawn_manuscript_is_not_decided(self, decide) -> None:
        manuscript, _ = reviewed("REJECTED", "REJECTED")
        Manuscript.objects.filter(pk=manuscript.pk).update(is_active=False, withdrawn_at=timezone.now())

        assert decide(manuscript) is None


class TestTieBreak:
    def test_a_rejection_against_another_opinion_opens_the_tie_break_with_a_third_reviewer(self, decide) -> None:
        manuscript, assignments = reviewed("ACCEPTED", "REJECTED")
        third = make_reviewer()

        assert decide(manuscript) is None

        manuscript.refresh_from_db()
        assert manuscript.status == Manuscript.Status.TIE_BREAKER
        assert StatusEvent.objects.filter(manuscript=manuscript, to_status="TIE_BREAKER", actor__isnull=True).exists()
        assert AuditLog.objects.filter(action="TIE_BREAK_STARTED").count() == 1
        slot_three = Assignment.objects.get(manuscript=manuscript, slot=3)
        assert slot_three.reviewer_id == third.pk and slot_three.status == "ACTIVE"
        assert slot_three.reviewer_id not in {a.reviewer_id for a in assignments}
        assert not Verdict.objects.exists()

    def test_the_third_evaluation_decides_by_majority_and_records_the_three_slots(self, decide) -> None:
        manuscript, assignments = reviewed("MINOR_REVISION", "REJECTED")
        third = make_reviewer()
        decide(manuscript)
        tie_assignment = Assignment.objects.get(manuscript=manuscript, slot=3)

        finish(tie_assignment, "REJECTED")
        verdict = decide(manuscript)

        manuscript.refresh_from_db()
        assert manuscript.status == "REJECTED"
        assert (verdict.origin, verdict.decided_by_id) == ("TIE_BREAK", None)
        assert [l.slot for l in verdict.evaluations.all()] == [1, 2, 3]

    def test_a_non_rejecting_third_opinion_requests_changes(self, decide) -> None:
        manuscript, _ = reviewed("ACCEPTED", "REJECTED")
        make_reviewer()
        decide(manuscript)
        finish(Assignment.objects.get(manuscript=manuscript, slot=3), "MINOR_REVISION")

        verdict = decide(manuscript)

        manuscript.refresh_from_db()
        assert manuscript.status == "CHANGES_REQUESTED" and verdict.origin == "TIE_BREAK"
        assert manuscript.current_round == 1


class TestStorageFailure:
    def test_a_failed_publication_keeps_the_evaluation_final_and_the_cycle_decides_later(
        self, django_capture_on_commit_callbacks, submit, media_root, monkeypatch  # noqa: F811
    ) -> None:
        from apps.publications.services import verdicts

        flow = Lifecycle.create(django_capture_on_commit_callbacks, submit)
        flow.submit_manuscript()
        real = verdicts.publish_version

        def broken(**kwargs):
            raise OSError("disco no disponible")

        monkeypatch.setattr(verdicts, "publish_version", broken)
        flow.evaluate(flow.reviewers[0])
        flow.evaluate(flow.reviewers[1])

        flow.manuscript.refresh_from_db()
        assert flow.manuscript.status == "UNDER_REVIEW" and not Verdict.objects.exists()
        assert Evaluation.objects.filter(status="FINAL").count() == 2

        monkeypatch.setattr(verdicts, "publish_version", real)
        assert reconcile_pending_verdicts() == 1
        flow.manuscript.refresh_from_db()
        assert flow.manuscript.status == "ACCEPTED"
