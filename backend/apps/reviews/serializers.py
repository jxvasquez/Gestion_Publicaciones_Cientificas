"""Serializers of the reviewer and administrator modules (plan sections 2.5 and 2.9).

The administrator is the only role that sees a reviewer's identity, so its
allowlists are never shared with the author or reviewer modules. The
reviewer ones are separate, explicit allowlists: the double-blind rule
never depends on an ``exclude`` or on a conditional field.
"""

from __future__ import annotations

from django.urls import reverse
from rest_framework import serializers

from apps.publications.models import Manuscript, ManuscriptVersion
from apps.reviews.models import (
    LEGACY_SCORE_FIELDS,
    MAX_SCORE,
    MIN_SCORE,
    RUBRIC_FIELDS,
    RUBRIC_RECOMMENDATION_CHOICES,
    Assignment,
    Evaluation,
    IncidentReport,
    RankingAdjustment,
)
from apps.reviews.policy import MAX_ACTIVE_ASSIGNMENTS
from apps.reviews.services.inbox import inbox_state
from apps.users.models import ReviewerProfile, User
from apps.users.serializers import AcademicAreaSerializer


class PersonSerializer(serializers.ModelSerializer):
    """Name and contact of an account."""

    full_name = serializers.CharField(source="get_full_name", read_only=True)

    class Meta:
        model = User
        fields = ("id", "full_name", "email")
        read_only_fields = fields


class ReviewerManuscriptSerializer(serializers.ModelSerializer):
    """The manuscript as its reviewer sees it: content, never authorship.

    Allowlist for the reviewer module (plan section 2.9, layer 2). It has
    no authors, affiliations, contact data, ``created_by`` or status
    history, and no file name of the author.
    """

    areas = AcademicAreaSerializer(many=True, read_only=True)

    class Meta:
        model = Manuscript
        fields = (
            "id",
            "code",
            "title",
            "abstract",
            "keywords",
            "areas",
            "language",
            "current_round",
            "current_version",
        )
        read_only_fields = fields


class ReviewerVersionSerializer(serializers.ModelSerializer):
    """The assigned version as its reviewer sees it: numbers and date only.

    It has no original file name, metadata snapshot, ``submitted_by``,
    paths or hashes. The download name is built from the manuscript code.
    """

    class Meta:
        model = ManuscriptVersion
        fields = ("version_number", "round_number", "submitted_at")
        read_only_fields = fields


class ReviewerAssignmentSerializer(serializers.ModelSerializer):
    """Row of the reviewer's inbox: the assignment and its blind manuscript summary.

    ``is_overdue`` and ``has_evaluation`` are annotated by the view
    (``with_overdue`` and ``with_evaluation_started``). It carries no
    authorship and no identity of anyone else.
    """

    manuscript_code = serializers.CharField(source="manuscript.code", read_only=True)
    manuscript_title = serializers.CharField(source="manuscript.title", read_only=True)
    areas = AcademicAreaSerializer(source="manuscript.areas", many=True, read_only=True)
    version_number = serializers.IntegerField(source="version.version_number", read_only=True)
    round_number = serializers.IntegerField(source="version.round_number", read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    state = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = (
            "id",
            "manuscript_code",
            "manuscript_title",
            "areas",
            "version_number",
            "round_number",
            "assigned_at",
            "due_at",
            "status",
            "state",
            "is_overdue",
            "completed_at",
        )
        read_only_fields = fields

    def get_state(self, obj: Assignment) -> str:
        return inbox_state(
            status=obj.status, is_overdue=obj.is_overdue, has_evaluation=obj.has_evaluation
        ).value


class ReviewerAssignmentDetailSerializer(ReviewerAssignmentSerializer):
    """One assignment with the blind manuscript, the assigned version and the PDF path.

    ``document_url`` is the API path, never the volume path, and only
    while the assignment is ``ACTIVE``: any other status gets ``410``.
    """

    manuscript = ReviewerManuscriptSerializer(read_only=True)
    version = ReviewerVersionSerializer(read_only=True)
    document_url = serializers.SerializerMethodField()

    class Meta(ReviewerAssignmentSerializer.Meta):
        fields = (*ReviewerAssignmentSerializer.Meta.fields, "manuscript", "version", "document_url")
        read_only_fields = fields

    def get_document_url(self, obj: Assignment) -> str | None:
        if obj.status != Assignment.Status.ACTIVE:
            return None
        return reverse("reviewer-assignment-document", kwargs={"pk": obj.pk})


class ReviewerEvaluationSerializer(serializers.ModelSerializer):
    """The reviewer's own draft or final evaluation (rubric of five criteria).

    The optimistic lock travels in the ``ETag`` header, not in the body.
    An evaluation that was not saved yet is shown as an empty draft.
    ``confidential_comments`` is never exposed: its reader was the Editor.
    """

    class Meta:
        model = Evaluation
        fields = (
            "id",
            "status",
            "rubric_version",
            *RUBRIC_FIELDS,
            "recommendation",
            "comments_for_author",
            "conflict_declared",
            "submitted_at",
        )
        read_only_fields = fields


class EvaluationDraftSerializer(serializers.Serializer):
    """Body of ``PUT .../evaluation/``: every field optional, a gap is a valid draft.

    Only the keys sent are changed, and nothing else is accepted: the
    status, the conflict flag, the lock and the retired keys (previous
    criteria, confidential comments) are ignored.
    """

    scientific_contribution = serializers.IntegerField(
        min_value=MIN_SCORE, max_value=MAX_SCORE, required=False, allow_null=True
    )
    methodological_rigor = serializers.IntegerField(
        min_value=MIN_SCORE, max_value=MAX_SCORE, required=False, allow_null=True
    )
    literature_grounding = serializers.IntegerField(
        min_value=MIN_SCORE, max_value=MAX_SCORE, required=False, allow_null=True
    )
    results_conclusions = serializers.IntegerField(
        min_value=MIN_SCORE, max_value=MAX_SCORE, required=False, allow_null=True
    )
    academic_writing = serializers.IntegerField(
        min_value=MIN_SCORE, max_value=MAX_SCORE, required=False, allow_null=True
    )
    recommendation = serializers.ChoiceField(
        choices=RUBRIC_RECOMMENDATION_CHOICES,
        required=False,
        allow_null=True,
    )
    comments_for_author = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=10000
    )


