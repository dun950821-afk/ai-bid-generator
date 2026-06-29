"""menu_service 与 login_service 测试（spec §5.2）。"""
import pytest

from apps.accounts.auth.exceptions import AccountDisabled
from apps.accounts.services import login_service
from apps.accounts.services.menu_service import build_menu_tree, MENU_DEFINITION


def _all_keys(tree):
    """从分组菜单树提取所有 item key。"""
    keys = set()
    for group in tree:
        for item in group.get("items", []):
            keys.add(item["key"])
    return keys


def test_build_menu_tree_filters_by_permission():
    tree = build_menu_tree(["user.manage"])
    keys = _all_keys(tree)
    assert "dashboard" in keys      # permission=None，始终可见
    assert "users" in keys          # user.manage 命中
    assert "roles" not in keys      # role.manage 未命中


def test_build_menu_tree_empty_permissions_keeps_public_items():
    tree = build_menu_tree([])
    keys = _all_keys(tree)
    # permission=None 的项始终可见：dashboard/projects/templates/enterprise
    assert "dashboard" in keys
    assert "projects" in keys
    assert "templates" in keys
    assert "enterprise" in keys


def test_menu_does_not_include_outlines():
    """标书制作菜单项应已移除（spec §3）。"""
    keys = [item["key"] for item in MENU_DEFINITION]
    assert "outlines" not in keys, "「标书制作」菜单项应已移除"
    tree = build_menu_tree(global_permissions=[])
    assert "outlines" not in _all_keys(tree)


@pytest.mark.django_db
def test_complete_login_returns_tokens_and_profile(bid_manager_user, rf):
    request = rf.post("/api/auth/login")
    result = login_service.complete_login(bid_manager_user, request)
    assert result["access"]
    assert result["refresh"]
    assert result["user"]["username"] == "manager"
    assert result["global_permissions"] == ["project.create"]
    assert result["must_change_password"] is False
    # menu_tree 是分组结构，dashboard 在第一个分组的 items 里
    all_keys = {item["key"] for group in result["menu_tree"] for item in group["items"]}
    assert "dashboard" in all_keys


@pytest.mark.django_db
def test_complete_login_rejects_disabled_account(normal_user, rf):
    normal_user.is_active = False
    normal_user.save(update_fields=["is_active"])
    request = rf.post("/api/auth/login")
    with pytest.raises(AccountDisabled):
        login_service.complete_login(normal_user, request)


@pytest.mark.django_db
def test_complete_login_updates_last_login(normal_user, rf):
    assert normal_user.last_login is None
    request = rf.post("/api/auth/login")
    login_service.complete_login(normal_user, request)
    normal_user.refresh_from_db()
    assert normal_user.last_login is not None
