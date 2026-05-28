import pytest

from apps.accounts.models import Permission, Role
from apps.accounts.services import permission_service as ps
from apps.projects.models import ProjectMember


@pytest.mark.django_db
def test_role_permission_change_invalidates_global_cache(normal_user):
    assert ps.has_global_permission(normal_user, "project.create") is False
    Role.objects.get(code="normal_user").permissions.add(
        Permission.objects.get(code="project.create")
    )
    assert ps.has_global_permission(normal_user, "project.create") is True


@pytest.mark.django_db
def test_user_role_change_invalidates_global_cache(normal_user):
    assert ps.has_global_permission(normal_user, "project.create") is False
    normal_user.roles.add(Role.objects.get(code="bid_manager"))
    assert ps.has_global_permission(normal_user, "project.create") is True


@pytest.mark.django_db
def test_member_create_invalidates_project_cache(normal_user, project):
    from apps.projects.services.role_service import RoleService

    assert ps.has_project_permission(normal_user, project, "project.view") is False
    roles = RoleService.initialize_builtin_roles(project)
    viewer_role = next(r for r in roles if r.code == "viewer")
    ProjectMember.objects.create(
        project=project, user=normal_user, project_role=viewer_role
    )
    assert ps.has_project_permission(normal_user, project, "project.view") is True


@pytest.mark.django_db
def test_member_delete_invalidates_project_cache(normal_user, project):
    from apps.projects.services.role_service import RoleService

    roles = RoleService.initialize_builtin_roles(project)
    viewer_role = next(r for r in roles if r.code == "viewer")
    member = ProjectMember.objects.create(
        project=project, user=normal_user, project_role=viewer_role
    )
    assert ps.has_project_permission(normal_user, project, "project.view") is True
    member.delete()
    assert ps.has_project_permission(normal_user, project, "project.view") is False
