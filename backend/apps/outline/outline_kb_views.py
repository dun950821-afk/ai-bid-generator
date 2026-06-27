# backend/apps/outline/outline_kb_views.py
"""大纲-知识库绑定 + 章节 RAG 视图。"""

import uuid

from django.contrib.auth import get_user_model
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.knowledge.services.retrieval_orchestrator import RetrievalOrchestrator
from apps.outline.models import (
    Outline, OutlineKnowledgeBase, Section, SectionGenerationRecord, SectionManualSource,
)
from apps.outline.outline_kb_serializer import (
    OutlineKnowledgeBaseSerializer, OutlineKbBindingSerializer,
)

User = get_user_model()


class OutlineKnowledgeBaseViewSet(viewsets.ModelViewSet):
    """大纲知识库绑定。"""

    serializer_class = OutlineKnowledgeBaseSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        outline_id = self.kwargs.get("outline_id")
        return OutlineKnowledgeBase.objects.filter(outline_id=outline_id)

    def create(self, request, *args, **kwargs):
        """批量绑定。"""
        outline_id = self.kwargs["outline_id"]
        serializer = OutlineKbBindingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        kb_ids = serializer.validated_data["kb_ids"]

        outline = Outline.objects.get(pk=outline_id)
        created = []
        for sort_order, kb_id in enumerate(kb_ids):
            obj, _ = OutlineKnowledgeBase.objects.get_or_create(
                outline=outline, knowledge_base_id=kb_id,
                defaults={"sort_order": sort_order, "created_by": request.user},
            )
            created.append(obj)
        return Response(
            OutlineKnowledgeBaseSerializer(created, many=True).data,
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        outline_id = self.kwargs["outline_id"]
        binding_id = self.kwargs["pk"]
        OutlineKnowledgeBase.objects.filter(
            id=binding_id, outline_id=outline_id
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def partial_update(self, request, *args, **kwargs):
        outline_id = self.kwargs["outline_id"]
        binding_id = self.kwargs["pk"]
        binding = OutlineKnowledgeBase.objects.get(id=binding_id, outline_id=outline_id)
        for field in ("sort_order", "is_active"):
            if field in request.data:
                setattr(binding, field, request.data[field])
        binding.save()
        return Response(OutlineKnowledgeBaseSerializer(binding).data)


class SectionRetrievalSearchView(APIView):
    """章节手动检索。"""

    permission_classes = [IsAuthenticated]

    def post(self, request, section_id):
        section = Section.objects.get(pk=section_id)
        query = request.data.get("query", section.title or "")
        channels = request.data.get("channels")
        knowledge_base_ids = request.data.get("knowledge_base_ids")
        top_k = request.data.get("top_k", 10)

        orchestrator = RetrievalOrchestrator()
        plan = orchestrator._plan_retrieval(
            outline=section.outline, section=section, user=request.user,
            generation_mode=None, analysis_result=None,
            override_kb_ids=knowledge_base_ids,
        )
        if channels:
            plan.channel_queries = [
                cq for cq in plan.channel_queries if cq.channel in channels
            ]
        ctx = orchestrator._execute(
            plan, request.user, str(uuid.uuid4()),
            manual_sources=None, manual_source_mode="auto",
        )
        return Response({
            "retrieval_run_id": ctx.retrieval_run_id,
            "results": ctx.sources,
            "warnings": ctx.warnings,
        })


class SectionManualSourceViewSet(viewsets.ModelViewSet):
    """章节人工选源 CRUD。"""

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        section_id = self.kwargs.get("section_id")
        return SectionManualSource.objects.filter(section_id=section_id)

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        data = [
            {
                "id": m.id, "chunk_id": m.chunk_id, "document_id": m.document_id,
                "document_title": m.document_title, "kb_id": m.kb_id, "kb_name": m.kb_name,
                "channel": m.channel, "content_preview": m.content_preview,
                "section_path": m.section_path, "page_start": m.page_start,
                "page_end": m.page_end, "created_at": m.created_at,
            }
            for m in qs
        ]
        return Response(data)

    def create(self, request, *args, **kwargs):
        section_id = self.kwargs["section_id"]
        sources = request.data.get("sources", [])
        created = []
        for s in sources:
            obj, _ = SectionManualSource.objects.update_or_create(
                section_id=section_id, chunk_id=s["chunk_id"],
                defaults={
                    "document_id": s.get("document_id"),
                    "document_title": s.get("document_title", ""),
                    "kb_id": s.get("kb_id"),
                    "kb_name": s.get("kb_name", ""),
                    "channel": s.get("channel", "company_info"),
                    "content_preview": s.get("content_preview", ""),
                    "section_path": s.get("section_path", ""),
                    "page_start": s.get("page_start"),
                    "page_end": s.get("page_end"),
                    "selected_by": request.user,
                },
            )
            created.append(obj)
        return Response({"created_count": len(created)}, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        section_id = self.kwargs["section_id"]
        source_id = self.kwargs["pk"]
        SectionManualSource.objects.filter(
            id=source_id, section_id=section_id
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SectionLatestGenerationRecordView(APIView):
    """章节最近生成记录（含 rag_sources）。"""

    permission_classes = [IsAuthenticated]

    def get(self, request, section_id):
        record = (
            SectionGenerationRecord.objects.filter(section_id=section_id)
            .order_by("-created_at")
            .first()
        )
        if not record:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response({
            "id": record.id,
            "status": record.status,
            "rag_sources": record.rag_sources or [],
            "generation_meta": record.generation_meta or {},
            "finished_at": record.finished_at,
            "created_at": record.created_at,
        })
