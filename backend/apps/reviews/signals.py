"""Domain events of the reviews app.

They are sent AFTER the transaction commits, never inside it: a
receiver can fail or be slow without undoing the assignment it reacts
to. The notifications app subscribes to them (TSK-75); reviews knows
nothing about who listens. Receivers get identifiers only and build
their own sanitized payloads: the free text of a report or a reason is
left out on purpose.
"""

from __future__ import annotations

import logging

from django.dispatch import Signal

logger = logging.getLogger(__name__)

#: The system assigned a reviewer to a version slot. Args: ``assignment_id``,
#: ``manuscript_id``, ``reviewer_id``.
assignment_created = Signal()

#: The first assignment of a version moved the manuscript to ``UNDER_REVIEW``.
#: Args: ``manuscript_id``, ``version_id``.
review_started = Signal()

#: A required slot of a version has no eligible reviewer yet (once per slot).
#: Args: ``manuscript_id``, ``version_id``, ``slot``.
slot_unfilled = Signal()

#: An assignment was released without penalty (conflict of interest, incident
#: resolution, anonymized version or withdrawal of the manuscript). Args:
#: ``assignment_id``, ``manuscript_id``, ``reviewer_id``, ``cause`` (a
#: ``Assignment.ReleaseCause`` value).
assignment_revoked = Signal()

#: The deadline passed without a final evaluation: the system expired the
#: assignment and subtracted points. Sent once per assignment. Args:
#: ``assignment_id``, ``manuscript_id``, ``reviewer_id``.
assignment_expired = Signal()

#: A reviewer submitted the final evaluation and the assignment became
#: ``COMPLETED``. Args: ``evaluation_id``, ``assignment_id``,
#: ``manuscript_id``, ``reviewer_id``.
evaluation_submitted = Signal()

#: Two final evaluations disagreed (one rejects, the other does not) and the
#: manuscript moved to ``TIE_BREAKER``. The notice carries no opinions.
#: Args: ``manuscript_id``, ``version_id``.
tie_break_started = Signal()

#: A reviewer filed a confidential incident report. The administrator is
#: told; the payload carries no author data and not the free text. Args:
#: ``incident_id``, ``assignment_id``, ``manuscript_id``, ``report_type``.
incident_reported = Signal()

#: The administrator resolved an incident. For ``REQUEST_ANONYMIZED_VERSION``
#: the author is asked for an anonymized version: that notice must never
#: mention the report nor the reviewer. Args: ``incident_id``,
#: ``assignment_id``, ``manuscript_id``, ``resolution``,
#: ``correction_round_id`` (or ``None``).
incident_resolved = Signal()


def announce(signal: Signal, **kwargs) -> None:
    """Send ``signal`` robustly: a failing receiver is logged, never raised."""
    for receiver, error in signal.send_robust(sender=None, **kwargs):
        if isinstance(error, Exception):
            logger.error("Un receptor de %s falló (%s): %s", signal, receiver, error)
