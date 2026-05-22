from apps.accounts.permissions_registry import PERMISSION_REGISTRY
from apps.projects.permissions import PROJECT_ROLE_PERMISSIONS
from apps.projects.services.role_service import BUILTIN_ROLES


def test_builtin_roles_match_static_permissions():
    """验证 BUILTIN_ROLES 与静态映射一致。"""
    for role_config in BUILTIN_ROLES:
        code = role_config["code"]
        if code in PROJECT_ROLE_PERMISSIONS:
            # 验证权限集合一致（静态映射可能不完整）
            assert set(role_config["permissions"]).issuperset(PROJECT_ROLE_PERMISSIONS[code])


def test_owner_can_manage_members():
    assert "project.member.manage" in PROJECT_ROLE_PERMISSIONS["owner"]


def test_viewer_is_read_only():
    assert PROJECT_ROLE_PERMISSIONS["viewer"] == {
        "project.view", "tender.view", "outline.view",
        "section.view", "export.view",
    }


def test_all_mapped_codes_are_registered_project_scope():
    """映射里出现的每个权限码都必须是注册表中的 project 权限。"""
    project_codes = {
        code for code, _, _, scope in PERMISSION_REGISTRY if scope == "project"
    }
    for role, codes in PROJECT_ROLE_PERMISSIONS.items():
        assert codes.issubset(project_codes), f"{role} 含未注册/非 project 权限码"
