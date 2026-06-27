# backend/apps/knowledge/tests/test_retrieval_service.py
"""检索服务测试。"""

import pytest
from django.contrib.auth import get_user_model

from apps.knowledge.models import KnowledgeBase, KnowledgeDocument, KnowledgeChunk
from apps.knowledge.constants import KnowledgeBaseType, KnowledgeBaseVisibility, DocumentStatus, ParseStatus, ChunkStatus, IndexStatus
from apps.knowledge.services.retrieval_service import RetrievalService
from apps.knowledge.services.rag_context_builder import RagContextBuilder

User = get_user_model()


@pytest.fixture
def setup_knowledge_data():
    """创建测试数据。"""
    user = User.objects.create_user(username="test", password="test123")
    kb = KnowledgeBase.objects.create(
        name="测试知识库",
        kb_type=KnowledgeBaseType.CASE_LIBRARY,
        visibility=KnowledgeBaseVisibility.PRIVATE,
        created_by=user,
    )
    doc = KnowledgeDocument.objects.create(
        knowledge_base=kb,
        file_name="test.pdf",
        file_size=1024,
        status=DocumentStatus.READY,
        parse_status=ParseStatus.PARSED,
        chunk_status=ChunkStatus.CHUNKED,
        index_status=IndexStatus.INDEXED,
        created_by=user,
    )
    chunk = KnowledgeChunk.objects.create(
        document=doc,
        chunk_index=0,
        title="智慧园区项目案例",
        content="这是一个智慧园区项目的实施方案，包含物联网平台、数据中台和应用系统。",
        content_hash="hash1",
        bm25_text="智慧园区 项目 案例 实施方案 物联网 平台 数据 中台 应用 系统",
    )
    return {"user": user, "kb": kb, "doc": doc, "chunk": chunk}


@pytest.mark.django_db
class TestRetrievalService:
    """检索服务测试。"""

    def test_keyword_search(self, setup_knowledge_data):
        """测试关键词检索。"""
        kb = setup_knowledge_data["kb"]
        user = setup_knowledge_data["user"]

        result = RetrievalService().search(
            query="智慧园区",
            knowledge_base_ids=[kb.id],
            top_k=10,
            created_by=user,
        )

        assert result["query"] == "智慧园区"
        assert len(result["results"]) >= 1
        assert result["latency_ms"] > 0
        assert result["log_id"] is not None

    def test_search_returns_dict(self, setup_knowledge_data):
        """测试检索返回字典类型。"""
        kb = setup_knowledge_data["kb"]
        user = setup_knowledge_data["user"]

        result = RetrievalService().search(
            query="测试查询",
            knowledge_base_ids=[kb.id],
            created_by=user,
        )

        assert isinstance(result, dict)
        assert "query" in result
        assert "results" in result
        assert "latency_ms" in result
        assert "log_id" in result


@pytest.mark.django_db
class TestRagContextBuilder:
    """RAG 上下文构建器测试。"""

    def test_build_context(self, setup_knowledge_data):
        """测试构建 RAG 上下文。"""
        chunk = setup_knowledge_data["chunk"]

        results = [{
            "chunk_id": chunk.id,
            "document_title": "test.pdf",
            "knowledge_base_name": "测试知识库",
            "section_path": "",
            "page_start": None,
            "page_end": None,
            "content": chunk.content,
        }]

        context = RagContextBuilder().build(results)

        assert "text" in context
        assert "sources" in context
        assert context["chunk_count"] == 1

    def test_truncation_fallback(self):
        """测试超长内容截断保底。"""
        long_content = "测试内容" * 10000
        results = [{
            "chunk_id": 1,
            "document_title": "test.pdf",
            "knowledge_base_name": "测试知识库",
            "section_path": "",
            "page_start": None,
            "page_end": None,
            "content": long_content,
        }]

        context = RagContextBuilder().build(results, max_tokens=100)

        # 即使超长，也应该有内容
        assert len(context["text"]) > 0
        assert context["chunk_count"] >= 1

import pytest
from unittest.mock import patch, MagicMock
from apps.knowledge.services.retrieval_service import RetrievalService
from apps.knowledge.constants import RetrievalMode


@pytest.mark.django_db
class TestRetrievalServiceHybridFallback:
    """RetrievalService HYBRID 降级与 trace 字段测试。"""

    def test_search_accepts_retrieval_run_id(self, django_user_model):
        user = django_user_model.objects.create_user(username="u", password="p")
        service = RetrievalService()
        with patch.object(service, "_hybrid_search", return_value=[]):
            result = service.search(
                query="test", knowledge_base_ids=[1], top_k=5,
                retrieval_mode=RetrievalMode.HYBRID,
                created_by=user,
                retrieval_run_id="run-uuid-xxx",
                trace_meta={"channel": "company_info"},
            )
        assert result["latency_ms"] >= 0

    def test_hybrid_falls_back_to_fulltext(self, django_user_model):
        user = django_user_model.objects.create_user(username="u", password="p")
        service = RetrievalService()
        with patch.object(service, "_vector_search", return_value=[]), \
             patch.object(service, "_fulltext_search", return_value=[]) as ft_mock:
            service._hybrid_search(MagicMock(), "query", 5)
        assert ft_mock.called
