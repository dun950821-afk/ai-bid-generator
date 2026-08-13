# -*- coding: utf-8 -*-
"""响应模板 API 视图。

- POST   /api/response-templates/           创建(传 tender_file_id)并触发识别
- GET    /api/response-templates/?project_id= 列表
- GET    /api/response-templates/{id}/      详情(含块列表)
- PATCH  /api/response-templates/{id}/      更新(名称/大纲关联)
- PATCH  /api/response-templates/{id}/blocks/{block_id}/  更新块(类型/绑定/确认)
- POST   /api/response-templates/{id}/confirm/   确认模板(触发生成前置状态)
- POST   /api/response-templates/{id}/generate/  触发生成
- GET    /api/response-templates/{id}/precheck/  生成前数据完备性预检
- GET    /api/response-documents/{id}/onlyoffice_config/  产物 ONLYOFFICE 校对配置
- GET    /api/response-documents/{id}/file/      产物文件代理(ONLYOFFICE 下载用)
"""

import logging
import time

import jwt
from django.conf import settings
from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import MustChangePasswordPermission
from apps.response_template.constants import BlockConfirmStatus, BlockType, TemplateStatus
from apps.response_template.models import (
    TenderResponseDocument,
    TenderResponseTemplate,
    TenderTemplateBlock,
)
from apps.response_template.serializers import (
    TenderResponseDocumentSerializer,
    TenderResponseTemplateSerializer,
    TenderTemplateBlockSerializer,
)
from apps.tender.models import TenderFile

