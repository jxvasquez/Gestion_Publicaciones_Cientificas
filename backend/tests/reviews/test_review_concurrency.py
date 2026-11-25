"""Real concurrency on evaluations and incidents (TSK-65).

Two requests run in parallel threads, each with its own database
connection, released together by a barrier. Whatever order the threads
take, the row locks, the optimistic lock and the partial unique index
must leave a single coherent outcome:

* two saves with the same ``If-Match`` produce one ``200`` and one ``409``;
* two submissions complete the assignment, and audit it, once;
* a submission racing a revocation or a conflict declaration never leaves
  an assignment that is both completed and revoked, or a final evaluation
  with a declared conflict;
* two reports leave a single open incident;
* two resolutions of one incident apply only the winner's effects.
"""

from __future__ import annotations

import pytest
from django.core.management import call_command

from apps.audit.models import AuditLog
from apps.publications.models import CorrectionRound, Manuscript
from apps.reviews.models import Assignment, Evaluation, IncidentReport
from tests.factories import EvaluationFactory
from tests.parallel import api_task, run_parallel, statuses
from tests.publications.test_lifecycle import assert_audit_chain_intact
from tests.publications.test_manuscript_api import actor
from tests.reviews.support import make_assignment, make_reviewer, submitted

pytestmark = pytest.mark.django_db(transaction=True)

REVIEWER = "/api/v1/reviewer/assignments/"
ADMIN = "/api/v1/admin/"
FULL = {
    "scientific_contribution": 4,
    "methodological_rigor": 4,
    "literature_grounding": 5,
    "results_conclusions": 4,
    "academic_writing": 5,
    "recommendation": "ACCEPTED",
    "comments_for_author": "Buen trabajo.",
}


@pytest.fixture(autouse=True)
def seeded_roles(db) -> None:
    call_command("seed_roles", verbosity=0)


class Case:
    """An ``ACTIVE`` assignment with its reviewer and an administrator, committed to the database."""

    def __init__(self) -> None:
        self.admin = actor("ADMIN")
        self.reviewer = make_reviewer()
        self.manuscript = submitted(status="UNDER_REVIEW")
        self.assignment = make_assignment(self.manuscript, self.reviewer)

    def url(self, suffix: str = "") -> str:
        return f"{REVIEWER}{self.assignment.pk}/{suffix}"

    def complete_draft(self, **overrides) -> Evaluation:
        return EvaluationFactory(
            assignment=self.assignment, lock_version=1, **{**FULL, **overrides}
        )

    def save(self, body: dict, lock: int):
        return api_task(
            self.reviewer,
            lambda client: client.put(
                self.url("evaluation/"), body, format="json", HTTP_IF_MATCH=f'"{lock}"'
            ),
        )

    def submit(self, lock: int):
        return api_task(
            self.reviewer,
            lambda client: client.post(self.url("evaluation/submit/"), HTTP_IF_MATCH=f'"{lock}"'),
        )

    def declare_conflict(self):
        return api_task(
            self.reviewer,
            lambda client: client.post(self.url("conflict/"), {}, format="json"),
        )

    def report(self):
        return api_task(
            self.reviewer,
            lambda client: client.post(
                self.url("identity-leak/"),
                {"report_type": "IDENTITY_LEAK", "description": "Texto."},
                format="json",
            ),
        )

    def release(self):
        """The reviewer releases the slot declaring a conflict of interest (no penalty)."""
        return self.declare_conflict()

    def resolve(self, incident: IncidentReport, resolution: str):
        return api_task(
            self.admin,
            lambda client: client.post(
                f"{ADMIN}incidents/{incident.pk}/resolve/",
                {"resolution": resolution},
                format="json",
            ),
        )


def refreshed(assignment: Assignment) -> Assignment:
    assignment.refresh_from_db()
    return assignment


class TestSimultaneousDrafts:
    def test_two_saves_with_the_same_lock_leave_one_winner(self) -> None:
        case = Case()
        case.complete_draft()

        first, second = run_parallel(
            [case.save({"literature_grounding": 1}, lock=1), case.save({"literature_grounding": 2}, lock=1)]
        )

        assert statuses([first, second]) == [200, 409]
        winner = 1 if first.status_code == 200 else 2
        draft = Evaluation.objects.get(assignment=case.assignment)
        assert draft.literature_grounding == winner and draft.lock_version == 2
        assert draft.status == "DRAFT"

    def test_two_first_saves_from_the_empty_draft_create_a_single_row(self) -> None:
        case = Case()

        first, second = run_parallel(
            [case.save({"literature_grounding": 1}, lock=0), case.save({"literature_grounding": 2}, lock=0)]
        )

        assert statuses([first, second]) == [200, 409]
        assert Evaluation.objects.filter(assignment=case.assignment).count() == 1

    def test_many_saves_at_once_apply_exactly_one(self) -> None:
        case = Case()
        case.complete_draft()

        responses = run_parallel([case.save({"literature_grounding": n}, lock=1) for n in (1, 2, 3, 4)])

        assert statuses(responses) == [200, 409, 409, 409]
        assert Evaluation.objects.get(assignment=case.assignment).lock_version == 2


