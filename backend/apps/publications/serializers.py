"""Role-specific serializers of the manuscript module (plan section 2.9).

The double-blind and confidentiality rules rely on separate allowlist
serializers, never on one serializer with conditional ``exclude``:

* :class:`AuthorManuscriptSerializer` — the author's own manuscript: its
  authors, state, round, version and the editable metadata. It never
  carries the reviewer's identity, confidential comments or scores.
* :class:`AuthorEvaluationFeedbackSerializer` — the only view of the
  evaluations the author gets: the decision and the comments each
  reviewer wrote for them, labelled «Revisor N». It appears as
  ``feedback`` in the author's manuscript, and only once the verdict
  exists: a final evaluation alone is not shown.
"""

from __future__ import annotations

import re
from datetime import datetime

from rest_framework import serializers

from apps.publications.models import Manuscript, ManuscriptAuthor, ManuscriptVersion
from apps.publications.services.manuscripts import (
    REQUIRED_METADATA,
    validate_author_roster,
)
from apps.users.serializers import AcademicAreaSerializer

#: ISO 639-1 language code (plan section 1.8).
LANGUAGE_PATTERN = re.compile(r"^[a-z]{2}$")


class ManuscriptAuthorSerializer(serializers.ModelSerializer):
    """Author with affiliation and contact; the order is the list position."""

    class Meta:
        model = ManuscriptAuthor
        fields = ("full_name", "email", "affiliation", "is_corresponding", "author_order")
        read_only_fields = ("author_order",)


class ManuscriptVersionSummarySerializer(serializers.ModelSerializer):
    """Version row: file name, size and integrity seal."""

    class Meta:
        model = ManuscriptVersion
        fields = (
            "id",
            "version_number",
            "round_number",
            "original_filename",
            "original_size_bytes",
            "original_sha256",
            "submitted_at",
        )
        read_only_fields = fields


class FeedbackReviewSerializer(serializers.Serializer):
    """The comments of one reviewer, identified only by the slot label."""

    label = serializers.CharField(read_only=True)
    comments_for_author = serializers.CharField(read_only=True)


class AuthorEvaluationFeedbackSerializer(serializers.Serializer):
    """What the author may read of the evaluations (double blind).

    Allowlist: the decision, its date and origin, the observations and one
    ``{label, comments_for_author}`` per reviewer. Identities, scores,
    individual recommendations and the ranking never belong to it.
    """

    decision = serializers.CharField(read_only=True)
    decided_at = serializers.DateTimeField(read_only=True)
    origin = serializers.CharField(read_only=True)
    observations = serializers.CharField(read_only=True, allow_null=True)
    reviews = FeedbackReviewSerializer(many=True, read_only=True)


def draft_file_summary(manuscript: Manuscript) -> dict | None:
    """Name, size and date of the attached draft PDF; never its path."""
    if not manuscript.draft_file_path:
        return None
    return {
        "filename": manuscript.draft_filename,
        "size_bytes": manuscript.draft_size_bytes,
        "uploaded_at": serializers.DateTimeField().to_representation(
            manuscript.draft_uploaded_at
        ),
    }


class AuthorManuscriptSerializer(serializers.ModelSerializer):
    """The author's own manuscript; also validates the writable metadata."""

    authors = ManuscriptAuthorSerializer(many=True, allow_empty=False)
    keywords = serializers.ListField(
        child=serializers.CharField(max_length=100),
        required=False,
        allow_empty=True,
    )
    # Se escribe como lista de códigos; se lee como `[{code, name}]` (ver `to_representation`).
    areas = serializers.ListField(
        child=serializers.SlugField(max_length=80),
        required=False,
        allow_empty=True,
        write_only=True,
    )
    draft_file = serializers.SerializerMethodField()
    feedback = serializers.SerializerMethodField()

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
            "status",
            "current_round",
            "current_version",
            "is_active",
            "withdrawn_at",
            "withdrawal_reason",
            "authors",
            "draft_file",
            "feedback",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "code",
            "status",
            "current_round",
            "current_version",
            "is_active",
            "withdrawn_at",
            "withdrawal_reason",
            "created_at",
            "updated_at",
        )
        extra_kwargs = {
            # Un borrador se guarda parcialmente (CA-HU-04-01).
            "title": {"required": False, "allow_blank": True},
            "abstract": {"required": False, "allow_blank": True},
            "language": {"required": False, "allow_blank": True},
        }

    def get_draft_file(self, obj: Manuscript) -> dict | None:
        return draft_file_summary(obj)

    def to_representation(self, instance: Manuscript) -> dict:
        data = super().to_representation(instance)
        data["areas"] = AcademicAreaSerializer(instance.areas.all(), many=True).data
        return data

    def get_feedback(self, obj: Manuscript) -> dict | None:
        """What the author may read of the latest verdict; ``None`` before any.

        The allowlist serializer receives only the fields it declares. The
        queryset prefetches ``verdicts__evaluations__evaluation`` and
        ``verdicts__evaluation``. A legacy verdict has one review labelled
        «Revisor 1»; a new one has one per considered evaluation, by slot.
        """
        verdicts = list(obj.verdicts.all())
        if not verdicts:
            return None
        latest = verdicts[-1]
        links = list(latest.evaluations.all())
        if links:
            reviews = [
                {
                    "label": f"Revisor {link.slot}",
                    "comments_for_author": link.evaluation.comments_for_author,
                }
                for link in links
            ]
        elif latest.evaluation is not None:
            reviews = [
                {"label": "Revisor 1", "comments_for_author": latest.evaluation.comments_for_author}
            ]
        else:
            reviews = []
        return AuthorEvaluationFeedbackSerializer(
            {
                "decision": latest.decision,
                "decided_at": latest.created_at,
                "origin": latest.origin,
                "observations": latest.observations,
                "reviews": reviews,
            }
        ).data

    def validate_language(self, value: str) -> str:
        value = value.strip().lower()
        if value and not LANGUAGE_PATTERN.match(value):
            raise serializers.ValidationError(
                "Use un código de idioma ISO 639-1 de dos letras."
            )
        return value

    def validate_authors(self, value: list[dict]) -> list[dict]:
        """At least one author, exactly one corresponding, the registrant listed."""
        roster = [(author["email"], author.get("is_corresponding", False)) for author in value]
        try:
            validate_author_roster(roster, self.context["request"].user.email)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from None
        return value

    def validate(self, attrs: dict) -> dict:
        """A manuscript with changes requested keeps its required metadata complete."""
        instance = self.instance
        if instance is not None and instance.status == Manuscript.Status.CHANGES_REQUESTED:
            errors = {
                field: ["Este campo no puede quedar vacío."]
                for field in REQUIRED_METADATA
                if field in attrs and not attrs[field]
            }
            if errors:
                raise serializers.ValidationError(errors)
        return attrs


