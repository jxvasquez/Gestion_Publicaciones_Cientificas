"""Seed the fixed role catalog (plan §1.4)."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.users.models import Role

ROLE_SEED: tuple[tuple[str, str, str], ...] = (
    (Role.Code.AUTHOR, "Autor", "Registra y envía manuscritos."),
    (Role.Code.REVIEWER, "Revisor", "Evalúa manuscritos asignados bajo doble ciego."),
    (
        Role.Code.ADMIN,
        "Administrador",
        "Resuelve incidentes, corrige veredictos y mantiene el padrón y las carreras.",
    ),
)

#: Código del rol retirado: su fila se conserva inactiva por el historial.
RETIRED_EDITOR_CODE = "EDITOR"


class Command(BaseCommand):
    """Create the three institutional roles exactly once and retire ``EDITOR`` (idempotent)."""

    help = "Siembra los roles AUTHOR, REVIEWER y ADMIN y desactiva la fila heredada EDITOR."

    def handle(self, *args, **options) -> None:
        for code, name, description in ROLE_SEED:
            role, created = Role.objects.get_or_create(
                code=code,
                defaults={"name": name, "description": description},
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"Rol creado: {code}"))
            else:
                self.stdout.write(f"Rol ya existente: {code}")
        retired = Role.objects.filter(code=RETIRED_EDITOR_CODE, is_active=True).update(
            is_active=False
        )
        if retired:
            self.stdout.write(f"Rol heredado desactivado: {RETIRED_EDITOR_CODE}")
        self.stdout.write(
            self.style.SUCCESS(
                f"Roles institucionales activos: {Role.objects.filter(is_active=True).count()}."
            )
        )
