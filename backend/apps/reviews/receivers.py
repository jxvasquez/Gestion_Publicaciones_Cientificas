"""Receivers of other apps' events that act on assignments."""

from __future__ import annotations

from django.dispatch import receiver

from apps.publications.signals import manuscript_withdrawing
from apps.reviews.services.assignments import release_on_withdrawal


@receiver(manuscript_withdrawing, dispatch_uid="reviews-release-on-withdrawal")
def release_assignments_on_withdrawal(sender, manuscript_id, withdrawn_by_id, **kwargs) -> None:
    """Withdrawing a manuscript releases its active assignments (plan section 4.8).

    The signal is sent with ``Signal.send`` inside the withdrawal's
    transaction, so a failure here aborts the whole withdrawal.
    """
    release_on_withdrawal(manuscript_id=manuscript_id, withdrawn_by_id=withdrawn_by_id)
