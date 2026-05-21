import pytest

from apps.accounts.models import Role


@pytest.mark.django_db
def test_builtin_roles_seeded():
    codes = set(Role.objects.values_list("code", flat=True))
    assert {"system_admin", "bid_manager", "normal_user"}.issubset(codes)


@pytest.mark.django_db
def test_builtin_roles_are_system():
    for code in ["system_admin", "bid_manager", "normal_user"]:
        assert Role.objects.get(code=code).is_system is True


@pytest.mark.django_db
def test_bid_manager_bound_to_project_create():
    role = Role.objects.get(code="bid_manager")
    assert set(role.permissions.values_list("code", flat=True)) == {"project.create"}


@pytest.mark.django_db
def test_system_admin_has_no_explicit_permissions():
    """system_admin 不绑定具体权限，全部权限由 permission_service 直通。"""
    assert Role.objects.get(code="system_admin").permissions.count() == 0


@pytest.mark.django_db
def test_normal_user_has_no_global_permissions():
    assert Role.objects.get(code="normal_user").permissions.count() == 0
