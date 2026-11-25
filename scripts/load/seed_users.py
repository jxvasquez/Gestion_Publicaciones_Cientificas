"""Siembra las cuentas de la prueba de carga (TSK-86).

Se ejecuta DENTRO del contenedor del backend, contra la base del stack
aislado de la prueba (nunca contra la base de trabajo):

    docker compose -p gpc_load ... exec -T backend python manage.py shell < scripts/load/seed_users.py

Variables: LOAD_PASSWORD (obligatoria, se genera en cada corrida y no se
guarda), LOAD_USERS (cantidad de autores, 50 por defecto). Es idempotente.
"""

import os

from django.contrib.auth import get_user_model
from django.core.management import call_command

from apps.users.models import AcademicArea, ReviewerProfile, Role, UserRole

PASSWORD = os.environ["LOAD_PASSWORD"]
AUTHORS = int(os.environ.get("LOAD_USERS", "50"))

call_command("seed_roles", verbosity=0)
User = get_user_model()


def ensure(identifier: str, first_name: str, role_code: str) -> None:
    user, created = User.objects.get_or_create(
        institutional_id=identifier,
        defaults={
            "username": identifier,
            "email": f"{identifier}@carga.invalid",
            "first_name": first_name,
            "last_name": "Carga",
        },
    )
    # La contraseña se fija siempre: cada corrida usa una nueva.
    user.set_password(PASSWORD)
    user.save(update_fields=["password"])
    UserRole.objects.get_or_create(
        user=user, role=Role.objects.get(code=role_code), is_active=True
    )


for number in range(AUTHORS):
    ensure(f"load-author-{number:02d}", f"Autor{number:02d}", "AUTHOR")
# La asignación es automática por carrera: seis revisores comparten la carrera de la siembra,
# así que cada manuscrito recibe a dos y hay cupo (5 activas por revisor) para toda la corrida.
AREA = AcademicArea.objects.get_or_create(
    code="ingenieria-en-computacion", defaults={"name": "Ingeniería en Computación"}
)[0]
for number in range(1, 7):
    identifier = f"load-reviewer-{number}"
    ensure(identifier, f"Revisor{number}", "REVIEWER")
    profile, _ = ReviewerProfile.objects.update_or_create(
        user=User.objects.get(institutional_id=identifier), defaults={"is_available": True}
    )
    profile.areas.set([AREA])
print(f"SEED_OK authors={AUTHORS} reviewers=6")
