import pytest

from apps.accounts.models import Permission
from apps.accounts.services import permission_service as ps
from apps.projects.models import ProjectMember


@pytest.mark.django_db
def test_unknown_code_is_denied(normal_user):
    assert ps.has_permission(normal_user, "nonexistent.code") is False


@pytest.mark.django_db
def test_inactive_permission_is_denied(bid_manager_user):
    Permission.objects.filter(code="project.create").update(is_active=False)
    assert ps.has_permission(bid_manager_user, "project.create") is False


@pytest.mark.django_db
def test_scope_mismatch_is_denied(bid_manager_user):
    """project.create 是 global；声明 required_scope=project → 拒绝。"""
    assert (
        ps.has_permission(
            bid_manager_user, "project.create", required_scope="project"
        )
        is False
    )


@pytest.mark.django_db
def test_global_dispatch(bid_manager_user, normal_user):
    assert ps.has_permission(bid_manager_user, "project.create") is True
    assert ps.has_permission(normal_user, "project.create") is False


@pytest.mark.django_db
def test_project_dispatch_requires_project(normal_user, project):
    ProjectMember.objects.create(
        project=project, user=normal_user, project_role="editor"
    )
    # project scope 权限码但未传 project → 拒绝
    assert ps.has_permission(normal_user, "section.edit") is False
    # 传 project → 正常判定
    assert ps.has_permission(normal_user, "section.edit", project=project) is True


@pytest.mark.django_db
def test_project_dispatch_with_required_scope(normal_user, project):
    ProjectMember.objects.create(
        project=project, user=normal_user, project_role="viewer"
    )
    assert (
        ps.has_permission(
            normal_user, "section.view", project=project, required_scope="project"
        )
        is True
    )
