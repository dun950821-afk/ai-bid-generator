from apps.accounts.permissions_registry import PERMISSION_REGISTRY
from apps.projects.models import ProjectMember
from apps.projects.permissions import PROJECT_ROLE_PERMISSIONS


def test_role_keys_match_projectmember_choices():
    role_codes = {code for code, _ in ProjectMember.ROLE_CHOICES}
    assert set(PROJECT_ROLE_PERMISSIONS.keys()) == role_codes


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
