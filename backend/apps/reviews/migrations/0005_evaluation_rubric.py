"""Rúbrica profesional de cinco criterios (spec 004, R-03 y R-04).

* Agrega ``rubric_version`` con ``DEFAULT 1`` en el ``ALTER TABLE`` (sin
  reescribir filas, así no se dispara ``trg_evaluation_no_update_after_final``)
  y los cinco criterios nuevos con su ``CHECK`` de 1 a 5.
* Con ``RunPython``, SOLO sobre ``status='DRAFT'``, pasa a la rúbrica 2 y
  convierte ``ACCEPT`` en ``ACCEPTED``, ``REJECT`` en ``REJECTED`` y
  ``REQUIRES_CORRECTIONS`` en nulo. Las evaluaciones ``FINAL`` no se tocan.
* Cambia el valor por defecto a 2 y redefine ``ck_evaluation_recommendation`` y
  ``ck_evaluation_final_complete``; agrega ``ck_evaluation_rubric_justification``
  (100 caracteres si algún criterio es 3 o menos o el dictamen es
  ``MAJOR_REVISION`` o ``REJECTED``).
"""

from __future__ import annotations

from django.db import migrations, models
from django.db.models.functions import Length
from django.db.models.lookups import GreaterThanOrEqual

RUBRIC = (
    "scientific_contribution",
    "methodological_rigor",
    "literature_grounding",
    "results_conclusions",
    "academic_writing",
)
LEGACY = (
    "originality_score",
    "methodology_score",
    "clarity_score",
    "relevance_score",
    "ethics_score",
)
RECOMMENDATION_CHOICES = [
    ("ACCEPTED", "Aceptar"),
    ("MINOR_REVISION", "Revisión menor"),
    ("MAJOR_REVISION", "Revisión mayor"),
    ("REJECTED", "Rechazar"),
    ("ACCEPT", "Aceptar (heredado)"),
    ("REQUIRES_CORRECTIONS", "Requiere correcciones (heredado)"),
    ("REJECT", "Rechazar (heredado)"),
]


def drafts_to_rubric_2(apps, schema_editor):
    Evaluation = apps.get_model("reviews", "Evaluation")
    drafts = Evaluation.objects.filter(status="DRAFT")
    drafts.filter(recommendation="ACCEPT").update(recommendation="ACCEPTED")
    drafts.filter(recommendation="REJECT").update(recommendation="REJECTED")
    drafts.filter(recommendation="REQUIRES_CORRECTIONS").update(recommendation=None)
    drafts.update(rubric_version=2)


def drafts_to_rubric_1(apps, schema_editor):
    Evaluation = apps.get_model("reviews", "Evaluation")
    drafts = Evaluation.objects.filter(status="DRAFT")
    drafts.filter(recommendation="ACCEPTED").update(recommendation="ACCEPT")
    drafts.filter(recommendation="REJECTED").update(recommendation="REJECT")
    drafts.filter(recommendation__in=("MINOR_REVISION", "MAJOR_REVISION")).update(
        recommendation="REQUIRES_CORRECTIONS"
    )
    drafts.update(rubric_version=1)


class Migration(migrations.Migration):
    dependencies = [
        ("reviews", "0004_assignment_slots_capacity"),
    ]

    operations = [
        migrations.AddField(
            model_name="evaluation",
            name="rubric_version",
            field=models.PositiveSmallIntegerField(default=1),
        ),
        *(
            migrations.AddField(
                model_name="evaluation",
                name=name,
                field=models.SmallIntegerField(blank=True, null=True),
            )
            for name in RUBRIC
        ),
        *(
            migrations.AddConstraint(
                model_name="evaluation",
                constraint=models.CheckConstraint(
                    condition=models.Q((f"{name}__isnull", True))
                    | models.Q((f"{name}__gte", 1), (f"{name}__lte", 5)),
                    name=f"ck_evaluation_{name}",
                ),
            )
            for name in RUBRIC
        ),
        migrations.RemoveConstraint(model_name="evaluation", name="ck_evaluation_recommendation"),
        migrations.RemoveConstraint(model_name="evaluation", name="ck_evaluation_final_complete"),
        migrations.AlterField(
            model_name="evaluation",
            name="recommendation",
            field=models.CharField(
                blank=True, choices=RECOMMENDATION_CHOICES, max_length=24, null=True
            ),
        ),
        migrations.RunPython(drafts_to_rubric_2, drafts_to_rubric_1),
        # Las claves foráneas son diferidas: sin esto, un ALTER TABLE posterior falla con
        # «pending trigger events» sobre las filas que acaba de tocar el paso de datos.
        migrations.RunSQL("SET CONSTRAINTS ALL IMMEDIATE", migrations.RunSQL.noop),
        migrations.AlterField(
            model_name="evaluation",
            name="rubric_version",
            field=models.PositiveSmallIntegerField(default=2),
        ),
        migrations.AddConstraint(
            model_name="evaluation",
            constraint=models.CheckConstraint(
                condition=models.Q(("rubric_version__in", (1, 2))),
                name="ck_evaluation_rubric_version",
            ),
        ),
        migrations.AddConstraint(
            model_name="evaluation",
            constraint=models.CheckConstraint(
                condition=models.Q(recommendation__isnull=True)
                | models.Q(rubric_version=1, recommendation__in=("ACCEPT", "REQUIRES_CORRECTIONS", "REJECT"))
                | models.Q(
                    rubric_version=2,
                    recommendation__in=("ACCEPTED", "MINOR_REVISION", "MAJOR_REVISION", "REJECTED"),
                ),
                name="ck_evaluation_recommendation",
            ),
        ),
        migrations.AddConstraint(
            model_name="evaluation",
            constraint=models.CheckConstraint(
                condition=models.Q(status="DRAFT")
                | models.Q(
                    recommendation__isnull=False,
                    comments_for_author__isnull=False,
                    submitted_at__isnull=False,
                )
                & (
                    models.Q(rubric_version=1, **{f"{name}__isnull": False for name in LEGACY})
                    | models.Q(rubric_version=2, **{f"{name}__isnull": False for name in RUBRIC})
                ),
                name="ck_evaluation_final_complete",
            ),
        ),
        migrations.AddConstraint(
            model_name="evaluation",
            constraint=models.CheckConstraint(
                condition=models.Q(status="DRAFT")
                | models.Q(rubric_version=1)
                | (
                    models.Q(**{f"{name}__gt": 3 for name in RUBRIC})
                    & ~models.Q(recommendation__in=("MAJOR_REVISION", "REJECTED"))
                )
                | models.Q(GreaterThanOrEqual(Length("comments_for_author"), 100)),
                name="ck_evaluation_rubric_justification",
            ),
        ),
    ]
