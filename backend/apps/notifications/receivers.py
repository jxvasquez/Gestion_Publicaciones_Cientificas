"""Receivers of the domain signals (TSK-75, closes D-10b).

Each receiver gets identifiers only, reads what it needs from the
database and writes notices whose payload comes from
:func:`~apps.notifications.payloads.build_payload`: the event, the public
code and title of the manuscript, the action expected, the deadline and a
SPA link. That is what keeps the double blind (plan section 2.9):

* the notices for a reviewer never include an author, and the ones for an
  author never include a reviewer, because no receiver puts a person in a
  payload at all;
* the free text of an incident, a verdict or an evaluation (justification,
  observations, comments) is never read here, and the notice that opens the
  tie-break carries no opinions;
* the notice for the author of an incident resolved with
  ``REQUEST_ANONYMIZED_VERSION`` talks about the manuscript, never about
  the report or whoever filed it.

All of them run after the business transaction committed and are sent
with ``send_robust``: a failure here is logged and never undoes the action.
"""

from __future__ import annotations

from django.dispatch import receiver

from apps.notifications.services import (
    admins_for,
    authors_of,
    notify_each,
    reviewer_of,
)
from apps.publications.models import Manuscript, Verdict
from apps.publications.signals import (
    manuscript_submitted,
    manuscript_withdrawn,
    new_version_submitted,
    verdict_registered,
)
from apps.reviews.models import Assignment, IncidentReport
from apps.reviews.signals import (
    assignment_created,
    assignment_expired,
    assignment_revoked,
    incident_reported,
    incident_resolved,
    review_started,
    slot_unfilled,
    tie_break_started,
)
from apps.users.models import Role

AUTHOR, ADMIN, REVIEWER = Role.Code.AUTHOR, Role.Code.ADMIN, Role.Code.REVIEWER

REVIEWER_ASSIGNMENTS_LINK = "/app/reviewer/assignments"

#: Message to the reviewer for each cause of a release without penalty.
RELEASE_MESSAGES = {
    Assignment.ReleaseCause.MANUSCRIPT_WITHDRAWN: (
        "El manuscrito fue dado de baja y su asignación se canceló."
    ),
    Assignment.ReleaseCause.CONFLICT_OF_INTEREST: (
        "Su asignación se liberó por el conflicto de interés declarado, sin penalización."
    ),
    Assignment.ReleaseCause.INCIDENT_REASSIGN: (
        "Su asignación se liberó tras resolverse un reporte, sin penalización."
    ),
    Assignment.ReleaseCause.ANONYMIZATION_REQUESTED: (
        "Su asignación se liberó porque se solicitó una versión anonimizada, sin penalización."
    ),
}
DEFAULT_RELEASE_MESSAGE = "Su asignación de revisión fue liberada, sin penalización."


def _manuscript(manuscript_id) -> Manuscript:
    return Manuscript.objects.get(pk=manuscript_id)


def _assignment(assignment_id) -> Assignment:
    return Assignment.objects.select_related("manuscript", "reviewer").get(pk=assignment_id)


def _author_link(manuscript: Manuscript) -> str:
    return f"/app/author/manuscripts/{manuscript.pk}"


def _reviewer_link(assignment: Assignment) -> str:
    return f"/app/reviewer/assignments/{assignment.pk}"


@receiver(manuscript_submitted, dispatch_uid="notifications-manuscript-submitted")
def on_manuscript_submitted(sender, manuscript_id, version_id, **kwargs) -> None:
    manuscript = _manuscript(manuscript_id)
    notify_each(
        authors_of(manuscript),
        event_type="MANUSCRIPT_SUBMITTED",
        subject_id=version_id,
        role=AUTHOR,
        manuscript=manuscript,
        title="Manuscrito enviado",
        message="Su manuscrito fue enviado. El sistema asignará revisores de su carrera.",
        action=None,
        link=_author_link(manuscript),
    )


