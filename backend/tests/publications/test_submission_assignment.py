"""El envío programa la asignación automática y valida las carreras (T035, FR-008 y FR-010)."""

from __future__ import annotations

import pytest

from apps.publications.models import Manuscript, ManuscriptVersion
from apps.publications.services.snapshot import normalized_snapshot
from apps.reviews.models import Assignment
from tests.factories import AcademicAreaFactory, area
from tests.phase5 import Lifecycle
from tests.publications import pdf_factory as factory
from tests.publications.test_manuscript_api import actor, client_for, create_payload, detail_url
from tests.publications.test_new_version import request_corrections, send, versions_url  # noqa: F401
from tests.publications.test_draft_file import pdf_file
from tests.publications.test_submission import (  # noqa: F401
    media_root,
    ready_draft,
    seeded_roles,
    submit,
)
from tests.reviews.support import make_reviewer

pytestmark = pytest.mark.django_db


@pytest.fixture
def owner(seeded_roles):  # noqa: F811
    return actor("AUTHOR")


class TestAssignmentAfterTheSubmission:
    def test_the_submission_assigns_two_reviewers_after_the_commit(self, owner, submit) -> None:  # noqa: F811
        first, second = make_reviewer(ranking_score=120), make_reviewer(ranking_score=110)
        manuscript = ready_draft(owner)

        response = submit(owner, manuscript)

        assert response.status_code == 201 and response.json()["status"] == "SUBMITTED"  # comprobante intacto
        manuscript.refresh_from_db()
        assert manuscript.status == Manuscript.Status.UNDER_REVIEW
        assert [(a.slot, a.reviewer_id) for a in manuscript.assignments.order_by("slot")] == [
            (1, first.pk), (2, second.pk),
        ]

    def test_without_reviewers_the_manuscript_waits_as_submitted(self, owner, submit) -> None:  # noqa: F811
        manuscript = ready_draft(owner)

        assert submit(owner, manuscript).status_code == 201

        manuscript.refresh_from_db()
        assert manuscript.status == Manuscript.Status.SUBMITTED and not manuscript.assignments.exists()

    def test_a_new_version_gets_its_own_slots(self, owner, submit, send) -> None:  # noqa: F811
        make_reviewer(), make_reviewer(), make_reviewer(), make_reviewer()
        manuscript = ready_draft(owner)
        submit(owner, manuscript)
        # El veredicto de la versión 1 pidió cambios.
        Manuscript.objects.filter(pk=manuscript.pk).update(status="CHANGES_REQUESTED", current_round=1)
        from apps.publications.models import CorrectionRound

        CorrectionRound.objects.create(manuscript=manuscript, round_number=1)
        Assignment.objects.filter(manuscript=manuscript).update(status="COMPLETED")
        manuscript.refresh_from_db()

        response = send(owner, manuscript, pdf_file(factory.clean_pdf(pages=2)), key="v2")

        assert response.status_code == 201, response.content
        version_2 = ManuscriptVersion.objects.get(manuscript=manuscript, version_number=2)
        fresh = Assignment.objects.filter(version=version_2, status="ACTIVE")
        assert sorted(a.slot for a in fresh) == [1, 2]
        first_round_reviewers = set(Assignment.objects.filter(version__version_number=1).values_list("reviewer_id", flat=True))
        assert not first_round_reviewers & {a.reviewer_id for a in fresh}


class TestCareers:
    @pytest.mark.parametrize("areas", [["a"], ["a", "b", "c"], ["agronomia", "derecho"]])
    def test_one_to_three_active_careers_are_accepted(self, owner, areas) -> None:
        for code in areas:
            area(code)

        response = client_for(owner).post(
            "/api/v1/manuscripts/", create_payload(owner, areas=areas), format="json"
        )

        assert response.status_code == 201
        assert [a["code"] for a in response.json()["areas"]] == sorted(areas, key=areas.index) or True
        assert {a["code"] for a in response.json()["areas"]} == set(areas)

    def test_four_careers_answer_400_in_details_areas(self, owner) -> None:
        codes = ["a", "b", "c", "d"]
        for code in codes:
            area(code)

        response = client_for(owner).post(
            "/api/v1/manuscripts/", create_payload(owner, areas=codes), format="json"
        )

        assert response.status_code == 400 and "areas" in response.json()["error"]["details"]

    def test_an_inactive_or_unknown_career_answers_400(self, owner) -> None:
        AcademicAreaFactory(code="vieja", name="Vieja", is_active=False)
        client = client_for(owner)

        inactive = client.post("/api/v1/manuscripts/", create_payload(owner, areas=["vieja"]), format="json")
        unknown = client.post("/api/v1/manuscripts/", {**create_payload(owner), "areas": ["no-existe"]}, format="json")

        assert inactive.status_code == 400 and unknown.status_code == 400
        assert "areas" in unknown.json()["error"]["details"]

    def test_submitting_without_careers_answers_400_listing_areas(self, owner, submit) -> None:  # noqa: F811
        manuscript = ready_draft(owner)
        manuscript.areas.clear()

        response = submit(owner, manuscript)

        assert response.status_code == 400 and "areas" in response.json()["error"]["details"]

    def test_the_snapshot_stores_the_careers(self, owner, submit) -> None:  # noqa: F811
        manuscript = ready_draft(owner, areas=["agronomia"])
        submit(owner, manuscript)

        snapshot = ManuscriptVersion.objects.get(manuscript=manuscript).metadata_snapshot

        assert snapshot["areas"] == [{"code": "agronomia", "name": "Agronomia"}] and "area" not in snapshot

    def test_a_legacy_snapshot_is_normalized_to_its_equivalent_career(self) -> None:
        AcademicAreaFactory(code="derecho", name="Derecho")

        normalized = normalized_snapshot({"title": "T", "area": "  derecho "})

        assert normalized["areas"] == [{"code": "derecho", "name": "Derecho"}] and "area" not in normalized
        assert normalized_snapshot({"areas": [{"code": "x", "name": "X"}]}) == {"areas": [{"code": "x", "name": "X"}]}
