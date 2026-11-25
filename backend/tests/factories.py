"""factory_boy factories for the domain test data (plan section 7.1, TSK-23).

Shared by the test suites of every app; the publications factories
(TSK-40) and the reviews ones (TSK-53) live here, and the notifications
and audit ones are added by their own tasks (TSK-65, TSK-79) on this
same module.

The users factories build accounts with unique identifiers and a known
password (:data:`FACTORY_PASSWORD`); the role assignments require
``seed_roles`` to have run, which the test helpers do beforehand.
"""

from __future__ import annotations

from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.utils import timezone
from factory import (
    Faker,
    LazyAttribute,
    LazyFunction,
    SelfAttribute,
    Sequence,
    SubFactory,
    Trait,
    post_generation,
)
from factory.django import DjangoModelFactory

from apps.publications.models import (
    CatalogEntry,
    CorrectionRound,
    Manuscript,
    ManuscriptAuthor,
    ManuscriptVersion,
    StatusEvent,
    Verdict,
)
from apps.reviews.models import Assignment, Evaluation, IncidentReport
from apps.reviews.policy import ASSIGNMENT_DAYS
from apps.users.models import AcademicArea, ReviewerProfile, Role, User, UserRole

#: Plain password of every account built by :class:`UserFactory`.
FACTORY_PASSWORD = "institucional-123"


class UserFactory(DjangoModelFactory):
    """Institutional account with unique identifiers and Faker names."""

    class Meta:
        model = User

    institutional_id = Sequence(lambda n: f"INST-{n:04d}")
    username = LazyAttribute(lambda o: o.institutional_id.lower().replace("-", "."))
    email = LazyAttribute(lambda o: f"{o.username}@unl.edu.ec")
    first_name = Faker("first_name", locale="es")
    last_name = Faker("last_name", locale="es")
    # Hash persistido directamente en el INSERT: sin post-generación
    # y sin segundo save.
    password = LazyFunction(lambda: make_password(FACTORY_PASSWORD))


class AcademicAreaFactory(DjangoModelFactory):
    """A career of the catalog; ``code`` is reused so tests share one row per career."""

    class Meta:
        model = AcademicArea
        django_get_or_create = ("code",)

    code = "agronomia"
    name = LazyAttribute(lambda o: o.code.replace("-", " ").capitalize())
    is_active = True


def area(code: str = "agronomia", name: str | None = None, **extra) -> AcademicArea:
    """The career with ``code`` (created on demand)."""
    return AcademicAreaFactory(code=code, **({"name": name} if name else {}), **extra)


class UserRoleFactory(DjangoModelFactory):
    """Active role assignment; requires ``seed_roles`` beforehand."""

    class Meta:
        model = UserRole
        exclude = ("role_code",)

    user = SubFactory(UserFactory)
    role_code = "AUTHOR"
    role = LazyAttribute(lambda o: Role.objects.get(code=o.role_code))


class ManuscriptFactory(DjangoModelFactory):
    """An active ``DRAFT`` with complete metadata.

    The code comes from the PostgreSQL sequence on ``save()``. It creates
    no authors, versions or rounds: build those explicitly so each test
    states the history it needs.
    """

    class Meta:
        model = Manuscript

    title = "Efecto del clima en cultivos andinos"
    abstract = "Resumen del estudio."
    keywords = LazyFunction(lambda: ["clima", "cultivos"])
    language = "es"
    created_by = SubFactory(UserFactory)

    @post_generation
    def areas(self, create, extracted, **kwargs):
        """Careers of the manuscript: ``areas=[...]`` (codes or rows); one by default."""
        if not create:
            return
        wanted = extracted if extracted is not None else ["agronomia"]
        self.areas.set([a if isinstance(a, AcademicArea) else area(a) for a in wanted])


class ManuscriptAuthorFactory(DjangoModelFactory):
    """A non-corresponding author; ``author_order`` is unique per manuscript."""

    class Meta:
        model = ManuscriptAuthor

    manuscript = SubFactory(ManuscriptFactory)
    user = None
    full_name = Faker("name", locale="es")
    email = Sequence(lambda n: f"autor{n:04d}@otra.edu")
    affiliation = "Universidad Nacional de Loja"
    is_corresponding = False
    author_order = Sequence(lambda n: n + 1)


