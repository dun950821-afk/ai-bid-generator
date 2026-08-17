"""默认公司接口测试。

无默认公司属预期空状态，应返回 200 + null（而非 404），
避免浏览器网络面板对每个新用户首页出现 404 报错。
"""

import pytest


@pytest.mark.django_db
def test_no_default_company_returns_200_null(api_client, normal_user):
    """未设置默认公司时返回 200 + null。"""
    api_client.force_authenticate(user=normal_user)
    resp = api_client.get("/api/enterprise/companies/default/")
    assert resp.status_code == 200
    assert resp.data is None


@pytest.mark.django_db
def test_default_company_returns_profile(api_client, normal_user):
    """存在默认公司时返回公司信息。"""
    from apps.enterprise.models import CompanyProfile

    CompanyProfile.objects.create(
        name="测试建设集团有限公司",
        unified_social_credit_code="91110000MA01ABC123",
        is_default=True,
        status="active",
        created_by=normal_user,
    )

    api_client.force_authenticate(user=normal_user)
    resp = api_client.get("/api/enterprise/companies/default/")
    assert resp.status_code == 200
    assert resp.data["name"] == "测试建设集团有限公司"
    assert resp.data["is_default"] is True


@pytest.mark.django_db
def test_default_company_anonymous_rejected(api_client):
    """匿名访问一律拒绝（F-03：企业资料中心不再对匿名放行 SAFE_METHODS）。"""
    resp = api_client.get("/api/enterprise/companies/default/")
    assert resp.status_code in (401, 403)
