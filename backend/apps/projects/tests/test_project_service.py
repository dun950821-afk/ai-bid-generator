"""项目服务测试。"""
import pytest
from apps.projects.services.project_service import ProjectService
from apps.projects.models import Project, ProjectMember
from apps.projects.services.role_service import RoleService


@pytest.mark.django_db
def test_create_project_with_owner(bid_manager_user):
    """测试创建项目，创建者自动成为 owner。"""
    project = ProjectService.create_project(
        name="测试项目",
        description="测试描述",
        created_by=bid_manager_user,
    )

    assert project.id is not None
    assert project.name == "测试项目"

    # 验证角色初始化
    assert project.roles.count() == 4

    # 验证创建者是 owner
    member = ProjectMember.objects.get(project=project, user=bid_manager_user)
    assert member.project_role.code == "owner"


@pytest.mark.django_db
def test_create_project_with_initial_members(bid_manager_user):
    """测试创建项目并添加初始成员。"""
    from apps.accounts.models import User
    member1 = User.objects.create_user(username="member1", password="pass")
    member2 = User.objects.create_user(username="member2", password="pass")

    project = ProjectService.create_project(
        name="测试项目",
        description="",
        created_by=bid_manager_user,
        initial_members=[
            {"user_id": member1.id, "role_code": "editor"},
            {"user_id": member2.id, "role_code": "viewer"},
        ],
    )

    # 验证成员数量（创建者 + 2 个初始成员）
    assert project.members.count() == 3

    # 验证成员角色
    m1 = ProjectMember.objects.get(project=project, user=member1)
    assert m1.project_role.code == "editor"

    m2 = ProjectMember.objects.get(project=project, user=member2)
    assert m2.project_role.code == "viewer"


@pytest.mark.django_db
def test_get_user_projects(bid_manager_user, project):
    """测试获取用户参与的项目列表。"""
    # 用户创建的项目
    roles = RoleService.initialize_builtin_roles(project)
    owner_role = next(r for r in roles if r.code == "owner")
    ProjectMember.objects.create(project=project, user=bid_manager_user, project_role=owner_role)

    # 用户不是成员的项目
    from apps.accounts.models import User
    other_user = User.objects.create_user(username="other", password="pass")
    p2 = Project.objects.create(name="其他项目", created_by=other_user)
    RoleService.initialize_builtin_roles(p2)

    projects = ProjectService.get_user_projects(bid_manager_user)
    assert projects.count() == 1
    assert project in projects
    assert p2 not in projects


@pytest.mark.django_db
def test_is_project_member(bid_manager_user, project):
    """测试检查用户是否是项目成员。"""
    roles = RoleService.initialize_builtin_roles(project)
    owner_role = next(r for r in roles if r.code == "owner")

    # 未添加成员
    assert ProjectService.is_project_member(bid_manager_user, project) is False

    # 添加成员后
    ProjectMember.objects.create(project=project, user=bid_manager_user, project_role=owner_role)
    assert ProjectService.is_project_member(bid_manager_user, project) is True