class SubmissionSerializer(serializers.Serializer):
    """Answer of the formal submission: code, version, round, date and seal."""

    code = serializers.CharField(source="manuscript.code")
    status = serializers.CharField(source="manuscript.status")
    version_number = serializers.IntegerField(source="version.version_number")
    round_number = serializers.IntegerField(source="version.round_number")
    submitted_at = serializers.DateTimeField(source="version.submitted_at")
    integrity_seal = serializers.SerializerMethodField()

    def get_integrity_seal(self, obj) -> str:
        """``sha256:<hex>`` of the original PDF (plan section 4.5)."""
        return f"sha256:{obj.version.original_sha256}"


class WithdrawalSerializer(serializers.Serializer):
    """Body of ``POST /api/v1/manuscripts/{id}/withdraw/``.

    The reason is optional here: whether it is mandatory depends on the
    manuscript status, which the service checks under the row lock.
    """

    reason = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=2000
    )


class HistoryEntrySerializer(serializers.BaseSerializer):
    """One entry of the history; timestamps use the API's datetime format."""

    def to_representation(self, entry: dict) -> dict:
        formatter = serializers.DateTimeField()
        return {
            key: formatter.to_representation(value) if isinstance(value, datetime) else value
            for key, value in entry.items()
        }


class DraftFileSummarySerializer(serializers.Serializer):
    """Nombre, tamaño y fecha del PDF del borrador; nunca su ruta."""

    filename = serializers.CharField(read_only=True)
    size_bytes = serializers.IntegerField(read_only=True)
    uploaded_at = serializers.DateTimeField(read_only=True)


class PdfUploadSerializer(serializers.Serializer):
    """Cuerpo `multipart/form-data` de las cargas de PDF."""

    file = serializers.FileField(
        help_text="Archivo PDF (máximo 50 MB). Se valida la firma y la estructura, no la extensión."
    )


class HistoryEntryDocSerializer(serializers.Serializer):
    """Entrada del historial (solo documentación; ver `HistoryEntrySerializer`).

    Los campos presentes dependen de `type`: `CREATED`, `STATUS_CHANGED` y `WITHDRAWN`
    traen los estados; `VERSION_SUBMITTED`, la versión y los sellos de integridad;
    `ROUND_OPENED`, los datos de la ronda de correcciones.
    """

    type = serializers.ChoiceField(
        choices=("CREATED", "STATUS_CHANGED", "WITHDRAWN", "VERSION_SUBMITTED", "ROUND_OPENED")
    )
    occurred_at = serializers.DateTimeField()
    from_status = serializers.CharField(required=False, allow_null=True)
    to_status = serializers.CharField(required=False)
    reason = serializers.CharField(required=False, allow_null=True)
    version_id = serializers.UUIDField(required=False)
    version_number = serializers.IntegerField(required=False, allow_null=True)
    round_number = serializers.IntegerField(required=False, allow_null=True)
    original_filename = serializers.CharField(required=False)
    original_size_bytes = serializers.IntegerField(required=False)
    integrity_seal = serializers.CharField(required=False, help_text="`sha256:<hex>` del PDF original.")
    metadata_sha256 = serializers.CharField(required=False)
    closed_at = serializers.DateTimeField(required=False, allow_null=True)
    closed_by_version_number = serializers.IntegerField(required=False, allow_null=True)
