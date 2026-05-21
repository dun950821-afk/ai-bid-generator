"""MustChangePasswordPermission 测试（spec §5.7）。"""
import pytest

from apps.accounts.permissions import MustChangePasswordPermission
from apps.common.exceptions import MustChangePassword


class _PlainView:
    pass


class _ExemptView:
    must_change_password_exempt = True


def _request(user):
    return type("R", (), {"user": user})()


@pytest.mark.django_db
def test_blocks_user_with_must_change_password(normal_user):
    normal_user.must_change_password = True
    perm = MustChangePasswordPermission()
    with pytest.raises(MustChangePassword):
        perm.has_permission(_request(normal_user), _PlainView())


@pytest.mark.django_db
def test_allows_exempt_view(normal_user):
    normal_user.must_change_password = True
    perm = MustChangePasswordPermission()
    assert perm.has_permission(_request(normal_user), _ExemptView()) is True


@pytest.mark.django_db
def test_allows_user_without_flag(normal_user):
    perm = MustChangePasswordPermission()
    assert perm.has_permission(_request(normal_user), _PlainView()) is True


@pytest.mark.django_db
def test_me_endpoint_still_reachable_when_flag_set(api_client, normal_user):
    """全局接入后，me 仍因豁免而可访问。"""
    normal_user.must_change_password = True
    normal_user.save(update_fields=["must_change_password"])
    login = api_client.post(
        "/api/auth/login",
        {"username": "normal", "password": "Str0ng-Pass-1"},
        format="json",
    )
    token = login.json()["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    assert api_client.get("/api/auth/me").status_code == 200
