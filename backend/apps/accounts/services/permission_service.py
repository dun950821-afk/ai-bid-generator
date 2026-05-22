"""权限判定服务（spec §4.5）—— 全系统唯一鉴权判定入口。

DRF 权限类、视图、菜单计算都从这里取权限，不在视图里散落判定逻辑。
缓存策略（spec §4.5）：请求级缓存 + Redis 两级，TTL 180s；角色/成员/
权限变更时由 signals 主动失效相关键（见 Task 8）。
"""
from django.core.cache import cache

from apps.accounts.models import Permission
from apps.common import request_cache
from apps.projects.models import ProjectMember
from apps.projects.permissions import PROJECT_ROLE_PERMISSIONS

CACHE_TTL = 180  # spec §4.5：60–300s
SYSTEM_ADMIN_ROLE_CODE = "system_admin"


def _global_cache_key(user_id):
    return f"perm:global:user:{user_id}"


def _project_cache_key(user_id, project_id):
    return f"perm:project:user:{user_id}:project:{project_id}"


def _scope_cache_key(code):
    return f"perm:scope:{code}"


# 缓存 code → scope，标记"code 不存在或已禁用"用以下哨兵；
# 选 sentinel 而非 None，因 _cached 把 None 视为未命中。
_SCOPE_MISS = "__miss__"


def get_permission_scope(code):
    """取权限点的 scope；不存在或 is_active=False 一律返回 None。

    M5：原 has_permission 每次都跑 Permission.filter(code=...).only('scope')，
    实质常量查询；改为两级缓存（request + Redis），由 signal 在
    Permission 行变化时主动失效（见 apps.accounts.signals）。
    """
    key = _scope_cache_key(code)
    hit = request_cache.get(key)
    if hit is not None:
        return None if hit == _SCOPE_MISS else hit
    hit = cache.get(key)
    if hit is not None:
        request_cache.set_value(key, hit)
        return None if hit == _SCOPE_MISS else hit
    perm = (
        Permission.objects.filter(code=code, is_active=True).only("scope").first()
    )
    value = perm.scope if perm else _SCOPE_MISS
    cache.set(key, value, CACHE_TTL)
    request_cache.set_value(key, value)
    return None if value == _SCOPE_MISS else value


def invalidate_scope(code):
    """失效某权限点的 scope 缓存。"""
    cache.delete(_scope_cache_key(code))


def _cached(key, producer):
    """两级缓存读取：先请求级，再 Redis，最后 producer() 计算并回填两级。

    约定缓存值不为 None（只缓存集合），故 None 即未命中。
    """
    hit = request_cache.get(key)
    if hit is not None:
        return hit
    hit = cache.get(key)
    if hit is not None:
        request_cache.set_value(key, hit)
        return hit
    value = producer()
    cache.set(key, value, CACHE_TTL)
    request_cache.set_value(key, value)
    return value


def _all_codes_by_scope(scope):
    return set(
        Permission.objects.filter(scope=scope, is_active=True).values_list(
            "code", flat=True
        )
    )


def is_system_admin(user):
    """是否系统管理员（请求级缓存，不进 Redis）。"""
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    key = f"perm:is_admin:user:{user.pk}"
    hit = request_cache.get(key)
    if hit is not None:
        return hit
    result = user.roles.filter(code=SYSTEM_ADMIN_ROLE_CODE).exists()
    request_cache.set_value(key, result)
    return result


def get_global_permissions(user):
    """取用户全局权限码集合（供登录响应、菜单计算）。

    system_admin 直通：返回全部启用的 global 权限码。
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return set()
    if is_system_admin(user):
        return _all_codes_by_scope(Permission.SCOPE_GLOBAL)

    def producer():
        return set(
            Permission.objects.filter(
                roles__users=user,
                scope=Permission.SCOPE_GLOBAL,
                is_active=True,
            )
            .values_list("code", flat=True)
            .distinct()
        )

    return _cached(_global_cache_key(user.pk), producer)


def has_global_permission(user, code):
    """全局权限判定。"""
    if is_system_admin(user):
        return True
    return code in get_global_permissions(user)


def get_project_permissions(user, project):
    """取用户在某项目的权限码集合（供 my-permissions、菜单二次裁剪）。

    system_admin 直通：返回全部启用的 project 权限码，且不要求 ProjectMember
    关系（spec §4.1、附录 A #12）。其余用户必须是该项目的 ProjectMember，
    按其 project_role 查 PROJECT_ROLE_PERMISSIONS 静态映射。
    """
    if (
        user is None
        or not getattr(user, "is_authenticated", False)
        or project is None
    ):
        return set()
    if is_system_admin(user):
        return _all_codes_by_scope(Permission.SCOPE_PROJECT)

    def producer():
        member = (
            ProjectMember.objects.filter(project=project, user=user)
            .only("project_role")
            .first()
        )
        if member is None:
            return set()
        return set(PROJECT_ROLE_PERMISSIONS.get(member.project_role, set()))

    return _cached(_project_cache_key(user.pk, project.pk), producer)


def has_project_permission(user, project, code):
    """项目权限判定。"""
    if is_system_admin(user):
        return True
    return code in get_project_permissions(user, project)


def has_permission(user, code, project=None, required_scope=None):
    """总入口：按权限点 scope 自动走全局或项目判定（spec §4.5）。

    一律拒绝（绝不默认放行，附录 A #13）：
    - code 不存在，或对应 Permission.is_active=False；
    - required_scope 已声明且与 Permission.scope 不一致；
    - 判定 scope 为 project 但未传 project。
    """
    scope = get_permission_scope(code)
    if scope is None:
        return False
    if required_scope is not None and scope != required_scope:
        return False
    if scope == Permission.SCOPE_GLOBAL:
        return has_global_permission(user, code)
    if project is None:
        return False
    return has_project_permission(user, project, code)


def invalidate_global(user_id):
    """失效某用户的全局权限缓存。"""
    cache.delete(_global_cache_key(user_id))


def invalidate_project(user_id, project_id):
    """失效某用户在某项目的权限缓存。"""
    cache.delete(_project_cache_key(user_id, project_id))