class DeclareConflictSerializer(serializers.Serializer):
    """Body of ``POST .../conflict/``: an optional reason, kept in the audit trail only."""

    reason = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=2000
    )


class ReviewerEvaluationHistorySerializer(serializers.ModelSerializer):
    """Row of the reviewer's history: a final evaluation of their own, read-only.

    Anonymized by construction: the manuscript is identified by code,
    title and areas, and the result is only the decision and its date —
    never the justification or the observations the author receives.
    ``editorial_decision`` and ``editorial_decided_at`` are annotated by
    the view from the latest verdict, if any.
    """

    manuscript_code = serializers.CharField(source="manuscript.code", read_only=True)
    manuscript_title = serializers.CharField(source="manuscript.title", read_only=True)
    areas = AcademicAreaSerializer(source="manuscript.areas", many=True, read_only=True)
    version_number = serializers.IntegerField(source="version.version_number", read_only=True)
    round_number = serializers.IntegerField(source="version.round_number", read_only=True)
    editorial_result = serializers.SerializerMethodField()

    class Meta:
        model = Evaluation
        fields = (
            "id",
            "assignment",
            "manuscript_code",
            "manuscript_title",
            "areas",
            "version_number",
            "round_number",
            "rubric_version",
            "recommendation",
            "submitted_at",
            "editorial_result",
        )
        read_only_fields = fields

    def get_editorial_result(self, obj: Evaluation) -> dict | None:
        if obj.editorial_decision is None:
            return None
        return {"decision": obj.editorial_decision, "decided_at": obj.editorial_decided_at}


class ReviewerEvaluationHistoryDetailSerializer(ReviewerEvaluationHistorySerializer):
    """A final evaluation in full, for reading: scores and the comments for the author.

    ``scores`` carries the keys of the evaluation's own rubric version.
    The confidential comments are left out on purpose.
    """

    scores = serializers.SerializerMethodField()

    class Meta(ReviewerEvaluationHistorySerializer.Meta):
        fields = (
            *ReviewerEvaluationHistorySerializer.Meta.fields,
            "scores",
            "comments_for_author",
        )
        read_only_fields = fields

    def get_scores(self, obj: Evaluation) -> dict:
        names = LEGACY_SCORE_FIELDS if obj.rubric_version == 1 else RUBRIC_FIELDS
        return {name: getattr(obj, name) for name in names}


class ReviewerConflictSerializer(serializers.ModelSerializer):
    """Answer of the conflict declaration: the released assignment."""

    assignment = serializers.UUIDField(source="pk", read_only=True)

    class Meta:
        model = Assignment
        fields = ("assignment", "status", "release_cause")
        read_only_fields = fields


