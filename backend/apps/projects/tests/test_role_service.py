"""角色服务测试。"""
import pytest
from apps.projects.services.role_service import RoleService, BUILTIN_ROLES
from apps.projects.models import Project, ProjectRole, ProjectMember


@pytest.mark.django_db
def test_initialize_builtin_roles(project, bid_manager_user):
    """测试初始化内置角色。"""
    roles = RoleService.initialize_builtin_roles(project, created_by=bid_manager_user)

    assert len(roles) == 4
    role_codes = [r.code for r in roles]
    assert "owner" in role_codes
    assert "editor" in role_codes
    assert "reviewer" in role_codes
    assert "viewer" in role_codes

    # 验证角色都有 is_builtin=True
    for role in roles:
        assert role.is_builtin is True


@pytest.mark.django_db
def test_get_role_by_code(project):
    """测试根据 code 获取角色。"""
    RoleService.initialize_builtin_roles(project)

    role = RoleService.get_role_by_code(project, "owner")
    assert role is not None
    assert role.code == "owner"

    # 不存在的 code
    role = RoleService.get_role_by_code(project, "nonexistent")
    assert role is None


@pytest.mark.django_db
def test_update_role_permissions(project, bid_manager_user):
    """测试更新角色权限。"""
    RoleService.initialize_builtin_roles(project)

    role = RoleService.get_role_by_code(project, "editor")
    new_permissions = ["project.view", "lot.view", "custom.permission"]

    updated = RoleService.update_role_permissions(role, new_permissions)

    assert "custom.permission" in updated.permissions


@pytest.mark.django_db
def test_owner_role_auto_merge_core_permissions(project, bid_manager_user):
    """测试更新 owner 角色时自动合并核心权限。"""
    RoleService.initialize_builtin_roles(project)

    role = RoleService.get_role_by_code(project, "owner")
    # 尝试移除核心权限
    new_permissions = ["project.view", "lot.view"]

    updated = RoleService.update_role_permissions(role, new_permissions)

    # 核心权限应被自动保留
    assert "project.update" in updated.permissions
    assert "project.member.manage" in updated.permissions


@pytest.mark.django_db
def test_can_delete_role(project, bid_manager_user):
    """测试角色删除检查。"""
    RoleService.initialize_builtin_roles(project)

    # 内置角色不可删除
    owner_role = RoleService.get_role_by_code(project, "owner")
    assert RoleService.can_delete_role(owner_role) is False

    # 创建自定义角色
    custom_role = ProjectRole.objects.create(
        project=project,
        name="自定义角色",
        code="custom",
        permissions=["project.view"],
        created_by=bid_manager_user,
    )
    assert RoleService.can_delete_role(custom_role) is True

    # 关联成员后不可删除
    ProjectMember.objects.create(
        project=project,
        user=bid_manager_user,
        project_role=custom_role,
    )
    assert RoleService.can_delete_role(custom_role) is False