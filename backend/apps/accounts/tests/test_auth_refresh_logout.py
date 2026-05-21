"""刷新与登出端点测试（spec §5.3）。"""
import pytest

from apps.accounts.cookies import CSRF_COOKIE_NAME, REFRESH_COOKIE_NAME


def _login(api_client):
    return api_client.post(
        "/api/auth/login",
        {"username": "normal", "password": "Str0ng-Pass-1"},
        format="json",
    )


@pytest.mark.django_db
def test_refresh_rotates_tokens(api_client, normal_user):
    login = _login(api_client)
    csrf = login.cookies[CSRF_COOKIE_NAME].value
    old_refresh = login.cookies[REFRESH_COOKIE_NAME].value

    resp = api_client.post(
        "/api/auth/refresh", {}, format="json", HTTP_X_CSRF_TOKEN=csrf
    )
    assert resp.status_code == 200
    assert resp.json()["access"]
    assert resp.cookies[REFRESH_COOKIE_NAME].value != old_refresh


@pytest.mark.django_db
def test_refresh_without_csrf_header_rejected(api_client, normal_user):
    _login(api_client)
    resp = api_client.post("/api/auth/refresh", {}, format="json")
    assert resp.status_code == 401
    assert resp.json()["code"] == "token_invalid"


@pytest.mark.django_db
def test_logout_returns_204_and_clears_cookie(api_client, normal_user):
    login = _login(api_client)
    csrf = login.cookies[CSRF_COOKIE_NAME].value
    resp = api_client.post(
        "/api/auth/logout", {}, format="json", HTTP_X_CSRF_TOKEN=csrf
    )
    assert resp.status_code == 204
    assert resp.cookies[REFRESH_COOKIE_NAME]["max-age"] == 0


@pytest.mark.django_db
def test_logout_blacklists_refresh_token(api_client, normal_user):
    login = _login(api_client)
    csrf = login.cookies[CSRF_COOKIE_NAME].value
    old_refresh = login.cookies[REFRESH_COOKIE_NAME].value

    logout = api_client.post(
        "/api/auth/logout", {}, format="json", HTTP_X_CSRF_TOKEN=csrf
    )
    assert logout.status_code == 204

    # 用登出前的 refresh token 再刷新——应被黑名单拦截
    api_client.cookies[REFRESH_COOKIE_NAME] = old_refresh
    api_client.cookies[CSRF_COOKIE_NAME] = csrf
    resp = api_client.post(
        "/api/auth/refresh", {}, format="json", HTTP_X_CSRF_TOKEN=csrf
    )
    assert resp.status_code == 401
