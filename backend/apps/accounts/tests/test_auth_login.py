"""登录端点测试（spec §5.2）。"""
import pytest

from apps.accounts.cookies import CSRF_COOKIE_NAME, REFRESH_COOKIE_NAME
from apps.accounts.services import captcha_service, login_throttle


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


@pytest.mark.django_db
def test_login_ip_throttled_blocks_before_credentials_check(api_client, normal_user):
    """L1：同 IP 在窗口内失败 ≥20 次后，任何 username 都直接 429 ip_throttled。"""
    for i in range(login_throttle.IP_RATE_LIMIT):
        login_throttle.record_failure(f"victim_{i}", "127.0.0.1")

    # 正确凭据也应被 L1 拦下，证明这层在认证之前。
    resp = api_client.post(
        "/api/auth/login",
        {"username": "normal", "password": "Str0ng-Pass-1"},
        format="json",
    )
    assert resp.status_code == 429
    assert resp.json()["code"] == "ip_throttled"


@pytest.mark.django_db
def test_login_demands_captcha_when_l3_tripped_across_ips(api_client, normal_user):
    """L3：同 username 跨 IP 累计 ≥10 次失败后，下一次登录必须先过 captcha。

    用合成 IP 触发 L3，避免触发 L2（每个 IP 只算 1 次），然后用测试客户端
    默认的 127.0.0.1 发请求 —— L2 在该 pair 上仍是 0，L1 也未到 20，唯
    一被拦的只能是 L3。
    """
    for i in range(login_throttle.CAPTCHA_THRESHOLD):
        login_throttle.record_failure("normal", f"10.0.0.{i}")

    resp = api_client.post(
        "/api/auth/login",
        {"username": "normal", "password": "Str0ng-Pass-1"},
        format="json",
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "captcha_required"


@pytest.mark.django_db
def test_login_with_invalid_captcha_returns_captcha_invalid(api_client, normal_user):
    for i in range(login_throttle.CAPTCHA_THRESHOLD):
        login_throttle.record_failure("normal", f"10.0.0.{i}")

    resp = api_client.post(
        "/api/auth/login",
        {
            "username": "normal",
            "password": "Str0ng-Pass-1",
            "captcha_token": "not-a-real-token",
            "captcha_answer": "1",
        },
        format="json",
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "captcha_invalid"


@pytest.mark.django_db
def test_login_with_valid_captcha_succeeds_after_l3(api_client, normal_user):
    for i in range(login_throttle.CAPTCHA_THRESHOLD):
        login_throttle.record_failure("normal", f"10.0.0.{i}")

    captcha = captcha_service.generate()
    q = captcha["question"]
    a, b = [int(x) for x in q.replace(" = ?", "").split(" + ")]

    resp = api_client.post(
        "/api/auth/login",
        {
            "username": "normal",
            "password": "Str0ng-Pass-1",
            "captcha_token": captcha["captcha_token"],
            "captcha_answer": str(a + b),
        },
        format="json",
    )
    assert resp.status_code == 200


@pytest.mark.django_db
def test_login_without_captcha_required_ignores_captcha_fields(api_client, normal_user):
    """captcha_token 字段是可选的：未触发 L3 时即便不带也应正常登录。"""
    resp = api_client.post(
        "/api/auth/login",
        {"username": "normal", "password": "Str0ng-Pass-1"},
        format="json",
    )
    assert resp.status_code == 200


@pytest.mark.django_db
def test_captcha_endpoint_returns_token_and_question(api_client):
    resp = api_client.get("/api/auth/captcha")
    assert resp.status_code == 200
    body = resp.json()
    assert "captcha_token" in body
    assert body["question"].endswith(" = ?")
