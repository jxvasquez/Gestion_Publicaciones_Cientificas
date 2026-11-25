"""Migraciones de la spec 004 sobre datos heredados (T005, SC-009).

Se migra hacia atrás a ``users 0003``, ``publications 0009`` y ``reviews 0003``, se crean con los
modelos históricos los datos que dejó el flujo del Editor (incluida una evaluación final,
inmutable por disparador) y se migra hacia adelante comprobando que nada se pierde ni se reescribe.
La base siempre vuelve al último estado, pase lo que pase.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone

from tests.reviews.support import seeded_roles  # noqa: F401,E402

pytestmark = pytest.mark.django_db(transaction=True)

OLD = [
    ("users", "0003_refreshtoken"),
    ("publications", "0009_verdict_correction"),
    ("reviews", "0003_incident_report"),
]
NEW = [
    ("users", "0004_academic_area_ranking"),
    ("publications", "0011_verdict_origin_basis"),
    ("reviews", "0006_ranking_adjustment"),
]
LATEST = [("users", "0004_academic_area_ranking"), ("publications", "0011_verdict_origin_basis"),
          ("reviews", "0006_ranking_adjustment")]


def migrate(targets):
    executor = MigrationExecutor(connection)
    executor.migrate(targets)
    executor.loader.build_graph()
    return executor.loader.project_state(targets).apps


@pytest.fixture
def old_apps():
    apps = migrate(OLD)
    try:
        yield apps
    finally:
        migrate(LATEST)


def _user(apps, n: int, **extra):
    User = apps.get_model("users", "User")
    return User.objects.create(
        username=f"u{n}", institutional_id=f"INST-{n}", email=f"u{n}@unl.edu.ec",
        first_name="N", last_name="A", password="x", **extra,
    )


def _manuscript(apps, owner, n: int, *, area: str, status: str):
    Manuscript = apps.get_model("publications", "Manuscript")
    ManuscriptVersion = apps.get_model("publications", "ManuscriptVersion")
    manuscript = Manuscript.objects.create(
        code=f"GPC-2026-0000{n:02d}", title=f"T{n}", abstract="a", keywords=["k"], area=area,
        language="es", status=status, created_by=owner, current_version=1,
    )
    version = ManuscriptVersion.objects.create(
        manuscript=manuscript, version_number=1, round_number=0, original_file_path="p",
        original_filename="a.pdf", original_size_bytes=1, original_sha256="a" * 64,
        sanitized_file_path="s", sanitized_sha256="a" * 64, metadata_snapshot={"area": area},
        metadata_sha256="a" * 64, submitted_by=owner,
    )
    return manuscript, version


def _assignment(apps, manuscript, version, reviewer, editor, status, slot_days=0):
    Assignment = apps.get_model("reviews", "Assignment")
    assigned = timezone.now() - timedelta(days=slot_days)
    return Assignment.objects.create(
        manuscript=manuscript, version=version, reviewer=reviewer, assigned_by=editor,
        assigned_at=assigned, due_at=assigned + timedelta(days=20), status=status,
    )


def test_legacy_data_survives_the_migration(old_apps) -> None:
    apps = old_apps
    Role = apps.get_model("users", "Role")
    UserRole = apps.get_model("users", "UserRole")
    ReviewerProfile = apps.get_model("users", "ReviewerProfile")
    Evaluation = apps.get_model("reviews", "Evaluation")
    Verdict = apps.get_model("publications", "Verdict")
    editor, author = _user(apps, 1), _user(apps, 2)
    reviewer1, reviewer2, reviewer3 = _user(apps, 3), _user(apps, 4), _user(apps, 5)
    editor_role = Role.objects.create(code="EDITOR", name="Editor")
    UserRole.objects.create(user=editor, role=editor_role)
    ReviewerProfile.objects.create(
        user=reviewer1, expertise_areas=["Derecho", "Ingeniería en Computación"], max_active_assignments=3
    )
    corrected, v_corrected = _manuscript(
        apps, author, 1, area="Ingeniería en Computación ", status="REQUIRES_CORRECTIONS"
    )
    reviewing, v_reviewing = _manuscript(apps, author, 2, area="derecho", status="UNDER_REVIEW")
    revoked = _assignment(apps, corrected, v_corrected, reviewer1, editor, "REVOKED", 30)
    expired = _assignment(apps, reviewing, v_reviewing, reviewer2, editor, "EXPIRED", 30)
    final_assignment = _assignment(apps, corrected, v_corrected, reviewer3, editor, "COMPLETED", 5)
    final = Evaluation.objects.create(
        assignment=final_assignment, manuscript=corrected, version=v_corrected, reviewer=reviewer3,
        status="FINAL", originality_score=4, methodology_score=4, clarity_score=3,
        relevance_score=4, ethics_score=5, recommendation="REQUIRES_CORRECTIONS",
        comments_for_author="Cambios.", submitted_at=timezone.now(),
    )
    draft_accept = Evaluation.objects.create(
        assignment=_assignment(apps, reviewing, v_reviewing, reviewer1, editor, "ACTIVE"),
        manuscript=reviewing, version=v_reviewing, reviewer=reviewer1, status="DRAFT",
        recommendation="ACCEPT",
    )
    draft_corrections = Evaluation.objects.create(
        assignment=_assignment(apps, corrected, v_corrected, reviewer2, editor, "REVOKED"),
        manuscript=corrected, version=v_corrected, reviewer=reviewer2, status="DRAFT",
        recommendation="REQUIRES_CORRECTIONS",
    )
    verdict = Verdict.objects.create(
        manuscript=corrected, version=v_corrected, evaluation=final, editor=editor,
        decision="REQUIRES_CORRECTIONS", observations="Corregir.",
    )

    new_apps = migrate(NEW)

    Manuscript = new_apps.get_model("publications", "Manuscript")
    AcademicArea = new_apps.get_model("users", "AcademicArea")
    names = {a.name for a in AcademicArea.objects.all()}
    assert {"Ingeniería en Computación", "Ingeniería Agropecuaria", "Derecho"} <= names
    assert len(names) == len({n.lower() for n in names})  # únicas sin distinguir mayúsculas
    m1, m2 = Manuscript.objects.get(pk=corrected.pk), Manuscript.objects.get(pk=reviewing.pk)
    assert [a.name for a in m1.areas.all()] == ["Ingeniería en Computación"]
    assert [a.name for a in m2.areas.all()] == ["Derecho"]
    assert m1.status == "CHANGES_REQUESTED" and m1.lock_version == 1
    assert m2.status == "UNDER_REVIEW" and m2.lock_version == 0

    profile = new_apps.get_model("users", "ReviewerProfile").objects.get(user_id=reviewer1.pk)
    assert sorted(a.name for a in profile.areas.all()) == ["Derecho", "Ingeniería en Computación"]
    assert profile.ranking_score == 100

    Assignment = new_apps.get_model("reviews", "Assignment")
    assert Assignment.objects.get(pk=revoked.pk).release_cause == "EDITOR_LEGACY"
    assert Assignment.objects.get(pk=revoked.pk).slot == 1
    assert Assignment.objects.get(pk=expired.pk).status == "EXPIRED"  # sigue vencida hasta la transición
    assert Assignment.objects.get(pk=expired.pk).release_cause is None

    Evaluation = new_apps.get_model("reviews", "Evaluation")
    migrated_final = Evaluation.objects.get(pk=final.pk)
    assert migrated_final.rubric_version == 1 and migrated_final.status == "FINAL"
    assert migrated_final.recommendation == "REQUIRES_CORRECTIONS"
    assert (migrated_final.originality_score, migrated_final.clarity_score) == (4, 3)
    accepted = Evaluation.objects.get(pk=draft_accept.pk)
    assert accepted.rubric_version == 2 and accepted.recommendation == "ACCEPTED"
    reset = Evaluation.objects.get(pk=draft_corrections.pk)
    assert reset.rubric_version == 2 and reset.recommendation is None

    migrated_verdict = new_apps.get_model("publications", "Verdict").objects.get(pk=verdict.pk)
    assert migrated_verdict.origin == "EDITOR_LEGACY" and migrated_verdict.decided_by_id == editor.pk
    assert migrated_verdict.decision == "REQUIRES_CORRECTIONS" and migrated_verdict.evaluation_id == final.pk