class TestSimultaneousSubmissions:
    def test_a_double_submission_completes_and_audits_once(self) -> None:
        case = Case()
        case.complete_draft()

        responses = run_parallel([case.submit(lock=1), case.submit(lock=1)])

        assert statuses(responses) == [200, 409]
        evaluation = Evaluation.objects.get(assignment=case.assignment)
        assert evaluation.status == "FINAL" and evaluation.lock_version == 2
        assignment = refreshed(case.assignment)
        assert assignment.status == "COMPLETED" and assignment.lock_version == 1
        assert AuditLog.objects.filter(action="EVALUATION_SUBMITTED").count() == 1
        assert_audit_chain_intact()

    def test_a_save_racing_the_submission_never_edits_the_final(self) -> None:
        case = Case()
        case.complete_draft()

        saved, submitted_ = run_parallel([case.save({"literature_grounding": 1}, lock=1), case.submit(lock=1)])

        assert statuses([saved, submitted_]) == [200, 409]
        evaluation = Evaluation.objects.get(assignment=case.assignment)
        assignment = refreshed(case.assignment)
        if submitted_.status_code == 200:
            # La entrega ganó: el borrador quedó tal cual y ya es final.
            assert evaluation.status == "FINAL" and evaluation.literature_grounding == FULL["literature_grounding"]
            assert assignment.status == "COMPLETED"
        else:
            assert evaluation.status == "DRAFT" and evaluation.literature_grounding == 1
            assert assignment.status == "ACTIVE"
        assert evaluation.lock_version == 2




class TestSimultaneousIncidents:
    def test_two_reports_leave_a_single_open_incident(self) -> None:
        case = Case()

        responses = run_parallel([case.report(), case.report()])

        assert statuses(responses) == [201, 409]
        assert IncidentReport.objects.filter(status="OPEN").count() == 1
        assert AuditLog.objects.filter(action="IDENTITY_LEAK_REPORTED").count() == 1

    def test_a_report_racing_a_revocation_is_either_kept_or_refused_whole(self) -> None:
        case = Case()

        reported, revoked = run_parallel([case.report(), case.release()])

        assert revoked.status_code == 200
        assert reported.status_code in (201, 409)
        expected = 1 if reported.status_code == 201 else 0
        assert IncidentReport.objects.filter(assignment=case.assignment).count() == expected
        assert refreshed(case.assignment).status == "REVOKED"

    def test_two_resolutions_of_the_same_incident_apply_only_the_winners_effects(self) -> None:
        case = Case()
        assert case.report()().status_code == 201
        incident = IncidentReport.objects.get()

        reassign, anonymize = run_parallel(
            [
                case.resolve(incident, "REASSIGN"),
                case.resolve(incident, "REQUEST_ANONYMIZED_VERSION"),
            ]
        )

        assert statuses([reassign, anonymize]) == [200, 409]
        incident.refresh_from_db()
        manuscript = Manuscript.objects.get(pk=case.manuscript.pk)
        assert incident.status == "RESOLVED"
        if reassign.status_code == 200:
            assert incident.resolution == "REASSIGN"
            assert manuscript.status == "UNDER_REVIEW" and manuscript.current_round == 0
            assert CorrectionRound.objects.count() == 0
        else:
            assert incident.resolution == "REQUEST_ANONYMIZED_VERSION"
            assert manuscript.status == "CHANGES_REQUESTED" and manuscript.current_round == 1
            assert CorrectionRound.objects.count() == 1
        assert refreshed(case.assignment).status == "REVOKED"
        assert AuditLog.objects.filter(action="INCIDENT_RESOLVED").count() == 1
        assert AuditLog.objects.filter(action="ASSIGNMENT_RELEASED").count() == 1
        assert_audit_chain_intact()

    def test_a_resolution_racing_the_submission_leaves_one_coherent_end(self) -> None:
        case = Case()
        case.complete_draft()
        assert case.report()().status_code == 201
        incident = IncidentReport.objects.get()

        submitted_, resolved = run_parallel([case.submit(lock=1), case.resolve(incident, "REASSIGN")])

        assert resolved.status_code == 200
        assignment = refreshed(case.assignment)
        evaluation = Evaluation.objects.get(assignment=case.assignment)
        # REASSIGN libera la asignación incluso si ya está completada: la evaluación se conserva.
        assert assignment.status == "REVOKED" and assignment.release_cause == "INCIDENT_REASSIGN"
        if submitted_.status_code == 200:
            assert evaluation.status == "FINAL"
        else:
            assert submitted_.status_code in (409, 410)
            assert evaluation.status == "DRAFT"
        assert_audit_chain_intact()
