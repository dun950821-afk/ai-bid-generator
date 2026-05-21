"""认证 Provider 测试（spec §5.1）。"""
import pytest

from apps.accounts.auth import exceptions as auth_exc
from apps.accounts.auth.password import PasswordAuthProvider
from apps.accounts.auth.registry import get_provider


@pytest.mark.django_db
def test_password_provider_returns_user_on_valid_credentials(normal_user):
    provider = PasswordAuthProvider()
    user = provider.authenticate(
        {"username": "normal", "password": "Str0ng-Pass-1"}
    )
    assert user == normal_user


@pytest.mark.django_db
def test_password_provider_rejects_wrong_password(normal_user):
    provider = PasswordAuthProvider()
    with pytest.raises(auth_exc.InvalidCredentials):
        provider.authenticate({"username": "normal", "password": "wrong"})


@pytest.mark.django_db
def test_password_provider_rejects_unknown_username():
    provider = PasswordAuthProvider()
    with pytest.raises(auth_exc.InvalidCredentials):
        provider.authenticate({"username": "ghost", "password": "whatever"})


@pytest.mark.django_db
def test_password_provider_rejects_blank_credentials():
    provider = PasswordAuthProvider()
    with pytest.raises(auth_exc.InvalidCredentials):
        provider.authenticate({"username": "", "password": ""})


@pytest.mark.django_db
def test_password_provider_accepts_disabled_user(normal_user):
    """Provider 不做 is_active 校验：停用账号也能换出 User，由 login_service 拦截。"""
    normal_user.is_active = False
    normal_user.save(update_fields=["is_active"])
    provider = PasswordAuthProvider()
    user = provider.authenticate(
        {"username": "normal", "password": "Str0ng-Pass-1"}
    )
    assert user == normal_user


def test_get_provider_returns_password_provider():
    assert isinstance(get_provider("password"), PasswordAuthProvider)


def test_get_provider_unknown_code_raises():
    with pytest.raises(auth_exc.ProviderUnavailable):
        get_provider("saml")
