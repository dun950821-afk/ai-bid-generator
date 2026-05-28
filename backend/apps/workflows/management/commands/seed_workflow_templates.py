# backend/apps/workflows/management/commands/seed_workflow_templates.py
"""初始化系统工作流模板。"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.workflows.models import WorkflowTemplate, WorkflowNodeTemplate


class Command(BaseCommand):
    help = "初始化系统工作流模板"

    @transaction.atomic
    def handle(self, *args, **options):
        # 检查是否已存在
        if WorkflowTemplate.objects.filter(scope="system", is_builtin=True).exists():
            self.stdout.write(self.style.WARNING("系统模板已存在，跳过创建"))
            return

        # 创建工程类投标模板
        template = WorkflowTemplate.objects.create(
            name="工程类投标",
            description="适用于工程类投标项目的标准流程",
            scope="system",
            is_builtin=True,
            is_active=True,
        )

        nodes = [
            ("上传招标文件", 1, "manual", False),
            ("解析招标文件", 2, "data", False),
            ("分块处理", 3, "data", False),
            ("条款抽取", 4, "data", False),
            ("AI 条款分析", 5, "ai", False),
            ("生成大纲", 6, "ai", False),
            ("技术方案编写", 7, "ai", False),
            ("商务部分编写", 8, "ai", False),
            ("技术审核", 9, "approval", True),
            ("商务审核", 10, "approval", True),
            ("导出标书", 11, "system", False),
        ]

        for name, order, visual_type, requires_approval in nodes:
            WorkflowNodeTemplate.objects.create(
                workflow_template=template,
                name=name,
                order=order,
                default_assignee_type="system" if visual_type in ("data", "ai", "system") else "user",
                requires_approval=requires_approval,
            )

        self.stdout.write(self.style.SUCCESS(f"创建系统模板: {template.name}"))

        # 创建服务类投标模板
        template2 = WorkflowTemplate.objects.create(
            name="服务类投标",
            description="适用于服务类投标项目的标准流程",
            scope="system",
            is_builtin=True,
            is_active=True,
        )

        nodes2 = [
            ("上传招标文件", 1, "manual", False),
            ("解析招标文件", 2, "data", False),
            ("条款抽取", 3, "data", False),
            ("AI 条款分析", 4, "ai", False),
            ("生成大纲", 5, "ai", False),
            ("技术方案编写", 6, "ai", False),
            ("服务方案编写", 7, "ai", False),
            ("技术审核", 8, "approval", True),
            ("导出标书", 9, "system", False),
        ]

        for name, order, visual_type, requires_approval in nodes2:
            WorkflowNodeTemplate.objects.create(
                workflow_template=template2,
                name=name,
                order=order,
                default_assignee_type="system" if visual_type in ("data", "ai", "system") else "user",
                requires_approval=requires_approval,
            )

        self.stdout.write(self.style.SUCCESS(f"创建系统模板: {template2.name}"))
        self.stdout.write(self.style.SUCCESS("初始化完成"))
