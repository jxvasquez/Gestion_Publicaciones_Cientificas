"""Domain models of reviewer assignments, evaluations and incidents (TSK-46, TSK-59).

They follow the implementation plan (sections 1.13, 1.14, 1.14.1 and 1.20):

* ``Assignment`` links one reviewer to one manuscript version in a slot
  (1 and 2 initial, 3 tie-break). The database allows one live assignment
  per slot and per reviewer in a version, caps each reviewer at five
  ``ACTIVE`` assignments and fixes the deadline to exactly 20 days after
  ``assigned_at``.
* ``Evaluation`` is the reviewer's draft and, once ``FINAL``, the
  immutable evaluation. A trigger (migration ``0002``) rejects any
  ``UPDATE`` or ``DELETE`` over a ``FINAL`` row; the submission logic
  that performs the ``DRAFT`` → ``FINAL`` transition arrives in Phase 4.
* ``RankingAdjustment`` is the append-only log of every bonus or penalty
  of the reviewer's ranking score.
* ``IncidentReport`` is the reviewer's confidential report of a possible
  identity leak (CA-HU-16-06). It only stores the report: it never
  touches the PDF, the evaluation or the manuscript status.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.db.models import BooleanField, Exists, ExpressionWrapper, F, OuterRef, Q
from django.db.models.functions import Length, Now
from django.db.models.lookups import GreaterThanOrEqual
from django.utils import timezone

from apps.publications.models import (
    AppendOnlyModel,
    CorrectionRound,
    Manuscript,
    ManuscriptVersion,
)
from apps.reviews.policy import (
    ASSIGNMENT_DAYS,
    JUSTIFICATION_MIN_LENGTH,
    JUSTIFICATION_SCORE_THRESHOLD,
    MISSED_DEADLINE_PENALTY,
    ON_TIME_BONUS,
)

#: Inclusive bounds of every evaluation score.
MIN_SCORE = 1
MAX_SCORE = 5

#: Criteria of the professional rubric (``rubric_version=2``), in display order.
RUBRIC_FIELDS = (
    "scientific_contribution",
    "methodological_rigor",
    "literature_grounding",
    "results_conclusions",
    "academic_writing",
)

#: Criteria of the previous rubric (``rubric_version=1``); only historical rows use them.
LEGACY_SCORE_FIELDS = (
    "originality_score",
    "methodology_score",
    "clarity_score",
    "relevance_score",
    "ethics_score",
)

#: Recommendations of each rubric version.
LEGACY_RECOMMENDATIONS = ("ACCEPT", "REQUIRES_CORRECTIONS", "REJECT")
RUBRIC_RECOMMENDATIONS = ("ACCEPTED", "MINOR_REVISION", "MAJOR_REVISION", "REJECTED")


#: Choices a reviewer may select in the rubric 2 form (the legacy codes are history only).
RUBRIC_RECOMMENDATION_CHOICES = [
    ("ACCEPTED", "Aceptar"),
    ("MINOR_REVISION", "Revisión menor"),
    ("MAJOR_REVISION", "Revisión mayor"),
    ("REJECTED", "Rechazar"),
]


class AssignmentQuerySet(models.QuerySet):
    """Scopes over assignments."""

    def with_overdue(self) -> "AssignmentQuerySet":
        """Annotate ``is_overdue``: ``ACTIVE`` and past ``due_at``, by the database clock.

        The scheduled task only marks ``EXPIRED`` later; the exact cut is
        always ``due_at <= now()`` evaluated by PostgreSQL.
        """
        return self.annotate(
            is_overdue=ExpressionWrapper(
                Q(status=Assignment.Status.ACTIVE, due_at__lte=Now()),
                output_field=BooleanField(),
            )
        )

    def with_evaluation_started(self) -> "AssignmentQuerySet":
        """Annotate ``has_evaluation``: the reviewer already saved a draft or a final."""
        return self.annotate(
            has_evaluation=Exists(Evaluation.objects.filter(assignment=OuterRef("pk")))
        )

    def for_reviewer(self, user) -> "AssignmentQuerySet":
        """Assignments a reviewer may reach: their own, over active manuscripts.

        The reviewer's endpoints start here and never at the global
        manuscript repository (plan section 2.9, layer 1). A manuscript the
        reviewer registered or co-authored — by account or by e-mail, the
        same rule as the eligibility check — is left out, and so is a
        withdrawn one. Whether the assignment is ``ACTIVE`` or
        ``COMPLETED`` is up to the object permission, not to this scope.
        """
        return (
            self.filter(reviewer=user, manuscript__is_active=True)
            .exclude(manuscript__created_by=user)
            .exclude(manuscript__authors__user=user)
            .exclude(manuscript__authors__email__iexact=user.email)
            .select_related("manuscript", "version")
        )


class Assignment(models.Model):
    """Assignment of one reviewer to one version of a manuscript."""

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Activa"
        COMPLETED = "COMPLETED", "Completada"
        REVOKED = "REVOKED", "Revocada"
        # Terminal: vencida y revocada por el sistema, con penalización.
        EXPIRED = "EXPIRED", "Vencida"

    class ReleaseCause(models.TextChoices):
        OVERDUE = "OVERDUE", "Plazo vencido"
        CONFLICT_OF_INTEREST = "CONFLICT_OF_INTEREST", "Conflicto de interés"
        INCIDENT_REASSIGN = "INCIDENT_REASSIGN", "Reasignación por incidente"
        ANONYMIZATION_REQUESTED = "ANONYMIZATION_REQUESTED", "Versión anonimizada solicitada"
        MANUSCRIPT_WITHDRAWN = "MANUSCRIPT_WITHDRAWN", "Baja lógica del manuscrito"
        LEGACY_TRANSITION = "LEGACY_TRANSITION", "Cierre en la transición"
        EDITOR_LEGACY = "EDITOR_LEGACY", "Revocación heredada del Editor"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    manuscript = models.ForeignKey(
        Manuscript,
        on_delete=models.PROTECT,
        related_name="assignments",
    )
    version = models.ForeignKey(
        ManuscriptVersion,
        on_delete=models.PROTECT,
        related_name="assignments",
    )
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="review_assignments",
    )
    # 1 y 2 son los cupos iniciales; 3 es el desempate.
    slot = models.PositiveSmallIntegerField(default=1)
    # `NULL` significa asignación del sistema; las heredadas conservan al Editor.
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="created_assignments",
    )
    assigned_at = models.DateTimeField(default=timezone.now)
    # Exactamente `assigned_at + 20 días`: la restricción CHECK lo valida y
    # el servicio de asignación (TSK-48) lo calcula en PostgreSQL.
    due_at = models.DateTimeField()
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="revoked_assignments",
    )
    revocation_reason = models.TextField(null=True, blank=True)
    release_cause = models.CharField(
        max_length=32,
        choices=ReleaseCause.choices,
        null=True,
        blank=True,
    )
    # Bloqueo optimista para `If-Match`/`ETag`.
    lock_version = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = AssignmentQuerySet.as_manager()

    class Meta:
        db_table = "reviews_assignment"
        ordering = ("-assigned_at",)
        indexes = [
            models.Index(
                fields=("reviewer", "status", "due_at"),
                name="idx_assignment_reviewer_due",
            ),
            models.Index(
                fields=("manuscript", "status"),
                # Django limita los nombres de índice a 30 caracteres.
                name="idx_assignment_ms_status",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(status__in=("ACTIVE", "COMPLETED", "REVOKED", "EXPIRED")),
                name="ck_assignment_status",
            ),
            # El plazo es de 20 días exactos, validado en la base de datos.
            models.CheckConstraint(
                condition=Q(
                    due_at=ExpressionWrapper(
                        F("assigned_at") + timedelta(days=ASSIGNMENT_DAYS),
                        output_field=models.DateTimeField(),
                    )
                ),
                name="ck_assignment_due_at",
            ),
            models.CheckConstraint(
                condition=Q(slot__in=(1, 2, 3)),
                name="ck_assignment_slot",
            ),
            # Un cupo vivo por versión y un revisor vivo por versión.
            models.UniqueConstraint(
                fields=("version", "slot"),
                condition=Q(status__in=("ACTIVE", "COMPLETED")),
                name="uq_assignment_live_slot",
            ),
            models.UniqueConstraint(
                fields=("version", "reviewer"),
                condition=Q(status__in=("ACTIVE", "COMPLETED")),
                name="uq_assignment_live_reviewer",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.manuscript_id} · {self.reviewer_id} · {self.status}"


class Evaluation(models.Model):
    """Reviewer's private draft that becomes the immutable final evaluation.

    ``rubric_version=2`` rows use the five professional criteria and the
    four recommendations; ``rubric_version=1`` rows are the historical
    evaluations, kept with their original criteria.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Borrador"
        FINAL = "FINAL", "Final"

    class Recommendation(models.TextChoices):
        ACCEPTED = "ACCEPTED", "Aceptar"
        MINOR_REVISION = "MINOR_REVISION", "Revisión menor"
        MAJOR_REVISION = "MAJOR_REVISION", "Revisión mayor"
        REJECTED = "REJECTED", "Rechazar"
        # Solo la rúbrica 1 (evaluaciones heredadas).
        ACCEPT = "ACCEPT", "Aceptar (heredado)"
        REQUIRES_CORRECTIONS = "REQUIRES_CORRECTIONS", "Requiere correcciones (heredado)"
        REJECT = "REJECT", "Rechazar (heredado)"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    assignment = models.OneToOneField(
        Assignment,
        on_delete=models.PROTECT,
        related_name="evaluation",
    )
    manuscript = models.ForeignKey(
        Manuscript,
        on_delete=models.PROTECT,
        related_name="evaluations",
    )
    version = models.ForeignKey(
        ManuscriptVersion,
        on_delete=models.PROTECT,
        related_name="evaluations",
    )
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="evaluations",
    )
    status = models.CharField(
        max_length=12,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    rubric_version = models.PositiveSmallIntegerField(default=2)
    # Rúbrica 2.
    scientific_contribution = models.SmallIntegerField(null=True, blank=True)
    methodological_rigor = models.SmallIntegerField(null=True, blank=True)
    literature_grounding = models.SmallIntegerField(null=True, blank=True)
    results_conclusions = models.SmallIntegerField(null=True, blank=True)
    academic_writing = models.SmallIntegerField(null=True, blank=True)
    # Rúbrica 1: solo las filas históricas los usan.
    originality_score = models.SmallIntegerField(null=True, blank=True)
    methodology_score = models.SmallIntegerField(null=True, blank=True)
    clarity_score = models.SmallIntegerField(null=True, blank=True)
    relevance_score = models.SmallIntegerField(null=True, blank=True)
    ethics_score = models.SmallIntegerField(null=True, blank=True)
    recommendation = models.CharField(
        max_length=24,
        choices=Recommendation.choices,
        null=True,
        blank=True,
    )
    # Visibles para el Autor; obligatorios al enviar.
    comments_for_author = models.TextField(null=True, blank=True)
    # Columna conservada por las evaluaciones históricas: la API nunca la expone.
    confidential_comments = models.TextField(null=True, blank=True)
    conflict_declared = models.BooleanField(default=False)
    submitted_at = models.DateTimeField(null=True, blank=True)
    # Bloqueo optimista del borrador para `If-Match`/`ETag`.
    lock_version = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "reviews_evaluation"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("version", "reviewer"),
                name="uq_evaluation_version_reviewer",
            ),
            models.CheckConstraint(
                condition=Q(status__in=("DRAFT", "FINAL")),
                name="ck_evaluation_status",
            ),
            models.CheckConstraint(
                condition=Q(rubric_version__in=(1, 2)),
                name="ck_evaluation_rubric_version",
            ),
            # El dictamen es nulo o pertenece al conjunto de su versión.
            models.CheckConstraint(
                condition=Q(recommendation__isnull=True)
                | Q(rubric_version=1, recommendation__in=LEGACY_RECOMMENDATIONS)
                | Q(rubric_version=2, recommendation__in=RUBRIC_RECOMMENDATIONS),
                name="ck_evaluation_recommendation",
            ),
            *(
                models.CheckConstraint(
                    condition=Q(**{f"{field}__isnull": True})
                    | Q(**{f"{field}__gte": MIN_SCORE, f"{field}__lte": MAX_SCORE}),
                    name=f"ck_evaluation_{field}",
                )
                for field in (*LEGACY_SCORE_FIELDS, *RUBRIC_FIELDS)
            ),
            # Una evaluación final está completa; el borrador admite huecos.
            models.CheckConstraint(
                condition=Q(status="DRAFT")
                | Q(
                    recommendation__isnull=False,
                    comments_for_author__isnull=False,
                    submitted_at__isnull=False,
                )
                & (
                    Q(
                        rubric_version=1,
                        **{f"{field}__isnull": False for field in LEGACY_SCORE_FIELDS},
                    )
                    | Q(
                        rubric_version=2,
                        **{f"{field}__isnull": False for field in RUBRIC_FIELDS},
                    )
                ),
                name="ck_evaluation_final_complete",
            ),
            # FR-019: criterio bajo, revisión mayor o rechazo exigen 100 caracteres.
            models.CheckConstraint(
                condition=Q(status="DRAFT")
                | Q(rubric_version=1)
                | (
                    Q(**{f"{field}__gt": JUSTIFICATION_SCORE_THRESHOLD for field in RUBRIC_FIELDS})
                    & ~Q(recommendation__in=("MAJOR_REVISION", "REJECTED"))
                )
                | Q(GreaterThanOrEqual(Length("comments_for_author"), JUSTIFICATION_MIN_LENGTH)),
                name="ck_evaluation_rubric_justification",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.assignment_id} · {self.status}"


