import pytest

from apps.accounts.models import Permission
from apps.accounts.permissions_registry import PERMISSION_REGISTRY, apply_registry


@pytest.mark.django_db
def test_seed_migration_loaded_all_registry_codes():
    """0005 数据迁移应已把注册表全部权限码写入库。"""
    db_codes = set(Permission.objects.values_list("code", flat=True))
    registry_codes = {code for code, _, _, _ in PERMISSION_REGISTRY}
    assert registry_codes.issubset(db_codes)


@pytest.mark.django_db
def test_registry_scopes_are_valid():
    for code, name, module, scope in PERMISSION_REGISTRY:
        assert scope in ("global", "project"), code


@pytest.mark.django_db
def test_apply_registry_is_idempotent():
    before = Permission.objects.count()
    apply_registry(Permission)
    assert Permission.objects.count() == before


@pytest.mark.django_db
def test_apply_registry_deactivates_unknown_code():
    Permission.objects.create(
        code="legacy.removed", name="已废弃", module="legacy", scope="global"
    )
    apply_registry(Permission)
    assert Permission.objects.get(code="legacy.removed").is_active is False
