"""项目个人权限查询端点测试（spec §4.5、§5.7）。"""
import pytest


def _login(api_client, username):
    resp = api_client.post(
        "/api/auth/login",
        {"username": username, "password": "Str0ng-Pass-1"},
        format="json",
    )
    return resp.json()["access"]


@pytest.mark.django_db
def test_member_sees_role_permissions(api_client, normal_user, project):
    from apps.projects.models import ProjectMember

    ProjectMember.objects.create(
        project=project, user=normal_user, project_role="viewer"
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(api_client, 'normal')}")
    resp = api_client.get(f"/api/projects/{project.id}/my-permissions")
    assert resp.status_code == 200
    perms = resp.json()["permissions"]
    assert "section.view" in perms       # viewer 含查看类权限
    assert "section.edit" not in perms   # viewer 不含编辑类权限


@pytest.mark.django_db
def test_non_member_gets_empty_permissions(api_client, normal_user, project):
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(api_client, 'normal')}")
    resp = api_client.get(f"/api/projects/{project.id}/my-permissions")
    assert resp.status_code == 200
    assert resp.json()["permissions"] == []


@pytest.mark.django_db
def test_unknown_project_returns_404(api_client, normal_user):
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(api_client, 'normal')}")
    resp = api_client.get("/api/projects/999999/my-permissions")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_blocked_when_must_change_password(api_client, normal_user, project):
    normal_user.must_change_password = True
    normal_user.save(update_fields=["must_change_password"])
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(api_client, 'normal')}")
    resp = api_client.get(f"/api/projects/{project.id}/my-permissions")
    assert resp.status_code == 403
    assert resp.json()["code"] == "must_change_password"
