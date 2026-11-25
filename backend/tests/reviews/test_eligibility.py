"""``eligible_candidates()``: cada condición de FR-011 y el orden de FR-012 (T032)."""

from __future__ import annotations

import pytest

from apps.reviews.models import Assignment
from apps.reviews.services.eligibility import eligible_candidates
from apps.users.models import Role, UserRole
from tests.factories import AcademicAreaFactory, ManuscriptAuthorFactory, area
from tests.reviews.support import make_assignment, make_reviewer, seeded_roles, submitted  # noqa: F401

pytestmark = pytest.mark.django_db


@pytest.fixture
def manuscript(seeded_roles):  # noqa: F811
    return submitted()


def candidates(manuscript) -> list:
    return list(eligible_candidates(manuscript, manuscript.versions.get()))


class TestEveryCondition:
    def test_a_matching_available_reviewer_is_eligible(self, manuscript) -> None:
        reviewer = make_reviewer()

        assert candidates(manuscript) == [reviewer]

    def test_an_inactive_account_is_excluded(self, manuscript) -> None:
        reviewer = make_reviewer()
        type(reviewer).objects.filter(pk=reviewer.pk).update(is_active=False)

        assert candidates(manuscript) == []

    def test_a_revoked_role_is_excluded(self, manuscript) -> None:
        reviewer = make_reviewer()
        UserRole.objects.filter(user=reviewer).update(is_active=False)

        assert candidates(manuscript) == []

    def test_an_inactive_role_row_is_excluded(self, manuscript) -> None:
        make_reviewer()
        Role.objects.filter(code="REVIEWER").update(is_active=False)

        assert candidates(manuscript) == []

    def test_an_unavailable_reviewer_is_excluded(self, manuscript) -> None:
        make_reviewer(available=False)

        assert candidates(manuscript) == []

    def test_a_reviewer_without_a_shared_career_is_excluded(self, manuscript) -> None:
        make_reviewer(areas=("derecho",))
        make_reviewer(areas=())

        assert candidates(manuscript) == []

    def test_the_registrant_and_the_authors_are_excluded_by_account_and_by_email(self, manuscript) -> None:
        registrant = make_reviewer()
        type(manuscript).objects.filter(pk=manuscript.pk).update(created_by=registrant)
        manuscript.refresh_from_db()
        coauthor = make_reviewer()
        ManuscriptAuthorFactory(manuscript=manuscript, user=coauthor, email="otro@x.edu", author_order=2)
        by_email = make_reviewer(email="Mismo.Correo@unl.edu.ec")
        ManuscriptAuthorFactory(
            manuscript=manuscript, user=None, email="mismo.correo@unl.edu.ec", author_order=3
        )
        eligible = make_reviewer()

        assert candidates(manuscript) == [eligible]
        assert by_email.pk not in {c.pk for c in candidates(manuscript)}

    @pytest.mark.parametrize("status", ["ACTIVE", "COMPLETED", "REVOKED", "EXPIRED"])
    def test_any_previous_participation_in_the_version_excludes(self, manuscript, status) -> None:
        reviewer = make_reviewer()
        make_assignment(manuscript, reviewer, status=status)

        assert candidates(manuscript) == []

    def test_a_reviewer_with_five_active_assignments_is_excluded(self, manuscript) -> None:
        busy = make_reviewer()
        for _ in range(5):
            make_assignment(submitted(status="UNDER_REVIEW"), busy)
        free = make_reviewer()

        assert candidates(manuscript) == [free]

    def test_four_active_assignments_still_leave_one_slot(self, manuscript) -> None:
        reviewer = make_reviewer()
        for _ in range(4):
            make_assignment(submitted(status="UNDER_REVIEW"), reviewer)

        assert candidates(manuscript) == [reviewer]


class TestOrder:
    def test_ranking_then_load_then_oldest_assignment_then_id(self, manuscript) -> None:
        top = make_reviewer(ranking_score=150)
        light = make_reviewer(ranking_score=100)
        loaded = make_reviewer(ranking_score=100)
        make_assignment(submitted(status="UNDER_REVIEW"), loaded)
        old = make_reviewer(ranking_score=90)
        recent = make_reviewer(ranking_score=90)
        for reviewer, days in ((old, 40), (recent, 2)):
            closed = make_assignment(submitted(status="UNDER_REVIEW"), reviewer, days_ago=days)
            Assignment.objects.filter(pk=closed.pk).update(status="COMPLETED")
        never = make_reviewer(ranking_score=90)

        assert candidates(manuscript) == [top, light, loaded, never, old, recent]

    def test_a_manuscript_with_two_careers_matches_either(self, seeded_roles) -> None:  # noqa: F811
        manuscript = submitted(areas=["agronomia", "derecho"])
        agro, law = make_reviewer(areas=("agronomia",)), make_reviewer(areas=("derecho",))
        make_reviewer(areas=("medicina",))

        assert {c.pk for c in candidates(manuscript)} == {agro.pk, law.pk}

    def test_a_career_deactivated_later_still_matches_an_ongoing_manuscript(self, manuscript) -> None:
        reviewer = make_reviewer()
        area("agronomia")
        AcademicAreaFactory(code="agronomia", is_active=False)
        type(area("agronomia")).objects.filter(code="agronomia").update(is_active=False)

        assert candidates(manuscript) == [reviewer]
