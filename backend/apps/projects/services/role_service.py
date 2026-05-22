"""项目角色服务。"""
from django.db import transaction

from apps.projects.models import Project, ProjectRole


# 内置角色配置
BUILTIN_ROLES = [
    {
        "code": "owner",
        "name": "负责人",
        "permissions": [
            "project.view", "project.update", "project.delete",
            "project.member.manage", "project.role.manage",
            "lot.create", "lot.view", "lot.update", "lot.workflow.operate",
            "tender.view", "tender.upload", "tender.parse",
            "outline.view", "outline.edit",
            "section.view", "section.generate", "section.edit", "section.review",
            "export.create", "export.view",
        ],
        "is_builtin": True,
    },
    {
        "code": "editor",
        "name": "编辑",
        "permissions": [
            "project.view",
            "lot.view", "lot.workflow.operate",
            "tender.view", "tender.upload",
            "outline.view", "outline.edit",
            "section.view", "section.generate", "section.edit",
        ],
        "is_builtin": True,
    },
    {
        "code": "reviewer",
        "name": "评审",
        "permissions": [
            "project.view",
            "lot.view",
            "tender.view",
            "outline.view",
            "section.view", "section.review",
        ],
        "is_builtin": True,
    },
    {
        "code": "viewer",
        "name": "只读",
        "permissions": [
            "project.view",
            "lot.view",
            "tender.view",
            "outline.view",
            "section.view",
            "export.view",
        ],
        "is_builtin": True,
    },
]


class RoleService:
    """项目角色服务。"""

    @staticmethod
    @transaction.atomic
    def initialize_builtin_roles(project: Project, created_by=None) -> list[ProjectRole]:
        """初始化项目的内置角色。

        Args:
            project: 项目实例
            created_by: 创建人

        Returns:
            创建的角色列表
        """
        roles = []
        for role_config in BUILTIN_ROLES:
            role, _ = ProjectRole.objects.get_or_create(
                project=project,
                code=role_config["code"],
                defaults={
                    "name": role_config["name"],
                    "permissions": role_config["permissions"],
                    "is_builtin": role_config["is_builtin"],
                    "created_by": created_by,
                }
            )
            roles.append(role)
        return roles

    @staticmethod
    def get_role_by_code(project: Project, code: str) -> ProjectRole | None:
        """根据 code 获取项目角色。

        Args:
            project: 项目实例
            code: 角色编码

        Returns:
            角色实例或 None
        """
        try:
            return ProjectRole.objects.get(project=project, code=code)
        except ProjectRole.DoesNotExist:
            return None

    @staticmethod
    @transaction.atomic
    def update_role_permissions(role: ProjectRole, permissions: list[str], updated_by=None) -> ProjectRole:
        """更新角色权限。

        Args:
            role: 角色实例
            permissions: 新权限列表
            updated_by: 更新人

        Returns:
            更新后的角色
        """
        role.permissions = permissions
        role.save()
        return role

    @staticmethod
    def can_delete_role(role: ProjectRole) -> bool:
        """检查角色是否可删除。

        Args:
            role: 角色实例

        Returns:
            是否可删除
        """
        # 内置角色不可删除
        if role.is_builtin:
            return False
        # 有成员关联的角色不可删除
        if role.members.exists():
            return False
        return True
