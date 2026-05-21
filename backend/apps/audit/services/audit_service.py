"""审计日志服务（spec §5.10）。

log_operation 是写 OperationLog 的唯一入口。OperationLog 只追加不更新。
登录失败等无已认证用户的事件：actor 传 None，尝试的用户名/原因写 extra。
"""
from apps.audit.models import OperationLog
from apps.common.utils import get_client_ip, get_user_agent


def log_operation(
    *,
    actor,
    action,
    request=None,
    target_type="",
    target_id="",
    summary="",
    extra=None,
):
    """写一条操作日志并返回 OperationLog 实例。

    参数全部 keyword-only，避免调用点位置参数写错。
    actor 允许为 None（匿名/登录失败场景）。
    """
    return OperationLog.objects.create(
        actor=actor,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id != "" else "",
        summary=summary,
        extra=extra or {},
        ip=get_client_ip(request),
        user_agent=get_user_agent(request),
    )
