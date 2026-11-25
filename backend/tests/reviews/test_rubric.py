"""La rúbrica de cinco criterios y la justificación de 100 caracteres (T051, FR-016 a FR-021)."""

from __future__ import annotations

import pytest

from apps.reviews.models import Evaluation
from tests.publications.test_manuscript_api import client_for
from tests.reviews.support import make_assignment, make_reviewer, seeded_roles, submitted  # noqa: F401

pytestmark = pytest.mark.django_db

BASE = "/api/v1/reviewer/assignments/"
CRITERIA = (
    "scientific_contribution",
    "methodological_rigor",
    "literature_grounding",
    "results_conclusions",
    "academic_writing",
)
GOOD = {**{name: 4 for name in CRITERIA}, "recommendation": "ACCEPTED", "comments_for_author": "Buen trabajo."}


@pytest.fixture
def case(seeded_roles):  # noqa: F811
    reviewer = make_reviewer()
    assignment = make_assignment(submitted(status="UNDER_REVIEW"), reviewer)
    return reviewer, assignment


def put(reviewer, assignment, body, lock: int = 0):
    return client_for(reviewer).put(
        f"{BASE}{assignment.pk}/evaluation/", body, format="json", HTTP_IF_MATCH=f'"{lock}"'
    )


def submit(reviewer, assignment, lock: int = 1):
    return client_for(reviewer).post(
        f"{BASE}{assignment.pk}/evaluation/submit/", HTTP_IF_MATCH=f'"{lock}"'
    )


def send(reviewer, assignment, body):
    assert put(reviewer, assignment, body).status_code == 200
    return submit(reviewer, assignment)


class TestDraft:
    def test_a_partial_draft_is_saved_in_rubric_2(self, case) -> None:
        reviewer, assignment = case

        response = put(reviewer, assignment, {"scientific_contribution": 5})

        assert response.status_code == 200
        body = response.json()
        assert body["rubric_version"] == 2 and body["scientific_contribution"] == 5
        assert body["methodological_rigor"] is None and body["recommendation"] is None

    def test_the_retired_keys_are_ignored_and_never_stored(self, case) -> None:
        reviewer, assignment = case

        response = put(
            reviewer,
            assignment,
            {"originality_score": 5, "confidential_comments": "secreto", "scientific_contribution": 3},
        )

        assert response.status_code == 200 and "confidential_comments" not in response.json()
        stored = Evaluation.objects.get(assignment=assignment)
        assert stored.originality_score is None and stored.confidential_comments is None
        assert stored.scientific_contribution == 3

    @pytest.mark.parametrize("value", [0, 6, "x"])
    def test_a_score_outside_1_to_5_answers_400(self, case, value) -> None:
        reviewer, assignment = case

        assert put(reviewer, assignment, {"academic_writing": value}).status_code == 400

    def test_a_legacy_recommendation_answers_400(self, case) -> None:
        reviewer, assignment = case

        assert put(reviewer, assignment, {"recommendation": "ACCEPT"}).status_code == 400


class TestSubmission:
    def test_it_needs_the_five_criteria_the_recommendation_and_the_comments(self, case) -> None:
        reviewer, assignment = case
        put(reviewer, assignment, {"scientific_contribution": 4})

        response = submit(reviewer, assignment)

        assert response.status_code == 400
        assert set(response.json()["error"]["details"]) == {
            "methodological_rigor", "literature_grounding", "results_conclusions",
            "academic_writing", "recommendation", "comments_for_author",
        }

    @pytest.mark.parametrize("recommendation", ["ACCEPTED", "MINOR_REVISION"])
    def test_high_scores_and_a_light_recommendation_need_only_a_short_comment(self, case, recommendation) -> None:
        reviewer, assignment = case

        response = send(reviewer, assignment, {**GOOD, "recommendation": recommendation})

        assert response.status_code == 200 and response.json()["status"] == "FINAL"

    @pytest.mark.parametrize(
        "override",
        [
            {"literature_grounding": 3},
            {"scientific_contribution": 1},
            {"recommendation": "MAJOR_REVISION"},
            {"recommendation": "REJECTED"},
        ],
    )
    def test_a_low_criterion_a_major_revision_or_a_rejection_need_100_characters(self, case, override) -> None:
        reviewer, assignment = case

        response = send(reviewer, assignment, {**GOOD, **override, "comments_for_author": "x" * 99})

        assert response.status_code == 400
        assert "comments_for_author" in response.json()["error"]["details"]
        assert Evaluation.objects.get(assignment=assignment).status == "DRAFT"

    @pytest.mark.parametrize(
        "override",
        [{"literature_grounding": 3}, {"recommendation": "MAJOR_REVISION"}, {"recommendation": "REJECTED"}],
    )
    def test_exactly_100_characters_are_enough(self, case, override) -> None:
        reviewer, assignment = case

        response = send(reviewer, assignment, {**GOOD, **override, "comments_for_author": "x" * 100})

        assert response.status_code == 200

    def test_the_count_ignores_the_spaces_around_the_text(self, case) -> None:
        reviewer, assignment = case
        body = {**GOOD, "recommendation": "REJECTED"}

        short = send(reviewer, assignment, {**body, "comments_for_author": "  " + "x" * 99 + "  "})

        assert short.status_code == 400
        ok = submit_after_edit(reviewer, assignment, {**body, "comments_for_author": "  " + "x" * 100 + "  "})
        assert ok.status_code == 200
        assert Evaluation.objects.get(assignment=assignment).comments_for_author == "x" * 100

    def test_an_emoji_counts_as_one_character(self, case) -> None:
        reviewer, assignment = case
        body = {**GOOD, "recommendation": "REJECTED"}

        assert send(reviewer, assignment, {**body, "comments_for_author": "😀" * 99}).status_code == 400
        assert submit_after_edit(reviewer, assignment, {**body, "comments_for_author": "😀" * 100}).status_code == 200


def submit_after_edit(reviewer, assignment, body):
    lock = Evaluation.objects.get(assignment=assignment).lock_version
    saved = put(reviewer, assignment, body, lock=lock)
    assert saved.status_code == 200, saved.content
    return submit(reviewer, assignment, lock=lock + 1)
