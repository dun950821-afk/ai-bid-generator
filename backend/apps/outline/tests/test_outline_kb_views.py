# backend/apps/outline/tests/test_outline_kb_views.py
"""大纲-知识库绑定 API 测试。"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.knowledge.models import KnowledgeBase
from apps.outline.models import Outline, OutlineKnowledgeBase
from apps.projects.models import Lot, Project

User = get_user_model()


@pytest.mark.django_db
class TestOutlineKbBindingApi:
    """大纲知识库绑定 API 测试。"""

    def setup_method(self):
        self.user = User.objects.create_user(username="u", password="p")
        project = Project.objects.create(name="P", created_by=self.user)
        lot = Lot.objects.create(name="L", project=project)
        self.outline = Outline.objects.create(
            project=project, lot=lot, name="O", source="preset", created_by=self.user
        )
        self.kb = KnowledgeBase.objects.create(
            name="KB", kb_type="company_profile", created_by=self.user
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_list_empty_bindings(self):
        resp = self.client.get(f"/api/outlines/{self.outline.id}/knowledge-bases/")
        assert resp.status_code == 200
        assert resp.data == []

    def test_bind_kb(self):
        resp = self.client.post(
            f"/api/outlines/{self.outline.id}/knowledge-bases/",
            {"kb_ids": [self.kb.id]}, format="json"
        )
        assert resp.status_code == 201
        assert OutlineKnowledgeBase.objects.filter(outline=self.outline).count() == 1

    def test_unbind_kb(self):
        binding = OutlineKnowledgeBase.objects.create(
            outline=self.outline, knowledge_base=self.kb
        )
        resp = self.client.delete(
            f"/api/outlines/{self.outline.id}/knowledge-bases/{binding.id}/"
        )
        assert resp.status_code == 204
        assert not OutlineKnowledgeBase.objects.filter(id=binding.id).exists()
