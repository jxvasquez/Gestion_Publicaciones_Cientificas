"""URL configuration of the administrator incident and reviewer endpoints (spec 004)."""

from django.urls import path

from apps.reviews.admin_views import (
    AdminIncidentDocumentView,
    AdminIncidentListView,
    AdminIncidentResolveView,
    AdminReviewerDetailView,
    AdminReviewerListView,
)

urlpatterns = [
    path("incidents/", AdminIncidentListView.as_view(), name="admin-incident-list"),
    path(
        "incidents/<uuid:pk>/resolve/",
        AdminIncidentResolveView.as_view(),
        name="admin-incident-resolve",
    ),
    path(
        "incidents/<uuid:pk>/document/",
        AdminIncidentDocumentView.as_view(),
        name="admin-incident-document",
    ),
    path("reviewers/", AdminReviewerListView.as_view(), name="admin-reviewer-list"),
    path(
        "reviewers/<uuid:user_id>/",
        AdminReviewerDetailView.as_view(),
        name="admin-reviewer-detail",
    ),
]
