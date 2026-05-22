"""项目权限服务测试。"""
import pytest
from django.core.cache import cache
from apps.accounts.services import permission_service
from apps.projects.models import ProjectMember
from apps.projects.services.role_service import RoleService


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_has_project_permission_with_dynamic_role(project, bid_manager_user):
    """测试项目权限检查（动态角色）。"""
    # 初始化角色并添加成员
    roles = RoleService.initialize_builtin_roles(project)
    editor_role = next(r for r in roles if r.code == "editor")

    ProjectMember.objects.create(
        project=project,
        user=bid_manager_user,
        project_role=editor_role,
    )

    # 检查权限
    assert permission_service.has_project_permission(bid_manager_user, project, "project.view") is True
    assert permission_service.has_project_permission(bid_manager_user, project, "project.update") is False


@pytest.mark.django_db
def test_permission_cache_invalidation(project, bid_manager_user):
    """测试权限缓存失效。"""
    roles = RoleService.initialize_builtin_roles(project)
    editor_role = next(r for r in roles if r.code == "editor")
    owner_role = next(r for r in roles if r.code == "owner")

    member = ProjectMember.objects.create(
        project=project,
        user=bid_manager_user,
        project_role=editor_role,
    )

    # 首次查询，写入缓存
    permission_service.has_project_permission(bid_manager_user, project, "project.view")

    # 修改角色
    member.project_role = owner_role
    member.save()

    # 失效缓存
    permission_service.invalidate_user_project_permission_cache(project.id, bid_manager_user.id)

    # 再次查询应使用新权限
    assert permission_service.has_project_permission(bid_manager_user, project, "project.update") is True


@pytest.mark.django_db
def test_invalidate_project_role_cache(project, bid_manager_user):
    """测试批量失效角色关联用户缓存。"""
    from apps.accounts.models import User
    user2 = User.objects.create_user(username="user2", password="pass")

    roles = RoleService.initialize_builtin_roles(project)
    editor_role = next(r for r in roles if r.code == "editor")

    # 两个用户都是 editor
    ProjectMember.objects.create(project=project, user=bid_manager_user, project_role=editor_role)
    ProjectMember.objects.create(project=project, user=user2, project_role=editor_role)

    # 写入缓存
    permission_service.has_project_permission(bid_manager_user, project, "project.view")
    permission_service.has_project_permission(user2, project, "project.view")

    # 修改角色权限
    editor_role.permissions = ["project.view", "custom.permission"]
    editor_role.save()

    # 批量失效
    permission_service.invalidate_project_role_cache(project.id, editor_role.id)

    # 缓存应被清除
    cache_key1 = f"perm:project:user:{bid_manager_user.id}:project:{project.id}"
    cache_key2 = f"perm:project:user:{user2.id}:project:{project.id}"
    assert cache.get(cache_key1) is None
    assert cache.get(cache_key2) is None