"""ProjectRole 模型测试。"""
import pytest
from apps.projects.models import ProjectRole, Project


@pytest.mark.django_db
def test_project_role_creation(project, bid_manager_user):
    """测试角色创建。"""
    role = ProjectRole.objects.create(
        project=project,
        name="自定义角色",
        code="custom_role",
        permissions=["project.view", "lot.view"],
        created_by=bid_manager_user,
    )
    assert role.id is not None
    assert role.permissions == ["project.view", "lot.view"]


@pytest.mark.django_db
def test_owner_role_auto_merge_core_permissions(project, bid_manager_user):
    """测试 owner 角色自动合并核心权限。"""
    role = ProjectRole.objects.create(
        project=project,
        name="负责人",
        code="owner",
        permissions=["project.view"],  # 故意缺少核心权限
        is_builtin=True,
        created_by=bid_manager_user,
    )
    # 保存后应自动合并核心权限
    assert "project.update" in role.permissions
    assert "project.member.manage" in role.permissions


@pytest.mark.django_db
def test_unique_constraint(project):
    """测试项目内 code 唯一约束。"""
    ProjectRole.objects.create(
        project=project,
        name="角色A",
        code="role_a",
        permissions=[],
    )
    with pytest.raises(Exception):  # IntegrityError
        ProjectRole.objects.create(
            project=project,
            name="角色B",
            code="role_a",  # 重复 code
            permissions=[],
        )


@pytest.mark.django_db
def test_non_owner_role_no_auto_merge(project, bid_manager_user):
    """测试非 owner 角色不会自动合并核心权限。"""
    role = ProjectRole.objects.create(
        project=project,
        name="编辑",
        code="editor",
        permissions=["project.view", "lot.view"],
        is_builtin=True,
        created_by=bid_manager_user,
    )
    # 非 owner 角色，权限不应被修改
    assert role.permissions == ["project.view", "lot.view"]
