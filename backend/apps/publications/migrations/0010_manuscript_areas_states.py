"""Carreras del manuscrito y nuevos estados (spec 004, R-02 y R-05).

* Agrega ``Manuscript.areas`` y, con ``RunPython``, crea o reutiliza la
  carrera de cada ``area`` (recortada y sin distinguir mayúsculas) y la
  vincula. Elimina ``area`` e ``idx_manuscript_area``.
* ``REQUIRES_CORRECTIONS`` pasa a ``CHANGES_REQUESTED`` incrementando
  ``lock_version``; ``ck_manuscript_status`` se redefine después de la
  actualización (``TIE_BREAKER`` es un estado nuevo).

El manuscrito solo bloquea ``DELETE``: esta actualización no toca filas
inmutables (versiones, eventos de estado y veredictos).
"""

from __future__ import annotations

from django.db import migrations, models
from django.db.models import F
from django.utils.text import slugify


def normalized(value: str) -> str:
    return " ".join((value or "").split())


def unique_code(AcademicArea, name: str) -> str:
    base = slugify(name)[:70] or "carrera"
    code, counter = base, 2
    while AcademicArea.objects.filter(code=code).exists():
        code = f"{base}-{counter}"
        counter += 1
    return code


def link_areas(apps, schema_editor):
    AcademicArea = apps.get_model("users", "AcademicArea")
    Manuscript = apps.get_model("publications", "Manuscript")
    by_key = {area.name.lower(): area for area in AcademicArea.objects.all()}
    for manuscript in Manuscript.objects.exclude(area="").iterator():
        name = normalized(manuscript.area)
        if not name:
            continue
        if name.lower() not in by_key:
            by_key[name.lower()] = AcademicArea.objects.create(
                code=unique_code(AcademicArea, name), name=name
            )
        manuscript.areas.add(by_key[name.lower()])


def restore_area_text(apps, schema_editor):
    Manuscript = apps.get_model("publications", "Manuscript")
    for manuscript in Manuscript.objects.all().iterator():
        first = manuscript.areas.order_by("name").first()
        Manuscript.objects.filter(pk=manuscript.pk).update(area=first.name if first else "")


def to_changes_requested(apps, schema_editor):
    Manuscript = apps.get_model("publications", "Manuscript")
    Manuscript.objects.filter(status="REQUIRES_CORRECTIONS").update(
        status="CHANGES_REQUESTED", lock_version=F("lock_version") + 1
    )


def to_requires_corrections(apps, schema_editor):
    Manuscript = apps.get_model("publications", "Manuscript")
    Manuscript.objects.filter(status="CHANGES_REQUESTED").update(status="REQUIRES_CORRECTIONS")
    Manuscript.objects.filter(status="TIE_BREAKER").update(status="UNDER_REVIEW")


NEW_STATUSES = (
    "DRAFT",
    "SUBMITTED",
    "UNDER_REVIEW",
    "TIE_BREAKER",
    "CHANGES_REQUESTED",
    "ACCEPTED",
    "REJECTED",
)


class Migration(migrations.Migration):
    dependencies = [
        ("publications", "0009_verdict_correction"),
        ("users", "0004_academic_area_ranking"),
    ]

    operations = [
        migrations.AddField(
            model_name="manuscript",
            name="areas",
            field=models.ManyToManyField(
                blank=True, related_name="manuscripts", to="users.academicarea"
            ),
        ),
        migrations.RunPython(link_areas, restore_area_text),
        # Las claves foráneas son diferidas: sin esto, un ALTER TABLE posterior falla con
        # «pending trigger events» sobre las filas que acaba de tocar el paso de datos.
        migrations.RunSQL("SET CONSTRAINTS ALL IMMEDIATE", migrations.RunSQL.noop),
        migrations.RemoveIndex(
            model_name="manuscript",
            name="idx_manuscript_area",
        ),
        migrations.RemoveField(
            model_name="manuscript",
            name="area",
        ),
        migrations.RemoveConstraint(
            model_name="manuscript",
            name="ck_manuscript_status",
        ),
        migrations.AlterField(
            model_name="manuscript",
            name="status",
            field=models.CharField(
                choices=[
                    ("DRAFT", "Borrador"),
                    ("SUBMITTED", "Enviado"),
                    ("UNDER_REVIEW", "En revisión"),
                    ("TIE_BREAKER", "En desempate"),
                    ("CHANGES_REQUESTED", "Cambios solicitados"),
                    ("ACCEPTED", "Aceptado"),
                    ("REJECTED", "Rechazado"),
                ],
                default="DRAFT",
                max_length=24,
            ),
        ),
        migrations.RunPython(to_changes_requested, to_requires_corrections),
        # Las claves foráneas son diferidas: sin esto, un ALTER TABLE posterior falla con
        # «pending trigger events» sobre las filas que acaba de tocar el paso de datos.
        migrations.RunSQL("SET CONSTRAINTS ALL IMMEDIATE", migrations.RunSQL.noop),
        migrations.AddConstraint(
            model_name="manuscript",
            constraint=models.CheckConstraint(
                condition=models.Q(("status__in", NEW_STATUSES)), name="ck_manuscript_status"
            ),
        ),
    ]