class RankingAdjustment(AppendOnlyModel):
    """Append-only log of one bonus or penalty of the ranking score (FR-032).

    ``delta`` is the nominal change of the cause; ``score_after`` is already
    clamped at 0. ``UNIQUE (assignment, cause)`` makes each adjustment
    idempotent.
    """

    class Cause(models.TextChoices):
        ON_TIME_EVALUATION = "ON_TIME_EVALUATION", "Evaluación a tiempo"
        DEADLINE_MISSED = "DEADLINE_MISSED", "Plazo vencido"

    id = models.BigAutoField(primary_key=True)
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="ranking_adjustments",
    )
    assignment = models.ForeignKey(
        Assignment,
        on_delete=models.PROTECT,
        related_name="ranking_adjustments",
    )
    cause = models.CharField(max_length=24, choices=Cause.choices)
    delta = models.SmallIntegerField()
    score_before = models.IntegerField()
    score_after = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reviews_ranking_adjustment"
        ordering = ("-created_at", "-id")
        indexes = [
            models.Index(
                fields=("reviewer", "-created_at"),
                name="idx_ranking_reviewer_date",
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("assignment", "cause"),
                name="uq_ranking_assignment_cause",
            ),
            models.CheckConstraint(
                condition=(
                    Q(cause="ON_TIME_EVALUATION", delta=ON_TIME_BONUS)
                    | Q(cause="DEADLINE_MISSED", delta=MISSED_DEADLINE_PENALTY)
                ),
                name="ck_ranking_delta_cause",
            ),
            models.CheckConstraint(
                condition=Q(score_after__gte=0),
                name="ck_ranking_score_after",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.reviewer_id} · {self.cause} · {self.delta:+d}"


class IncidentReportQuerySet(models.QuerySet):
    """Scopes over incident reports."""

    def for_admin(self, user) -> "IncidentReportQuerySet":
        """Reports over manuscripts in which the administrator has no authorship.

        An administrator who registered or co-authored the manuscript, by
        account or by e-mail, never reaches its reports, which answer ``404``.
        """
        return (
            self.exclude(manuscript__created_by=user)
            .exclude(manuscript__authors__user=user)
            .exclude(manuscript__authors__email__iexact=user.email)
        )


class IncidentReport(models.Model):
    """Reviewer's confidential report about an assignment (CA-HU-16-06).

    The report is private to the reviewer and the administrator; the author
    never sees it. The database allows one ``OPEN`` report per assignment and
    requires ``resolution`` and ``resolved_at`` once it is ``RESOLVED``.
    The effects of each resolution belong to the administrator's service, not
    to this model.
    """

    class ReportType(models.TextChoices):
        IDENTITY_LEAK = "IDENTITY_LEAK", "Posible fuga de identidad"
        OTHER = "OTHER", "Otro"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Abierto"
        RESOLVED = "RESOLVED", "Resuelto"

    class Resolution(models.TextChoices):
        REQUEST_ANONYMIZED_VERSION = (
            "REQUEST_ANONYMIZED_VERSION",
            "Solicitar versión anonimizada",
        )
        REASSIGN = "REASSIGN", "Reasignar"
        DISMISS = "DISMISS", "Descartar"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    assignment = models.ForeignKey(
        Assignment,
        on_delete=models.PROTECT,
        related_name="incident_reports",
    )
    manuscript = models.ForeignKey(
        Manuscript,
        on_delete=models.PROTECT,
        related_name="incident_reports",
    )
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="incident_reports",
    )
    report_type = models.CharField(max_length=24, choices=ReportType.choices)
    description = models.TextField()
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.OPEN,
    )
    resolution = models.CharField(
        max_length=32,
        choices=Resolution.choices,
        null=True,
        blank=True,
    )
    # Ronda que abre `REQUEST_ANONYMIZED_VERSION`; nula en otro caso.
    correction_round = models.ForeignKey(
        CorrectionRound,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="incident_reports",
    )
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_incident_reports",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    objects = IncidentReportQuerySet.as_manager()

    class Meta:
        db_table = "reviews_incident_report"
        ordering = ("-created_at",)
        indexes = [
            models.Index(
                fields=("status", "created_at"),
                name="idx_incident_status_date",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(report_type__in=("IDENTITY_LEAK", "OTHER")),
                name="ck_incident_report_type",
            ),
            models.CheckConstraint(
                condition=Q(status__in=("OPEN", "RESOLVED")),
                name="ck_incident_status",
            ),
            models.CheckConstraint(
                condition=Q(resolution__isnull=True)
                | Q(resolution__in=("REQUEST_ANONYMIZED_VERSION", "REASSIGN", "DISMISS")),
                name="ck_incident_resolution",
            ),
            # Un reporte resuelto registra cómo y cuándo se resolvió.
            models.CheckConstraint(
                condition=Q(status="OPEN")
                | Q(resolution__isnull=False, resolved_at__isnull=False),
                name="ck_incident_resolved_complete",
            ),
            # Un solo reporte abierto por asignación.
            models.UniqueConstraint(
                fields=("assignment",),
                condition=Q(status="OPEN"),
                name="uq_incident_open",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.assignment_id} · {self.report_type} · {self.status}"
