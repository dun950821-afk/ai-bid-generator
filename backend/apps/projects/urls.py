"""projects 应用 API 路由。"""
from django.urls import path

from apps.projects.views import MyProjectPermissionsView

app_name = "projects"

urlpatterns = [
    path(
        "projects/<int:project_id>/my-permissions",
        MyProjectPermissionsView.as_view(),
        name="my-permissions",
    ),
]
