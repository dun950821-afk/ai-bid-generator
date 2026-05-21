import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError

from apps.accounts.models import Permission, Role

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
    Permission.objects.create(
        code="tender.upload", name="上传招标文件", module="tender", scope="project"
    )
    with pytest.raises(IntegrityError):
        Permission.objects.create(
            code="tender.upload", name="重复码", module="tender", scope="project"
        )


@pytest.mark.django_db
def test_permission_defaults_active():
    perm = Permission.objects.create(
        code="project.create", name="创建项目", module="projects", scope="global"
    )
    assert perm.is_active is True
    assert perm.scope == "global"


@pytest.mark.django_db
def test_role_code_is_unique():
    Role.objects.create(code="bid_manager", name="投标经理")
    with pytest.raises(IntegrityError):
        Role.objects.create(code="bid_manager", name="重复码")


@pytest.mark.django_db
def test_role_permissions_m2m_and_user_roles():
    role = Role.objects.create(code="normal_user", name="普通用户", is_system=True)
    perm = Permission.objects.create(
        code="project.view", name="查看项目", module="projects", scope="global"
    )
    role.permissions.add(perm)
    user = User.objects.create_user(username="carol", password="Str0ng-Pass-1")
    user.roles.add(role)
    assert list(user.roles.all()) == [role]
    assert list(role.permissions.all()) == [perm]
