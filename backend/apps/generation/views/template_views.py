# backend/apps/generation/views.py
"""提示词管理 API 视图。"""

from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError

from apps.generation.models import PromptTemplate, PromptVersion, ModelProvider, ModelConfig
from apps.generation.serializers import (
    PromptTemplateSerializer,
    PromptTemplateDetailSerializer,
    PromptVersionSerializer,
    PromptVersionCreateSerializer,
    ModelProviderSerializer,
    ModelConfigSerializer,
)
from apps.generation.constants import PromptVersionStatus, PromptScope
from apps.accounts.permissions import RequirePermission


class PromptTemplateListView(generics.ListCreateAPIView):
    """提示词模板列表/新建。"""

    serializer_class = PromptTemplateSerializer
    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "prompt_template.manage"

    def get_queryset(self):
        queryset = PromptTemplate.objects.prefetch_related("versions")
        scenario = self.request.query_params.get("scenario")
        if scenario:
            queryset = queryset.filter(scenario=scenario)
        scope = self.request.query_params.get("scope")
        if scope:
            queryset = queryset.filter(scope=scope)
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == "true")
        return queryset.order_by("scenario", "key")

    def perform_create(self, serializer):
        # P0 只允许创建 system scope，忽略用户传入的 scope
        serializer.save(scope=PromptScope.SYSTEM)


class PromptTemplateDetailView(generics.RetrieveUpdateDestroyAPIView):
    """提示词模板详情/更新/停用。

    注意：删除操作实际上是停用（is_active=False），不是物理删除。
    这是为了保护 PromptRun 的审计链路。
    """

    serializer_class = PromptTemplateDetailSerializer
    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "prompt_template.manage"

    def get_queryset(self):
        return PromptTemplate.objects.prefetch_related("versions")

    def perform_destroy(self, instance):
        """停用模板而非物理删除。"""
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class PromptVersionListView(generics.ListCreateAPIView):
    """提示词版本列表/新建。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "prompt_template.manage"
    pagination_class = None  # 版本数量有限，不分页，直接返回数组

    def get_queryset(self):
        template_id = self.kwargs["template_id"]
        return PromptVersion.objects.filter(template_id=template_id).order_by("-created_at")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return PromptVersionCreateSerializer
        return PromptVersionSerializer

    def perform_create(self, serializer):
        template_id = self.kwargs["template_id"]
        template = PromptTemplate.objects.get(pk=template_id)
        serializer.save(template=template, created_by=self.request.user)


class PromptVersionDetailView(generics.RetrieveUpdateDestroyAPIView):
    """提示词版本详情/更新/删除。

    约束：
    - draft: 可编辑、可删除、可发布
    - published: 不可编辑、不可删除（保护审计复现）
    - archived: 不可编辑、不可删除（P0）
    """

    serializer_class = PromptVersionSerializer
    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "prompt_template.manage"
    lookup_url_kwarg = "version_id"

    def get_queryset(self):
        template_id = self.kwargs["template_id"]
        return PromptVersion.objects.filter(template_id=template_id)

    def perform_update(self, serializer):
        """只有草稿版本可以编辑。"""
        if self.get_object().status != PromptVersionStatus.DRAFT:
            raise ValidationError("只有草稿版本可以编辑")
        serializer.save()

    def perform_destroy(self, instance):
        """已发布/归档版本不能删除。"""
        if instance.status == PromptVersionStatus.PUBLISHED:
            raise ValidationError("已发布版本不能删除")
        if instance.status == PromptVersionStatus.ARCHIVED:
            raise ValidationError("归档版本不能删除")
        instance.delete()


class PromptVersionPublishView(APIView):
    """发布提示词版本。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "prompt_template.manage"

    def post(self, request, template_id, version_id):
        try:
            version = PromptVersion.objects.get(
                pk=version_id,
                template_id=template_id,
            )
        except PromptVersion.DoesNotExist:
            return Response({"detail": "版本不存在"}, status=status.HTTP_404_NOT_FOUND)

        if version.status == PromptVersionStatus.PUBLISHED:
            return Response({"detail": "该版本已发布"}, status=status.HTTP_400_BAD_REQUEST)

        if version.status == PromptVersionStatus.ARCHIVED:
            return Response({"detail": "归档版本不能发布"}, status=status.HTTP_400_BAD_REQUEST)

        version.publish()
        return Response(PromptVersionSerializer(version).data)


class PromptVersionCopyView(APIView):
    """基于已发布/归档版本创建新草稿。

    只允许复制 published/archived 版本，draft 版本可直接编辑无需复制。
    """

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "prompt_template.manage"

    def post(self, request, template_id, version_id):
        try:
            source = PromptVersion.objects.get(
                pk=version_id,
                template_id=template_id,
            )
        except PromptVersion.DoesNotExist:
            return Response({"detail": "版本不存在"}, status=status.HTTP_404_NOT_FOUND)

        if source.status == PromptVersionStatus.DRAFT:
            return Response(
                {"detail": "草稿版本无需复制，可直接编辑"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 生成新版本号
        existing_versions = PromptVersion.objects.filter(
            template_id=template_id
        ).values_list("version", flat=True)
        new_version = self._increment_version(source.version, existing_versions)

        new_draft = PromptVersion.objects.create(
            template=source.template,
            version=new_version,
            system_prompt=source.system_prompt,
            user_prompt=source.user_prompt,
            output_schema=source.output_schema,
            variable_schema=source.variable_schema,
            changelog=f"基于 {source.version} 复制",
            created_by=request.user,
        )
        return Response(PromptVersionSerializer(new_draft).data, status=status.HTTP_201_CREATED)

    def _increment_version(self, base_version: str, existing: list) -> str:
        """生成递增版本号。"""
        base = f"{base_version}-copy"
        n = 1
        while f"{base}{n}" in existing:
            n += 1
        return f"{base}{n}"


class ModelProviderListView(generics.ListAPIView):
    """模型供应商列表。"""

    serializer_class = ModelProviderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ModelProvider.objects.filter(is_active=True).order_by("name")


class ModelConfigListView(generics.ListAPIView):
    """模型配置列表。"""

    serializer_class = ModelConfigSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = ModelConfig.objects.select_related("provider").filter(is_active=True)
        model_type = self.request.query_params.get("model_type")
        if model_type:
            queryset = queryset.filter(model_type=model_type)
        return queryset.order_by("provider__name", "model_name")