@receiver(new_version_submitted, dispatch_uid="notifications-new-version-submitted")
def on_new_version_submitted(sender, manuscript_id, version_id, **kwargs) -> None:
    manuscript = _manuscript(manuscript_id)
    notify_each(
        authors_of(manuscript),
        event_type="NEW_VERSION_SUBMITTED",
        subject_id=version_id,
        role=AUTHOR,
        manuscript=manuscript,
        title="Nueva versión enviada",
        message="Su nueva versión fue recibida y vuelve a la revisión.",
        link=_author_link(manuscript),
    )


@receiver(review_started, dispatch_uid="notifications-review-started")
def on_review_started(sender, manuscript_id, version_id, **kwargs) -> None:
    manuscript = _manuscript(manuscript_id)
    notify_each(
        authors_of(manuscript),
        event_type="REVIEW_STARTED",
        subject_id=version_id,
        role=AUTHOR,
        manuscript=manuscript,
        title="Revisión iniciada",
        message="Su manuscrito ya está en revisión.",
        link=_author_link(manuscript),
    )


@receiver(slot_unfilled, dispatch_uid="notifications-slot-unfilled")
def on_slot_unfilled(sender, manuscript_id, version_id, slot, **kwargs) -> None:
    # Un solo aviso por cupo: el `event_key` es `SLOT_UNFILLED:<versión>:<cupo>:ADMIN`.
    manuscript = _manuscript(manuscript_id)
    notify_each(
        admins_for(manuscript),
        event_type="SLOT_UNFILLED",
        subject_id=f"{version_id}:{slot}",
        role=ADMIN,
        manuscript=manuscript,
        title="Cupo de revisión sin revisor",
        message="No hay revisores elegibles de la carrera del manuscrito para un cupo.",
        action="Revise el padrón de revisores y sus carreras.",
        link="/app/admin/reviewers",
    )


@receiver(tie_break_started, dispatch_uid="notifications-tie-break-started")
def on_tie_break_started(sender, manuscript_id, version_id, **kwargs) -> None:
    # El aviso no dice qué opinó cada revisor: solo que se suma un tercero.
    manuscript = _manuscript(manuscript_id)
    notify_each(
        authors_of(manuscript),
        event_type="TIE_BREAK_STARTED",
        subject_id=version_id,
        role=AUTHOR,
        manuscript=manuscript,
        title="Manuscrito en desempate",
        message="Un tercer revisor evaluará el manuscrito para completar la decisión.",
        link=_author_link(manuscript),
    )


@receiver(verdict_registered, dispatch_uid="notifications-verdict-registered")
def on_verdict_registered(
    sender, manuscript_id, verdict_id, decision, previous_verdict_id=None, **kwargs
) -> None:
    manuscript = _manuscript(manuscript_id)
    changes = (
        "Se solicitan cambios",
        "Los revisores solicitaron cambios a su manuscrito.",
        "Revise los comentarios y envíe una nueva versión.",
    )
    messages = {
        Verdict.Decision.ACCEPTED: (
            "Manuscrito aceptado",
            "Su manuscrito fue aceptado y se publicará en el catálogo.",
            None,
        ),
        Verdict.Decision.REJECTED: (
            "Manuscrito rechazado",
            "El proceso de revisión del manuscrito concluyó con su rechazo.",
            None,
        ),
        Verdict.Decision.CHANGES_REQUESTED: changes,
        Verdict.Decision.REQUIRES_CORRECTIONS: changes,
    }
    title, message, action = messages[decision]
    if previous_verdict_id is not None:
        # Corrección de un Administrador: la nueva decisión sustituye a la anterior.
        title = f"Decisión corregida: {title.lower()}"
        message = f"Un Administrador corrigió la decisión sobre el manuscrito. {message}"
    notify_each(
        authors_of(manuscript),
        event_type="VERDICT_REGISTERED",
        subject_id=verdict_id,
        role=AUTHOR,
        manuscript=manuscript,
        title=title,
        message=message,
        action=action,
        link=_author_link(manuscript),
    )


