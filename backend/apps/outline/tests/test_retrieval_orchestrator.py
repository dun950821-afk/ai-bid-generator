# backend/apps/outline/tests/test_retrieval_orchestrator.py
"""RetrievalOrchestrator 测试。"""

import pytest
from django.contrib.auth import get_user_model

from apps.knowledge.models import KnowledgeBase
from apps.knowledge.services.retrieval_orchestrator import (
    RetrievalOrchestrator,
    ManualSourceMode,
)
from apps.outline.models import Outline, OutlineKnowledgeBase
from apps.projects.models import Lot, Project

User = get_user_model()


@pytest.mark.django_db
class TestResolveChannel:
    """resolve_channel 通道解析测试。"""

    def setup_method(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.orchestrator = RetrievalOrchestrator()

    def test_rag_channel_overrides_kb_type(self):
        kb = KnowledgeBase.objects.create(
            name="KB", kb_type="company_profile",
            rag_channel="historical_bid", created_by=self.user
        )
        assert self.orchestrator.resolve_channel(kb) == "historical_bid"

    def test_default_mapping_when_rag_channel_empty(self):
        kb = KnowledgeBase.objects.create(
            name="KB", kb_type="company_profile", created_by=self.user
        )
        assert self.orchestrator.resolve_channel(kb) == "company_info"

    def test_unknown_kb_type_returns_none(self):
        kb = KnowledgeBase.objects.create(
            name="KB", kb_type="unknown_type", created_by=self.user
        )
        assert self.orchestrator.resolve_channel(kb) is None


@pytest.mark.django_db
class TestCollectMetadataSnapshot:
    """collect_metadata_snapshot 矩阵元数据快照测试。"""

    def setup_method(self):
        self.user = User.objects.create_user(username="u", password="p")
        project = Project.objects.create(name="P", created_by=self.user)
        lot = Lot.objects.create(name="L", project=project)
        self.outline = Outline.objects.create(
            project=project, lot=lot, name="O", source="preset", created_by=self.user
        )
        self.orchestrator = RetrievalOrchestrator()

    def test_empty_metadata_when_no_bindings(self):
        ctx = self.orchestrator.collect_metadata_snapshot(self.outline, self.user)
        assert ctx.metadata_snapshot["has_kb_bindings"] is False
        assert ctx.metadata_snapshot["available_knowledge_bases"] == []
        assert ctx.fused == []
        assert ctx.by_channel == {}

    def test_metadata_includes_bound_kbs(self):
        kb = KnowledgeBase.objects.create(
            name="公司介绍库", kb_type="company_profile", created_by=self.user
        )
        OutlineKnowledgeBase.objects.create(outline=self.outline, knowledge_base=kb)
        ctx = self.orchestrator.collect_metadata_snapshot(self.outline, self.user)
        assert ctx.metadata_snapshot["has_kb_bindings"] is True
        assert len(ctx.metadata_snapshot["available_knowledge_bases"]) == 1
        assert ctx.metadata_snapshot["available_knowledge_bases"][0]["rag_channel"] == "company_info"


from unittest.mock import patch
from apps.outline.models import Section


@pytest.mark.django_db
class TestRetrieveForSection:
    """retrieve_for_section 正文检索测试。"""

    def setup_method(self):
        self.user = User.objects.create_user(username="u", password="p")
        project = Project.objects.create(name="P", created_by=self.user)
        lot = Lot.objects.create(name="L", project=project)
        self.outline = Outline.objects.create(
            project=project, lot=lot, name="O", source="preset", created_by=self.user
        )
        self.section = Section.objects.create(
            outline=self.outline, title="公司能力说明", level=1, sort_order=1
        )
        self.orchestrator = RetrievalOrchestrator()

    def test_retrieve_returns_fused_results(self):
        kb = KnowledgeBase.objects.create(
            name="KB", kb_type="company_profile", created_by=self.user
        )
        OutlineKnowledgeBase.objects.create(outline=self.outline, knowledge_base=kb)
        fake_results = {
            "results": [{
                "chunk_id": 1, "document_id": 10, "document_title": "doc.pdf",
                "knowledge_base_id": kb.id, "knowledge_base_name": "KB",
                "score": 0.9, "rank": 1, "title": "t", "content": "c",
                "content_preview": "c...", "section_path": "s",
                "page_start": 1, "page_end": 2,
            }]
        }
        with patch("apps.knowledge.services.retrieval_service.RetrievalService.search",
                   return_value=fake_results):
            ctx = self.orchestrator.retrieve_for_section(
                outline=self.outline, section=self.section, user=self.user
            )
        assert len(ctx.fused) == 1
        assert ctx.fused[0].channel == "company_info"
        assert ctx.sources[0]["chunk_id"] == 1

    def test_manual_only_mode_skips_vector_search(self):
        manual = [{
            "chunk_id": 99, "document_id": 9, "document_title": "manual.pdf",
            "kb_id": 1, "kb_name": "KB", "channel": "company_info",
            "score": 1.0, "rank": 1, "title": "t", "content": "c",
            "content_preview": "c", "section_path": "s", "page_start": None, "page_end": None,
        }]
        with patch("apps.knowledge.services.retrieval_service.RetrievalService.search") as mock_search:
            ctx = self.orchestrator.retrieve_for_section(
                outline=self.outline, section=self.section, user=self.user,
                manual_sources=manual, manual_source_mode=ManualSourceMode.ONLY,
            )
        assert mock_search.call_count == 0
        assert len(ctx.fused) == 1
        assert ctx.fused[0].chunk_id == 99
