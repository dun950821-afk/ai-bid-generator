"""系统配置视图。"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import MustChangePasswordPermission, RequirePermission
from apps.system_config.models import SystemSetting, StorageConfig, EmbeddingConfig, RagSettings
from apps.system_config.serializers import (
    SystemSettingSerializer,
    StorageConfigCreateSerializer,
    StorageConfigUpdateSerializer,
    CorsConfigSerializer,
    EmbeddingConfigSerializer,
    EmbeddingConfigCreateSerializer,
    EmbeddingConfigUpdateSerializer,
    EmbeddingTestSerializer,
    RagSettingsSerializer,
)


class SystemSettingView(APIView):
    """系统设置视图。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def get(self, request):
        """获取系统设置。"""
        setting = SystemSetting.get_singleton()
        return Response(SystemSettingSerializer(setting).data)

    def patch(self, request):
        """更新系统设置。"""
        setting = SystemSetting.get_singleton()
        serializer = SystemSettingSerializer(setting, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class StorageConfigListView(APIView):
    """存储配置列表视图。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def get(self, request):
        """获取存储配置列表。"""
        configs = StorageConfig.objects.all()
        data = [c.to_dict_safe() for c in configs]
        return Response(data)

    def post(self, request):
        """创建存储配置。"""
        serializer = StorageConfigCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        config = StorageConfig(
            name=data["name"],
            is_default=data.get("is_default", False),
            provider=data.get("provider", "minio"),
            endpoint=data["endpoint"],
            public_endpoint=data.get("public_endpoint", ""),
            bucket=data["bucket"],
            region=data.get("region", ""),
            secure=data.get("secure", False),
            proxy_enabled=data.get("proxy_enabled", False),
            presign_expire_seconds=data.get("presign_expire_seconds", 3600),
        )
        config.set_access_key(data["access_key"])
        config.set_secret_key(data["secret_key"])

        if config.is_default:
            StorageConfig.objects.update(is_default=False)

        config.save()
        return Response(config.to_dict_safe(), status=status.HTTP_201_CREATED)


class StorageConfigDetailView(APIView):
    """存储配置详情视图。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def get(self, request, pk):
        """获取存储配置详情。"""
        try:
            config = StorageConfig.objects.get(pk=pk)
            return Response(config.to_dict_safe())
        except StorageConfig.DoesNotExist:
            return Response({"message": "配置不存在"}, status=status.HTTP_404_NOT_FOUND)

    def patch(self, request, pk):
        """更新存储配置。"""
        try:
            config = StorageConfig.objects.get(pk=pk)
        except StorageConfig.DoesNotExist:
            return Response({"message": "配置不存在"}, status=status.HTTP_404_NOT_FOUND)

        serializer = StorageConfigUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        for key, value in data.items():
            if key == "access_key" and value:
                config.set_access_key(value)
            elif key == "secret_key" and value:
                config.set_secret_key(value)
            elif key == "is_default" and value:
                StorageConfig.objects.update(is_default=False)
                setattr(config, key, value)
            else:
                setattr(config, key, value)

        config.save()
        return Response(config.to_dict_safe())

    def delete(self, request, pk):
        """删除存储配置。"""
        try:
            config = StorageConfig.objects.get(pk=pk)
            config.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except StorageConfig.DoesNotExist:
            return Response({"message": "配置不存在"}, status=status.HTTP_404_NOT_FOUND)


class StorageConfigSetDefaultView(APIView):
    """设置默认存储配置。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def post(self, request, pk):
        """设置默认存储配置。"""
        try:
            config = StorageConfig.objects.get(pk=pk)
            StorageConfig.objects.update(is_default=False)
            config.is_default = True
            config.save()
            return Response(config.to_dict_safe())
        except StorageConfig.DoesNotExist:
            return Response({"message": "配置不存在"}, status=status.HTTP_404_NOT_FOUND)


class StorageConfigTestView(APIView):
    """测试存储配置连接。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def post(self, request, pk):
        """测试存储配置连接。"""
        try:
            config = StorageConfig.objects.get(pk=pk)
        except StorageConfig.DoesNotExist:
            return Response({"message": "配置不存在"}, status=status.HTTP_404_NOT_FOUND)

        try:
            from minio import Minio
            client = Minio(
                config.endpoint,
                access_key=config.get_access_key(),
                secret_key=config.get_secret_key(),
                secure=config.secure,
            )
            # 测试连接：检查 bucket 是否存在
            exists = client.bucket_exists(config.bucket)
            return Response({
                "success": True,
                "message": f"连接成功，bucket {'存在' if exists else '不存在'}",
                "bucket_exists": exists,
            })
        except Exception as e:
            return Response({
                "success": False,
                "message": f"连接失败: {str(e)}",
            })


class CorsConfigGenerateView(APIView):
    """生成 CORS 配置。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def post(self, request, pk):
        """生成 CORS 配置（不自动应用）。"""
        try:
            config = StorageConfig.objects.get(pk=pk)
        except StorageConfig.DoesNotExist:
            return Response({"message": "配置不存在"}, status=status.HTTP_404_NOT_FOUND)

        # 从请求中获取允许的域名
        allowed_origins = request.data.get("allowed_origins", ["*"])

        cors_config = {
            "allowed_origins": allowed_origins,
            "allowed_methods": ["GET", "PUT", "POST", "HEAD", "DELETE"],
            "allowed_headers": ["*"],
            "expose_headers": ["ETag", "Content-Length", "Content-Type"],
            "max_age_seconds": 3600,
        }

        # 保存配置但不应用
        config.cors_config = cors_config
        config.save()

        return Response({
            "message": "CORS 配置已生成，需手动应用到 MinIO",
            "cors_config": cors_config,
            "apply_command": self._generate_apply_command(config),
        })

    def _generate_apply_command(self, config):
        """生成应用 CORS 的命令。"""
        origins = config.cors_config.get("allowed_origins", [])
        origins_json = str(origins).replace("'", '"')

        return f"""# 在 MinIO 容器中执行以下命令设置 CORS：
# 1. 创建 CORS 配置文件
cat > /tmp/cors.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CORSRule>
    {''.join(f'<AllowedOrigin>{o}</AllowedOrigin>' for o in origins)}
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>POST</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedMethod>DELETE</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <ExposeHeader>Content-Length</ExposeHeader>
    <ExposeHeader>Content-Type</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>
EOF

# 2. 使用 mc 命令设置 CORS
mc alias set local http://localhost:9000 {config.get_access_key()} {config.get_secret_key()}
mc cors set /tmp/cors.xml local/{config.bucket}
"""


class SystemConfigOverviewView(APIView):
    """系统配置概览。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def get(self, request):
        """获取系统配置概览。"""
        setting = SystemSetting.get_singleton()
        default_storage = StorageConfig.objects.filter(is_default=True).first()
        default_embedding = EmbeddingConfig.objects.filter(is_default=True, is_active=True).first()
        rag_settings = RagSettings.get_singleton()

        return Response({
            "rag_settings": setting.to_dict(),
            "storage_default": default_storage.to_dict_safe() if default_storage else None,
            "embedding_default": default_embedding.to_dict_safe() if default_embedding else None,
            "rag_config": rag_settings.to_dict(),
        })


class EmbeddingConfigListView(APIView):
    """Embedding 配置列表视图。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def get(self, request):
        """获取 Embedding 配置列表。"""
        configs = EmbeddingConfig.objects.all()
        data = [c.to_dict_safe() for c in configs]
        return Response(data)

    def post(self, request):
        """创建 Embedding 配置。"""
        serializer = EmbeddingConfigCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # 设置默认 base_url
        base_url = data.get("base_url", "")
        if not base_url:
            if data.get("provider") == "bailian":
                base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
            elif data.get("provider") == "openai":
                base_url = "https://api.openai.com/v1"

        config = EmbeddingConfig(
            name=data["name"],
            provider=data.get("provider", "bailian"),
            api_mode=data.get("api_mode", "openai_compatible"),
            model_name=data.get("model_name", "text-embedding-v4"),
            dimension=data.get("dimension", 1024),
            base_url=base_url,
            api_key_env=data.get("api_key_env", ""),
            batch_size=data.get("batch_size", 10),
            max_tokens_per_text=data.get("max_tokens_per_text", 8192),
            timeout_seconds=data.get("timeout_seconds", 60),
            is_active=data.get("is_active", True),
            is_default=data.get("is_default", False),
            metadata=data.get("metadata", {}),
        )

        # 加密存储 API Key
        api_key = data.get("api_key", "")
        if api_key:
            config.set_api_key(api_key)

        # 如果设置为默认，清除其他默认
        if config.is_default:
            EmbeddingConfig.objects.update(is_default=False)

        config.save()
        return Response(config.to_dict_safe(), status=status.HTTP_201_CREATED)


class EmbeddingConfigDetailView(APIView):
    """Embedding 配置详情视图。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def get(self, request, pk):
        """获取 Embedding 配置详情。"""
        try:
            config = EmbeddingConfig.objects.get(pk=pk)
            return Response(config.to_dict_safe())
        except EmbeddingConfig.DoesNotExist:
            return Response({"message": "配置不存在"}, status=status.HTTP_404_NOT_FOUND)

    def patch(self, request, pk):
        """更新 Embedding 配置。"""
        try:
            config = EmbeddingConfig.objects.get(pk=pk)
        except EmbeddingConfig.DoesNotExist:
            return Response({"message": "配置不存在"}, status=status.HTTP_404_NOT_FOUND)

        serializer = EmbeddingConfigUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        for key, value in data.items():
            if key == "api_key" and value:
                config.set_api_key(value)
            elif key == "is_default" and value:
                EmbeddingConfig.objects.update(is_default=False)
                setattr(config, key, value)
            else:
                setattr(config, key, value)

        config.save()
        return Response(config.to_dict_safe())

    def delete(self, request, pk):
        """删除 Embedding 配置。"""
        try:
            config = EmbeddingConfig.objects.get(pk=pk)
            config.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except EmbeddingConfig.DoesNotExist:
            return Response({"message": "配置不存在"}, status=status.HTTP_404_NOT_FOUND)


class EmbeddingConfigSetDefaultView(APIView):
    """设置默认 Embedding 配置。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def post(self, request, pk):
        """设置默认 Embedding 配置。"""
        try:
            config = EmbeddingConfig.objects.get(pk=pk)
            EmbeddingConfig.objects.update(is_default=False)
            config.is_default = True
            config.is_active = True
            config.save()
            return Response(config.to_dict_safe())
        except EmbeddingConfig.DoesNotExist:
            return Response({"message": "配置不存在"}, status=status.HTTP_404_NOT_FOUND)


class EmbeddingConfigTestView(APIView):
    """测试 Embedding 配置。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def post(self, request, pk):
        """测试 Embedding 配置。"""
        try:
            config = EmbeddingConfig.objects.get(pk=pk)
        except EmbeddingConfig.DoesNotExist:
            return Response({"message": "配置不存在"}, status=status.HTTP_404_NOT_FOUND)

        serializer = EmbeddingTestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        texts = serializer.validated_data["texts"]

        # 获取 API Key
        api_key = config.get_api_key()
        if not api_key:
            import os
            api_key = os.environ.get(config.api_key_env, "")

        if not api_key:
            return Response({
                "success": False,
                "message": "API Key 未配置",
            }, status=status.HTTP_400_BAD_REQUEST)

        # 测试 Embedding
        try:
            from apps.knowledge.services.embedding_service import BailianEmbeddingClient
            client = BailianEmbeddingClient(
                api_key=api_key,
                base_url=config.base_url,
                model_name=config.model_name,
                dimension=config.dimension,
                batch_size=config.batch_size,
                timeout_seconds=config.timeout_seconds,
            )
            result = client.embed(texts)

            return Response({
                "success": True,
                "message": "Embedding 测试成功",
                "dimension": result["dimension"],
                "vector_count": len(result["vectors"]),
                "token_count": result["token_count"],
                "latency_ms": result["latency_ms"],
            })
        except Exception as e:
            return Response({
                "success": False,
                "message": f"Embedding 测试失败: {str(e)}",
            }, status=status.HTTP_400_BAD_REQUEST)


class RagSettingsView(APIView):
    """RAG 设置视图。"""

    permission_classes = [IsAuthenticated, MustChangePasswordPermission, RequirePermission]
    required_permission = "system_settings.manage"

    def get(self, request):
        """获取 RAG 设置。"""
        settings = RagSettings.get_singleton()
        data = RagSettingsSerializer(settings).data
        # 补充 Embedding 配置详情
        if settings.embedding_config:
            data["embedding_config_detail"] = settings.embedding_config.to_dict_safe()
        else:
            data["embedding_config_detail"] = None
            # 检查是否有可用 Embedding 配置
            has_embedding = EmbeddingConfig.objects.filter(is_active=True).exists()
            data["has_embedding_config"] = has_embedding
        return Response(data)

    def patch(self, request):
        """更新 RAG 设置。"""
        settings = RagSettings.get_singleton()
        serializer = RagSettingsSerializer(settings, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        # 检查向量检索依赖
        data = serializer.validated_data
        if data.get("enable_vector_search") or data.get("retrieval_mode") == "vector" or data.get("retrieval_mode") == "hybrid":
            # 检查是否有默认 Embedding 配置
            embedding_config_id = data.get("embedding_config")
            if not embedding_config_id:
                default_embedding = EmbeddingConfig.objects.filter(is_default=True, is_active=True).first()
                if not default_embedding:
                    return Response({
                        "message": "启用向量检索需要先配置默认 Embedding 模型",
                    }, status=status.HTTP_400_BAD_REQUEST)

        serializer.save()
        return Response(RagSettingsSerializer(settings).data)