class ManuscriptVersionFactory(DjangoModelFactory):
    """A formal version row with valid hashes and a snapshot.

    It writes no files: tests that need the PDFs go through the API.
    """

    class Meta:
        model = ManuscriptVersion

    manuscript = SubFactory(ManuscriptFactory)
    version_number = 1
    round_number = 0
    original_file_path = LazyAttribute(
        lambda o: f"manuscripts/{o.manuscript.pk}/v{o.version_number:04d}/original.pdf"
    )
    original_filename = "articulo.pdf"
    original_size_bytes = 1024
    original_sha256 = "a" * 64
    sanitized_file_path = LazyAttribute(
        lambda o: f"manuscripts/{o.manuscript.pk}/v{o.version_number:04d}/sanitized.pdf"
    )
    sanitized_sha256 = "a" * 64
    metadata_snapshot = LazyAttribute(lambda o: {"title": o.manuscript.title})
    metadata_sha256 = "a" * 64
    submitted_by = SelfAttribute("manuscript.created_by")


class CorrectionRoundFactory(DjangoModelFactory):
    """An open correction round."""

    class Meta:
        model = CorrectionRound

    manuscript = SubFactory(ManuscriptFactory)
    round_number = 0


class StatusEventFactory(DjangoModelFactory):
    """The initial status event of a manuscript."""

    class Meta:
        model = StatusEvent

    manuscript = SubFactory(ManuscriptFactory)
    to_status = "DRAFT"


class ReviewerProfileFactory(DjangoModelFactory):
    """Careers, availability and ranking of a reviewer; the role is granted apart.

    The account needs an active ``REVIEWER`` role (``UserRoleFactory``)
    to be eligible for an assignment.
    """

    class Meta:
        model = ReviewerProfile

    user = SubFactory(UserFactory)
    is_available = True
    ranking_score = 100

    @post_generation
    def areas(self, create, extracted, **kwargs):
        """Careers of the reviewer: ``areas=[...]`` (codes or rows); one by default."""
        if not create:
            return
        wanted = extracted if extracted is not None else ["agronomia"]
        self.areas.set([a if isinstance(a, AcademicArea) else area(a) for a in wanted])


class AssignmentFactory(DjangoModelFactory):
    """An ``ACTIVE`` assignment with the exact 20-day deadline.

    The version belongs to the same manuscript. It does not touch the
    manuscript status: the test states the editorial state it needs.
    """

    class Meta:
        model = Assignment

    manuscript = SubFactory(
        ManuscriptFactory, status=Manuscript.Status.UNDER_REVIEW, current_version=1
    )
    version = SubFactory(
        ManuscriptVersionFactory, manuscript=SelfAttribute("..manuscript")
    )
    reviewer = SubFactory(UserFactory)
    slot = 1
    # `None` es el sistema, que es quien asigna.
    assigned_by = None
    assigned_at = LazyFunction(timezone.now)
    due_at = LazyAttribute(lambda o: o.assigned_at + timedelta(days=ASSIGNMENT_DAYS))


class EvaluationFactory(DjangoModelFactory):
    """A private ``DRAFT`` evaluation of its assignment."""

    class Meta:
        model = Evaluation

    assignment = SubFactory(AssignmentFactory)
    manuscript = SelfAttribute("assignment.manuscript")
    version = SelfAttribute("assignment.version")
    reviewer = SelfAttribute("assignment.reviewer")
    status = Evaluation.Status.DRAFT
    rubric_version = 2

    class Params:
        # Evaluación heredada (rúbrica 1): sus criterios y dictámenes anteriores.
        legacy = Trait(
            rubric_version=1,
            recommendation=Evaluation.Recommendation.ACCEPT,
            originality_score=4,
            methodology_score=4,
            clarity_score=4,
            relevance_score=4,
            ethics_score=5,
        )


class FinalEvaluationFactory(EvaluationFactory):
    """A complete ``FINAL`` evaluation of the rubric 2; immutable once created.

    ``legacy=True`` builds a rubric 1 evaluation instead.
    """

    status = Evaluation.Status.FINAL
    recommendation = Evaluation.Recommendation.ACCEPTED
    comments_for_author = "Comentarios para el autor."
    scientific_contribution = 4
    methodological_rigor = 4
    literature_grounding = 4
    results_conclusions = 4
    academic_writing = 5
    submitted_at = LazyFunction(timezone.now)


class IncidentReportFactory(DjangoModelFactory):
    """An ``OPEN`` identity-leak report written by the assignment's reviewer.

    It writes only the row: no notification, revocation or status change.
    """

    class Meta:
        model = IncidentReport

    assignment = SubFactory(AssignmentFactory)
    manuscript = SelfAttribute("assignment.manuscript")
    reporter = SelfAttribute("assignment.reviewer")
    report_type = IncidentReport.ReportType.IDENTITY_LEAK
    description = "El texto menciona la afiliación de los autores."


