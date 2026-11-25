"""Cupos de asignación y tope de cinco activas por revisor (spec 004, R-07 y R-08).

* Agrega ``slot`` (las filas existentes reciben 1), ``release_cause`` y
  permite ``assigned_by`` nulo (``NULL`` es el sistema).
* Con ``RunPython`` completa ``release_cause='EDITOR_LEGACY'`` en las filas
  ``REVOKED`` y numera los cupos si una versión heredada tenía varias
  asignaciones vivas.
* Reemplaza ``uq_assignment_active`` por un cupo vivo por versión y un
  revisor vivo por versión, y agrega ``ck_assignment_slot``.
* Crea el disparador ``trg_assignment_capacity``: rechaza con
  ``check_violation`` la sexta asignación ``ACTIVE`` de un revisor.
"""

from __future__ import annotations

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

CREATE_CAPACITY_TRIGGER = """
CREATE OR REPLACE FUNCTION enforce_assignment_capacity()
RETURNS trigger AS $$
BEGIN
    IF (
        SELECT count(*) FROM reviews_assignment
        WHERE reviewer_id = NEW.reviewer_id AND status = 'ACTIVE' AND id <> NEW.id
    ) >= 5 THEN
        RAISE EXCEPTION 'El revisor ya tiene 5 asignaciones activas'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assignment_capacity
BEFORE INSERT OR UPDATE OF status ON reviews_assignment
FOR EACH ROW WHEN (NEW.status = 'ACTIVE')
EXECUTE FUNCTION enforce_assignment_capacity();
"""

DROP_CAPACITY_TRIGGER = """
DROP TRIGGER IF EXISTS trg_assignment_capacity ON reviews_assignment;
DROP FUNCTION IF EXISTS enforce_assignment_capacity();
"""


def mark_legacy_releases(apps, schema_editor):
    Assignment = apps.get_model("reviews", "Assignment")
    Assignment.objects.filter(status="REVOKED").update(release_cause="EDITOR_LEGACY")
    # Una versión heredada con varias asignaciones vivas: un cupo distinto a cada una.
    live = Assignment.objects.filter(status__in=("ACTIVE", "COMPLETED")).order_by(
        "version_id", "assigned_at", "id"
    )
    previous_version, slot = None, 0
    for assignment in live.iterator():
        slot = slot + 1 if assignment.version_id == previous_version else 1
        previous_version = assignment.version_id
        if slot > 1:
            Assignment.objects.filter(pk=assignment.pk).update(slot=min(slot, 3))


class Migration(migrations.Migration):
    dependencies = [
        ("reviews", "0003_incident_report"),
        ("publications", "0010_manuscript_areas_states"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="assignment",
            name="slot",
            field=models.PositiveSmallIntegerField(default=1),
        ),
        migrations.AddField(
            model_name="assignment",
            name="release_cause",
            field=models.CharField(
                blank=True,
                choices=[
                    ("OVERDUE", "Plazo vencido"),
                    ("CONFLICT_OF_INTEREST", "Conflicto de interés"),
                    ("INCIDENT_REASSIGN", "Reasignación por incidente"),
                    ("ANONYMIZATION_REQUESTED", "Versión anonimizada solicitada"),
                    ("MANUSCRIPT_WITHDRAWN", "Baja lógica del manuscrito"),
                    ("LEGACY_TRANSITION", "Cierre en la transición"),
                    ("EDITOR_LEGACY", "Revocación heredada del Editor"),
                ],
                max_length=32,
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="assignment",
            name="assigned_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="created_assignments",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(mark_legacy_releases, migrations.RunPython.noop),
        # Las claves foráneas son diferidas: sin esto, un ALTER TABLE posterior falla con
        # «pending trigger events» sobre las filas que acaba de tocar el paso de datos.
        migrations.RunSQL("SET CONSTRAINTS ALL IMMEDIATE", migrations.RunSQL.noop),
        migrations.RemoveConstraint(
            model_name="assignment",
            name="uq_assignment_active",
        ),
        migrations.AddConstraint(
            model_name="assignment",
            constraint=models.CheckConstraint(
                condition=models.Q(("slot__in", (1, 2, 3))), name="ck_assignment_slot"
            ),
        ),
        migrations.AddConstraint(
            model_name="assignment",
            constraint=models.UniqueConstraint(
                condition=models.Q(("status__in", ("ACTIVE", "COMPLETED"))),
                fields=("version", "slot"),
                name="uq_assignment_live_slot",
            ),
        ),
        migrations.AddConstraint(
            model_name="assignment",
            constraint=models.UniqueConstraint(
                condition=models.Q(("status__in", ("ACTIVE", "COMPLETED"))),
                fields=("version", "reviewer"),
                name="uq_assignment_live_reviewer",
            ),
        ),
        migrations.RunSQL(sql=CREATE_CAPACITY_TRIGGER, reverse_sql=DROP_CAPACITY_TRIGGER),
    ]
