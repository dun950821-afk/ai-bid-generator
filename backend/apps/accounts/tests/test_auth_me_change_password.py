"""me 与 change-password 端点测试（spec §5.2、§5.7）。"""
import pytest


def _login(api_client, username, password="Str0ng-Pass-1"):
    resp = api_client.post(
        "/api/auth/login",
        {"username": username, "password": password},
        format="json",
    )
    return resp.json()["access"]


@pytest.mark.django_db
def test_me_returns_profile_and_permissions(api_client, bid_manager_user):
    token = _login(api_client, "manager")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = api_client.get("/api/auth/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["user"]["username"] == "manager"
    assert body["global_permissions"] == ["project.create"]
    assert any(
        item["key"] == "dashboard"
        for group in body["menu_tree"]
        for item in group["items"]
    )


@pytest.mark.django_db
def test_me_requires_authentication(api_client):
    resp = api_client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_change_password_succeeds_and_clears_flag(api_client, normal_user):
    normal_user.must_change_password = True
    normal_user.save(update_fields=["must_change_password"])
    token = _login(api_client, "normal")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = api_client.post(
        "/api/auth/change-password",
        {"old_password": "Str0ng-Pass-1", "new_password": "Even-Str0nger-2"},
        format="json",
    )
    assert resp.status_code == 200
    normal_user.refresh_from_db()
    assert normal_user.must_change_password is False
    assert normal_user.check_password("Even-Str0nger-2")


@pytest.mark.django_db
def test_change_password_rejects_wrong_old_password(api_client, normal_user):
    token = _login(api_client, "normal")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = api_client.post(
        "/api/auth/change-password",
        {"old_password": "wrong-pass", "new_password": "Even-Str0nger-2"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_change_password_rejects_weak_new_password(api_client, normal_user):
    token = _login(api_client, "normal")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = api_client.post(
        "/api/auth/change-password",
        {"old_password": "Str0ng-Pass-1", "new_password": "123"},
        format="json",
    )
    assert resp.status_code == 400
