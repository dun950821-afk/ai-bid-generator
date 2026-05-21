import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError

from apps.accounts.models import AuthIdentity, Permission, Role

User = get_user_model()


@pytest.mark.django_db
def test_create_user_has_custom_fields():
    user = User.objects.create_user(
        username="alice",
        password="Str0ng-Pass-1",
        real_name="爱丽丝",
        phone="13800000000",
        department="投标部",
    )
    assert user.real_name == "爱丽丝"
    assert user.phone == "13800000000"
    assert user.department == "投标部"
    assert user.must_change_password is False
    assert user.is_active is True
    assert user.created_at is not None
    assert user.updated_at is not None


@pytest.mark.django_db
def test_must_change_password_can_be_set():
    user = User.objects.create_user(username="bob", password="Str0ng-Pass-1")
    user.must_change_password = True
    user.save(update_fields=["must_change_password"])
    user.refresh_from_db()
    assert user.must_change_password is True


@pytest.mark.django_db
def test_permission_code_is_unique():
    # 用注册表外的码，避免与 0005 种子数据撞码
    Permission.objects.create(
        code="sample.uniq", name="样例权限", module="sample", scope="project"
    )
    with pytest.raises(IntegrityError):
        Permission.objects.create(
            code="sample.uniq", name="重复码", module="sample", scope="project"
        )


@pytest.mark.django_db
def test_permission_defaults_active():
    perm = Permission.objects.create(
        code="sample.active", name="样例权限", module="sample", scope="global"
    )
    assert perm.is_active is True
    assert perm.scope == "global"


@pytest.mark.django_db
def test_role_code_is_unique():
    Role.objects.create(code="sample_role_a", name="样例角色 A")
    with pytest.raises(IntegrityError):
        Role.objects.create(code="sample_role_a", name="重复码")


@pytest.mark.django_db
def test_role_permissions_m2m_and_user_roles():
    role = Role.objects.create(code="sample_role_b", name="样例角色 B", is_system=True)
    perm = Permission.objects.create(
        code="sample.view", name="样例权限", module="sample", scope="global"
    )
    role.permissions.add(perm)
    user = User.objects.create_user(username="carol", password="Str0ng-Pass-1")
    user.roles.add(role)
    assert list(user.roles.all()) == [role]
    assert list(role.permissions.all()) == [perm]


@pytest.mark.django_db
def test_authidentity_unique_provider_external_id():
    user1 = User.objects.create_user(username="dave", password="Str0ng-Pass-1")
    user2 = User.objects.create_user(username="erin", password="Str0ng-Pass-1")
    AuthIdentity.objects.create(user=user1, provider="ldap", external_id="ext-1")
    with pytest.raises(IntegrityError):
        AuthIdentity.objects.create(user=user2, provider="ldap", external_id="ext-1")
