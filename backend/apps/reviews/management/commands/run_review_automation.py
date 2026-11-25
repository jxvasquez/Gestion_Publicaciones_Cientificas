"""Ciclo programado de la revisión: vence plazos, concilia veredictos y cubre cupos (spec 004).

Lo ejecuta el cron cada minuto con ``flock``. Es idempotente: una segunda ejecución sin trabajo
nuevo no hace nada y no escribe salida.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.reviews.services.automation import run_cycle


class Command(BaseCommand):
    help = (
        "Vence las asignaciones con el plazo cumplido (penaliza y revoca), decide los veredictos "
        "pendientes y asigna los cupos libres. Solo escribe salida si hubo trabajo."
    )

    def handle(self, *args, **options) -> None:
        result = run_cycle()
        if not result.worked:
            return
        self.stdout.write(
            f"Asignaciones vencidas: {result.expired}; sin auditar: {result.failed}; "
            f"veredictos emitidos: {result.decided}; asignaciones nuevas: {result.assigned}."
        )
