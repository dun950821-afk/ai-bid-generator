# backend/apps/knowledge/tests/test_models.py
"""知识库模型测试。"""

import pytest
from django.contrib.auth import get_user_model

from apps.knowledge.models import KnowledgeBase, KnowledgeDocument, KnowledgeChunk, RetrievalLog
from apps.knowledge.constants import KnowledgeBaseType, KnowledgeBaseVisibility, DocumentStatus

User = get_user_model()


@pytest.mark.django_db
class TestKnowledgeBase:
    """知识库模型测试。"""

    def test_create_knowledge_base(self):
        """测试创建知识库。"""
        user = User.objects.create_user(username="test", password="test123")
        kb = KnowledgeBase.objects.create(
            name="测试知识库",
            kb_type=KnowledgeBaseType.COMPANY_PROFILE,
            visibility=KnowledgeBaseVisibility.PRIVATE,
            created_by=user,
        )
        assert kb.id is not None
        assert kb.name == "测试知识库"
        assert kb.kb_type == KnowledgeBaseType.COMPANY_PROFILE
        assert kb.is_active is True
        assert kb.is_deleted is False

    def test_soft_delete_knowledge_base(self):
        """测试软删除知识库。"""
        user = User.objects.create_user(username="test", password="test123")
        kb = KnowledgeBase.objects.create(
            name="测试知识库",
            kb_type=KnowledgeBaseType.CASE_LIBRARY,
            created_by=user,
        )
        kb.is_deleted = True
        kb.save()

        assert kb.is_deleted is True
        # 软删除后仍可通过 filter 获取
        assert KnowledgeBase.objects.filter(id=kb.id).count() == 1


@pytest.mark.django_db
class TestKnowledgeDocument:
    """知识文档模型测试。"""

    def test_create_document(self):
        """测试创建文档。"""
        user = User.objects.create_user(username="test", password="test123")
        kb = KnowledgeBase.objects.create(
            name="测试知识库",
            kb_type=KnowledgeBaseType.QUALIFICATION,
            created_by=user,
        )
        doc = KnowledgeDocument.objects.create(
            knowledge_base=kb,
            file_name="test.pdf",
            file_size=1024,
            file_hash="abc123",
            mime_type="application/pdf",
            created_by=user,
        )
        assert doc.id is not None
        assert doc.status == DocumentStatus.UPLOADING

    def test_unique_file_hash_constraint(self):
        """测试同一知识库文件哈希唯一约束。"""
        user = User.objects.create_user(username="test", password="test123")
        kb = KnowledgeBase.objects.create(
            name="测试知识库",
            kb_type=KnowledgeBaseType.PRODUCT,
            created_by=user,
        )
        KnowledgeDocument.objects.create(
            knowledge_base=kb,
            file_name="test1.pdf",
            file_hash="same_hash",
            created_by=user,
        )
        # 同一知识库相同哈希应该冲突
        with pytest.raises(Exception):  # IntegrityError
            KnowledgeDocument.objects.create(
                knowledge_base=kb,
                file_name="test2.pdf",
                file_hash="same_hash",
                created_by=user,
            )


@pytest.mark.django_db
class TestKnowledgeChunk:
    """知识分块模型测试。"""

    def test_create_chunk(self):
        """测试创建分块。"""
        user = User.objects.create_user(username="test", password="test123")
        kb = KnowledgeBase.objects.create(
            name="测试知识库",
            kb_type=KnowledgeBaseType.BID_HISTORY,
            created_by=user,
        )
        doc = KnowledgeDocument.objects.create(
            knowledge_base=kb,
            file_name="test.pdf",
            created_by=user,
        )
        chunk = KnowledgeChunk.objects.create(
            document=doc,
            chunk_index=0,
            content="测试内容",
            content_hash="hash123",
        )
        assert chunk.id is not None
        assert chunk.chunk_index == 0