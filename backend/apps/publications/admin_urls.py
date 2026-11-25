"""URL configuration of the administrator verdict endpoints (plan section 2.7)."""

from django.urls import path

from apps.publications.admin_views import CorrectVerdictView

urlpatterns = [
    path(
        "<uuid:pk>/correct/",
        CorrectVerdictView.as_view(),
        name="admin-verdict-correct",
    ),
]
