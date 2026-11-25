"""Catálogo de carreras y ranking de revisores (spec 004, R-02 y R-09).

* Crea ``AcademicArea`` (nombre único sin distinguir mayúsculas), agrega
  ``ReviewerProfile.areas`` y ``ranking_score`` (100, con ``CHECK >= 0``).
* Con ``RunPython`` siembra Ingeniería en Computación, Ingeniería
  Agropecuaria y Derecho, crea una carrera por cada valor distinto de
  ``expertise_areas`` (recortado y sin distinguir mayúsculas, con
  ``code=slugify(name)`` único) y vincula los perfiles.
* Elimina el índice GIN, ``expertise_areas`` y ``max_active_assignments``.

Reversible: ``reverse_code`` reconstruye ``expertise_areas`` desde las carreras.
"""

from __future__ import annotations

import django.db.models.functions.text
from django.db import migrations, models
from django.utils.text import slugify

INITIAL_AREAS = ("Ingeniería en Computación", "Ingeniería Agropecuaria", "Derecho")


def normalized(value: str) -> str:
    """Nombre recortado y sin espacios repetidos."""
    return " ".join((value or "").split())


def unique_code(AcademicArea, name: str) -> str:
    base = slugify(name)[:70] or "carrera"
    code, counter = base, 2
    while AcademicArea.objects.filter(code=code).exists():
        code = f"{base}-{counter}"
        counter += 1
    return code


def area_for(AcademicArea, name: str, by_key: dict):
    """La carrera de ``name`` (sin distinguir mayúsculas); se crea si no existe."""
    key = name.lower()
    if key not in by_key:
        by_key[key] = AcademicArea.objects.create(code=unique_code(AcademicArea, name), name=name)
    return by_key[key]


def seed_and_link(apps, schema_editor):
    AcademicArea = apps.get_model("users", "AcademicArea")
    ReviewerProfile = apps.get_model("users", "ReviewerProfile")
    by_key = {area.name.lower(): area for area in AcademicArea.objects.all()}
    for name in INITIAL_AREAS:
        area_for(AcademicArea, name, by_key)
    for profile in ReviewerProfile.objects.all():
        names = dict.fromkeys(normalized(value) for value in profile.expertise_areas)
        areas = [area_for(AcademicArea, name, by_key) for name in names if name]
        if areas:
            profile.areas.add(*areas)


def restore_expertise_areas(apps, schema_editor):
    ReviewerProfile = apps.get_model("users", "ReviewerProfile")
    for profile in ReviewerProfile.objects.all():
        profile.expertise_areas = list(profile.areas.order_by("name").values_list("name", flat=True))
        profile.save(update_fields=["expertise_areas"])


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0003_refreshtoken"),
    ]

    operations = [
        migrations.CreateModel(
            name="AcademicArea",
            fields=[
                ("id", models.SmallAutoField(primary_key=True, serialize=False)),
                ("code", models.SlugField(max_length=80, unique=True)),
                ("name", models.CharField(max_length=120)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "users_academic_area", "ordering": ("name",)},
        ),
        migrations.AddConstraint(
            model_name="academicarea",
            constraint=models.UniqueConstraint(
                django.db.models.functions.text.Lower("name"), name="uq_academic_area_name_lower"
            ),
        ),
        migrations.AddField(
            model_name="reviewerprofile",
            name="areas",
            field=models.ManyToManyField(
                blank=True, related_name="reviewer_profiles", to="users.academicarea"
            ),
        ),
        migrations.AddField(
            model_name="reviewerprofile",
            name="ranking_score",
            field=models.IntegerField(default=100),
        ),
        migrations.AddConstraint(
            model_name="reviewerprofile",
            constraint=models.CheckConstraint(
                condition=models.Q(("ranking_score__gte", 0)), name="ck_reviewer_ranking_score"
            ),
        ),
        migrations.AlterField(
            model_name="role",
            name="code",
            field=models.CharField(max_length=20, unique=True),
        ),
        migrations.RunPython(seed_and_link, restore_expertise_areas),
        # Las claves foráneas son diferidas: sin esto, un ALTER TABLE posterior falla con
        # «pending trigger events» sobre las filas que acaba de tocar el paso de datos.
        migrations.RunSQL("SET CONSTRAINTS ALL IMMEDIATE", migrations.RunSQL.noop),
        migrations.RemoveIndex(
            model_name="reviewerprofile",
            name="idx_reviewer_expertise_areas",
        ),
        migrations.RemoveField(
            model_name="reviewerprofile",
            name="expertise_areas",
        ),
        migrations.RemoveField(
            model_name="reviewerprofile",
            name="max_active_assignments",
        ),
    ]
