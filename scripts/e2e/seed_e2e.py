"""Siembra las cuentas del E2E (TSK-91, spec 004).

Se ejecuta DENTRO del contenedor del backend del stack aislado «gpc_e2e»:

    docker compose -p gpc_e2e ... exec -T -e E2E_PASSWORD backend python manage.py shell < scripts/e2e/seed_e2e.py

La contraseña (E2E_PASSWORD) se genera en cada corrida y no se guarda. Es idempotente.
Las personas tienen nombres reconocibles para comprobar que ninguna identidad cruza
el doble ciego (el Autor nunca ve al Revisor ni al revés).

Diseño (sin rol Editor; la asignación es automática por carrera):

* Seis revisores de «Ingeniería en Computación»: cualquier manuscrito de esa carrera recibe
  a dos de ellos y hay cupo (5 activas por revisor) para todas las pruebas de la corrida.
* Un revisor de «Derecho» y una cuenta Autor–Revisor también de «Derecho»: un manuscrito
  de Derecho tiene exactamente esos dos candidatos, así que sus asignaciones son
  deterministas, y la cuenta Autor–Revisor nunca revisa lo suyo (Computación).
* Un Autor y un Administrador.
"""

import os

from django.contrib.auth import get_user_model
from django.core.management import call_command

from apps.users.models import AcademicArea, ReviewerProfile, Role, UserRole

PASSWORD = os.environ["E2E_PASSWORD"]
call_command("seed_roles", verbosity=0)
User = get_user_model()

COMPUTING = AcademicArea.objects.get_or_create(
    code="ingenieria-en-computacion", defaults={"name": "Ingeniería en Computación"}
)[0]
LAW = AcademicArea.objects.get_or_create(code="derecho", defaults={"name": "Derecho"})[0]

# (identificador, nombre, apellidos, roles, carrera del revisor)
PEOPLE = [
    ("e2e-dual", "Elena", "Cabrera Rojas", ["AUTHOR", "REVIEWER"], LAW),
    ("e2e-autor", "Marcela", "Quizhpe Ordóñez", ["AUTHOR"], None),
    ("e2e-rev-1", "Rodrigo", "Valarezo Cueva", ["REVIEWER"], COMPUTING),
    ("e2e-rev-2", "Patricia", "Jaramillo Soto", ["REVIEWER"], COMPUTING),
    ("e2e-rev-3", "Gonzalo", "Armijos Pineda", ["REVIEWER"], COMPUTING),
    ("e2e-rev-4", "Lucía", "Ochoa Berrezueta", ["REVIEWER"], COMPUTING),
    ("e2e-rev-5", "Fabián", "Granda Loaiza", ["REVIEWER"], COMPUTING),
    ("e2e-rev-6", "Verónica", "Tapia Ludeña", ["REVIEWER"], COMPUTING),
    ("e2e-rev-derecho", "Julián", "Espinosa Vivanco", ["REVIEWER"], LAW),
    ("e2e-admin", "Adriana", "Paredes León", ["ADMIN"], None),
]

for identifier, first_name, last_name, roles, area in PEOPLE:
    user, _ = User.objects.get_or_create(
        institutional_id=identifier,
        defaults={
            "username": identifier,
            "email": f"{identifier}@e2e.unl.edu.ec",
            "first_name": first_name,
            "last_name": last_name,
        },
    )
    user.set_password(PASSWORD)
    user.save(update_fields=["password"])
    for code in roles:
        UserRole.objects.get_or_create(user=user, role=Role.objects.get(code=code), is_active=True)
    if "REVIEWER" in roles:
        profile, _ = ReviewerProfile.objects.update_or_create(user=user, defaults={"is_available": True})
        profile.areas.set([area])
print(f"SEED_OK people={len(PEOPLE)}")
