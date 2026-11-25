"""Alta de cuentas institucionales y de sus roles, sin Django Admin (D-31).

Es la única vía de provisión en producción (el Admin no se monta ahí) y la comparten el
comando de soporte ``create_user`` y el de pruebas ``seed_dev_users``. Idempotente: repetirla
no duplica la cuenta ni sus roles, y solo cambia la contraseña si se pide una explícitamente.
"""

from __future__ import annotations

import secrets
from collections.abc import Iterable
from dataclasses import dataclass

from django.db import transaction
from django.db.models import Q

from apps.users.models import AcademicArea, ReviewerProfile, Role, User, UserRole


class ProvisioningError(ValueError):
    """Datos de alta inválidos (rol desconocido, correo repetido, roles sin sembrar…)."""


@dataclass(frozen=True)
class Provisioned:
    user: User
    created: bool
    #: La contraseña, solo si se fijó o generó en esta llamada (única vez que se conoce).
    password: str | None
    roles_added: tuple[str, ...]


def _resolve_areas(areas: Iterable[str]) -> list[AcademicArea]:
    """Carreras activas del catálogo por nombre o código; una desconocida es un error."""
    rows = []
    for value in dict.fromkeys(item.strip() for item in areas if item.strip()):
        area = (
            AcademicArea.objects.filter(is_active=True)
            .filter(Q(code__iexact=value) | Q(name__iexact=value))
            .first()
        )
        if area is None:
            raise ProvisioningError(f"La carrera «{value}» no existe o está inactiva.")
        rows.append(area)
    return rows


def provision_user(
    *,
    institutional_id: str,
    first_name: str,
    last_name: str,
    email: str,
    roles: Iterable[str],
    password: str | None = None,
    areas: Iterable[str] = (),
) -> Provisioned:
    """Crea (o completa) la cuenta ``institutional_id`` con los roles indicados.

    * Cuenta nueva sin ``password``: se genera una aleatoria y se devuelve.
    * Cuenta existente sin ``password``: se conserva la que tiene.
    * ``REVIEWER`` crea además su perfil: ``areas`` son nombres o códigos de carreras activas
      del catálogo y una desconocida falla.
    """
    wanted = tuple(dict.fromkeys(role.upper() for role in roles))
    area_rows = _resolve_areas(areas)
    valid = {code for code, _ in Role.Code.choices}
    unknown = [code for code in wanted if code not in valid]
    if unknown or not wanted:
        raise ProvisioningError(
            f"Roles no válidos: {', '.join(unknown) or '(ninguno)'}. Use: {', '.join(sorted(valid))}."
        )
    catalog = {role.code: role for role in Role.objects.filter(code__in=wanted)}
    if len(catalog) != len(wanted):
        raise ProvisioningError("Faltan los roles en la base: ejecute antes `manage.py seed_roles`.")
    if User.objects.filter(email__iexact=email).exclude(institutional_id=institutional_id).exists():
        raise ProvisioningError(f"El correo {email} ya pertenece a otra cuenta.")

    with transaction.atomic():
        user, created = User.objects.get_or_create(
            institutional_id=institutional_id,
            defaults={
                "username": institutional_id,
                "email": email,
                "first_name": first_name,
                "last_name": last_name,
            },
        )
        secret = password if password is not None else (secrets.token_urlsafe(12) if created else None)
        if secret is not None:
            user.set_password(secret)
            user.save(update_fields=["password"])

        added = []
        for code in wanted:
            _, new = UserRole.objects.get_or_create(user=user, role=catalog[code], is_active=True)
            if new:
                added.append(code)
        if Role.Code.REVIEWER in wanted:
            profile, _ = ReviewerProfile.objects.get_or_create(
                user=user, defaults={"is_available": True}
            )
            if area_rows:
                profile.areas.add(*area_rows)
    return Provisioned(user=user, created=created, password=secret, roles_added=tuple(added))
