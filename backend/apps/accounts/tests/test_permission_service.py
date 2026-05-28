import pytest

from apps.accounts.services import permission_service as ps
from apps.projects.models import ProjectMember


@pytest.mark.django_db
def test_is_system_admin(admin_user, normal_user):
    assert ps.is_system_admin(admin_user) is True
    assert ps.is_system_admin(normal_user) is False


@pytest.mark.django_db
def test_is_system_admin_false_for_anonymous():
    from django.contrib.auth.models import AnonymousUser

    assert ps.is_system_admin(AnonymousUser()) is False


@pytest.mark.django_db
def test_global_permission_from_role(bid_manager_user, normal_user):
    assert ps.has_global_permission(bid_manager_user, "project.create") is True
    assert ps.has_global_permission(normal_user, "project.create") is False


@pytest.mark.django_db
def test_system_admin_passes_any_global_permission(admin_user):
    assert ps.has_global_permission(admin_user, "user.manage") is True
    assert ps.has_global_permission(admin_user, "project.create") is True


@pytest.mark.django_db
def test_get_global_permissions_admin_returns_all(admin_user):
    from apps.accounts.models import Permission

    expected = set(
        Permission.objects.filter(scope="global", is_active=True).values_list(
            "code", flat=True
        )
    )
    assert ps.get_global_permissions(admin_user) == expected


@pytest.mark.django_db
def test_get_global_permissions_bid_manager(bid_manager_user):
    assert ps.get_global_permissions(bid_manager_user) == {"project.create"}


@pytest.mark.django_db
def test_project_permission_for_member(normal_user, project):
    from apps.projects.services.role_service import RoleService

    roles = RoleService.initialize_builtin_roles(project)
    editor_role = next(r for r in roles if r.code == "editor")
    ProjectMember.objects.create(
        project=project, user=normal_user, project_role=editor_role
    )
    assert ps.has_project_permission(normal_user, project, "section.edit") is True
    assert ps.has_project_permission(normal_user, project, "project.view") is True


@pytest.mark.django_db
def test_project_permission_denied_for_non_member(normal_user, project):
    """非项目成员 → 无任何项目权限（spec §6）。"""
    assert ps.has_project_permission(normal_user, project, "project.view") is False
    assert ps.get_project_permissions(normal_user, project) == set()


@pytest.mark.django_db
def test_project_role_limits_permissions(normal_user, project):
    """viewer 只读，无 section.edit。"""
    from apps.projects.services.role_service import RoleService

    roles = RoleService.initialize_builtin_roles(project)
    viewer_role = next(r for r in roles if r.code == "viewer")
    ProjectMember.objects.create(
        project=project, user=normal_user, project_role=viewer_role
    )
    assert ps.has_project_permission(normal_user, project, "section.view") is True
    assert ps.has_project_permission(normal_user, project, "section.edit") is False


@pytest.mark.django_db
def test_system_admin_accesses_any_project_without_membership(admin_user, project):
    """system_admin 不要求 ProjectMember 关系（附录 A #12）。"""
    assert ps.has_project_permission(admin_user, project, "section.review") is True
    assert ps.has_project_permission(admin_user, project, "export.create") is True
