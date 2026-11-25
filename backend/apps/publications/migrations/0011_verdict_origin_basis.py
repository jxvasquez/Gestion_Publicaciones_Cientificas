"""Origen del veredicto y evaluaciones consideradas (spec 004, R-12).

* Renombra ``editor`` a ``decided_by`` y permite nulos en él y en
  ``evaluation`` (``NULL`` es el sistema).
* Agrega ``origin`` con ``DEFAULT 'EDITOR_LEGACY'`` en el ``ALTER TABLE``
  (sin reescribir filas, así no se dispara ``trg_verdict_no_update``) y luego
  elimina el valor por defecto.
* Crea ``VerdictEvaluation`` con su disparador append-only y redefine las
  restricciones del veredicto (``CHANGES_REQUESTED``, origen y decisor).
"""

from __future__ import annotations

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

CREATE_TRIGGER = """
CREATE TRIGGER trg_verdict_evaluation_no_update
BEFORE UPDATE OR DELETE ON publications_verdict_evaluation
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();
"""

DROP_TRIGGER = """
DROP TRIGGER IF EXISTS trg_verdict_evaluation_no_update ON publications_verdict_evaluation;
"""

ORIGINS = [
    ("CONSENSUS", "Consenso de dos revisores"),
    ("TIE_BREAK", "Desempate de un tercer revisor"),
    ("ADMIN_CORRECTION", "Corrección del Administrador"),
    ("EDITOR_LEGACY", "Veredicto heredado del Editor"),
]


class Migration(migrations.Migration):
    dependencies = [
        ("publications", "0010_manuscript_areas_states"),
        ("reviews", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RenameField(model_name="verdict", old_name="editor", new_name="decided_by"),
        migrations.AlterField(
            model_name="verdict",
            name="decided_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="issued_verdicts",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="verdict",
            name="evaluation",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="verdicts",
                to="reviews.evaluation",
            ),
        ),
        migrations.AddField(
            model_name="verdict",
            name="origin",
            field=models.CharField(choices=ORIGINS, default="EDITOR_LEGACY", max_length=20),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name="verdict",
            name="decision",
            field=models.CharField(
                choices=[
                    ("ACCEPTED", "Aceptado"),
                    ("REJECTED", "Rechazado"),
                    ("CHANGES_REQUESTED", "Cambios solicitados"),
                    ("REQUIRES_CORRECTIONS", "Requiere correcciones"),
                ],
                max_length=24,
            ),
        ),
        migrations.RemoveConstraint(model_name="verdict", name="ck_verdict_decision"),
        migrations.RemoveConstraint(
            model_name="verdict", name="ck_verdict_corrections_observations"
        ),
        migrations.AddConstraint(
            model_name="verdict",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("origin__in", ("CONSENSUS", "TIE_BREAK", "ADMIN_CORRECTION", "EDITOR_LEGACY"))
                ),
                name="ck_verdict_origin",
            ),
        ),
        migrations.AddConstraint(
            model_name="verdict",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("decision__in", ("ACCEPTED", "REJECTED", "CHANGES_REQUESTED"))
                )
                | models.Q(("decision", "REQUIRES_CORRECTIONS"), ("origin", "EDITOR_LEGACY")),
                name="ck_verdict_decision",
            ),
        ),
        migrations.AddConstraint(
            model_name="verdict",
            constraint=models.CheckConstraint(
                condition=~models.Q(("decision__in", ("CHANGES_REQUESTED", "REQUIRES_CORRECTIONS")))
                | models.Q(("observations__isnull", False)),
                name="ck_verdict_corrections_observations",
            ),
        ),
        migrations.AddConstraint(
            model_name="verdict",
            constraint=models.CheckConstraint(
                condition=models.Q(origin__in=("CONSENSUS", "TIE_BREAK"), decided_by__isnull=True)
                | models.Q(
                    origin__in=("ADMIN_CORRECTION", "EDITOR_LEGACY"), decided_by__isnull=False
                ),
                name="ck_verdict_decider",
            ),
        ),
        migrations.CreateModel(
            name="VerdictEvaluation",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("slot", models.PositiveSmallIntegerField()),
                (
                    "evaluation",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="verdict_links",
                        to="reviews.evaluation",
                    ),
                ),
                (
                    "verdict",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="evaluations",
                        to="publications.verdict",
                    ),
                ),
            ],
            options={"db_table": "publications_verdict_evaluation", "ordering": ("slot",)},
        ),
        migrations.AddConstraint(
            model_name="verdictevaluation",
            constraint=models.UniqueConstraint(
                fields=("verdict", "evaluation"), name="uq_verdict_evaluation_pair"
            ),
        ),
        migrations.AddConstraint(
            model_name="verdictevaluation",
            constraint=models.UniqueConstraint(
                fields=("verdict", "slot"), name="uq_verdict_evaluation_slot"
            ),
        ),
        migrations.RunSQL(sql=CREATE_TRIGGER, reverse_sql=DROP_TRIGGER),
    ]
