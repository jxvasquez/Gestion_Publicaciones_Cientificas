"""Creation and reading of notices (plan sections 1.18 and 2.8, TSK-75).

``notify`` stores, for one recipient and one event, a ``PANEL`` notice that
is available at once (``SENT``) and an ``EMAIL`` twin in ``PENDING`` that
``send_pending_notifications`` delivers with retries. The panel never
depends on the mail: if the SMTP server is down the panel notice is already
there. ``UNIQUE (recipient, event_key)`` makes the event idempotent: the
same event for the same person produces one notice, even if a signal fires
twice; two roles of the same person get two keys, so two actions stay two
notices (CA-HU-24-06).

The recipients are resolved here from the manuscript, never from the
event arguments: an author is the registrant or a linked co-author, an
administrator holds the active ``ADMIN`` role and has no authorship
relation with the manuscript, and a reviewer is the one of the assignment. An inactive account
gets nothing (CA-HU-24-07).
"""

from __future__ import annotations

import logging
from collections.abc import Iterable

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils import timezone

from apps.notifications.models import Notification
from apps.notifications.payloads import build_payload
from apps.publications.models import Manuscript
from apps.users.models import Role, User

logger = logging.getLogger(__name__)

EMAIL_KEY_SUFFIX = "#email"


# --- Recipients -------------------------------------------------------------


def authors_of(manuscript: Manuscript, *, exclude_ids: Iterable = ()) -> list[User]:
    """The registrant and the co-authors that have an account."""
    users = User.objects.filter(
        Q(pk=manuscript.created_by_id) | Q(authorships__manuscript=manuscript),
        is_active=True,
    )
    return list(users.exclude(pk__in=list(exclude_ids)).distinct())


def admins_for(manuscript: Manuscript) -> list[User]:
    """Active administrators without an authorship relation with the manuscript.

    The relation is by account (registrant or linked author) or by e-mail.
    """
    author_emails = [
        email.lower() for email in manuscript.authors.values_list("email", flat=True)
    ]
    return list(
        User.objects.annotate(email_lower=Lower("email"))
        .filter(
            is_active=True,
            role_assignments__is_active=True,
            role_assignments__role__code=Role.Code.ADMIN,
            role_assignments__role__is_active=True,
        )
        .exclude(pk=manuscript.created_by_id)
        .exclude(authorships__manuscript=manuscript)
        .exclude(email_lower__in=author_emails)
        .distinct()
    )


def reviewer_of(assignment) -> list[User]:
    reviewer = assignment.reviewer
    return [reviewer] if reviewer.is_active else []


# --- Creation ---------------------------------------------------------------


def event_key(event_type: str, subject_id, role: str) -> str:
    """``<EVENT>:<subject>:<ROLE>``; the role keeps two actions of one person apart."""
    return f"{event_type}:{subject_id}:{role}"


def notify(
    *,
    recipient: User,
    event_type: str,
    key: str,
    manuscript: Manuscript,
    **payload_fields,
) -> bool:
    """Create the panel notice and its mail twin once; ``False`` if it existed."""
    payload = build_payload(
        manuscript_code=manuscript.code,
        manuscript_title=manuscript.title,
        **payload_fields,
    )
    now = timezone.now()
    try:
        with transaction.atomic():
            _, created = Notification.objects.get_or_create(
                recipient=recipient,
                event_key=key,
                defaults={
                    "event_type": event_type,
                    "manuscript": manuscript,
                    "channel": Notification.Channel.PANEL,
                    "payload": payload,
                    "status": Notification.Status.SENT,
                    "sent_at": now,
                },
            )
            if created:
                Notification.objects.get_or_create(
                    recipient=recipient,
                    event_key=f"{key}{EMAIL_KEY_SUFFIX}",
                    defaults={
                        "event_type": event_type,
                        "manuscript": manuscript,
                        "channel": Notification.Channel.EMAIL,
                        "payload": payload,
                        "status": Notification.Status.PENDING,
                    },
                )
    except IntegrityError:
        # Otro proceso creó el mismo aviso a la vez: el evento ya está notificado.
        return False
    return created


def notify_each(
    recipients: Iterable[User],
    *,
    event_type: str,
    subject_id,
    role: str,
    manuscript: Manuscript,
    **payload_fields,
) -> int:
    """``notify`` every recipient; one failing recipient never blocks the rest."""
    created = 0
    for recipient in recipients:
        try:
            created += notify(
                recipient=recipient,
                event_type=event_type,
                key=event_key(event_type, subject_id, role),
                manuscript=manuscript,
                **payload_fields,
            )
        except Exception:  # noqa: BLE001 - un aviso fallido no revierte la acción de negocio
            logger.exception("No se pudo crear el aviso %s para %s", event_type, recipient.pk)
    return created


# --- Reading ----------------------------------------------------------------


def panel_notices(user: User):
    """The user's own panel notices (the mail twins are not shown)."""
    return Notification.objects.filter(recipient=user, channel=Notification.Channel.PANEL)


def mark_read(notice: Notification) -> Notification:
    if notice.read_at is None:
        notice.read_at = timezone.now()
        notice.save(update_fields=("read_at",))
    return notice


def mark_all_read(user: User) -> int:
    return panel_notices(user).filter(read_at__isnull=True).update(read_at=timezone.now())