logger = logging.getLogger(__name__)


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
        source_file_id = self.request.query_params.get("source_file_id")
        if source_file_id:
            qs = qs.filter(source_file_id=source_file_id)
        lot_id = self.request.query_params.get("lot_id")
        if lot_id:
            qs = qs.filter(lot_id=lot_id)
        return qs

    def create(self, request, *args, **kwargs):
        """创建响应模板: 传 tender_file_id → 关联项目/解析文档 → 触发识别任务。

        幂等: 同一招标文件已有模板(非失败状态)时直接返回已有模板, 不重复创建。
        """
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

        # 幂等: 同源文件已有模板(非失败) → 返回已有
        existing = (
            TenderResponseTemplate.objects.filter(source_file=tf)
            .exclude(status=TemplateStatus.FAILED)
            .first()
        )
        if existing:
            return Response(self.get_serializer(existing).data, status=status.HTTP_200_OK)

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

        # 触发识别任务(纳入队列管理)
        from apps.common.models import AsyncTask
        from apps.response_template.tasks import analyze_response_template

        task = AsyncTask.objects.create(
            task_type="response_template.analyze",
            related_object_type="TenderResponseTemplate",
            related_object_id=str(template.id),
            input_payload={"tender_file_id": tf.id},
            created_by=request.user,
        )
        analyze_response_template.delay(task.id, template.id)

        return Response(
            self.get_serializer(template).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["post"], url_path="re-analyze")
    def re_analyze(self, request, pk=None):
        """重新识别: 删除旧块, 重置状态, 重新触发识别任务。"""
        template = self.get_object()
        template.blocks.all().delete()
        template.status = TemplateStatus.PENDING
        template.schema_json = []
        template.summary_json = {}
        template.confidence = None
        template.error_message = ""
        template.updated_by = request.user
        template.save(update_fields=[
            "status", "schema_json", "summary_json", "confidence",
            "error_message", "updated_by", "updated_at",
        ])

        from apps.common.models import AsyncTask
        from apps.response_template.tasks import analyze_response_template

        task = AsyncTask.objects.create(
            task_type="response_template.analyze",
            related_object_type="TenderResponseTemplate",
            related_object_id=str(template.id),
            input_payload={"tender_file_id": template.source_file_id, "re_analyze": True},
            created_by=request.user,
        )
        analyze_response_template.delay(task.id, template.id)
        return Response(
            {"detail": "重新识别已启动"}, status=status.HTTP_202_ACCEPTED
        )

    @action(detail=True, methods=["get"], url_path="source-file")
    def source_file_download(self, request, pk=None):
        """返回源招标文件 docx 二进制(原文对照按原格式渲染用)。"""
        from django.http import HttpResponse

        from apps.common.services.storage import ObjectNotFound, StorageService

        template = self.get_object()
        try:
            content = StorageService().get_object(template.source_file.object_key)
        except ObjectNotFound:
            return Response({"detail": "源文件不存在"}, status=status.HTTP_404_NOT_FOUND)
        except Exception:
            logger.exception("source file download failed: template=%s", pk)
            return Response({"detail": "源文件读取失败"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return HttpResponse(
            content,
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

    @action(detail=True, methods=["get"], url_path="source-markdown")
    def source_markdown(self, request, pk=None):
        """返回解析后的招标文件 markdown 文本(双栏预览用)。"""
        template = self.get_object()
        pd = template.parsed_document
        if not pd or not pd.markdown_uri:
            return Response({"content": "", "error": "无解析产物"}, status=status.HTTP_200_OK)
        try:
            from apps.common.services.storage import StorageService

            content = StorageService().get_object(pd.markdown_uri).decode("utf-8", "replace")
            return Response({"content": content[:30000], "error": ""})
        except Exception as exc:
            return Response({"content": "", "error": str(exc)[:200]}, status=status.HTTP_200_OK)

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

    @action(detail=True, methods=["get"])
    def precheck(self, request, pk=None):
        """生成前数据完备性预检。

        返回缺失项清单, 前端引导用户补齐(企业资料/材料包/人员库/报价):
        - missing_company_fields: 已绑定但企业资料为空的字段
        - unbound_fields: 无绑定规则的自动字段(需在 Word 中人工填写)
        - missing_materials: 材料包中缺失的材料
        - members_empty: 有人员重复块但人员库为空
        - unfilled_price: 未填报价的块
        - signature_count / manual_count: 落款与纯人工块统计
        """
        template = self.get_object()
        blocks = list(template.blocks.all())

        from apps.enterprise.models import CompanyProfile, ProjectMember

        company = CompanyProfile.objects.filter(is_default=True).first()

        missing_company = {}
        unbound = []
        for b in blocks:
            if b.block_type not in (BlockType.AUTO_FIELD, BlockType.DATA_TABLE):
                continue
            field = (b.binding_config or {}).get("field", "")
            if not field:
                unbound.append({"block_key": b.block_key, "title": b.title})
                continue
            if field.startswith("company."):
                attr = field.split(".", 1)[1]
                value = getattr(company, attr, None) if company else None
                if value in (None, ""):
                    missing_company.setdefault(field, []).append(b.block_key)

        package = company.material_packages.first() if company else None
        missing_materials = {}
        for b in blocks:
            if b.block_type != BlockType.MATERIAL_SLOT:
                continue
            usage_key = (b.binding_config or {}).get("usage_key", "")
            if not usage_key:
                missing_materials.setdefault("(未绑定材料)", []).append(b.block_key)
                continue
            material = package.get_material_by_usage_key(usage_key) if package else None
            if material is None or not getattr(material, "object_key", ""):
                missing_materials.setdefault(usage_key, []).append(b.block_key)

        has_member_block = any(
            b.block_type in (BlockType.REPEAT_BLOCK, BlockType.REPEAT_TABLE) for b in blocks
        )
        members_count = (
            ProjectMember.objects.filter(company=company).count() if company else 0
        )

        unfilled_price = [
            {"block_key": b.block_key, "title": b.title}
            for b in blocks
            if b.block_type == BlockType.PRICE
            and (b.fill_payload or {}).get("price") in (None, "")
        ]

        return Response({
            "missing_company_fields": [
                {"field": k, "blocks": v} for k, v in missing_company.items()
            ],
            "unbound_fields": unbound,
            "missing_materials": [
                {"usage_key": k, "blocks": v} for k, v in missing_materials.items()
            ],
            "members_empty": bool(has_member_block and members_count == 0),
            "unfilled_price": unfilled_price,
            "signature_count": sum(
                1 for b in blocks if (b.source_config or {}).get("is_signature")
            ),
            "manual_count": sum(
                1 for b in blocks
                if b.block_type == BlockType.MANUAL
                and not (b.source_config or {}).get("is_signature")
            ),
            "ready": not (
                missing_company or missing_materials or unfilled_price
            ),
        })

    @action(detail=True, methods=["post"])
    def generate(self, request, pk=None):
        """触发响应文件生成任务。

        状态约束: confirmed(首次)/ generated(重新生成)/ failed(重试) 可生成;
        pending/analyzing/analyzed 需先确认。
        """
        template = self.get_object()
        if template.status not in (
            TemplateStatus.CONFIRMED,
            TemplateStatus.GENERATED,
            TemplateStatus.FAILED,
        ):
            return Response(
                {"detail": "请先确认模板再生成"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from apps.common.models import AsyncTask
        from apps.response_template.tasks import fill_response_template

        task = AsyncTask.objects.create(
            task_type="response_template.fill",
            related_object_type="TenderResponseTemplate",
            related_object_id=str(template.id),
            input_payload={"tender_file_id": template.source_file_id},
            created_by=request.user,
        )
        fill_response_template.delay(task.id, template.id)
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


class ResponseDocumentViewSet(viewsets.ReadOnlyModelViewSet):
    """响应文件产物: ONLYOFFICE 在线校对配置 + 文件代理。"""

    queryset = TenderResponseDocument.objects.all()
    serializer_class = TenderResponseDocumentSerializer
    permission_classes = [IsAuthenticated, MustChangePasswordPermission]

    @action(detail=True, methods=["get"])
    def onlyoffice_config(self, request, pk=None):
        """获取 ONLYOFFICE 编辑器配置(与 outline 标书文档同一模式)。"""
        document = self.get_object()
        if not document.object_key:
            return Response(
                {"error": "文件尚未生成"}, status=status.HTTP_400_BAD_REQUEST
            )

        # 文件代理 URL(内嵌 JWT, ONLYOFFICE 服务器经后端代理下载)
        token = jwt.encode(
            {
                "response_document_id": document.id,
                "exp": int(time.time()) + 24 * 3600,
            },
            settings.ONLYOFFICE_JWT_SECRET,
            algorithm="HS256",
        )
        file_url = (
            f"{settings.ONLYOFFICE_PUBLIC_BASE_URL}"
            f"/api/response-documents/{document.id}/file/?token={token}"
        )
        callback_url = (
            f"{settings.ONLYOFFICE_PUBLIC_BASE_URL}"
            f"/api/onlyoffice/callback/response/{document.id}/"
        )

        config = {
            "document": {
                "fileType": "docx",
                # key 需随内容变化, 否则 ONLYOFFICE 命中缓存打开旧版本
                "key": f"response-{document.id}-{int(document.updated_at.timestamp())}",
                "title": document.title,
                "url": file_url,
                "permissions": {
                    "chat": False,
                    "comment": True,
                },
            },
            "documentType": "word",
            "editorConfig": {
                "mode": "edit",
                "lang": "zh-CN",
                "callbackUrl": callback_url,
                "user": {
                    "id": str(request.user.id) if request.user.is_authenticated else "anonymous",
                    "name": (
                        request.user.get_full_name() or request.user.username
                        if request.user.is_authenticated
                        else "匿名用户"
                    ),
                },
                "customization": {
                    "forcesave": True,
                    "features": {
                        "spellcheck": {
                            "mode": False,
                        },
                    },
                    "plugins": settings.ONLYOFFICE_ENABLE_PLUGINS,
                },
            },
        }
        config["token"] = jwt.encode(
            config, settings.ONLYOFFICE_JWT_SECRET, algorithm="HS256",
        )
        return Response({
            "documentServerUrl": settings.ONLYOFFICE_DOCUMENT_SERVER_URL,
            "config": config,
        })

    @action(
        detail=True,
        methods=["get", "head"],
        # 与 outline 同一考量: ONLYOFFICE 下载前发 HEAD, 预签名 URL 不支持,
        # 统一经此端点代理; 访问控制靠 URL 内 JWT, 认证/权限层跳过。
        authentication_classes=[],
        permission_classes=[AllowAny],
    )
    def file(self, request, pk=None):
        """ONLYOFFICE 文件代理下载端点。"""
        from django.http import HttpResponse

        from apps.common.services.storage import ObjectNotFound, StorageService

        token = request.query_params.get("token", "")
        try:
            payload = jwt.decode(
                token, settings.ONLYOFFICE_JWT_SECRET, algorithms=["HS256"],
            )
        except jwt.InvalidTokenError:
            return Response({"error": "无效的下载链接"}, status=status.HTTP_403_FORBIDDEN)
        if str(payload.get("response_document_id")) != str(pk):
            return Response({"error": "无效的下载链接"}, status=status.HTTP_403_FORBIDDEN)

        document = TenderResponseDocument.objects.filter(pk=pk).first()
        if document is None or not document.object_key:
            return Response({"error": "文件不存在"}, status=status.HTTP_404_NOT_FOUND)

        try:
            content = StorageService().get_object(document.object_key)
        except ObjectNotFound:
            return Response({"error": "文件不存在"}, status=status.HTTP_404_NOT_FOUND)
        except Exception:
            logger.exception("response document proxy download failed: %s", pk)
            return Response(
                {"error": "文件下载失败"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return HttpResponse(
            content,
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
