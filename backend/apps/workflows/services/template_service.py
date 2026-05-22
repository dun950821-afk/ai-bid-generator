"""流程模板服务。"""
from django.db import transaction
from apps.workflows.models import WorkflowTemplate, WorkflowNodeTemplate


# 系统预设模板配置
SYSTEM_TEMPLATES = [
    {
        "name": "工程类投标",
        "description": "适用于工程类投标项目，包含完整的招标文件解析、标书生成、审核流程。",
        "nodes": [
            {"name": "上传招标文件", "order": 1, "default_assignee_role": "editor"},
            {"name": "解析招标文件", "order": 2, "default_assignee_role": "editor"},
            {"name": "确认标段信息", "order": 3, "default_assignee_role": "owner", "requires_approval": True, "approver_role": "owner"},
            {"name": "生成投标大纲", "order": 4, "default_assignee_role": "editor"},
            {"name": "生成技术标书", "order": 5, "default_assignee_role": "editor", "requires_approval": True, "approver_role": "reviewer"},
            {"name": "生成商务标书", "order": 6, "default_assignee_role": "editor", "requires_approval": True, "approver_role": "reviewer"},
            {"name": "合并审核", "order": 7, "default_assignee_role": "reviewer", "requires_approval": True, "approver_role": "owner"},
            {"name": "导出标书", "order": 8, "default_assignee_role": "owner"},
        ],
    },
    {
        "name": "服务类采购",
        "description": "适用于服务类采购项目，流程较简化。",
        "nodes": [
            {"name": "上传采购文件", "order": 1, "default_assignee_role": "editor"},
            {"name": "解析采购文件", "order": 2, "default_assignee_role": "editor"},
            {"name": "编写技术方案", "order": 3, "default_assignee_role": "editor", "requires_approval": True, "approver_role": "reviewer"},
            {"name": "编写商务报价", "order": 4, "default_assignee_role": "editor", "requires_approval": True, "approver_role": "reviewer"},
            {"name": "综合审核", "order": 5, "default_assignee_role": "reviewer", "requires_approval": True, "approver_role": "owner"},
            {"name": "导出响应文件", "order": 6, "default_assignee_role": "owner"},
        ],
    },
    {
        "name": "简易流程",
        "description": "适用于小型项目，流程最简化。",
        "nodes": [
            {"name": "上传招标文件", "order": 1, "default_assignee_role": "editor"},
            {"name": "解析并生成", "order": 2, "default_assignee_role": "editor"},
            {"name": "审核确认", "order": 3, "default_assignee_role": "reviewer", "requires_approval": True, "approver_role": "owner"},
            {"name": "导出标书", "order": 4, "default_assignee_role": "owner"},
        ],
    },
]


class TemplateService:
    """流程模板服务。"""

    @staticmethod
    @transaction.atomic
    def create_system_templates(created_by=None):
        """初始化系统预设模板。

        Args:
            created_by: 创建人

        Returns:
            创建的模板列表
        """
        templates = []
        for template_config in SYSTEM_TEMPLATES:
            template = WorkflowTemplate.objects.create(
                name=template_config["name"],
                description=template_config.get("description", ""),
                scope="system",
                is_builtin=True,
                created_by=created_by,
            )
            for node_config in template_config.get("nodes", []):
                WorkflowNodeTemplate.objects.create(
                    workflow_template=template,
                    name=node_config["name"],
                    order=node_config["order"],
                    default_assignee_type="role",
                    default_assignee_role=node_config.get("default_assignee_role", "editor"),
                    requires_approval=node_config.get("requires_approval", False),
                    approver_type="role" if node_config.get("approver_role") else "",
                    approver_role=node_config.get("approver_role", ""),
                    estimated_hours=node_config.get("estimated_hours"),
                    description=node_config.get("description", ""),
                )
            templates.append(template)
        return templates

    @staticmethod
    @transaction.atomic
    def clone_template_to_project(system_template, project, created_by=None):
        """将系统模板深拷贝为项目私有模板。

        Args:
            system_template: 系统模板实例
            project: 项目实例
            created_by: 创建人

        Returns:
            克隆的项目模板
        """
        project_template = WorkflowTemplate.objects.create(
            name=system_template.name,
            description=system_template.description,
            scope="project",
            project=project,
            is_active=True,
            is_builtin=False,
            created_by=created_by,
        )

        node_templates = []
        for node in system_template.node_templates.all():
            node_templates.append(WorkflowNodeTemplate(
                workflow_template=project_template,
                name=node.name,
                order=node.order,
                default_assignee_type=node.default_assignee_type,
                default_assignee_role=node.default_assignee_role,
                # 系统模板的 user 字段不拷贝
                default_assignee_user=None,
                requires_approval=node.requires_approval,
                approver_type=node.approver_type,
                approver_role=node.approver_role,
                approver_user=None,
                estimated_hours=node.estimated_hours,
                description=node.description,
            ))

        WorkflowNodeTemplate.objects.bulk_create(node_templates)
        return project_template

    @staticmethod
    @transaction.atomic
    def reorder_nodes(template_id, node_orders):
        """批量重排节点顺序。

        Args:
            template_id: 模板 ID
            node_orders: [{"id": 1, "order": 1}, ...]

        Returns:
            更新的节点数量
        """
        nodes = WorkflowNodeTemplate.objects.filter(
            workflow_template_id=template_id
        ).select_for_update()

        node_map = {n.id: n for n in nodes}
        updated_count = 0

        for item in node_orders:
            node = node_map.get(item["id"])
            if node and node.order != item["order"]:
                node.order = item["order"]
                node.save(update_fields=["order"])
                updated_count += 1

        return updated_count

    @staticmethod
    def get_active_system_templates():
        """获取所有启用的系统模板。"""
        return WorkflowTemplate.objects.filter(
            scope="system",
            is_active=True,
        ).prefetch_related("node_templates")

    @staticmethod
    def get_project_templates(project):
        """获取项目的模板列表。"""
        return WorkflowTemplate.objects.filter(
            project=project,
        ).prefetch_related("node_templates")