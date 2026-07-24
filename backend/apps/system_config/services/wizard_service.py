"""配置向导服务。

向导 4 步：chat_model / embedding_model / rag_search / file_storage。
每步可跳过（值为 None），跳过的步骤不写数据库。
配置的步骤即设为默认（覆盖原默认指向）。

事务保证：4 个 _apply_* 调用包在 transaction.atomic() 中，任一步失败回滚，
避免半配置状态。
"""

from django.db import transaction

from apps.generation.constants import ProviderType
from apps.generation.models import ModelProvider, ModelConfig
from apps.system_config.models import (
    EmbeddingConfig,
    RagSettings,
    StorageConfig,
    SystemSetting,
)


MOCK_PROVIDER_TYPES = {ProviderType.MOCK}


class WizardService:
    """配置向导服务。"""

    def apply_wizard(self, steps: dict) -> dict:
        """应用向导配置。

        Args:
            steps: 4 个步骤的数据，None 表示跳过
                {
                    "chat_model": {provider_type, base_url, api_key, model_name} | None,
                    "embedding_model": {provider_type, base_url, api_key, model_name} | None,
                    "rag_search": {retrieval_mode, top_k, embedding_config_id} | None,
                    "file_storage": {endpoint, public_endpoint, access_key, secret_key,
                                    bucket, upload_mode} | None,
                }

        Returns:
            最新 health 状态字典；mock 校验失败时返回
            {"error_code": "mock_not_allowed", "detail": ...}
        """
        chat_data = steps.get("chat_model")
        embedding_data = steps.get("embedding_model")
        rag_data = steps.get("rag_search")
        storage_data = steps.get("file_storage")

        # mock 校验在事务外：返回错误不应触发回滚（未写库）
        if chat_data and chat_data.get("provider_type") in MOCK_PROVIDER_TYPES:
            return {
                "error_code": "mock_not_allowed",
                "detail": "Mock Provider 不可在向导中配置为默认",
            }
        if embedding_data and embedding_data.get("provider_type") in MOCK_PROVIDER_TYPES:
            return {
                "error_code": "mock_not_allowed",
                "detail": "Mock Provider 不可在向导中配置为默认",
            }

        # 4 个 _apply_* 原子化：任一步失败全部回滚，避免半配置状态
        with transaction.atomic():
            if chat_data:
                self._apply_chat_model(chat_data)
            if embedding_data:
                self._apply_embedding_model(embedding_data)
            if rag_data:
                self._apply_rag_settings(rag_data)
            if storage_data:
                self._apply_file_storage(storage_data)

        # 清缓存，返回最新状态
        from django.core.cache import cache
        cache.delete("settings:health:status")

        from apps.system_config.services.health_service import HealthCheckService
        return HealthCheckService().get_health_status(use_cache=False)

    def _apply_chat_model(self, data: dict) -> None:
        """创建/更新 Chat Provider + ModelConfig + 设为默认。"""
        provider_type = data["provider_type"]
        base_url = data["base_url"]
        api_key = data["api_key"]
        model_name = data["model_name"]

        provider, _ = ModelProvider.objects.update_or_create(
            provider_type=provider_type,
            defaults={
                "key": provider_type,
                "name": provider_type.capitalize(),
                "base_url": base_url,
                "is_active": True,
            },
        )
        if api_key:
            provider.set_api_key(api_key)
            provider.save(update_fields=["encrypted_api_key"])

        # 清除其他默认 chat
        ModelConfig.objects.filter(model_type="chat").update(is_default=False)

        config, _ = ModelConfig.objects.update_or_create(
            provider=provider,
            model_name=model_name,
            model_type="chat",
            defaults={
                "is_default": True,
                "is_active": True,
            },
        )

    def _apply_embedding_model(self, data: dict) -> None:
        """创建/更新 Embedding 配置 + 设为默认。"""
        provider_type = data["provider_type"]
        base_url = data["base_url"]
        api_key = data["api_key"]
        model_name = data["model_name"]

        # 清除其他默认
        EmbeddingConfig.objects.update(is_default=False)

        config, _ = EmbeddingConfig.objects.update_or_create(
            provider=provider_type,
            model_name=model_name,
            defaults={
                "name": f"{provider_type}-{model_name}",
                "base_url": base_url,
                "is_active": True,
                "is_default": True,
            },
        )
        if api_key:
            config.set_api_key(api_key)
            config.save(update_fields=["encrypted_api_key"])

    def _apply_rag_settings(self, data: dict) -> None:
        """更新 RAG 设置。"""
        rag = RagSettings.get_singleton()
        if "retrieval_mode" in data:
            rag.retrieval_mode = data["retrieval_mode"]
        if "top_k" in data:
            rag.top_k = data["top_k"]
        if "embedding_config_id" in data and data["embedding_config_id"]:
            rag.embedding_config_id = data["embedding_config_id"]
        rag.save()

    def _apply_file_storage(self, data: dict) -> None:
        """创建/更新 StorageConfig + 设为默认，并同步 SystemSetting.upload_mode。

        upload_mode 字段属于 SystemSetting（全局单例），而非 StorageConfig：
        - StorageConfig 只描述 MinIO 连接参数；
        - upload_mode 是全局上传策略（backend_proxy / presigned_direct），
          多个 StorageConfig 共享同一个 upload_mode，故落在 SystemSetting。
        """
        # 清除其他默认
        StorageConfig.objects.update(is_default=False)

        config, _ = StorageConfig.objects.update_or_create(
            bucket=data["bucket"],
            defaults={
                "name": f"MinIO-{data['bucket']}",
                "provider": "minio",
                "endpoint": data["endpoint"],
                "public_endpoint": data.get("public_endpoint", ""),
                "is_default": True,
            },
        )
        if data.get("access_key"):
            config.set_access_key(data["access_key"])
        if data.get("secret_key"):
            config.set_secret_key(data["secret_key"])
        config.save()

        # 同步上传模式到 SystemSetting（spec §6.4 Step 4 字段）
        upload_mode = data.get("upload_mode")
        if upload_mode:
            setting = SystemSetting.get_singleton()
            setting.upload_mode = upload_mode
            setting.save(update_fields=["upload_mode"])
