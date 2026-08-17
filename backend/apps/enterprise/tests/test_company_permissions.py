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


@pytest.mark.django_db
class TestF03F04F15Regression:
    """F-03/F-04/F-15 回归：匿名拒绝、content_type 服务端推导、object_key 前缀校验。"""

    def _company(self, user):
        from apps.enterprise.models import CompanyProfile

        return CompanyProfile.objects.create(
            name="测试公司", unified_social_credit_code="91110000MA01ABC123",
            created_by=user,
        )

    def test_anonymous_company_list_rejected(self, api_client):
        assert api_client.get("/api/enterprise/companies/").status_code in (401, 403)

    def test_anonymous_material_list_rejected(self, api_client):
        assert api_client.get("/api/enterprise/materials/").status_code in (401, 403)

    def test_anonymous_member_list_rejected(self, api_client):
        assert api_client.get("/api/enterprise/members/").status_code in (401, 403)

    def test_content_type_derived_server_side(self, api_client, admin_user):
        """客户端谎报 text/html，落库必须是按扩展名推导的类型（F-04）。"""
        company = self._company(admin_user)
        api_client.force_authenticate(user=admin_user)
        resp = api_client.post("/api/enterprise/materials/", {
            "company_id": company.id,
            "material_type": "business_license",
            "title": "xss-probe",
            "object_key": f"company_materials/{company.id}/business_license/2026/08/17/evil.png",
            "file_size": 10,
            "content_type": "text/html",
        }, format="json")
        assert resp.status_code == 201, resp.data
        assert resp.data["content_type"] == "image/png"

    def test_object_key_prefix_rejected(self, api_client, admin_user):
        """object_key 指向他企业/桶内其他路径 → 400（F-15）。"""
        company = self._company(admin_user)
        api_client.force_authenticate(user=admin_user)
        resp = api_client.post("/api/enterprise/materials/", {
            "company_id": company.id,
            "material_type": "business_license",
            "title": "bad-key",
            "object_key": "bid-templates/system/1/versions/v1.docx",
            "file_size": 10,
        }, format="json")
        assert resp.status_code == 400
