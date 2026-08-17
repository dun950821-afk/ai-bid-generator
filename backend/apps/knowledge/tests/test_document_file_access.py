# backend/apps/knowledge/tests/test_document_file_access.py
"""F-13 回归：知识库文件/图片/复制接口要求 knowledge.manage 权限。"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.knowledge.constants import KnowledgeBaseType
from apps.knowledge.models import KnowledgeBase, KnowledgeDocument

User = get_user_model()


def _make_doc(username="f13-owner"):
    user = User.objects.create_user(username=username, password="x")
    kb = KnowledgeBase.objects.create(
        name=f"KB-{username}", kb_type=KnowledgeBaseType.QUALIFICATION,
        created_by=user,
    )
    doc = KnowledgeDocument.objects.create(
        knowledge_base=kb, file_name="a.docx", file_uri="kb/a.docx",
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        file_size=10, created_by=user,
    )
    return user, doc


@pytest.mark.django_db
class TestDocumentFileAccessControl:
    def test_anonymous_rejected(self):
        _, doc = _make_doc()
        assert APIClient().get(f"/api/knowledge/documents/{doc.id}/file/").status_code in (401, 403)

    def test_zero_privilege_user_rejected(self):
        _, doc = _make_doc()
        stranger = User.objects.create_user(username="f13-stranger", password="x")
        client = APIClient()
        client.force_authenticate(user=stranger)
        assert client.get(f"/api/knowledge/documents/{doc.id}/file/").status_code == 403

    def test_zero_privilege_copy_to_editor_rejected(self):
        _, doc = _make_doc()
        stranger = User.objects.create_user(username="f13-stranger2", password="x")
        client = APIClient()
        client.force_authenticate(user=stranger)
        assert client.post(f"/api/knowledge/documents/{doc.id}/copy-to-editor/").status_code == 403
