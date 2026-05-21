"""登录端点测试（spec §5.2）。"""
import pytest

from apps.accounts.cookies import CSRF_COOKIE_NAME, REFRESH_COOKIE_NAME


@pytest.mark.django_db
def test_login_success_returns_access_and_sets_cookies(api_client, normal_user):
    resp = api_client.post(
        "/api/auth/login",
        {"username": "normal", "password": "Str0ng-Pass-1"},
        format="json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access"]
    assert "refresh" not in body                       # refresh 不进响应体
    assert body["user"]["username"] == "normal"
    assert "global_permissions" in body
    assert "menu_tree" in body
    assert resp.cookies[REFRESH_COOKIE_NAME]["httponly"] is True
    assert resp.cookies[REFRESH_COOKIE_NAME]["path"] == "/api/auth"
    assert not resp.cookies[CSRF_COOKIE_NAME]["httponly"]  # csrf 非 httpOnly


@pytest.mark.django_db
def test_login_wrong_password_returns_401(api_client, normal_user):
    resp = api_client.post(
        "/api/auth/login",
        {"username": "normal", "password": "wrong"},
        format="json",
    )
    assert resp.status_code == 401
    assert resp.json()["code"] == "unauthenticated"


@pytest.mark.django_db
def test_login_locks_account_after_five_failures(api_client, normal_user):
    for _ in range(4):
        api_client.post(
            "/api/auth/login",
            {"username": "normal", "password": "wrong"},
            format="json",
        )
    resp = api_client.post(
        "/api/auth/login",
        {"username": "normal", "password": "wrong"},
        format="json",
    )
    assert resp.status_code == 423
    assert resp.json()["code"] == "account_locked"


@pytest.mark.django_db
def test_login_disabled_account_returns_403(api_client, normal_user):
    normal_user.is_active = False
    normal_user.save(update_fields=["is_active"])
    resp = api_client.post(
        "/api/auth/login",
        {"username": "normal", "password": "Str0ng-Pass-1"},
        format="json",
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "account_disabled"


@pytest.mark.django_db
def test_login_missing_field_returns_400(api_client):
    resp = api_client.post("/api/auth/login", {"username": "x"}, format="json")
    assert resp.status_code == 400
