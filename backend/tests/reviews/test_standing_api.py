"""``/reviewer/standing/`` y el panel: desempeño propio, sin identidades (T078, FR-033, FR-038)."""

from __future__ import annotations

import pytest

from apps.reviews.models import RankingAdjustment
from tests.publications.test_manuscript_api import actor, client_for
from tests.reviews.support import make_assignment, make_reviewer, seeded_roles, submitted  # noqa: F401

pytestmark = pytest.mark.django_db

STANDING = "/api/v1/reviewer/standing/"
ADJUSTMENTS = f"{STANDING}adjustments/"


@pytest.fixture
def reviewer(seeded_roles):  # noqa: F811
    return make_reviewer(areas=("agronomia", "derecho"))


def adjust(reviewer, cause, delta, before, after):
    assignment = make_assignment(submitted(status="UNDER_REVIEW"), reviewer, status="COMPLETED")
    return RankingAdjustment.objects.create(
        reviewer=reviewer, assignment=assignment, cause=cause, delta=delta,
        score_before=before, score_after=after,
    )


class TestStanding:
    def test_it_shows_the_score_the_load_and_the_counters(self, reviewer) -> None:
        make_assignment(submitted(status="UNDER_REVIEW"), reviewer)
        adjust(reviewer, "ON_TIME_EVALUATION", 10, 100, 110)
        adjust(reviewer, "ON_TIME_EVALUATION", 10, 110, 120)
        adjust(reviewer, "DEADLINE_MISSED", -20, 120, 100)
        type(reviewer.reviewer_profile).objects.filter(user=reviewer).update(ranking_score=100)

        body = client_for(reviewer).get(STANDING).json()

        assert body["ranking_score"] == 100 and body["active_assignments"] == 1
        assert body["max_active_assignments"] == 5
        assert (body["on_time_evaluations"], body["missed_deadlines"]) == (2, 1)
        assert body["is_available"] is True
        assert sorted(a["code"] for a in body["areas"]) == ["agronomia", "derecho"]

    def test_the_adjustments_are_paginated_newest_first_without_identities(self, reviewer) -> None:
        first = adjust(reviewer, "ON_TIME_EVALUATION", 10, 100, 110)
        second = adjust(reviewer, "DEADLINE_MISSED", -20, 110, 90)

        response = client_for(reviewer).get(ADJUSTMENTS, {"page_size": 1})
        body = response.json()

        assert body["count"] == 2 and len(body["results"]) == 1
        row = body["results"][0]
        assert row["id"] == second.pk and row["delta"] == -20 and row["score_after"] == 90
        assert set(row) == {"id", "created_at", "cause", "delta", "score_after", "manuscript_code", "version_number"}
        text = response.content.decode()
        assert str(reviewer.pk) not in text and reviewer.email not in text and first.pk != second.pk

    def test_another_reviewer_never_sees_it(self, reviewer) -> None:
        adjust(reviewer, "ON_TIME_EVALUATION", 10, 100, 110)
        other = make_reviewer()

        assert client_for(other).get(ADJUSTMENTS).json()["count"] == 0
        assert client_for(other).get(STANDING).json()["on_time_evaluations"] == 0

    @pytest.mark.parametrize("role", ["AUTHOR", "ADMIN"])
    def test_other_roles_answer_403(self, seeded_roles, role) -> None:  # noqa: F811
        assert client_for(actor(role)).get(STANDING).status_code == 403
        assert client_for(actor(role)).get(ADJUSTMENTS).status_code == 403


class TestDashboard:
    def test_the_reviewer_section_carries_the_score_and_the_load(self, reviewer) -> None:
        make_assignment(submitted(status="UNDER_REVIEW"), reviewer)
        adjust(reviewer, "ON_TIME_EVALUATION", 10, 100, 110)

        section = client_for(reviewer).get("/api/v1/dashboard/").json()["sections"]["reviewer"]["data"]

        assert set(section) == {
            "ranking_score", "active_assignments", "max_active_assignments",
            "pending_evaluations", "on_time_evaluations", "missed_deadlines",
        }
        assert section["active_assignments"] == 1 and section["pending_evaluations"] == 1
        assert section["on_time_evaluations"] == 1 and section["max_active_assignments"] == 5

    def test_the_admin_section_counts_open_reports_and_waiting_manuscripts(self, reviewer) -> None:
        from tests.factories import IncidentReportFactory

        admin = actor("ADMIN")
        waiting = submitted()  # sin cupos cubiertos
        under_review = submitted(status="UNDER_REVIEW")
        assignment = make_assignment(under_review, reviewer)
        IncidentReportFactory(assignment=assignment, manuscript=under_review)

        section = client_for(admin).get("/api/v1/dashboard/").json()["sections"]["admin"]["data"]

        assert section == {"open_incidents": 1, "awaiting_reviewers": 2} and waiting.pk
