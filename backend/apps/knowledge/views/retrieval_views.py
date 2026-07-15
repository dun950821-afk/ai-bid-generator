# backend/apps/knowledge/views/retrieval_views.py
"""检索视图。"""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import RequirePermission
from apps.knowledge.serializers import RetrievalTestSerializer
from apps.knowledge.services.retrieval_service import RetrievalService
from apps.knowledge.services.rag_context_builder import RagContextBuilder


class RetrievalTestView(APIView):
    """检索测试。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "knowledge.manage"

    def post(self, request):
        serializer = RetrievalTestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data

        result = RetrievalService().search(
            query=data["query"],
            knowledge_base_ids=data["knowledge_base_ids"],
            top_k=data.get("top_k", 10),
            filters=data.get("filters"),
            retrieval_mode=data.get("retrieval_mode"),
            created_by=request.user,
        )

        # 构建 RAG 上下文预览
        rag_context = RagContextBuilder().build(result["results"])

        return Response({
            **result,
            "rag_context": rag_context,
        })