class VerdictFactory(DjangoModelFactory):
    """A normal ``ACCEPTED`` verdict issued by the system (consensus).

    It writes only the row: no status change, round, catalog entry or
    ``VerdictEvaluation``. Go through ``decide_version`` to exercise the
    real flow; pass ``origin='EDITOR_LEGACY'`` and ``decided_by`` for a
    legacy verdict that points to its single evaluation.
    """

    class Meta:
        model = Verdict

    class Params:
        legacy = Trait(
            origin=Verdict.Origin.EDITOR_LEGACY,
            decided_by=SubFactory(UserFactory),
            evaluation=SubFactory(FinalEvaluationFactory),
            manuscript=SelfAttribute("evaluation.manuscript"),
            version=SelfAttribute("evaluation.version"),
        )

    evaluation = None
    manuscript = SubFactory(ManuscriptFactory, status=Manuscript.Status.ACCEPTED)
    version = SubFactory(ManuscriptVersionFactory, manuscript=SelfAttribute("..manuscript"))
    decided_by = None
    origin = Verdict.Origin.CONSENSUS
    decision = Verdict.Decision.ACCEPTED


class CatalogEntryFactory(DjangoModelFactory):
    """An active catalog entry; it writes no file."""

    class Meta:
        model = CatalogEntry

    manuscript = SubFactory(ManuscriptFactory, status=Manuscript.Status.ACCEPTED)
    version = SubFactory(
        ManuscriptVersionFactory, manuscript=SelfAttribute("..manuscript")
    )
    public_file_path = LazyAttribute(lambda o: f"{o.manuscript.pk}/{o.version.pk}.pdf")


# --- Constructores de estado (sin Editor) ----------------------------------------------


def reviewer_account(*, areas=("agronomia",), ranking_score: int = 100, available: bool = True, **user):
    """An active reviewer: account, ``REVIEWER`` role and profile with its careers."""
    account = UserFactory(**user)
    UserRoleFactory(user=account, role_code=Role.Code.REVIEWER)
    ReviewerProfileFactory(
        user=account, areas=list(areas), ranking_score=ranking_score, is_available=available
    )
    return account


def submitted(*, areas=("agronomia",), **fields) -> Manuscript:
    """A formally submitted manuscript: ``SUBMITTED`` with its version 1 and round 0."""
    manuscript = ManuscriptFactory(status=Manuscript.Status.SUBMITTED, areas=list(areas), **fields)
    manuscript.current_version = 1
    manuscript.save(update_fields=["current_version"])
    ManuscriptVersionFactory(manuscript=manuscript)
    CorrectionRoundFactory(manuscript=manuscript, round_number=0)
    return manuscript


def under_review_with_slots(*, reviewers=2, areas=("agronomia",), **fields):
    """An ``UNDER_REVIEW`` manuscript with ``reviewers`` live assignments in slots 1, 2...

    Returns ``(manuscript, [assignments])``.
    """
    manuscript = submitted(areas=areas, **fields)
    manuscript.status = Manuscript.Status.UNDER_REVIEW
    manuscript.save(update_fields=["status"])
    version = manuscript.versions.get()
    assignments = [
        AssignmentFactory(
            manuscript=manuscript,
            version=version,
            reviewer=reviewer_account(areas=areas),
            slot=slot,
        )
        for slot in range(1, reviewers + 1)
    ]
    return manuscript, assignments


def tie_breaker(*, areas=("agronomia",), **fields):
    """A ``TIE_BREAKER`` manuscript: slot 1 accepts, slot 2 rejects, slot 3 still pending."""
    manuscript, assignments = under_review_with_slots(areas=areas, **fields)
    manuscript.status = Manuscript.Status.TIE_BREAKER
    manuscript.save(update_fields=["status"])
    for assignment, recommendation in zip(
        assignments, (Evaluation.Recommendation.ACCEPTED, Evaluation.Recommendation.REJECTED)
    ):
        assignment.status = Assignment.Status.COMPLETED
        assignment.save(update_fields=["status"])
        FinalEvaluationFactory(assignment=assignment, recommendation=recommendation)
    return manuscript, assignments


def changes_requested(*, areas=("agronomia",), **fields) -> Manuscript:
    """A ``CHANGES_REQUESTED`` manuscript with its open round 1."""
    manuscript = submitted(areas=areas, **fields)
    manuscript.status = Manuscript.Status.CHANGES_REQUESTED
    manuscript.current_round = 1
    manuscript.save(update_fields=["status", "current_round"])
    CorrectionRoundFactory(manuscript=manuscript, round_number=1)
    return manuscript


def accepted(*, areas=("agronomia",), **fields) -> Manuscript:
    """An ``ACCEPTED`` manuscript (no catalog entry, no verdict)."""
    manuscript = submitted(areas=areas, **fields)
    manuscript.status = Manuscript.Status.ACCEPTED
    manuscript.save(update_fields=["status"])
    return manuscript
