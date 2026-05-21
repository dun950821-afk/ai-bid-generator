"""角色权限 scope 校验测试（spec §4.2.3、附录 A #11）。"""
import pytest

from apps.accounts.models import Permission, Role
from apps.accounts.services import role_service
from apps.common.exceptions import ValidationError


@pytest.mark.django_db
def test_set_role_permissions_accepts_global():
    role = Role.objects.get(code="bid_manager")
    perms = list(Permission.objects.filter(code="audit.view"))
    role_service.set_role_permissions(role, perms)
    assert set(role.permissions.values_list("code", flat=True)) == {"audit.view"}


@pytest.mark.django_db
def test_set_role_permissions_rejects_project_scope():
    role = Role.objects.get(code="bid_manager")
    perms = list(Permission.objects.filter(code="section.edit"))
    with pytest.raises(ValidationError):
        role_service.set_role_permissions(role, perms)


@pytest.mark.django_db
def test_set_role_permissions_rejects_system_admin():
    role = Role.objects.get(code="system_admin")
    with pytest.raises(ValidationError):
        role_service.set_role_permissions(role, [])


@pytest.mark.django_db
def test_role_admin_form_rejects_project_permission():
    from apps.accounts.admin import RoleAdminForm

    role = Role.objects.get(code="bid_manager")
    section_edit = Permission.objects.get(code="section.edit")
    form = RoleAdminForm(
        data={
            "code": role.code,
            "name": role.name,
            "description": "",
            "is_system": role.is_system,
            "permissions": [section_edit.pk],
        },
        instance=role,
    )
    assert not form.is_valid()
    assert "permissions" in form.errors
