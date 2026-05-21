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
    assert ps.has_project_permission(normal_user, project, "project.view") is False
    ProjectMember.objects.create(
        project=project, user=normal_user, project_role="viewer"
    )
    assert ps.has_project_permission(normal_user, project, "project.view") is True


@pytest.mark.django_db
def test_member_delete_invalidates_project_cache(normal_user, project):
    member = ProjectMember.objects.create(
        project=project, user=normal_user, project_role="viewer"
    )
    assert ps.has_project_permission(normal_user, project, "project.view") is True
    member.delete()
    assert ps.has_project_permission(normal_user, project, "project.view") is False
