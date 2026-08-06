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


# ============================================================================
# PATCH /api/auth/me —— 本人资料修改
# ============================================================================


@pytest.mark.django_db
def test_me_patch_updates_profile(api_client, normal_user):
    token = _login(api_client, "normal")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = api_client.patch(
        "/api/auth/me",
        {"real_name": "新名字", "email": "new@example.com", "department": "投标部"},
        format="json",
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["real_name"] == "新名字"
    assert body["email"] == "new@example.com"
    assert body["department"] == "投标部"
    normal_user.refresh_from_db()
    assert normal_user.real_name == "新名字"
    assert normal_user.phone == ""  # 未提交字段不受影响


@pytest.mark.django_db
def test_me_patch_partial_and_blank_ok(api_client, normal_user):
    token = _login(api_client, "normal")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = api_client.patch(
        "/api/auth/me",
        {"real_name": "", "phone": "13800000000"},
        format="json",
    )
    assert resp.status_code == 200
    normal_user.refresh_from_db()
    assert normal_user.real_name == ""
    assert normal_user.phone == "13800000000"


@pytest.mark.django_db
def test_me_patch_rejects_invalid_email(api_client, normal_user):
    token = _login(api_client, "normal")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = api_client.patch(
        "/api/auth/me",
        {"email": "not-an-email"},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_me_patch_cannot_change_username_or_roles(api_client, normal_user):
    token = _login(api_client, "normal")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = api_client.patch(
        "/api/auth/me",
        {"username": "hacker", "is_active": False},
        format="json",
    )
    # 额外字段被忽略，返回 200 且 username 不变
    assert resp.status_code == 200
    normal_user.refresh_from_db()
    assert normal_user.username == "normal"
    assert normal_user.is_active is True


@pytest.mark.django_db
def test_me_patch_requires_authentication(api_client):
    resp = api_client.patch("/api/auth/me", {"real_name": "x"}, format="json")
    assert resp.status_code == 401
