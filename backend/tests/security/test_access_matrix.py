"""Access matrix of the whole API (TSK-89, plan sections 6.2 and 6.3).

Every route of the ``/api/`` URLconf is classified here by *module role* and by
*object scope*, and the test runs it against every kind of actor:

* no credentials  -> ``401``;
* signed in but without the module's role (including the Administrator on the
  manuscript, evaluation and PDF routes) -> ``403``;
* the module's role, but an object that is not theirs -> ``404``, the same
  answer as an object that does not exist;
* in scope -> anything but ``401``/``403``/``404`` (the body is empty on
  purpose, so a ``400`` or ``409`` is the expected, harmless answer).

``test_every_route_is_classified`` fails when somebody adds an endpoint without
classifying it, so the matrix cannot silently go stale.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

import pytest
from django.urls import get_resolver
from rest_framework.test import APIClient
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.notifications.models import Notification
from apps.publications.models import Verdict
from apps.reviews.models import Evaluation, IncidentReport
from apps.users.models import UserRole
from tests.factories import UserRoleFactory
from tests.phase5 import AUTHOR_TOKENS, EVALUATION, REVIEWER_TOKENS, Lifecycle
from tests.publications.test_manuscript_api import actor, client_for
from tests.publications.test_submission import media_root, seeded_roles, submit  # noqa: F401
from tests.reviews.support import make_reviewer

pytestmark = pytest.mark.django_db

ANONYMOUS, OWNER, OTHER_AUTHOR, ASSIGNED, OTHER_REVIEWER, ADMIN, NO_ROLE = (
    "anonymous", "owner", "other_author", "assigned", "other_reviewer", "admin", "no_role",
)
ACTORS = (ANONYMOUS, OWNER, OTHER_AUTHOR, ASSIGNED, OTHER_REVIEWER, ADMIN, NO_ROLE)
ROLE_OF = {
    OWNER: "AUTHOR", OTHER_AUTHOR: "AUTHOR", ASSIGNED: "REVIEWER",
    OTHER_REVIEWER: "REVIEWER", ADMIN: "ADMIN", NO_ROLE: None,
}
PUBLIC, AUTHENTICATED = "PUBLIC", "AUTHENTICATED"


@dataclass(frozen=True)
class Rule:
    """Who may call a route: ``module`` roles and, for an object route, ``scope`` actors."""

    module: tuple[str, ...] | str
    scope: tuple[str, ...] | None = None
    obj: str | None = None  # key of the world's objects that fills <uuid:pk>


AUTHOR_ONLY = Rule(("AUTHOR",), (OWNER,), "manuscript")
REVIEWER_OBJECT = Rule(("REVIEWER",), (ASSIGNED,), "assignment")

#: (method, route) -> rule. Routes are written as the URLconf spells them.
MATRIX: dict[tuple[str, str], Rule] = {
    ("GET", "api/v1/admin/audit/"): Rule(("ADMIN",)),
    ("GET", "api/v1/admin/audit/<uuid:pk>/"): Rule(("ADMIN",), None, "audit"),
    ("POST", "api/v1/admin/verdicts/<uuid:pk>/correct/"): Rule(("ADMIN",), None, "verdict"),
    ("GET", "api/v1/admin/incidents/"): Rule(("ADMIN",)),
    ("POST", "api/v1/admin/incidents/<uuid:pk>/resolve/"): Rule(("ADMIN",), None, "incident"),
    ("GET", "api/v1/admin/incidents/<uuid:pk>/document/"): Rule(("ADMIN",), None, "incident"),
    ("GET", "api/v1/admin/reviewers/"): Rule(("ADMIN",)),
    ("PATCH", "api/v1/admin/reviewers/<uuid:user_id>/"): Rule(("ADMIN",)),
    ("GET", "api/v1/admin/areas/"): Rule(("ADMIN",)),
    ("POST", "api/v1/admin/areas/"): Rule(("ADMIN",)),
    ("PATCH", "api/v1/admin/areas/<slug:code>/"): Rule(("ADMIN",)),
    ("GET", "api/v1/areas/"): Rule(PUBLIC),
    ("POST", "api/v1/auth/logout/"): Rule(AUTHENTICATED),
    ("GET", "api/v1/auth/me/"): Rule(AUTHENTICATED),
    ("GET", "api/v1/catalog/"): Rule(PUBLIC),
    ("GET", "api/v1/catalog/<str:code>/"): Rule(PUBLIC),
    ("GET", "api/v1/catalog/<str:code>/document/"): Rule(PUBLIC),
    ("GET", "api/v1/dashboard/"): Rule(AUTHENTICATED),
    ("GET", "api/v1/manuscripts/"): Rule(("AUTHOR",)),
    ("POST", "api/v1/manuscripts/"): Rule(("AUTHOR",)),
    ("GET", "api/v1/manuscripts/<uuid:pk>/"): AUTHOR_ONLY,
    ("PATCH", "api/v1/manuscripts/<uuid:pk>/"): AUTHOR_ONLY,
    ("POST", "api/v1/manuscripts/<uuid:pk>/draft-file/"): AUTHOR_ONLY,
    ("GET", "api/v1/manuscripts/<uuid:pk>/history/"): AUTHOR_ONLY,
    ("POST", "api/v1/manuscripts/<uuid:pk>/submit/"): AUTHOR_ONLY,
    ("GET", "api/v1/manuscripts/<uuid:pk>/versions/"): AUTHOR_ONLY,
    ("POST", "api/v1/manuscripts/<uuid:pk>/versions/"): AUTHOR_ONLY,
    ("GET", "api/v1/manuscripts/<uuid:pk>/versions/<uuid:version_id>/file/"): AUTHOR_ONLY,
    ("POST", "api/v1/manuscripts/<uuid:pk>/withdraw/"): AUTHOR_ONLY,
    ("GET", "api/v1/notifications/"): Rule(AUTHENTICATED),
    ("PATCH", "api/v1/notifications/<uuid:pk>/read/"): Rule(AUTHENTICATED, (OWNER,), "notification"),
    ("POST", "api/v1/notifications/read-all/"): Rule(AUTHENTICATED),
    ("GET", "api/v1/reviewer/assignments/"): Rule(("REVIEWER",)),
    ("GET", "api/v1/reviewer/assignments/<uuid:pk>/"): REVIEWER_OBJECT,
    ("POST", "api/v1/reviewer/assignments/<uuid:pk>/conflict/"): REVIEWER_OBJECT,
    ("GET", "api/v1/reviewer/assignments/<uuid:pk>/document/"): REVIEWER_OBJECT,
    ("GET", "api/v1/reviewer/assignments/<uuid:pk>/evaluation/"): REVIEWER_OBJECT,
    ("PUT", "api/v1/reviewer/assignments/<uuid:pk>/evaluation/"): REVIEWER_OBJECT,
    ("POST", "api/v1/reviewer/assignments/<uuid:pk>/evaluation/submit/"): REVIEWER_OBJECT,
    ("POST", "api/v1/reviewer/assignments/<uuid:pk>/identity-leak/"): REVIEWER_OBJECT,
    ("GET", "api/v1/reviewer/standing/"): Rule(("REVIEWER",)),
    ("GET", "api/v1/reviewer/standing/adjustments/"): Rule(("REVIEWER",)),
    ("GET", "api/v1/reviewer/evaluations/"): Rule(("REVIEWER",)),
    ("GET", "api/v1/reviewer/evaluations/<uuid:pk>/"): Rule(("REVIEWER",), (ASSIGNED,), "evaluation"),
}

#: Routes that are open by design and carry their own tests.
OUTSIDE_THE_MATRIX = {
    # Públicas por diseño: el inicio de sesión, su renovación, el health y la raíz de la API.
    "api/v1/auth/login/",
    "api/v1/auth/refresh/",
    "api/v1/health/",
    "api/v1/",
    # Documentación de la API (solo existe con API_DOCS_ENABLED): describe, no expone datos.
    "api/v1/schema/",
    "api/v1/schema.json",
    "api/v1/docs/",
    # Alias sin versión del health que usan Docker y los scripts de operación.
    "api/health/",
}


def declared_routes() -> set[tuple[str, str]]:
    found: set[tuple[str, str]] = set()

    def walk(patterns, prefix: str = "") -> None:
        for pattern in patterns:
            if hasattr(pattern, "url_patterns"):
                walk(pattern.url_patterns, prefix + str(pattern.pattern))
                continue
            view = getattr(pattern.callback, "cls", None) or getattr(pattern.callback, "view_class", None)
            if view and issubclass(view, APIView):
                route = prefix + str(pattern.pattern)
                if route.startswith("api/") and route not in OUTSIDE_THE_MATRIX:
                    for method in view.http_method_names:
                        if method not in ("options", "head") and hasattr(view, method):
                            found.add((method.upper(), route))

    walk(get_resolver().url_patterns)
    return found


# ---------------------------------------------------------------------------
# The world: one accepted article, one manuscript in review, foreign people
# ---------------------------------------------------------------------------
@dataclass
class World:
    flow: Lifecycle
    other_author: object
    other_reviewer: object
    objects: dict

    def client(self, label: str) -> APIClient:
        users = {
            OWNER: self.flow.author, OTHER_AUTHOR: self.other_author, ASSIGNED: self.flow.reviewer,
            OTHER_REVIEWER: self.other_reviewer, ADMIN: self.flow.admin,
        }
        if label == ANONYMOUS:
            return APIClient()
        return client_for(users.get(label) or self.no_role)

    def url(self, route: str, *, pk: str | None = None) -> str:
        values = {
            "<uuid:pk>": pk,
            "<uuid:version_id>": self.objects["version"],
            "<uuid:user_id>": self.objects["reviewer_user"],
            "<slug:code>": self.objects["area_code"],
            "<str:code>": self.objects["code"],
        }
        for placeholder, value in values.items():
            route = route.replace(placeholder, str(value))
        return "/" + route


@pytest.fixture
def world(django_capture_on_commit_callbacks, submit, media_root) -> World:  # noqa: F811
    flow = Lifecycle.create(django_capture_on_commit_callbacks, submit)
    accepted = flow.accepted()
    verdict = Verdict.objects.get(manuscript=accepted)
    final_evaluation = Evaluation.objects.get(
        assignment__manuscript=accepted, reviewer=flow.reviewer, status=Evaluation.Status.FINAL
    )
    notification = Notification.objects.filter(recipient=flow.author, channel="PANEL").first()

    in_review = flow.submit_manuscript()
    assignment = flow.assignment_of(flow.reviewer)
    client_for(flow.reviewer).put(
        f"/api/v1/reviewer/assignments/{assignment.pk}/evaluation/", EVALUATION, format="json", HTTP_IF_MATCH='"0"'
    )
    reported = client_for(flow.reviewer).post(
        f"/api/v1/reviewer/assignments/{assignment.pk}/identity-leak/",
        {"report_type": "IDENTITY_LEAK", "description": "El PDF menciona al grupo de investigación."},
        format="json",
    )
    assert reported.status_code in (200, 201), reported.content

    world = World(
        flow=flow,
        other_author=actor("AUTHOR", first_name="Otra", last_name="Persona", email="otra.persona@unl.edu.ec"),
        other_reviewer=make_reviewer(first_name="Otro", last_name="Revisor", email="otro.revisor@unl.edu.ec"),
        objects={
            "manuscript": in_review.pk, "assignment": assignment.pk, "code": accepted.code,
            "version": in_review.versions.first().pk, "verdict": verdict.pk,
            "evaluation": final_evaluation.pk, "notification": notification.pk,
            "incident": IncidentReport.objects.get(assignment=assignment).pk,
            "audit": AuditLog.objects.order_by("-id").first().event_id,
            "reviewer_user": flow.reviewer.pk, "area_code": "agronomia",
        },
    )
    world.no_role = actor()
    return world


def expected_denial(label: str, rule: Rule) -> int | None:
    """The status a denied actor must get, or ``None`` when the actor is allowed in."""
    if rule.module == PUBLIC:
        return None
    if label == ANONYMOUS:
        return 401
    if rule.module == AUTHENTICATED:
        denied_by_scope = rule.scope is not None and label not in rule.scope
        return 404 if denied_by_scope else None
    if ROLE_OF[label] not in rule.module:
        return 403
    if rule.scope is not None and label not in rule.scope:
        return 404
    return None


def call(client: APIClient, method: str, url: str):
    return getattr(client, method.lower())(url, {}, format="json")


class TestEveryRouteIsClassified:
    def test_every_route_is_classified(self) -> None:
        declared = declared_routes()
        assert declared - set(MATRIX) == set(), "rutas nuevas sin clasificar en la matriz de acceso"
        assert set(MATRIX) - declared == set(), "la matriz clasifica rutas que ya no existen"


class TestAccessMatrix:
    @pytest.mark.parametrize("label", ACTORS)
    def test_each_actor_gets_exactly_the_planned_answer(self, world, label) -> None:
        mismatches = []
        for (method, route), rule in sorted(MATRIX.items()):
            url = world.url(route, pk=world.objects.get(rule.obj) if rule.obj else None)
            status = call(world.client(label), method, url).status_code
            denial = expected_denial(label, rule)
            ok = status == denial if denial else status not in (401, 403, 404)
            if not ok:
                mismatches.append(f"{method} {route}: esperaba {denial or 'acceso'}, obtuvo {status}")
        assert not mismatches, f"{label}:\n" + "\n".join(mismatches)



class TestForeignAndMissingObjectsAreIndistinguishable:
    #: Routes where somebody holds the module's role yet the object is not theirs.
    OBJECT_ROUTES = sorted(
        (method, route) for (method, route), rule in MATRIX.items()
        if rule.scope is not None
    )

    @staticmethod
    def envelope(response) -> dict:
        body = response.json()["error"]
        return {key: value for key, value in body.items() if key != "request_id"}

    @pytest.mark.parametrize("method,route", OBJECT_ROUTES)
    def test_a_foreign_object_answers_like_one_that_does_not_exist(self, world, method, route) -> None:
        rule = MATRIX[(method, route)]
        foreign = OTHER_REVIEWER if rule.module == ("REVIEWER",) else OTHER_AUTHOR
        client = world.client(foreign)
        real = call(client, method, world.url(route, pk=world.objects[rule.obj]))
        missing = call(client, method, world.url(route, pk=uuid4()))
        assert real.status_code == missing.status_code == 404
        assert self.envelope(real) == self.envelope(missing)








