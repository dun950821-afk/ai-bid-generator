"""permission_service scope 查表缓存测试（M5 修复）。"""
import pytest

from apps.accounts.models import Permission, Role
from apps.accounts.services import permission_service as ps
from apps.common import request_cache


@pytest.fixture
def _in_request_context():
    """request_cache 只在 RequestCacheMiddleware 上下文里激活；
    单元测试里要显式 reset 进入"同一请求内"语义，模拟生产路径。"""
    request_cache.reset()
    yield
    request_cache.clear()


@pytest.mark.django_db
def test_has_permission_caches_scope_lookup(
    normal_user, django_assert_num_queries, _in_request_context
):
    """同一请求内连续两次 has_permission 不应重复查 Permission 表。

    原实现每次都跑一次 Permission.filter(code=, is_active=True).only('scope')，
    本质是常量查询，应被缓存。
    """
    code = "project.create"
    Role.objects.get(code="bid_manager").permissions.add(
        Permission.objects.get(code=code)
    )
    normal_user.roles.add(Role.objects.get(code="bid_manager"))

    # 首次：会查 Permission scope + 用户全局权限
    assert ps.has_permission(normal_user, code) is True

    # 再次：两层缓存都命中
    with django_assert_num_queries(0):
        assert ps.has_permission(normal_user, code) is True


@pytest.mark.django_db
def test_permission_is_active_toggle_invalidates_scope_cache(normal_user):
    """切换 Permission.is_active 必须立刻被 has_permission 感知。

    否则会出现"管理员禁用权限后仍然放行"的安全漏洞。
    """
    code = "project.create"
    Role.objects.get(code="bid_manager").permissions.add(
        Permission.objects.get(code=code)
    )
    normal_user.roles.add(Role.objects.get(code="bid_manager"))

    assert ps.has_permission(normal_user, code) is True

    perm = Permission.objects.get(code=code)
    perm.is_active = False
    perm.save()

    assert ps.has_permission(normal_user, code) is False


@pytest.mark.django_db
def test_unknown_code_negative_cached_without_db_hit(
    normal_user, django_assert_num_queries, _in_request_context
):
    """未知 code 也应被负向缓存，避免被反复探测打表。"""
    code = "definitely.does.not.exist"

    assert ps.has_permission(normal_user, code) is False
    with django_assert_num_queries(0):
        assert ps.has_permission(normal_user, code) is False