class ReviewerStandingSerializer(serializers.Serializer):
    """The reviewer's own performance (FR-033)."""

    ranking_score = serializers.IntegerField()
    active_assignments = serializers.IntegerField()
    max_active_assignments = serializers.IntegerField()
    on_time_evaluations = serializers.IntegerField()
    missed_deadlines = serializers.IntegerField()
    is_available = serializers.BooleanField()
    areas = AcademicAreaSerializer(many=True)


class RankingAdjustmentSerializer(serializers.ModelSerializer):
    """One ranking adjustment; it identifies no author and no other reviewer."""

    manuscript_code = serializers.CharField(source="assignment.manuscript.code", read_only=True)
    version_number = serializers.IntegerField(
        source="assignment.version.version_number", read_only=True
    )

    class Meta:
        model = RankingAdjustment
        fields = (
            "id",
            "created_at",
            "cause",
            "delta",
            "score_after",
            "manuscript_code",
            "version_number",
        )
        read_only_fields = fields


class ReportIncidentSerializer(serializers.Serializer):
    """Body of ``POST .../identity-leak/``: the type and a non-blank description."""

    report_type = serializers.ChoiceField(choices=IncidentReport.ReportType.choices)
    description = serializers.CharField(max_length=5000, trim_whitespace=True)


class ReviewerIncidentSerializer(serializers.ModelSerializer):
    """What the reporter gets back: the receipt, not the text nor anything editorial."""

    class Meta:
        model = IncidentReport
        fields = ("id", "assignment", "report_type", "status", "created_at")
        read_only_fields = fields


class AdminIncidentSerializer(serializers.ModelSerializer):
    """A confidential report as the administrator reads it, with the reporter's identity.

    The administrator module is the only place that exposes the description
    and the reviewer; the author never reaches either.
    """

    reporter = PersonSerializer(read_only=True)
    resolved_by = PersonSerializer(read_only=True)
    manuscript_code = serializers.CharField(source="manuscript.code", read_only=True)
    manuscript_title = serializers.CharField(source="manuscript.title", read_only=True)
    manuscript_status = serializers.CharField(source="manuscript.status", read_only=True)
    version_number = serializers.IntegerField(
        source="assignment.version.version_number", read_only=True
    )
    correction_round_number = serializers.IntegerField(
        source="correction_round.round_number", read_only=True, default=None
    )

    class Meta:
        model = IncidentReport
        fields = (
            "id",
            "status",
            "report_type",
            "description",
            "manuscript",
            "manuscript_code",
            "manuscript_title",
            "manuscript_status",
            "version_number",
            "assignment",
            "reporter",
            "created_at",
            "resolution",
            "resolved_by",
            "resolved_at",
            "correction_round_number",
        )
        read_only_fields = fields


class ResolveIncidentSerializer(serializers.Serializer):
    """Body of ``POST .../resolve/``: the one resolution chosen."""

    resolution = serializers.ChoiceField(choices=IncidentReport.Resolution.choices)


class AdminReviewerSerializer(serializers.ModelSerializer):
    """Row of the reviewer roster: identity, careers, availability and performance.

    ``active_assignments``, ``on_time_evaluations`` and ``missed_deadlines``
    are annotated by ``annotate_standing`` (one query for the whole page).
    """

    id = serializers.UUIDField(source="user_id", read_only=True)
    full_name = serializers.CharField(source="user.get_full_name", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    institutional_id = serializers.CharField(source="user.institutional_id", read_only=True)
    areas = AcademicAreaSerializer(many=True, read_only=True)
    active_assignments = serializers.IntegerField(read_only=True)
    on_time_evaluations = serializers.IntegerField(read_only=True)
    missed_deadlines = serializers.IntegerField(read_only=True)
    max_active_assignments = serializers.SerializerMethodField()

    class Meta:
        model = ReviewerProfile
        fields = (
            "id",
            "full_name",
            "email",
            "institutional_id",
            "is_available",
            "areas",
            "ranking_score",
            "active_assignments",
            "max_active_assignments",
            "on_time_evaluations",
            "missed_deadlines",
        )
        read_only_fields = fields

    def get_max_active_assignments(self, obj: ReviewerProfile) -> int:
        return MAX_ACTIVE_ASSIGNMENTS


class AdminReviewerUpdateSerializer(serializers.Serializer):
    """Body of ``PATCH /admin/reviewers/{user_id}/``: both fields optional.

    New careers must be active; one that is inactive but already assigned
    is kept, so the check is done by the service against the profile.
    """

    areas = serializers.ListField(
        child=serializers.SlugField(max_length=80), required=False, allow_empty=True
    )
    is_available = serializers.BooleanField(required=False)
