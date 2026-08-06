"""DRF 权限类——permission_service 的薄包装（spec §4.5）。"""
from rest_framework.permissions import BasePermission

from apps.accounts.permissions_registry import PROJECT
from apps.accounts.services import permission_service
from apps.common.exceptions import MustChangePassword, PermissionDenied


def check_project_permission(user, code, project):
    """检查用户是否具备项目级权限。

    Args:
        user: 用户对象
        code: 权限码
        project: 项目对象

    Returns:
        bool: 是否具备权限
    """
    return permission_service.has_permission(user, code, project=project, required_scope=PROJECT)


class RequirePermission(BasePermission):
    """要求当前用户具备视图声明的权限码。

    视图通过类属性声明：
        required_permission = "user.manage"
        required_scope = "global"   # 或 "project"

    项目级权限按以下优先级解析目标 project：
        1) URL kwarg `project_id`
        2) 视图的 get_permission_project(request) 钩子
        3) 请求体 project / project_id 字段
    解析不到项目即拒绝（fail-closed）。
    """

    def has_permission(self, request, view):
        # 认证检查必须先于权限码检查：否则未声明 required_permission 的视图
        # 会把未认证请求直接放行，随后 get_queryset 用 AnonymousUser 过滤
        # 抛 TypeError 500（见标书下载故障）。
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            raise PermissionDenied(message="未认证")

        code = getattr(view, "required_permission", None)
        if not code:
            return True  # 视图未声明权限码 → 已认证即可访问

        scope = getattr(view, "required_scope", None)
        project = None
        if scope == PROJECT:
            project = self._resolve_project(request, view)
            if project is None:
                raise PermissionDenied(message="无法确定目标项目")

        allowed = permission_service.has_permission(
            user, code, project=project, required_scope=scope
        )
        if not allowed:
            raise PermissionDenied
        return True

    def _resolve_project(self, request, view):
        from apps.projects.models import Project

        raw = view.kwargs.get("project_id")
        if raw is None and hasattr(view, "get_permission_project"):
            return view.get_permission_project(request)
        if raw is None:
            raw = request.data.get("project") or request.data.get("project_id")
        if raw is None:
            return None
        return Project.objects.filter(pk=raw).first()


class MustChangePasswordPermission(BasePermission):
    """强制改密拦截（spec §5.7）。

    must_change_password=True 的用户，除标注 must_change_password_exempt
    的视图（me / change-password）外一律拦截。未认证用户放行，交由
    IsAuthenticated 处理。
    """

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return True
        if not getattr(user, "must_change_password", False):
            return True
        if getattr(view, "must_change_password_exempt", False):
            return True
        raise MustChangePassword
