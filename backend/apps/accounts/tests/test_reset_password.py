"""管理员重置密码端点测试（spec §5.7）。"""
import pytest


def _login(api_client, username):
    resp = api_client.post(
        "/api/auth/login",
        {"username": username, "password": "Str0ng-Pass-1"},
        format="json",
    )
    return resp.json()["access"]


@pytest.mark.django_db
def test_admin_can_reset_user_password(api_client, admin_user, normal_user):
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(api_client, 'sysadmin')}")
    resp = api_client.post(
        f"/api/users/{normal_user.id}/reset-password", {}, format="json"
    )
    assert resp.status_code == 200
    temp_password = resp.json()["temporary_password"]
    normal_user.refresh_from_db()
    assert normal_user.must_change_password is True
    assert normal_user.check_password(temp_password)


@pytest.mark.django_db
def test_non_admin_cannot_reset_password(api_client, bid_manager_user, normal_user):
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(api_client, 'manager')}")
    resp = api_client.post(
        f"/api/users/{normal_user.id}/reset-password", {}, format="json"
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "permission_denied"


@pytest.mark.django_db
def test_reset_password_unknown_user_returns_404(api_client, admin_user):
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {_login(api_client, 'sysadmin')}")
    resp = api_client.post("/api/users/999999/reset-password", {}, format="json")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_reset_password_requires_authentication(api_client, normal_user):
    resp = api_client.post(
        f"/api/users/{normal_user.id}/reset-password", {}, format="json"
    )
    assert resp.status_code == 401
