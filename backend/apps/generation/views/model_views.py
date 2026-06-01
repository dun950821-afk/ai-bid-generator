# backend/apps/generation/views/model_views.py
"""模型供应商和配置管理视图。"""

from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from apps.generation.models import ModelProvider, ModelConfig
from apps.generation.serializers import (
    ModelProviderSerializer,
    ModelProviderCreateSerializer,
    ModelProviderUpdateSerializer,
    ModelConfigSerializer,
    ModelConfigCreateSerializer,
    ModelConfigUpdateSerializer,
)
from apps.accounts.permissions import RequirePermission


class ModelProviderListView(generics.ListCreateAPIView):
    """模型供应商列表/新建。"""

    serializer_class = ModelProviderSerializer
    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "system_settings.manage"

    def get_queryset(self):
        return ModelProvider.objects.all().order_by("name")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ModelProviderCreateSerializer
        return ModelProviderSerializer

    def perform_create(self, serializer):
        data = serializer.validated_data
        provider = ModelProvider(
            key=data["key"],
            name=data["name"],
            provider_type=data["provider_type"],
            base_url=data.get("base_url", ""),
            api_key_env=data.get("api_key_env", ""),
            is_active=data.get("is_active", True),
        )
        if data.get("api_key"):
            provider.set_api_key(data["api_key"])
        provider.save()


class ModelProviderDetailView(generics.RetrieveUpdateDestroyAPIView):
    """模型供应商详情/更新/删除。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "system_settings.manage"

    def get_queryset(self):
        return ModelProvider.objects.all()

    def get_serializer_class(self):
        if self.request.method in ["PUT", "PATCH"]:
            return ModelProviderUpdateSerializer
        return ModelProviderSerializer

    def perform_update(self, serializer):
        data = serializer.validated_data
        provider = self.get_object()
        for key, value in data.items():
            if key == "api_key" and value:
                provider.set_api_key(value)
            else:
                setattr(provider, key, value)
        provider.save()

    def perform_destroy(self, instance):
        # 检查是否有关联的 ModelConfig
        if instance.models.exists():
            # 软删除
            instance.is_active = False
            instance.save(update_fields=["is_active"])
        else:
            instance.delete()


class ModelConfigListView(generics.ListCreateAPIView):
    """模型配置列表/新建。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "system_settings.manage"

    def get_queryset(self):
        queryset = ModelConfig.objects.select_related("provider")
        model_type = self.request.query_params.get("model_type")
        if model_type:
            queryset = queryset.filter(model_type=model_type)
        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == "true")
        return queryset.order_by("provider__name", "model_name")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ModelConfigCreateSerializer
        return ModelConfigSerializer

    def perform_create(self, serializer):
        data = serializer.validated_data
        # provider is now a ModelProvider instance from PrimaryKeyRelatedField
        provider = data["provider"]
        config = ModelConfig(
            provider=provider,  # Use the instance directly
            model_name=data["model_name"],
            model_type=data.get("model_type", "chat"),
            display_name=data.get("display_name", ""),
            temperature=data.get("temperature", 0.2),
            max_tokens=data.get("max_tokens", 4096),
            top_p=data.get("top_p", 0.8),
            timeout_seconds=data.get("timeout_seconds", 60),
            retry_count=data.get("retry_count", 2),
            is_default=data.get("is_default", False),
            is_active=data.get("is_active", True),
            enable_thinking=data.get("enable_thinking", False),
            reasoning_effort=data.get("reasoning_effort", ""),
        )
        if config.is_default:
            ModelConfig.objects.filter(model_type=config.model_type).update(is_default=False)
        config.save()


class ModelConfigDetailView(generics.RetrieveUpdateDestroyAPIView):
    """模型配置详情/更新/删除。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "system_settings.manage"

    def get_queryset(self):
        return ModelConfig.objects.select_related("provider")

    def get_serializer_class(self):
        if self.request.method in ["PUT", "PATCH"]:
            return ModelConfigUpdateSerializer
        return ModelConfigSerializer

    def perform_update(self, serializer):
        data = serializer.validated_data
        config = self.get_object()
        # Handle provider specially - it's a ModelProvider instance from PrimaryKeyRelatedField
        if "provider" in data:
            config.provider = data["provider"]  # PrimaryKeyRelatedField returns the instance
        for key, value in data.items():
            if key == "provider":
                continue  # Already handled above
            if key == "is_default" and value:
                ModelConfig.objects.filter(model_type=config.model_type).update(is_default=False)
            setattr(config, key, value)
        config.save()


class ModelConfigSetDefaultView(APIView):
    """设置默认模型配置。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "system_settings.manage"

    def post(self, request, pk):
        try:
            config = ModelConfig.objects.get(pk=pk)
        except ModelConfig.DoesNotExist:
            return Response({"message": "配置不存在"}, status=status.HTTP_404_NOT_FOUND)

        # 清除同类型的其他默认
        ModelConfig.objects.filter(model_type=config.model_type).update(is_default=False)
        config.is_default = True
        config.is_active = True
        config.save()
        return Response(ModelConfigSerializer(config).data)


class ModelConfigTestConnectionView(APIView):
    """测试模型连接。"""

    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "system_settings.manage"

    def post(self, request, pk):
        """测试模型配置是否可以正常调用。

        发送一个简单的测试请求，验证 API Key 和模型配置是否正确。
        """
        try:
            config = ModelConfig.objects.select_related("provider").get(pk=pk)
        except ModelConfig.DoesNotExist:
            return Response({"message": "配置不存在"}, status=status.HTTP_404_NOT_FOUND)

        from apps.generation.services.llm_service import LLMService

        llm_service = LLMService()

        try:
            response = llm_service.chat(
                model_config=config,
                system_prompt="你是一个测试助手。",
                user_prompt="请回复'连接成功'。",
            )
            return Response({
                "success": True,
                "message": "连接成功",
                "model_name": config.model_name,
                "provider_type": config.provider.provider_type,
                "latency_ms": response.latency_ms,
                "prompt_tokens": response.prompt_tokens,
                "completion_tokens": response.completion_tokens,
                "response_preview": response.text[:100] if response.text else "",
            })
        except ValueError as e:
            return Response({
                "success": False,
                "message": str(e),
                "error_type": "config_error",
            }, status=status.HTTP_400_BAD_REQUEST)
        except RuntimeError as e:
            error_msg = str(e)
            error_type = "api_error"
            if "认证失败" in error_msg:
                error_type = "auth_error"
            elif "限流" in error_msg:
                error_type = "rate_limit"
            elif "超时" in error_msg:
                error_type = "timeout"
            elif "请求参数错误" in error_msg:
                error_type = "bad_request"

            return Response({
                "success": False,
                "message": error_msg,
                "error_type": error_type,
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({
                "success": False,
                "message": f"未知错误: {str(e)}",
                "error_type": "unknown",
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)