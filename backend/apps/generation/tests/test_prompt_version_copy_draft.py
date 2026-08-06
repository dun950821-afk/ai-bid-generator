# backend/apps/generation/tests/test_prompt_version_copy_draft.py
"""复制为新版本（copy-draft，Playground 调试保存）接口测试。"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.generation.models import PromptTemplate, PromptVersion
from apps.generation.constants import (
    PromptScenario,
    PromptScope,
    PromptVersionStatus,
)

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user():
    return User.objects.create_superuser(username="testuser", password="testpass", email="testuser@example.com")


@pytest.fixture
def prompt_template(db):
    return PromptTemplate.objects.create(
        key="test_template",
        name="测试模板",
        scenario=PromptScenario.SECTION_WRITING,
        scope=PromptScope.SYSTEM,
    )


@pytest.fixture
def published_version(prompt_template):
    return PromptVersion.objects.create(
        template=prompt_template,
        version="1.0.0",
        system_prompt="原版系统提示词",
        user_prompt="原版用户提示词",
        variable_schema={"type": "object", "properties": {}},
        status=PromptVersionStatus.PUBLISHED,
    )


@pytest.fixture
def draft_version(prompt_template):
    return PromptVersion.objects.create(
        template=prompt_template,
        version="2.0.0",
        system_prompt="草稿系统提示词",
        user_prompt="草稿用户提示词",
        status=PromptVersionStatus.DRAFT,
    )


def _url(template_id, version_id):
    return f"/api/generation/prompt-templates/{template_id}/versions/{version_id}/copy-draft/"


@pytest.mark.django_db
class TestPromptVersionCopyDraft:
    def test_requires_auth(self, api_client, published_version):
        response = api_client.post(_url(published_version.template_id, published_version.id), {}, format="json")
        assert response.status_code == 401

    def test_version_not_found(self, api_client, user, prompt_template):
        api_client.force_authenticate(user=user)
        response = api_client.post(_url(prompt_template.id, 99999), {}, format="json")
        assert response.status_code == 404

    def test_copy_from_published(self, api_client, user, published_version):
        """published 源可复制，且只创建草稿不发布。"""
        api_client.force_authenticate(user=user)
        response = api_client.post(
            _url(published_version.template_id, published_version.id), {}, format="json"
        )
        assert response.status_code == 201
        data = response.data
        assert data["status"] == PromptVersionStatus.DRAFT
        assert data["system_prompt"] == "原版系统提示词"
        assert data["user_prompt"] == "原版用户提示词"
        assert data["version"] == "1.0.0-copy1"

        # 源版本状态不变
        published_version.refresh_from_db()
        assert published_version.status == PromptVersionStatus.PUBLISHED

    def test_copy_from_draft(self, api_client, user, draft_version):
        """draft 源也允许复制（CopyView 拒绝，copy-draft 放行）。"""
        api_client.force_authenticate(user=user)
        response = api_client.post(
            _url(draft_version.template_id, draft_version.id), {}, format="json"
        )
        assert response.status_code == 201
        assert response.data["status"] == PromptVersionStatus.DRAFT

    def test_copy_with_content_override(self, api_client, user, published_version):
        """body 覆盖 system_prompt/user_prompt（调试好的内容）。"""
        api_client.force_authenticate(user=user)
        response = api_client.post(
            _url(published_version.template_id, published_version.id),
            {
                "system_prompt": "调试好的系统提示词",
                "user_prompt": "调试好的用户提示词",
                "changelog": "基于调试结果保存",
            },
            format="json",
        )
        assert response.status_code == 201
        data = response.data
        assert data["system_prompt"] == "调试好的系统提示词"
        assert data["user_prompt"] == "调试好的用户提示词"
        assert data["changelog"] == "基于调试结果保存"

    def test_copy_with_blank_override_keeps_blank(self, api_client, user, published_version):
        """显式清空某段（空串）也是有效覆盖。"""
        api_client.force_authenticate(user=user)
        response = api_client.post(
            _url(published_version.template_id, published_version.id),
            {"user_prompt": ""},
            format="json",
        )
        assert response.status_code == 201
        assert response.data["system_prompt"] == "原版系统提示词"
        assert response.data["user_prompt"] == ""

    def test_copy_version_increment(self, api_client, user, published_version):
        """连续复制版本号递增。"""
        api_client.force_authenticate(user=user)
        for _ in range(2):
            response = api_client.post(
                _url(published_version.template_id, published_version.id), {}, format="json"
            )
            assert response.status_code == 201

        versions = list(
            PromptVersion.objects.filter(
                template_id=published_version.template_id
            ).values_list("version", flat=True)
        )
        assert "1.0.0-copy1" in versions
        assert "1.0.0-copy2" in versions

    def test_default_changelog(self, api_client, user, published_version):
        """未传 changelog 时使用 Playground 默认说明。"""
        api_client.force_authenticate(user=user)
        response = api_client.post(
            _url(published_version.template_id, published_version.id), {}, format="json"
        )
        assert response.status_code == 201
        assert response.data["changelog"] == "基于 1.0.0 复制（Playground）"

    def test_schema_copied(self, api_client, user, published_version):
        """variable_schema/output_schema 随源复制。"""
        api_client.force_authenticate(user=user)
        response = api_client.post(
            _url(published_version.template_id, published_version.id), {}, format="json"
        )
        assert response.status_code == 201
        assert response.data["variable_schema"] == {"type": "object", "properties": {}}
