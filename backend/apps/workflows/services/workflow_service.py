"""工作流执行服务。"""
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from apps.workflows.models import LotWorkflow, WorkflowNodeInstance


class WorkflowService:
    """工作流执行服务。"""

    @staticmethod
    @transaction.atomic
    def initialize_workflow(lot, workflow_template=None):
        """初始化标段工作流。

        Args:
            lot: 标段实例
            workflow_template: 流程模板（可选，默认使用项目的第一个模板）

        Returns:
            创建的工作流实例
        """
        if lot.has_workflow:
            raise ValidationError("标段已存在工作流")

        # 获取模板
        if workflow_template is None:
            workflow_template = lot.project.workflow_templates.first()

        if workflow_template is None:
            raise ValidationError("项目没有可用的流程模板")

        # 创建工作流实例
        workflow = LotWorkflow.objects.create(
            lot=lot,
            workflow_template=workflow_template,
        )

        # 创建节点实例
        node_instances = []
        for node_template in workflow_template.node_templates.all().order_by("order"):
            node_instances.append(WorkflowNodeInstance(
                lot_workflow=workflow,
                node_template=node_template,
                name=node_template.name,
                order=node_template.order,
                requires_approval=node_template.requires_approval,
                assignee_type=node_template.default_assignee_type,
                assignee_role=node_template.default_assignee_role,
                approval_status="pending" if node_template.requires_approval else "not_required",
                approver_type=node_template.approver_type,
                approver_role=node_template.approver_role,
            ))

        WorkflowNodeInstance.objects.bulk_create(node_instances)

        return workflow

    @staticmethod
    @transaction.atomic
    def start_workflow(workflow, operator):
        """启动工作流。

        Args:
            workflow: 工作流实例
            operator: 操作人

        Returns:
            更新后的工作流
        """
        if workflow.status != "not_started":
            raise ValidationError("工作流状态不允许启动")

        workflow.status = "in_progress"
        workflow.started_at = timezone.now()
        workflow.save()

        # 启动第一个节点
        first_node = workflow.nodes.order_by("order").first()
        if first_node:
            WorkflowService.start_node(first_node, operator)

        return workflow

    @staticmethod
    @transaction.atomic
    def start_node(node, operator, assignee_user=None):
        """开始执行节点。

        Args:
            node: 节点实例
            operator: 操作人
            assignee_user: 指定负责人（可选）

        Returns:
            更新后的节点
        """
        can_start, reason = node.can_start()
        if not can_start:
            raise ValidationError(reason)

        node.status = "in_progress"
        node.started_at = timezone.now()
        node.retry_count += 1

        if assignee_user:
            node.assignee_user = assignee_user
            node.assignee_type = "user"

        node.save()

        return node

    @staticmethod
    @transaction.atomic
    def complete_node(node, operator):
        """完成节点。

        Args:
            node: 节点实例
            operator: 操作人

        Returns:
            更新后的节点
        """
        can_complete, reason = node.can_complete()
        if not can_complete:
            raise ValidationError(reason)

        node.status = "completed"
        node.completed_at = timezone.now()
        node.save()

        # 自动推进到下一节点
        WorkflowService._auto_advance(node.lot_workflow)

        return node

    @staticmethod
    @transaction.atomic
    def fail_node(node, operator, reason=""):
        """标记节点失败。

        Args:
            node: 节点实例
            operator: 操作人
            reason: 失败原因

        Returns:
            更新后的节点
        """
        if node.status != "in_progress":
            raise ValidationError("只有进行中的节点可以标记失败")

        node.status = "failed"
        node.failed_at = timezone.now()
        node.failure_reason = reason
        node.save()

        return node

    @staticmethod
    @transaction.atomic
    def skip_node(node, operator, reason=""):
        """跳过节点。

        Args:
            node: 节点实例
            operator: 操作人
            reason: 跳过原因

        Returns:
            更新后的节点
        """
        if node.status not in ["pending", "failed"]:
            raise ValidationError("节点状态不允许跳过")

        node.status = "skipped"
        node.completed_at = timezone.now()
        node.failure_reason = reason
        node.save()

        # 自动推进
        WorkflowService._auto_advance(node.lot_workflow)

        return node

    @staticmethod
    @transaction.atomic
    def approve_node(node, operator, comment=""):
        """审批通过节点。

        Args:
            node: 节点实例
            operator: 审批人
            comment: 审批意见

        Returns:
            更新后的节点
        """
        if not node.requires_approval:
            raise ValidationError("该节点无需审批")

        if node.approval_status != "pending":
            raise ValidationError("节点不在待审批状态")

        # 检查审批自我回避
        if node.assignee_type == "user" and node.assignee_user == operator:
            raise ValidationError("不可审批自己负责的节点")
        if node.assignee_type == "role":
            from apps.projects.models import ProjectMember
            member = ProjectMember.objects.filter(
                project=node.lot_workflow.lot.project,
                user=operator
            ).first()
            if member and member.project_role.code == node.assignee_role:
                raise ValidationError("不可审批自己负责角色的节点")

        node.approval_status = "approved"
        node.approved_by = operator
        node.approved_at = timezone.now()
        node.approval_comment = comment
        node.save()

        return node

    @staticmethod
    @transaction.atomic
    def reject_node(node, operator, comment=""):
        """审批驳回节点。

        Args:
            node: 节点实例
            operator: 审批人
            comment: 驳回原因

        Returns:
            更新后的节点
        """
        if not node.requires_approval:
            raise ValidationError("该节点无需审批")

        if node.approval_status != "pending":
            raise ValidationError("节点不在待审批状态")

        node.approval_status = "rejected"
        node.approved_by = operator
        node.approved_at = timezone.now()
        node.approval_comment = comment
        node.save()

        return node

    @staticmethod
    @transaction.atomic
    def rollback_to_node(workflow, target_node_id, operator, reason=""):
        """回退到指定节点。

        Args:
            workflow: 工作流实例
            target_node_id: 目标节点 ID
            operator: 操作人
            reason: 回退原因

        Returns:
            更新后的工作流
        """
        target_node = workflow.nodes.filter(pk=target_node_id).first()
        if not target_node:
            raise ValidationError("目标节点不存在")

        # 锁定下游节点
        downstream_nodes = workflow.nodes.filter(
            order__gte=target_node.order
        ).select_for_update()

        # 重置状态
        for node in downstream_nodes:
            node.status = "pending"
            node.started_at = None
            node.completed_at = None
            node.failed_at = None
            node.failure_reason = ""
            if node.requires_approval:
                node.approval_status = "pending"
            node.retry_count = 0
            node.save()

        # 更新工作流状态
        workflow.status = "in_progress"
        workflow.completed_at = None
        workflow.save()

        return workflow

    @staticmethod
    def _auto_advance(workflow):
        """自动推进流程。

        检查是否所有并行节点完成，推进到下一批节点。
        """
        # 检查是否有进行中的节点
        in_progress = workflow.nodes.filter(status="in_progress")
        if in_progress.exists():
            return

        # 检查是否有失败的节点
        failed = workflow.nodes.filter(status="failed")
        if failed.exists():
            workflow.status = "failed"
            workflow.save()
            return

        # 找到下一个待处理的节点
        pending_nodes = workflow.nodes.filter(status="pending").order_by("order")

        if not pending_nodes.exists():
            # 所有节点完成
            workflow.status = "completed"
            workflow.completed_at = timezone.now()
            workflow.save()

            # 更新标段状态
            lot = workflow.lot
            lot.workflow_status = "completed"
            lot.save()
            return

        # 获取下一批节点（相同 order 的并行节点）
        next_order = pending_nodes.first().order
        batch_nodes = [n for n in pending_nodes if n.order == next_order]

        for node in batch_nodes:
            node.status = "in_progress"
            node.started_at = timezone.now()
            node.save()
