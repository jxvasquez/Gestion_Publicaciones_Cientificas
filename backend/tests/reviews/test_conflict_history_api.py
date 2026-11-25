"""Tests for the conflict of interest and the history of the reviewer (TSK-63).

Covers the acceptance criteria: declaring a conflict blocks saving and
submitting the evaluation without revealing the author; the history only
holds the reviewer's own final evaluations, read-only, with the editorial
result once the editor registered it; and neither the history nor the
event for the editor carries author identity or confidential comments.

The no-leak checks look at the serialized JSON text, so a value under
any key would fail too.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.audit.services import AuditService, AuditUnavailable
from apps.publications.models import Manuscript
from apps.reviews.models import Assignment, Evaluation, RankingAdjustment
from apps.reviews.signals import assignment_revoked
from tests.factories import (
    AssignmentFactory,
    EvaluationFactory,
    FinalEvaluationFactory,
    ManuscriptAuthorFactory,
    ManuscriptFactory,
    VerdictFactory,
)
from tests.publications.test_manuscript_api import actor, client_for, error_code
from tests.reviews.support import make_reviewer

pytestmark = pytest.mark.django_db

BASE = "/api/v1/reviewer/"
AUTHOR_NAME = "Ana Autora Reservada"
SECRET = "nota-confidencial-solo-editor"
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


@pytest.fixture
def reviewer():
    return make_reviewer()


def with_known_author(assignment: Assignment) -> Assignment:
    ManuscriptAuthorFactory(
        manuscript=assignment.manuscript,
        full_name=AUTHOR_NAME,
        email="ana.reservada@otra.edu",
        author_order=1,
    )
    return assignment


@pytest.fixture
def assignment(reviewer) -> Assignment:
    return with_known_author(AssignmentFactory(reviewer=reviewer))


def conflict_url(assignment) -> str:
    return f"{BASE}assignments/{assignment.pk}/conflict/"


def evaluation_url(assignment, suffix: str = "") -> str:
    return f"{BASE}assignments/{assignment.pk}/evaluation/{suffix}"


def declare(user, assignment, body=None, **extra):
    return client_for(user).post(conflict_url(assignment), body or {}, format="json", **extra)


def set_status(assignment, status: str) -> None:
    Assignment.objects.filter(pk=assignment.pk).update(status=status)


def evaluation_of(assignment) -> Evaluation:
    return Evaluation.objects.get(assignment=assignment)


class TestConflictAccess:
    def test_anonymous_requests_answer_401(self, assignment) -> None:
        assert APIClient().post(conflict_url(assignment)).status_code == 401


    def test_a_foreign_assignment_answers_404(self, assignment) -> None:
        response = declare(actor("REVIEWER"), assignment)

        assert response.status_code == 404 and error_code(response) == "NOT_FOUND"
        assert not Evaluation.objects.filter(assignment=assignment).exists()

    def test_a_coauthor_reviewer_gets_404(self, reviewer, assignment) -> None:
        ManuscriptAuthorFactory(manuscript=assignment.manuscript, user=reviewer, author_order=2)

        assert declare(reviewer, assignment).status_code == 404

    def test_only_post_is_allowed(self, reviewer, assignment) -> None:
        client = client_for(reviewer)

        assert client.get(conflict_url(assignment)).status_code == 405
        assert client.put(conflict_url(assignment), {}, format="json").status_code == 405
        assert client.delete(conflict_url(assignment)).status_code == 405


class TestDeclareConflict:
    def test_it_releases_the_assignment_without_penalty(self, reviewer, assignment) -> None:
        response = declare(reviewer, assignment)

        assert response.status_code == 200
        assert response.json() == {
            "assignment": str(assignment.pk),
            "status": "REVOKED",
            "release_cause": "CONFLICT_OF_INTEREST",
        }
        assignment.refresh_from_db()
        assert assignment.status == "REVOKED" and assignment.revoked_at is not None
        assert assignment.release_cause == "CONFLICT_OF_INTEREST"
        profile = reviewer.reviewer_profile
        profile.refresh_from_db()
        assert profile.ranking_score == 100
        assert not RankingAdjustment.objects.filter(reviewer=reviewer).exists()

    def test_the_detail_answers_404_afterwards(self, reviewer, assignment) -> None:
        declare(reviewer, assignment)

        detail = client_for(reviewer).get(f"{BASE}assignments/{assignment.pk}/")

        assert detail.status_code == 404

    def test_the_slot_is_covered_by_another_reviewer(
        self, reviewer, assignment, django_capture_on_commit_callbacks
    ) -> None:
        replacement = make_reviewer()
        with django_capture_on_commit_callbacks(execute=True):
            declare(reviewer, assignment)

        covering = Assignment.objects.get(
            version=assignment.version, slot=assignment.slot, status="ACTIVE"
        )
        assert covering.reviewer_id == replacement.pk and covering.assigned_by_id is None

    def test_an_existing_draft_is_kept_and_marked(self, reviewer, assignment) -> None:
        EvaluationFactory(assignment=assignment, lock_version=3, **FULL)

        response = declare(reviewer, assignment)

        assert response.status_code == 200
        draft = evaluation_of(assignment)
        assert draft.conflict_declared is True and draft.status == "DRAFT"
        assert draft.comments_for_author == FULL["comments_for_author"]

    def test_without_a_draft_it_creates_an_empty_marked_one(self, reviewer, assignment) -> None:
        declare(reviewer, assignment)

        draft = evaluation_of(assignment)
        assert draft.conflict_declared is True and draft.recommendation is None

    def test_declaring_twice_answers_409_or_404(self, reviewer, assignment) -> None:
        declare(reviewer, assignment)

        response = declare(reviewer, assignment)

        assert response.status_code in (404, 409)
        assert AuditLog.objects.filter(action="CONFLICT_OF_INTEREST_DECLARED").count() == 1

    @pytest.mark.parametrize("status", ["COMPLETED", "REVOKED", "EXPIRED"])
    def test_a_non_active_assignment_answers_409_or_404(self, reviewer, assignment, status) -> None:
        set_status(assignment, status)

        response = declare(reviewer, assignment)

        assert response.status_code in (404, 409)
        assert not Evaluation.objects.filter(assignment=assignment).exists()

    def test_an_active_assignment_past_its_deadline_can_still_declare(
        self, reviewer, assignment
    ) -> None:
        due_at = timezone.now() - timedelta(days=1)
        Assignment.objects.filter(pk=assignment.pk).update(
            due_at=due_at, assigned_at=due_at - timedelta(days=20)
        )

        assert declare(reviewer, assignment).status_code == 200

    def test_a_reason_longer_than_the_limit_answers_400(self, reviewer, assignment) -> None:
        response = declare(reviewer, assignment, {"reason": "x" * 2001})

        assert response.status_code == 400 and error_code(response) == "VALIDATION_ERROR"
        assert not Evaluation.objects.filter(assignment=assignment).exists()

    def test_the_declaration_and_the_release_are_audited_without_author_data(
        self, reviewer, assignment
    ) -> None:
        declare(reviewer, assignment, {"reason": "  Conozco el grupo de investigación.  "})

        row = AuditLog.objects.get(action="CONFLICT_OF_INTEREST_DECLARED")
        assert row.actor_id == reviewer.pk and row.actor_role == "REVIEWER"
        assert row.entity_type == "ASSIGNMENT" and row.entity_id == assignment.pk
        assert row.reason == "Conozco el grupo de investigación." and row.request_id
        assert AUTHOR_NAME not in str(row.details)
        released = AuditLog.objects.get(action="ASSIGNMENT_RELEASED")
        assert released.details["cause"] == "CONFLICT_OF_INTEREST"

    def test_the_answer_does_not_reveal_the_author(self, reviewer, assignment) -> None:
        response = declare(reviewer, assignment)

        text = response.content.decode() + str(response.headers)
        assert AUTHOR_NAME not in text and "ana.reservada" not in text

    def test_an_unavailable_audit_answers_503_and_reverts_everything(
        self, reviewer, assignment, monkeypatch
    ) -> None:
        def fail(**kwargs):
            raise AuditUnavailable("sin auditoría")

        monkeypatch.setattr(AuditService, "record", staticmethod(fail))

        response = declare(reviewer, assignment)

        assert response.status_code == 503 and error_code(response) == "AUDIT_UNAVAILABLE"
        assignment.refresh_from_db()
        assert assignment.status == "ACTIVE"
        assert not Evaluation.objects.filter(assignment=assignment).exists()

    def test_the_release_notice_goes_out_after_the_commit_and_no_event_when_it_fails(
        self, reviewer, assignment, django_capture_on_commit_callbacks
    ) -> None:
        received: list[dict] = []
        listener = lambda sender, **kwargs: received.append(kwargs)  # noqa: E731
        assignment_revoked.connect(listener, weak=False)
        try:
            set_status(assignment, "REVOKED")
            with django_capture_on_commit_callbacks(execute=True):
                declare(reviewer, assignment)
            assert received == []

            set_status(assignment, "ACTIVE")
            with django_capture_on_commit_callbacks(execute=True):
                declare(reviewer, assignment)
        finally:
            assignment_revoked.disconnect(listener)

        assert [r["cause"] for r in received] == ["CONFLICT_OF_INTEREST"]


def final_for(reviewer, **overrides) -> Evaluation:
    """A completed assignment of the reviewer with its final evaluation."""
    assignment = with_known_author(AssignmentFactory(reviewer=reviewer))
    Assignment.objects.filter(pk=assignment.pk).update(status="COMPLETED")
    return FinalEvaluationFactory(
        assignment=assignment, confidential_comments=SECRET, **overrides
    )


LIST_URL = f"{BASE}evaluations/"
LIST_FIELDS = {
    "id", "assignment", "manuscript_code", "manuscript_title", "areas", "version_number",
    "round_number", "rubric_version", "recommendation", "submitted_at", "editorial_result",
}
DETAIL_FIELDS = LIST_FIELDS | {"scores", "comments_for_author"}


def detail_url(evaluation) -> str:
    return f"{LIST_URL}{evaluation.pk}/"


class TestHistoryAccess:
    @pytest.mark.parametrize("suffix", ["", "{id}/"])
    def test_anonymous_requests_answer_401(self, reviewer, suffix) -> None:
        evaluation = final_for(reviewer)

        assert APIClient().get(LIST_URL + suffix.format(id=evaluation.pk)).status_code == 401


    def test_the_history_is_read_only(self, reviewer) -> None:
        evaluation = final_for(reviewer)
        client = client_for(reviewer)

        for url in (LIST_URL, detail_url(evaluation)):
            assert client.post(url, {}, format="json").status_code == 405
            assert client.put(url, {}, format="json").status_code == 405
            assert client.delete(url).status_code == 405


class TestHistoryScope:
    def test_lists_only_the_reviewers_own_final_evaluations(self, reviewer) -> None:
        own = final_for(reviewer)
        final_for(actor("REVIEWER"))

        body = client_for(reviewer).get(LIST_URL).json()

        assert body["count"] == 1 and body["results"][0]["id"] == str(own.pk)

    def test_an_empty_history_is_a_valid_answer(self, reviewer) -> None:
        body = client_for(reviewer).get(LIST_URL).json()

        assert body["count"] == 0 and body["results"] == []

    def test_drafts_and_blocked_evaluations_are_not_listed(self, reviewer) -> None:
        draft_assignment = AssignmentFactory(reviewer=reviewer)
        EvaluationFactory(assignment=draft_assignment, **FULL)
        blocked_assignment = AssignmentFactory(reviewer=reviewer)
        EvaluationFactory(assignment=blocked_assignment, conflict_declared=True)
        final = final_for(reviewer)

        ids = [row["id"] for row in client_for(reviewer).get(LIST_URL).json()["results"]]

        assert ids == [str(final.pk)]

    def test_a_withdrawn_manuscript_is_not_listed(self, reviewer) -> None:
        evaluation = final_for(reviewer)
        Manuscript.objects.filter(pk=evaluation.manuscript_id).update(
            is_active=False, withdrawn_at=timezone.now()
        )

        assert client_for(reviewer).get(LIST_URL).json()["count"] == 0
        assert client_for(reviewer).get(detail_url(evaluation)).status_code == 404

    def test_a_manuscript_the_reviewer_later_coauthored_is_not_listed(self, reviewer) -> None:
        evaluation = final_for(reviewer)
        ManuscriptAuthorFactory(manuscript=evaluation.manuscript, user=reviewer, author_order=2)

        assert client_for(reviewer).get(LIST_URL).json()["count"] == 0
        assert client_for(reviewer).get(detail_url(evaluation)).status_code == 404

    def test_the_newest_is_first_and_the_list_is_paginated(self, reviewer) -> None:
        final_for(reviewer, submitted_at=timezone.now() - timedelta(days=2))
        newer = final_for(reviewer, submitted_at=timezone.now() - timedelta(days=1))

        body = client_for(reviewer).get(LIST_URL, {"page_size": 1}).json()

        assert body["count"] == 2 and body["next"]
        assert [row["id"] for row in body["results"]] == [str(newer.pk)]

    def test_the_list_does_not_query_per_row(self, reviewer, django_assert_max_num_queries) -> None:
        for _ in range(4):
            VerdictFactory(legacy=True, evaluation=final_for(reviewer))

        with django_assert_max_num_queries(6):
            assert client_for(reviewer).get(LIST_URL).status_code == 200


class TestHistoryContent:
    def test_the_list_row_is_an_allowlist(self, reviewer) -> None:
        final_for(reviewer)

        row = client_for(reviewer).get(LIST_URL).json()["results"][0]

        assert set(row) == LIST_FIELDS

    def test_the_detail_is_an_allowlist_in_read_mode(self, reviewer) -> None:
        evaluation = final_for(reviewer)

        response = client_for(reviewer).get(detail_url(evaluation))

        assert response.status_code == 200
        body = response.json()
        assert set(body) == DETAIL_FIELDS
        assert body["comments_for_author"] == "Comentarios para el autor."
        assert body["scores"]["literature_grounding"] == 4 and body["recommendation"] == "ACCEPTED"
        assert set(body["scores"]) == {
            "scientific_contribution", "methodological_rigor", "literature_grounding",
            "results_conclusions", "academic_writing",
        }

    def test_no_author_identity_nor_confidential_comments_under_any_key(self, reviewer) -> None:
        evaluation = final_for(reviewer)
        VerdictFactory(legacy=True, evaluation=evaluation, observations="Observaciones privadas.")
        author = evaluation.manuscript.created_by

        texts = [
            client_for(reviewer).get(LIST_URL).content.decode(),
            client_for(reviewer).get(detail_url(evaluation)).content.decode(),
        ]

        for text in texts:
            for secret in (
                AUTHOR_NAME,
                "ana.reservada",
                author.email,
                author.institutional_id,
                SECRET,
                "confidential_comments",
                "Observaciones privadas.",
                "created_by",
                "authors",
            ):
                assert secret not in text



    def test_a_corrected_verdict_replaces_the_previous_one(self, reviewer) -> None:
        evaluation = final_for(reviewer)
        first = VerdictFactory(legacy=True, evaluation=evaluation, decision="ACCEPTED")
        VerdictFactory(
            evaluation=evaluation,
            decision="CHANGES_REQUESTED",
            observations="Hay que corregir.",
            previous_verdict=first,
        )

        body = client_for(reviewer).get(detail_url(evaluation)).json()

        assert body["editorial_result"]["decision"] == "CHANGES_REQUESTED"

    def test_the_row_identifies_the_manuscript_by_code_title_and_area(self, reviewer) -> None:
        evaluation = final_for(reviewer)

        row = client_for(reviewer).get(LIST_URL).json()["results"][0]

        assert row["manuscript_code"] == evaluation.manuscript.code
        assert row["manuscript_title"] == evaluation.manuscript.title
        assert [a["code"] for a in row["areas"]] == [a.code for a in evaluation.manuscript.areas.all()]
        assert row["version_number"] == 1 and row["round_number"] == 0
        assert row["assignment"] == str(evaluation.assignment_id)


class TestHistoryDetailScope:
    def test_a_foreign_evaluation_answers_404_not_403(self, reviewer) -> None:
        foreign = final_for(actor("REVIEWER"))

        response = client_for(reviewer).get(detail_url(foreign))

        assert response.status_code == 404 and error_code(response) == "NOT_FOUND"

    def test_an_own_draft_answers_404(self, reviewer) -> None:
        draft = EvaluationFactory(assignment=AssignmentFactory(reviewer=reviewer), **FULL)

        assert client_for(reviewer).get(detail_url(draft)).status_code == 404

    def test_an_unknown_id_answers_404(self, reviewer) -> None:
        assert client_for(reviewer).get(f"{LIST_URL}{ManuscriptFactory().pk}/").status_code == 404

    def test_a_final_evaluation_is_seen_even_after_the_assignment_was_completed(
        self, reviewer
    ) -> None:
        evaluation = final_for(reviewer)

        assert client_for(reviewer).get(detail_url(evaluation)).status_code == 200
