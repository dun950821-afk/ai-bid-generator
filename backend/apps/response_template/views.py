# -*- coding: utf-8 -*-
"""响应模板 API 视图。

- POST   /api/response-templates/           创建(传 tender_file_id)并触发识别
- GET    /api/response-templates/?project_id= 列表
- GET    /api/response-templates/{id}/      详情(含块列表)
- PATCH  /api/response-templates/{id}/      更新(名称/大纲关联)
- PATCH  /api/response-templates/{id}/blocks/{block_id}/  更新块(类型/绑定/确认)
- POST   /api/response-templates/{id}/confirm/   确认模板(触发生成前置状态)
- POST   /api/response-templates/{id}/generate/  触发生成
"""

from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import MustChangePasswordPermission
from apps.response_template.constants import BlockConfirmStatus, TemplateStatus
from apps.response_template.models import (
    TenderResponseTemplate,
    TenderTemplateBlock,
)
from apps.response_template.serializers import (
    TenderResponseTemplateSerializer,
    TenderTemplateBlockSerializer,
)
from apps.tender.models import TenderFile


class ResponseTemplateViewSet(viewsets.ModelViewSet):
    """响应模板 CRUD + 识别/确认/生成动作。"""

    queryset = TenderResponseTemplate.objects.select_related(
        "project", "lot", "source_file", "parsed_document"
    ).all()
    serializer_class = TenderResponseTemplateSerializer
    permission_classes = [IsAuthenticated, MustChangePasswordPermission]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset().prefetch_related("blocks", "documents")
        project_id = self.request.query_params.get("project_id")
        if project_id:
            qs = qs.filter(project_id=project_id)
        return qs

    def create(self, request, *args, **kwargs):
        """创建响应模板: 传 tender_file_id → 关联项目/解析文档 → 触发识别任务。"""
        tender_file_id = request.data.get("tender_file_id")
        if not tender_file_id:
            return Response(
                {"detail": "缺少 tender_file_id"}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            tf = TenderFile.objects.select_related("project", "lot").get(pk=tender_file_id)
        except TenderFile.DoesNotExist:
            return Response(
                {"detail": "招标文件不存在"}, status=status.HTTP_404_NOT_FOUND
            )

        pd = tf.parsed_documents.filter(is_active=True).first()
        name = request.data.get("name") or f"{tf.original_name} 响应模板"

        with transaction.atomic():
            template = TenderResponseTemplate.objects.create(
                project=tf.project,
                lot=tf.lot,
                source_file=tf,
                parsed_document=pd,
                name=name[:255],
                status=TemplateStatus.PENDING,
                created_by=request.user,
                updated_by=request.user,
            )

        # 触发识别任务
        from apps.response_template.tasks import analyze_response_template

        analyze_response_template.delay(template.id)

        return Response(
            self.get_serializer(template).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        """确认模板, 进入可生成状态。未确认块(低置信度/人工类型)不阻断, 但记录。"""
        template = self.get_object()
        if template.status not in (TemplateStatus.ANALYZED, TemplateStatus.CONFIRMED):
            return Response(
                {"detail": f"当前状态不可确认: {template.status}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        template.blocks.update(confirm_status=BlockConfirmStatus.CONFIRMED)
        template.status = TemplateStatus.CONFIRMED
        template.updated_by = request.user
        template.save(update_fields=["status", "updated_by", "updated_at"])
        return Response(self.get_serializer(template).data)

    @action(detail=True, methods=["post"])
    def generate(self, request, pk=None):
        """触发响应文件生成任务。"""
        template = self.get_object()
        if template.status != TemplateStatus.CONFIRMED:
            return Response(
                {"detail": "请先确认模板再生成"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from apps.response_template.tasks import fill_response_template

        fill_response_template.delay(template.id)
        return Response({"detail": "生成任务已提交"}, status=status.HTTP_202_ACCEPTED)


class ResponseTemplateBlockViewSet(viewsets.ModelViewSet):
    """块操作: PATCH 修改类型/绑定/确认。"""

    queryset = TenderTemplateBlock.objects.all()
    serializer_class = TenderTemplateBlockSerializer
    permission_classes = [IsAuthenticated, MustChangePasswordPermission]
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        qs = super().get_queryset()
        template_id = self.request.query_params.get("template_id")
        if template_id:
            qs = qs.filter(template_id=template_id)
        return qs
