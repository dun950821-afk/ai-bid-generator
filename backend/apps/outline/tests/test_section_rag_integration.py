# backend/apps/outline/tests/test_section_rag_integration.py
"""正文生成 RAG 集成测试。"""

import pytest
from unittest.mock import patch
from django.contrib.auth import get_user_model

from apps.knowledge.models import KnowledgeBase
from apps.knowledge.services.retrieval_orchestrator import (
    RetrievedChunk, RetrievedContext, RetrievalPlan,
)
from apps.outline.models import Outline, OutlineKnowledgeBase, Section
from apps.outline.services.section_generation_service import SectionGenerationService
from apps.projects.models import Lot, Project

User = get_user_model()


@pytest.mark.django_db
class TestSectionRagIntegration:
    """正文生成接入 Orchestrator 测试。"""

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
        kb = KnowledgeBase.objects.create(
            name="KB", kb_type="company_profile", created_by=self.user
        )
        OutlineKnowledgeBase.objects.create(outline=self.outline, knowledge_base=kb)

    def test_prepare_context_includes_rag_sources(self):
        fake_ctx = RetrievedContext(
            retrieval_run_id="run-1",
            plan=RetrievalPlan(mode="retrieval", channel_queries=[],
                               outline_kb_ids=[1], fallback_to_global=False, reason=""),
            by_channel={},
            fused=[RetrievedChunk(
                chunk_id=1, document_id=10, document_title="d.pdf",
                kb_id=1, kb_name="KB", channel="company_info",
                score=0.9, rank=1, content="c", content_preview="c",
                section_path="s", page_start=1, page_end=2,
            )],
            sources=[{
                "chunk_id": 1, "document_id": 10, "document_title": "d.pdf",
                "kb_id": 1, "kb_name": "KB", "channel": "company_info",
                "score": 0.9, "rank": 1, "section_path": "s",
                "page_start": 1, "page_end": 2,
            }],
            metadata_snapshot={},
            latency_ms=10,
            warnings=[],
        )
        with patch("apps.knowledge.services.retrieval_orchestrator.RetrievalOrchestrator.retrieve_for_section",
                   return_value=fake_ctx):
            ctx = SectionGenerationService().prepare_generation_context(
                section_id=self.section.id,
                analysis_result={"keywords": ["公司"]},
                user_prompt="",
                user_id=self.user.id,
            )
        assert "rag_sources" in ctx
        assert len(ctx["rag_sources"]) == 1
        assert ctx["rag_sources"][0]["chunk_id"] == 1
        assert "retrieval_meta" in ctx
        assert ctx["retrieval_meta"]["retrieval_run_id"] == "run-1"
