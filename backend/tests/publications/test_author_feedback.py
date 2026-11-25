"""The author reads the outcome of the evaluations (D-19, CA-HU-13-04, spec 004 FR-027).

After the system registers the verdict, the author's manuscript carries
``feedback``: the decision, its date and origin, the observations and one
review per considered evaluation labelled «Revisor N» with the comments
the reviewer wrote for them. It is an allowlist: none of the following
ever reaches the author: the reviewers' identity, the scores, the
individual recommendations and the ranking. Before a verdict there is no
feedback, even if a final evaluation already exists.
"""

from __future__ import annotations

import json

import pytest

from apps.publications.models import Manuscript, Verdict, VerdictEvaluation
from tests.factories import FinalEvaluationFactory, VerdictFactory
from tests.phase5 import (
    AUTHOR_TOKENS,
    REVIEWER_PERSON,
    SECOND_REVIEWER_PERSON,
    Lifecycle,
)
from tests.publications.test_manuscript_api import client_for
from tests.publications.test_submission import media_root, seeded_roles, submit  # noqa: F401
from tests.reviews.support import make_assignment, submitted

pytestmark = pytest.mark.django_db

FOR_AUTHOR_1 = "Comentario del primer revisor para el Autor."
FOR_AUTHOR_2 = "Comentario del segundo revisor para el Autor."
FORBIDDEN_KEYS = {
    "scientific_contribution",
    "methodological_rigor",
    "literature_grounding",
    "results_conclusions",
    "academic_writing",
    "recommendation",
    "ranking_score",
    "reviewer",
    "reviewer_id",
    "email",
}


@pytest.fixture
def flow(django_capture_on_commit_callbacks, submit) -> Lifecycle:  # noqa: F811
    return Lifecycle.create(django_capture_on_commit_callbacks, submit)


def detail(owner, manuscript):
    return client_for(owner).get(f"/api/v1/manuscripts/{manuscript.pk}/")


def feedback_of(flow: Lifecycle) -> dict | None:
    return detail(flow.author, flow.manuscript).json()["feedback"]


class TestBeforeTheVerdict:
    def test_a_single_final_evaluation_shows_nothing(self, flow) -> None:
        flow.submit_manuscript()
        flow.evaluate(flow.reviewers[0], comments_for_author=FOR_AUTHOR_1)

        assert feedback_of(flow) is None


class TestAfterTheVerdict:
    def test_the_reviews_are_labelled_by_slot_without_identities(self, flow) -> None:
        flow.submit_manuscript()
        flow.evaluate(flow.reviewers[0], comments_for_author=FOR_AUTHOR_1)
        flow.evaluate(
            flow.reviewers[1],
            comments_for_author=FOR_AUTHOR_2,
            recommendation="MINOR_REVISION",
        )

        feedback = feedback_of(flow)

        assert feedback["decision"] == "CHANGES_REQUESTED"
        assert feedback["origin"] == "CONSENSUS"
        assert feedback["reviews"] == [
            {"label": "Revisor 1", "comments_for_author": FOR_AUTHOR_1},
            {"label": "Revisor 2", "comments_for_author": FOR_AUTHOR_2},
        ]
        assert feedback["observations"]

    def test_the_payload_has_no_identities_scores_or_recommendations(self, flow) -> None:
        flow.submit_manuscript()
        flow.evaluate(flow.reviewers[0], comments_for_author=FOR_AUTHOR_1)
        flow.evaluate(flow.reviewers[1], comments_for_author=FOR_AUTHOR_2)

        body = detail(flow.author, flow.manuscript).content.decode()
        feedback = feedback_of(flow)

        assert set(feedback) == {"decision", "decided_at", "origin", "observations", "reviews"}
        for review in feedback["reviews"]:
            assert set(review) == {"label", "comments_for_author"}
        for forbidden in FORBIDDEN_KEYS:
            assert f'"{forbidden}"' not in json.dumps(feedback)
        for person in (REVIEWER_PERSON, SECOND_REVIEWER_PERSON):
            for value in person.values():
                assert value not in body

    def test_an_accepted_verdict_carries_both_reviews(self, flow) -> None:
        flow.submit_manuscript()
        flow.evaluate(flow.reviewers[0], comments_for_author=FOR_AUTHOR_1)
        flow.evaluate(flow.reviewers[1], comments_for_author=FOR_AUTHOR_2)

        feedback = feedback_of(flow)

        assert flow.manuscript.status == Manuscript.Status.ACCEPTED
        assert feedback["decision"] == "ACCEPTED"
        assert [r["label"] for r in feedback["reviews"]] == ["Revisor 1", "Revisor 2"]


class TestLegacyVerdict:
    def test_an_editor_verdict_returns_a_single_review(self) -> None:
        manuscript = submitted(status=Manuscript.Status.ACCEPTED)
        assignment = make_assignment(manuscript, None or FinalEvaluationFactory().reviewer)
        evaluation = FinalEvaluationFactory(
            assignment=assignment, legacy=True, comments_for_author=FOR_AUTHOR_1
        )
        VerdictFactory(
            legacy=True,
            manuscript=manuscript,
            version=evaluation.version,
            evaluation=evaluation,
            origin=Verdict.Origin.EDITOR_LEGACY,
        )
        assert not VerdictEvaluation.objects.exists()

        body = detail(manuscript.created_by, manuscript).json()

        assert body["feedback"]["origin"] == "EDITOR_LEGACY"
        assert body["feedback"]["reviews"] == [
            {"label": "Revisor 1", "comments_for_author": FOR_AUTHOR_1}
        ]


def test_the_author_tokens_never_reach_the_reviews_endpoint_shape(flow) -> None:
    """The author's own data stays theirs; the review texts are what changes hands."""
    flow.submit_manuscript()
    assert AUTHOR_TOKENS[0] in detail(flow.author, flow.manuscript).content.decode()