@receiver(manuscript_withdrawn, dispatch_uid="notifications-manuscript-withdrawn")
def on_manuscript_withdrawn(
    sender, manuscript_id, withdrawn_by_id, previous_status, **kwargs
) -> None:
    manuscript = _manuscript(manuscript_id)
    notify_each(
        authors_of(manuscript, exclude_ids=[withdrawn_by_id]),
        event_type="MANUSCRIPT_WITHDRAWN",
        subject_id=manuscript.pk,
        role=AUTHOR,
        manuscript=manuscript,
        title="Manuscrito dado de baja",
        message="El manuscrito fue dado de baja.",
        link=_author_link(manuscript),
    )


@receiver(assignment_created, dispatch_uid="notifications-assignment-created")
def on_assignment_created(sender, assignment_id, **kwargs) -> None:
    assignment = _assignment(assignment_id)
    notify_each(
        reviewer_of(assignment),
        event_type="ASSIGNMENT_CREATED",
        subject_id=assignment.pk,
        role=REVIEWER,
        manuscript=assignment.manuscript,
        title="Nueva asignación de revisión",
        message="Se le asignó un manuscrito para evaluar.",
        action="Evalúe el manuscrito antes de la fecha límite.",
        due_at=assignment.due_at,
        link=_reviewer_link(assignment),
    )


@receiver(assignment_revoked, dispatch_uid="notifications-assignment-revoked")
def on_assignment_revoked(sender, assignment_id, cause, **kwargs) -> None:
    assignment = _assignment(assignment_id)
    notify_each(
        reviewer_of(assignment),
        event_type="ASSIGNMENT_REVOKED",
        subject_id=assignment.pk,
        role=REVIEWER,
        manuscript=assignment.manuscript,
        title="Asignación liberada",
        message=RELEASE_MESSAGES.get(cause, DEFAULT_RELEASE_MESSAGE),
        link=REVIEWER_ASSIGNMENTS_LINK,
    )


@receiver(assignment_expired, dispatch_uid="notifications-assignment-expired")
def on_assignment_expired(sender, assignment_id, **kwargs) -> None:
    assignment = _assignment(assignment_id)
    notify_each(
        reviewer_of(assignment),
        event_type="ASSIGNMENT_EXPIRED",
        subject_id=assignment.pk,
        role=REVIEWER,
        manuscript=assignment.manuscript,
        title="Plazo de revisión vencido",
        message=(
            "El plazo venció sin evaluación final: la asignación se revocó "
            "y se restaron 20 puntos de su ranking."
        ),
        due_at=assignment.due_at,
        link=REVIEWER_ASSIGNMENTS_LINK,
    )


@receiver(incident_reported, dispatch_uid="notifications-incident-reported")
def on_incident_reported(sender, incident_id, assignment_id, **kwargs) -> None:
    assignment = _assignment(assignment_id)
    notify_each(
        admins_for(assignment.manuscript),
        event_type="INCIDENT_REPORTED",
        subject_id=incident_id,
        role=ADMIN,
        manuscript=assignment.manuscript,
        title="Reporte confidencial recibido",
        message="Se registró un reporte confidencial sobre el manuscrito.",
        action="Revise y resuelva el reporte.",
        link="/app/admin/incidents",
    )


@receiver(incident_resolved, dispatch_uid="notifications-incident-resolved")
def on_incident_resolved(sender, incident_id, manuscript_id, resolution, **kwargs) -> None:
    # Solo se avisa al Autor cuando se le pide una versión anonimizada; el aviso
    # habla del manuscrito, nunca del reporte ni de quien lo presentó.
    if resolution != IncidentReport.Resolution.REQUEST_ANONYMIZED_VERSION:
        return
    manuscript = _manuscript(manuscript_id)
    notify_each(
        authors_of(manuscript),
        event_type="ANONYMIZED_VERSION_REQUESTED",
        subject_id=incident_id,
        role=AUTHOR,
        manuscript=manuscript,
        title="Se solicita una versión anonimizada",
        message="Se solicita una versión anonimizada del manuscrito.",
        action="Envíe una nueva versión sin datos que identifiquen a los autores.",
        link=_author_link(manuscript),
    )
