"""RequirePermission 权限类测试（spec §4.5）。"""
import pytest
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework.views import APIView

from apps.accounts.permissions import RequirePermission


class _GlobalView(APIView):
    permission_classes = [RequirePermission]
    required_permission = "user.manage"
    required_scope = "global"

    def get(self, request):
        return Response({"ok": True})


class _ProjectView(APIView):
    permission_classes = [RequirePermission]
    required_permission = "section.edit"
    required_scope = "project"

    def get(self, request, project_id=None):
        return Response({"ok": True})


def _authed_get(user):
    request = APIRequestFactory().get("/x")
    force_authenticate(request, user=user)
    return request


@pytest.mark.django_db
def test_allows_user_with_global_permission(admin_user):
    response = _GlobalView.as_view()(_authed_get(admin_user))
    assert response.status_code == 200


@pytest.mark.django_db
def test_denies_user_without_global_permission(normal_user):
    response = _GlobalView.as_view()(_authed_get(normal_user))
    assert response.status_code == 403
    assert response.data["code"] == "permission_denied"


@pytest.mark.django_db
def test_allows_project_member_via_url_kwarg(normal_user, project):
    from apps.projects.models import ProjectMember

    ProjectMember.objects.create(
        project=project, user=normal_user, project_role="editor"
    )
    response = _ProjectView.as_view()(
        _authed_get(normal_user), project_id=project.id
    )
    assert response.status_code == 200


@pytest.mark.django_db
def test_denies_when_project_unresolvable(normal_user):
    response = _ProjectView.as_view()(_authed_get(normal_user))
    assert response.status_code == 403
