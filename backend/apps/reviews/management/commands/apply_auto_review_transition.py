"""Transición a la revisión automática (spec 004, R-18 y FR-039). Idempotente.

Lo ejecuta el arranque (después de ``migrate`` y ``apply_db_privileges``). Completa lo que las
migraciones no pueden hacer porque necesita auditoría y servicios reales:

1. Revoca los roles ``EDITOR`` activos con ``ROLE_REVOKED`` y desactiva la fila del rol.
2. Cierra sin penalización (``LEGACY_TRANSITION``) las asignaciones ``EXPIRED`` heredadas que
   esperaban una decisión del Editor.
3. Cubre los cupos de los manuscritos en curso: los ``SUBMITTED`` reciben asignación y los
   ``UNDER_REVIEW`` completan sus dos cupos.
4. Concilia los veredictos: una versión con las dos evaluaciones completas se decide, con la
   clasificación de los dictámenes de la rúbrica 1 si son heredados.

Repetirlo no tiene efectos: cada paso solo actúa si hay trabajo pendiente.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.audit.services import AuditService
from apps.reviews.models import Assignment
from apps.reviews.services.assignments import (
    fill_pending_slots,
    mark_released,
    record_review_audit,
)
from apps.reviews.services.consensus import reconcile_pending_verdicts
from apps.users.models import Role, UserRole

RETIRED_CODE = "EDITOR"


def revoke_editor_roles() -> int:
    """Revoke every active ``EDITOR`` assignment (audited) and retire the role row."""
    revoked = 0
    rows = UserRole.objects.select_related("role").filter(is_active=True, role__code=RETIRED_CODE)
    for row in rows:
        with transaction.atomic():
            row.is_active = False
            row.revoked_at = timezone.now()
            row.save(update_fields=("is_active", "revoked_at"))
            AuditService.record(
                action="ROLE_REVOKED",
                entity_type="USER_ROLE",
                entity_id=row.pk,
                result=AuditLog.Result.SUCCESS,
                details={"user_id": str(row.user_id), "role": RETIRED_CODE, "cause": "ROLE_RETIRED"},
            )
        revoked += 1
    Role.objects.filter(code=RETIRED_CODE, is_active=True).update(is_active=False)
    return revoked


def close_legacy_expired() -> int:
    """Close without penalty the ``EXPIRED`` assignments left by the old flow."""
    closed = 0
    legacy = Assignment.objects.filter(status=Assignment.Status.EXPIRED, release_cause__isnull=True)
    for assignment_id in list(legacy.values_list("pk", flat=True)):
        with transaction.atomic():
            assignment = Assignment.objects.select_for_update().get(pk=assignment_id)
            if assignment.status != Assignment.Status.EXPIRED or assignment.release_cause:
                continue
            mark_released(
                assignment,
                status=Assignment.Status.REVOKED,
                cause=Assignment.ReleaseCause.LEGACY_TRANSITION,
                actor=None,
            )
            record_review_audit(
                None,
                None,
                "ASSIGNMENT_RELEASED",
                "ASSIGNMENT",
                assignment.pk,
                details={
                    "manuscript_id": str(assignment.manuscript_id),
                    "cause": Assignment.ReleaseCause.LEGACY_TRANSITION,
                    "slot": assignment.slot,
                    "previous_status": Assignment.Status.EXPIRED,
                },
            )
        closed += 1
    return closed


class Command(BaseCommand):
    help = "Transición a la asignación automática: retira el rol Editor y deja los expedientes en marcha."

    def handle(self, *args, **options) -> None:
        roles = revoke_editor_roles()
        closed = close_legacy_expired()
        assigned = fill_pending_slots()
        decided = reconcile_pending_verdicts()
        if any((roles, closed, assigned, decided)):
            self.stdout.write(
                f"Roles Editor revocados: {roles}; asignaciones heredadas cerradas: {closed}; "
                f"asignaciones nuevas: {assigned}; veredictos emitidos: {decided}."
            )
