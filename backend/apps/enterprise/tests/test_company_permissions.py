"""公司管理权限测试。

回归：企业模块曾用 Django 内置 has_perm 判权（与自定义 RBAC 无关的 auth
Permission 表，恒为空），导致系统管理员也无法新增公司（403）。
应走 permission_service 直通逻辑：system_admin 角色可管理公司。
"""

import pytest


@pytest.mark.django_db
def test_system_admin_can_create_company(api_client, admin_user):
    """系统管理员可新增公司，且创建后默认启用（可立即关联大纲/材料）。"""
    api_client.force_authenticate(user=admin_user)
    resp = api_client.post(
        "/api/enterprise/companies/",
        {
            "name": "测试建设集团有限公司",
            "short_name": "测试建设",
            "unified_social_credit_code": "91110000MA01ABC123",
        },
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["name"] == "测试建设集团有限公司"
    assert resp.data["status"] == "active"


@pytest.mark.django_db
def test_user_without_permission_cannot_create_company(api_client, normal_user):
    """无权限用户新增公司被拒（403）。"""
    api_client.force_authenticate(user=normal_user)
    resp = api_client.post(
        "/api/enterprise/companies/",
        {"name": "无权公司", "unified_social_credit_code": "91110000MA01DEF456"},
        format="json",
    )
    assert resp.status_code == 403
