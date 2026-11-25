"""Bitácora de ajustes de ranking, append-only (spec 004, R-09).

Crea ``RankingAdjustment`` con sus restricciones e índice y el disparador
``trg_ranking_adjustment_no_update``, que reutiliza
``prevent_append_only_mutation()`` de ``publications 0004``.
"""

from __future__ import annotations

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

CREATE_TRIGGER = """
CREATE TRIGGER trg_ranking_adjustment_no_update
BEFORE UPDATE OR DELETE ON reviews_ranking_adjustment
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();
"""

DROP_TRIGGER = """
DROP TRIGGER IF EXISTS trg_ranking_adjustment_no_update ON reviews_ranking_adjustment;
"""


class Migration(migrations.Migration):
    dependencies = [
        ("reviews", "0005_evaluation_rubric"),
        ("publications", "0004_integrity_triggers"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="RankingAdjustment",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                (
                    "cause",
                    models.CharField(
                        choices=[
                            ("ON_TIME_EVALUATION", "Evaluación a tiempo"),
                            ("DEADLINE_MISSED", "Plazo vencido"),
                        ],
                        max_length=24,
                    ),
                ),
                ("delta", models.SmallIntegerField()),
                ("score_before", models.IntegerField()),
                ("score_after", models.IntegerField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "assignment",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="ranking_adjustments",
                        to="reviews.assignment",
                    ),
                ),
                (
                    "reviewer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="ranking_adjustments",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"db_table": "reviews_ranking_adjustment", "ordering": ("-created_at", "-id")},
        ),
        migrations.AddIndex(
            model_name="rankingadjustment",
            index=models.Index(fields=["reviewer", "-created_at"], name="idx_ranking_reviewer_date"),
        ),
        migrations.AddConstraint(
            model_name="rankingadjustment",
            constraint=models.UniqueConstraint(
                fields=("assignment", "cause"), name="uq_ranking_assignment_cause"
            ),
        ),
        migrations.AddConstraint(
            model_name="rankingadjustment",
            constraint=models.CheckConstraint(
                condition=models.Q(("cause", "ON_TIME_EVALUATION"), ("delta", 10))
                | models.Q(("cause", "DEADLINE_MISSED"), ("delta", -20)),
                name="ck_ranking_delta_cause",
            ),
        ),
        migrations.AddConstraint(
            model_name="rankingadjustment",
            constraint=models.CheckConstraint(
                condition=models.Q(("score_after__gte", 0)), name="ck_ranking_score_after"
            ),
        ),
        migrations.RunSQL(sql=CREATE_TRIGGER, reverse_sql=DROP_TRIGGER),
    ]
