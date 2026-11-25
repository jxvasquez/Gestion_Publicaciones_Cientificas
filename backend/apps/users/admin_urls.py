"""URL configuration of the administrator career catalog (spec 004)."""

from django.urls import path

from apps.users.admin_views import AdminAreaDetailView, AdminAreaListView

urlpatterns = [
    path("", AdminAreaListView.as_view(), name="admin-area-list"),
    path("<slug:code>/", AdminAreaDetailView.as_view(), name="admin-area-detail"),
]
