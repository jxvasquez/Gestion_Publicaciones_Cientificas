"""``POST /admin/verdicts/{id}/correct/`` (T096, FR-006, CA-HU-13-12)."""

from __future__ import annotations

import pytest

from apps.audit.models import AuditLog
from apps.publications.models import CatalogEntry, Verdict
from tests.factories import ManuscriptAuthorFactory
from tests.phase5 import REJECTION, Lifecycle, anonymous
from tests.publications.test_manuscript_api import actor, client_for
from tests.publications.test_submission import media_root, seeded_roles, submit  # noqa: F401

pytestmark = pytest.mark.django_db

REASON = "El veredicto se registró sobre la evaluación equivocada."


@pytest.fixture
def flow(django_capture_on_commit_callbacks, submit) -> Lifecycle:  # noqa: F811
    return Lifecycle.create(django_capture_on_commit_callbacks, submit)


def correct(flow, verdict, body, key="k-1"):
    return client_for(flow.admin).post(
        f"/api/v1/admin/verdicts/{verdict.pk}/correct/", body, format="json", HTTP_IDEMPOTENCY_KEY=key
    )


def rejected(flow) -> Verdict:
    flow.submit_manuscript()
    flow.evaluate(flow.reviewers[0], **REJECTION)
    flow.evaluate(flow.reviewers[1], **REJECTION)
    return flow.manuscript.verdicts.get()


class TestCorrection:
    def test_it_creates_an_admin_correction_and_keeps_the_original(self, flow) -> None:
        original = rejected(flow)

        response = correct(flow, original, {"decision": "ACCEPTED", "reason": REASON})

        assert response.status_code == 201
        body = response.json()
        assert set(body) == {"manuscript_code", "verdict", "correction"}
        assert body["verdict"]["origin"] == "ADMIN_CORRECTION" and body["verdict"]["previous_verdict"] == str(original.pk)
        original.refresh_from_db()
        assert original.decision == "REJECTED"  # el original no cambia
        assert Verdict.objects.filter(manuscript=flow.manuscript).count() == 2

    def test_the_catalog_follows_each_decision(self, flow) -> None:
        original = rejected(flow)
        assert not CatalogEntry.objects.filter(is_active=True).exists()

        accepted = correct(flow, original, {"decision": "ACCEPTED", "reason": REASON}, key="a")
        assert CatalogEntry.objects.filter(manuscript=flow.manuscript, is_active=True).count() == 1

        newest = Verdict.objects.filter(manuscript=flow.manuscript).latest("created_at", "id")
        back = correct(flow, newest, {"decision": "REJECTED", "reason": REASON}, key="b")

        assert accepted.status_code == back.status_code == 201
        assert not CatalogEntry.objects.filter(manuscript=flow.manuscript, is_active=True).exists()

    def test_changes_requested_needs_observations_and_opens_a_round(self, flow) -> None:
        original = rejected(flow)

        missing = correct(flow, original, {"decision": "CHANGES_REQUESTED", "reason": REASON})
        ok = correct(
            flow, original,
            {"decision": "CHANGES_REQUESTED", "reason": REASON, "observations": "Ampliar la metodología."},
            key="k-2",
        )

        assert missing.status_code == 400 and "observations" in missing.json()["error"]["details"]
        assert ok.status_code == 201
        flow.manuscript.refresh_from_db()
        assert flow.manuscript.status == "CHANGES_REQUESTED" and flow.manuscript.current_round == 1

    @pytest.mark.parametrize("reason", ["corto", "x" * 1001, ""])
    def test_the_reason_has_10_to_1000_characters(self, flow, reason) -> None:
        original = rejected(flow)

        assert correct(flow, original, {"decision": "ACCEPTED", "reason": reason}).status_code == 400

    def test_a_stale_verdict_answers_409(self, flow) -> None:
        original = rejected(flow)
        correct(flow, original, {"decision": "ACCEPTED", "reason": REASON}, key="a")

        assert correct(flow, original, {"decision": "REJECTED", "reason": REASON}, key="b").status_code == 409

    def test_an_admin_with_authorship_relation_answers_403_and_the_denial_is_audited(self, flow) -> None:
        original = rejected(flow)
        ManuscriptAuthorFactory(
            manuscript=flow.manuscript, user=flow.admin, email=flow.admin.email, author_order=7
        )

        response = correct(flow, original, {"decision": "ACCEPTED", "reason": REASON})

        assert response.status_code == 403
        assert AuditLog.objects.filter(action="VERDICT_CORRECTED", result="DENIED").exists()
        assert Verdict.objects.filter(manuscript=flow.manuscript).count() == 1

    def test_the_correction_is_audited_and_the_same_key_is_idempotent(self, flow) -> None:
        original = rejected(flow)
        first = correct(flow, original, {"decision": "ACCEPTED", "reason": REASON})
        again = correct(flow, original, {"decision": "ACCEPTED", "reason": REASON})

        assert first.status_code == again.status_code == 201 and first.json() == again.json()
        audit = AuditLog.objects.get(action="VERDICT_CORRECTED")
        assert audit.actor_id == flow.admin.pk and audit.actor_role == "ADMIN"

    def test_the_old_authorization_route_answers_404(self, flow) -> None:
        original = rejected(flow)

        response = client_for(flow.admin).post(
            f"/api/v1/admin/verdicts/{original.pk}/authorize-correction/",
            {"reason": REASON}, format="json", HTTP_IDEMPOTENCY_KEY="x",
        )

        assert response.status_code == 404

    def test_other_roles_answer_403(self, flow) -> None:
        original = rejected(flow)

        for user in (flow.author, flow.reviewers[0], actor("AUTHOR")):
            assert client_for(user).post(
                f"/api/v1/admin/verdicts/{original.pk}/correct/",
                {"decision": "ACCEPTED", "reason": REASON}, format="json", HTTP_IDEMPOTENCY_KEY="z",
            ).status_code == 403
        assert anonymous().post(f"/api/v1/admin/verdicts/{original.pk}/correct/").status_code == 401
