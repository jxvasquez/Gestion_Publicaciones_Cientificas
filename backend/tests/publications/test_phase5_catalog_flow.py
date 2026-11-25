"""Catalog and correction over a whole editorial cycle (TSK-79, HU-18, HU-19, CA-HU-13-12).

Acceptance criteria: the catalog returns only accepted, active articles and
retires one right after its withdrawal; and the correction authorization is
consumed once, with both decisions kept in the history and in the audit.
The cycle runs through the real endpoints of every role.
"""

from __future__ import annotations

import pytest

from apps.audit.models import AuditLog
from apps.publications.models import CatalogEntry, StatusEvent, Verdict, VerdictCorrection
from apps.publications.services.storage import catalog_path
from tests.phase5 import (
    AUTHOR_TOKENS,
    EVALUATION,
    REJECTION,
    REVIEWER_TOKENS,
    TITLE,
    Lifecycle,
    anonymous,
)
from tests.publications.test_lifecycle import assert_audit_chain_intact
from tests.publications.test_manuscript_api import client_for
from tests.publications.test_submission import media_root, seeded_roles, submit  # noqa: F401

pytestmark = pytest.mark.django_db

CATALOG = "/api/v1/catalog/"


@pytest.fixture
def flow(django_capture_on_commit_callbacks, submit) -> Lifecycle:  # noqa: F811
    return Lifecycle.create(django_capture_on_commit_callbacks, submit)


def listed_codes(**params) -> list[str]:
    return [row["code"] for row in anonymous().get(CATALOG, params).json()["results"]]


class TestOnlyAcceptedAndActive:
    def test_the_article_appears_exactly_when_it_is_accepted(self, flow) -> None:
        manuscript = flow.submit_manuscript()
        assert listed_codes() == []

        flow.evaluate(flow.reviewers[0])
        assert listed_codes() == []  # un solo dictamen no decide

        flow.evaluate(flow.reviewers[1])
        assert listed_codes() == [manuscript.code]

    def test_a_rejected_manuscript_never_appears(self, flow) -> None:
        manuscript = flow.submit_manuscript()
        flow.evaluate(flow.reviewers[0], **REJECTION)
        flow.evaluate(flow.reviewers[1], **REJECTION)

        assert flow.manuscript.status == "REJECTED"
        assert listed_codes() == []
        assert anonymous().get(f"{CATALOG}{manuscript.code}/").status_code == 404
        assert anonymous().get(f"{CATALOG}{manuscript.code}/document/").status_code == 404

    def test_a_manuscript_with_changes_requested_does_not_appear(self, flow) -> None:
        manuscript = flow.submit_manuscript()
        flow.evaluate(flow.reviewers[0], recommendation="MINOR_REVISION")
        flow.evaluate(flow.reviewers[1], recommendation="MINOR_REVISION")

        assert flow.manuscript.status == "CHANGES_REQUESTED"
        assert listed_codes() == [] and anonymous().get(f"{CATALOG}{manuscript.code}/").status_code == 404

    def test_the_search_finds_the_article_by_title_and_author(self, flow) -> None:
        manuscript = flow.accepted()

        assert listed_codes(search="glaciares") == [manuscript.code]
        assert listed_codes(search="Quizhpe") == [manuscript.code]
        assert listed_codes(search="area inexistente xyz") == []
        assert listed_codes(area="agronomia") == [manuscript.code]

    def test_the_public_page_shows_authors_but_never_the_review(self, flow) -> None:
        manuscript = flow.accepted()

        response = anonymous().get(f"{CATALOG}{manuscript.code}/")
        text = response.content.decode() + anonymous().get(CATALOG).content.decode()

        assert response.status_code == 200 and response.json()["title"] == TITLE
        assert "Quizhpe" in text
        for secret in (*REVIEWER_TOKENS, EVALUATION["comments_for_author"],
                       "recommendation", "assignment", "AUDIT"):
            assert secret not in text
        assert "marcela.autora" not in text


class TestWithdrawalRetiresImmediately:
    def test_everything_public_disappears_with_the_withdrawal(self, flow) -> None:
        manuscript = flow.accepted()
        entry = CatalogEntry.objects.get(manuscript=manuscript)
        copy = catalog_path(entry.public_file_path)
        assert copy.is_file() and listed_codes() == [manuscript.code]

        assert flow.withdraw().status_code == 200

        assert listed_codes() == [] and listed_codes(search="glaciares") == []
        assert anonymous().get(f"{CATALOG}{manuscript.code}/").status_code == 404
        assert anonymous().get(f"{CATALOG}{manuscript.code}/document/").status_code == 410
        entry.refresh_from_db()
        assert entry.is_active is False and entry.unpublished_at is not None
        assert not copy.exists()

    def test_the_withdrawal_keeps_the_history_and_the_original(self, flow, media_root) -> None:  # noqa: F811
        manuscript = flow.accepted()
        flow.withdraw()

        manuscript.refresh_from_db()
        assert manuscript.is_active is False and manuscript.status == "ACCEPTED"
        assert Verdict.objects.filter(manuscript=manuscript).count() == 1
        assert (media_root / "private").exists()
        assert manuscript.versions.count() == 1
        assert AuditLog.objects.filter(action="MANUSCRIPT_WITHDRAWN").count() == 1
        assert_audit_chain_intact()

    def test_every_public_download_is_audited(self, flow) -> None:
        manuscript = flow.accepted()
        url = f"{CATALOG}{manuscript.code}/document/"

        first, second = anonymous().get(url), anonymous().get(url)

        assert first.status_code == second.status_code == 200
        assert first["X-Accel-Redirect"].startswith("/_catalog/")
        assert AuditLog.objects.filter(action="CATALOG_DOCUMENT_DOWNLOADED").count() == 2


class TestCorrectionCycle:
    def test_the_correction_replaces_the_verdict_once(self, flow) -> None:
        manuscript = flow.submit_manuscript()
        flow.evaluate(flow.reviewers[0], **REJECTION)
        flow.evaluate(flow.reviewers[1], **REJECTION)
        original = manuscript.verdicts.get()
        assert original.origin == "CONSENSUS" and original.decided_by_id is None

        corrected = flow.correct(original.pk, decision="ACCEPTED", key="c-1")

        assert corrected.status_code == 201, corrected.content
        assert listed_codes() == [manuscript.code]
        assert Verdict.objects.filter(manuscript=manuscript).count() == 2
        newest = Verdict.objects.filter(manuscript=manuscript).latest("created_at", "id")
        assert newest.origin == "ADMIN_CORRECTION" and newest.previous_verdict_id == original.pk
        assert newest.decided_by_id == flow.admin.pk
        correction = VerdictCorrection.objects.get()
        assert correction.is_active is False and correction.consumed_by_verdict_id == newest.pk

        # El veredicto original ya no es el último: una segunda corrección sobre él responde 409.
        again = flow.correct(original.pk, decision="REJECTED", key="c-2")
        assert again.status_code == 409
        assert Verdict.objects.filter(manuscript=manuscript).count() == 2
