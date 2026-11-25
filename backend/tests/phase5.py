"""Shared scenario of the Phase 5 end-to-end tests (TSK-79, spec 004).

``Lifecycle`` drives a manuscript through the real endpoints, from the
author's submission to the automatic verdict, with named people so the
tests can look for them in every artifact (notifications, audit, public
pages, mail): the author submits, the system assigns two reviewers of the
career, they write and submit their evaluations and the system decides.
Everything that commits runs its ``on_commit`` callbacks, as in production.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from rest_framework.test import APIClient

from apps.publications.models import Manuscript
from tests.publications import pdf_factory as factory
from tests.publications.test_draft_file import pdf_file
from tests.publications.test_manuscript_api import actor, client_for
from tests.publications.test_new_version import versions_url
from tests.publications.test_submission import ready_draft
from tests.reviews.support import make_reviewer

AREA = "agronomia"
TITLE = "Glaciares tropicales del Chimborazo"

AUTHOR_PERSON = {
    "first_name": "Marcela",
    "last_name": "Quizhpe Ordóñez",
    "email": "marcela.autora@unl.edu.ec",
}
AUTHOR_TOKENS = ("Marcela", "Quizhpe", "Ordóñez", "marcela.autora")
REVIEWER_PERSON = {
    "first_name": "Rodrigo",
    "last_name": "Valarezo Cueva",
    "email": "rodrigo.revisor@unl.edu.ec",
}
REVIEWER_TOKENS = ("Rodrigo", "Valarezo", "Cueva", "rodrigo.revisor")
SECOND_REVIEWER_PERSON = {
    "first_name": "Rosa",
    "last_name": "Cumbicus Torres",
    "email": "rosa.revisora@unl.edu.ec",
}
THIRD_REVIEWER_PERSON = {
    "first_name": "Rebeca",
    "last_name": "Armijos Soto",
    "email": "rebeca.revisora@unl.edu.ec",
}
EVALUATION = {
    "scientific_contribution": 4,
    "methodological_rigor": 4,
    "literature_grounding": 5,
    "results_conclusions": 4,
    "academic_writing": 5,
    "recommendation": "ACCEPTED",
    "comments_for_author": "Buen trabajo, con matices menores.",
}


#: Comentarios de al menos 100 caracteres, que exigen el dictamen «Rechazar» o un criterio bajo.
LONG_COMMENTS = (
    "El manuscrito no alcanza el nivel esperado: la metodología es insuficiente, los resultados no "
    "se sustentan en los datos y la redacción impide verificar las conclusiones del estudio."
)
REJECTION = {"recommendation": "REJECTED", "comments_for_author": LONG_COMMENTS}


@dataclass
class Lifecycle:
    """The people and the helpers of one review cycle (no Editor: the system decides)."""

    author: object
    reviewers: list
    admin: object
    commits: object
    submit: object
    manuscript: Manuscript | None = None
    assignments: list = field(default_factory=list)

    @property
    def reviewer(self):
        """The first reviewer: the best ranked, so the engine assigns them to slot 1."""
        return self.reviewers[0]

    @classmethod
    def create(cls, commits, submit) -> "Lifecycle":
        return cls(
            author=actor("AUTHOR", **AUTHOR_PERSON),
            reviewers=[
                make_reviewer(ranking_score=130, **REVIEWER_PERSON),
                make_reviewer(ranking_score=120, **SECOND_REVIEWER_PERSON),
                make_reviewer(ranking_score=110, **THIRD_REVIEWER_PERSON),
            ],
            admin=actor("ADMIN"),
            commits=commits,
            submit=submit,
        )

    def post(self, user, url, body=None, **extra):
        with self.commits(execute=True):
            return client_for(user).post(url, body or {}, format="json", **extra)

    def submit_manuscript(self) -> Manuscript:
        """Submit: the engine assigns the two best reviewers after the commit."""
        self.manuscript = ready_draft(
            self.author, pdf=factory.clean_pdf(pages=1), areas=[AREA], title=TITLE
        )
        assert self.submit(self.author, self.manuscript).status_code == 201
        self.manuscript.refresh_from_db()
        self.refresh_assignments()
        return self.manuscript

    def refresh_assignments(self) -> list:
        from apps.reviews.models import Assignment

        self.assignments = list(
            Assignment.objects.filter(
                manuscript=self.manuscript, status__in=("ACTIVE", "COMPLETED")
            ).order_by("slot")
        )
        return self.assignments

    def assignment_of(self, reviewer):
        self.refresh_assignments()
        return next(a for a in self.assignments if a.reviewer_id == reviewer.pk)

    def evaluate(self, reviewer=None, **overrides):
        """Write and submit the evaluation of ``reviewer`` (the first one by default)."""
        reviewer = reviewer or self.reviewer
        assignment = self.assignment_of(reviewer)
        base = f"/api/v1/reviewer/assignments/{assignment.pk}/evaluation/"
        client = client_for(reviewer)
        saved = client.put(base, {**EVALUATION, **overrides}, format="json", HTTP_IF_MATCH='"0"')
        assert saved.status_code == 200, saved.content
        with self.commits(execute=True):
            sent = client.post(f"{base}submit/", HTTP_IF_MATCH=saved["ETag"])
        assert sent.status_code == 200, sent.content
        self.manuscript.refresh_from_db()

    def accepted(self) -> Manuscript:
        """Submit and let two reviewers accept: the system publishes the article."""
        self.submit_manuscript()
        self.evaluate(self.reviewers[0])
        self.evaluate(self.reviewers[1])
        assert self.manuscript.status == Manuscript.Status.ACCEPTED
        return self.manuscript

    def withdraw(self, user=None):
        return self.post(
            user or self.author,
            f"/api/v1/manuscripts/{self.manuscript.pk}/withdraw/",
            {"reason": "Retiro por decisión de los autores."},
        )

    def correct(self, verdict_id, decision="REJECTED", key="corrige-1", **extra):
        """The administrator replaces the verdict with a new decision."""
        return self.post(
            self.admin,
            f"/api/v1/admin/verdicts/{verdict_id}/correct/",
            {
                "decision": decision,
                "reason": "El veredicto se registró sobre la evaluación equivocada.",
                **extra,
            },
            HTTP_IDEMPOTENCY_KEY=key,
        )


def anonymous() -> APIClient:
    return APIClient()
