"""项目服务。"""
from django.db import transaction

from apps.projects.models import Project, ProjectMember
from apps.projects.services.role_service import RoleService


class ProjectService:
    """项目服务。"""

    @staticmethod
    @transaction.atomic
    def create_project(*, name, description, created_by, workflow_template_id=None, initial_members=None):
        """创建项目并初始化角色。

        Args:
            name: 项目名称
            description: 项目描述
            created_by: 创建人
            workflow_template_id: 流程模板 ID（可选）
            initial_members: 初始成员列表 [{"user_id": 1, "role_code": "viewer"}, ...]

        Returns:
            创建的项目实例
        """
        # 创建项目
        project = Project.objects.create(
            name=name,
            description=description,
            created_by=created_by,
        )

        # 初始化内置角色
        roles = RoleService.initialize_builtin_roles(project, created_by=created_by)
        role_map = {r.code: r for r in roles}

        # 创建者自动成为 owner
        owner_role = role_map["owner"]
        ProjectMember.objects.create(
            project=project,
            user=created_by,
            project_role=owner_role,
            added_by=created_by,
        )

        # 克隆流程模板到项目（如果指定）
        if workflow_template_id:
            try:
                from apps.workflows.models import WorkflowTemplate
                from apps.workflows.services.template_service import TemplateService

                system_template = WorkflowTemplate.objects.get(
                    pk=workflow_template_id,
                    scope="system",
                    is_active=True,
                )
                TemplateService.clone_template_to_project(
                    system_template, project, created_by=created_by
                )
            except Exception:
                pass  # 模板不存在时忽略

        # 添加初始成员
        if initial_members:
            for member_data in initial_members:
                user_id = member_data.get("user_id")
                role_code = member_data.get("role_code", "viewer")
                role = role_map.get(role_code)
                if role and user_id:
                    from apps.accounts.models import User
                    try:
                        user = User.objects.get(pk=user_id)
                        if user != created_by:  # 避免重复添加创建者
                            ProjectMember.objects.create(
                                project=project,
                                user=user,
                                project_role=role,
                                added_by=created_by,
                            )
                    except User.DoesNotExist:
                        pass

        return project

    @staticmethod
    def get_user_projects(user):
        """获取用户参与的项目列表。

        Args:
            user: 用户实例

        Returns:
            项目 QuerySet
        """
        return Project.objects.filter(members__user=user).distinct()

    @staticmethod
    def is_project_member(user, project):
        """检查用户是否是项目成员。

        Args:
            user: 用户实例
            project: 项目实例

        Returns:
            是否是成员
        """
        return ProjectMember.objects.filter(project=project, user=user).exists()
