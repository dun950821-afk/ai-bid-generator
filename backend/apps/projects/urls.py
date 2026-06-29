"""projects 应用 API 路由。"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.projects.views.permission_views import MyProjectPermissionsView
from apps.projects.views.project_views import ProjectViewSet
from apps.projects.views.role_views import ProjectRoleViewSet
from apps.projects.views.member_views import ProjectMemberViewSet
from apps.projects.views.lot_views import LotDetailView, LotWorkflowView, LotWorkflowStartView
from apps.projects.views.workbench_views import LotWorkbenchStatusView

router = DefaultRouter()
router.register(r"projects", ProjectViewSet, basename="project")

app_name = "projects"

urlpatterns = [
    path("", include(router.urls)),
    # 项目权限查询
    path(
        "projects/<int:project_id>/my-permissions",
        MyProjectPermissionsView.as_view(),
        name="my-permissions",
    ),
    # 项目角色管理
    path(
        "projects/<int:project_pk>/roles/",
        ProjectRoleViewSet.as_view({"get": "list", "post": "create"}),
        name="project-roles",
    ),
    path(
        "projects/<int:project_pk>/roles/<int:pk>/",
        ProjectRoleViewSet.as_view({
            "get": "retrieve",
            "put": "update",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="project-role-detail",
    ),
    # 项目成员管理
    path(
        "projects/<int:project_pk>/members/",
        ProjectMemberViewSet.as_view({"get": "list", "post": "create"}),
        name="project-members",
    ),
    path(
        "projects/<int:project_pk>/members/<int:pk>/",
        ProjectMemberViewSet.as_view({
            "get": "retrieve",
            "put": "update",
            "patch": "partial_update",
            "delete": "destroy",
        }),
        name="project-member-detail",
    ),
    path(
        "projects/<int:project_pk>/members/batch/",
        ProjectMemberViewSet.as_view({"post": "batch"}),
        name="project-members-batch",
    ),
    # 标段管理
    path(
        "lots/<int:pk>/",
        LotDetailView.as_view(),
        name="lot-detail",
    ),
    path(
        "lots/<int:pk>/workflow/",
        LotWorkflowView.as_view(),
        name="lot-workflow",
    ),
    path(
        "lots/<int:pk>/workflow/start/",
        LotWorkflowStartView.as_view(),
        name="lot-workflow-start",
    ),
    path(
        "lots/<int:pk>/workbench_status/",
        LotWorkbenchStatusView.as_view(),
        name="lot-workbench-status",
    ),
]