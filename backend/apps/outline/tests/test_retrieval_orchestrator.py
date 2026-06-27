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
