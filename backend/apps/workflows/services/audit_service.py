# backend/apps/workflows/services/audit_service.py
"""审计日志服务。"""

from apps.workflows.models import WorkflowAuditLog


class AuditService:
    """审计日志服务。"""

    @staticmethod
    def record(
        node,
        action: str,
        previous_status: str,
        new_status: str,
        operator=None,
        reason: str = "",
        error_message: str = "",
    ) -> WorkflowAuditLog:
        """记录审计日志。

        Args:
            node: 节点实例
            action: 动作
            previous_status: 变更前状态
            new_status: 变更后状态
            operator: 操作人
            reason: 原因/备注
            error_message: 错误信息

        Returns:
            创建的审计日志
        """
        return WorkflowAuditLog.objects.create(
            lot_workflow=node.lot_workflow,
            node=node,
            action=action,
            previous_status=previous_status,
            new_status=new_status,
            operator=operator,
            reason=reason,
            error_message=error_message,
        )

    @staticmethod
    def get_node_logs(node, page: int = 1, page_size: int = 50):
        """获取节点日志（分页）。"""
        logs = WorkflowAuditLog.objects.filter(node=node).order_by("-created_at")
        start = (page - 1) * page_size
        end = start + page_size
        return logs[start:end], logs.count()
