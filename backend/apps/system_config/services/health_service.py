# backend/apps/system_config/services/health_service.py
"""健康检查聚合服务。

返回 Chat 模型 / Embedding 模型 / 向量检索 / 文件存储 / 安全审计 5 项状态
+ 总分 + Mock 告警。
"""

from typing import Callable, Optional

from django.core.cache import cache
from django.utils import timezone

from apps.generation.models import ModelConfig
from apps.system_config.models import (
    EmbeddingConfig,
    RagSettings,
    StorageConfig,
    SystemSetting,
)


CHAT_MODEL_IMPACT = (
    "投标文件大纲生成、条款抽取、废标检查、一致性修复等所有 LLM 调用将无法执行；"
    "招标文件解析流水线中「条款抽取」阶段会一直返回空结果"
)
EMBEDDING_MODEL_IMPACT = (
    "知识库 RAG 检索不可用；招标文件解析流水线中「向量嵌入」阶段被跳过；"
    "知识库管理中无法对文档建立向量索引"
)
RAG_SEARCH_IMPACT = (
    "投标内容生成时无法引用历史投标库/企业知识库，生成质量依赖单一 LLM 上下文；"
    "可通过启用 RAG 检索增强生成"
)
FILE_STORAGE_IMPACT = "所有文件上传（招标文件、附件、生成文档）将失败；预览/下载不可用"
SECURITY_AUDIT_IMPACT = "用户登录、模型调用、文件操作等关键行为无日志记录；安全事件无法追溯"


class HealthCheckService:
    """系统配置健康检查服务。"""

    CACHE_TIMEOUT = 30  # 30 秒缓存

    def get_health_status(
        self,
        use_cache: bool = True,
        chat_probe_fn: Optional[Callable] = None,
        embedding_probe_fn: Optional[Callable] = None,
        storage_probe_fn_factory: Optional[Callable] = None,
    ) -> dict:
        """获取健康状态。

        Args:
            use_cache: 是否使用 Redis 缓存（True 时若缓存命中则不重探）
            chat_probe_fn: Chat 模型探针，签名
                (provider_type, base_url, api_key, model_name) -> bool。None 时不
                做真实探针，只读数据库状态。
            embedding_probe_fn: Embedding 模型探针，签名同上。
            storage_probe_fn_factory: 文件存储探针工厂，签名
                (storage) -> Callable[[], bool]。接收 StorageConfig 实例，返回无
                参探针闭包，闭包内可访问 storage.secure 等字段。None 时不做真
                实探针，只读数据库状态。
        """
        has_any_probe = any([chat_probe_fn, embedding_probe_fn, storage_probe_fn_factory])
        if use_cache and not has_any_probe:
            cached = cache.get("settings:health:status")
            if cached:
                return cached

        chat_status = self._compute_chat_model_status(chat_probe_fn)
        embedding_status = self._compute_embedding_model_status(embedding_probe_fn)
        rag_status = self._compute_rag_status(embedding_status)
        storage_status = self._compute_storage_status(storage_probe_fn_factory)
        audit_status = self._compute_security_audit_status()

        mock_warning = self._compute_mock_warning(chat_status, embedding_status)

        total_score = (
            chat_status["score"]
            + embedding_status["score"]
            + rag_status["score"]
            + storage_status["score"]
            + audit_status["score"]
        )
        pending_count = sum(
            1
            for s in [chat_status, embedding_status, rag_status, storage_status, audit_status]
            if s["status"] in ("warning", "error", "mock")
        )

        result = {
            "chat_model": chat_status,
            "embedding_model": embedding_status,
            "rag_search": rag_status,
            "file_storage": storage_status,
            "security_audit": audit_status,
            "mock_warning": mock_warning,
            "total_score": total_score,
            "total_max": 100,
            "pending_count": pending_count,
        }

        if use_cache and not has_any_probe:
            cache.set("settings:health:status", result, self.CACHE_TIMEOUT)

        return result

    def diagnose(self) -> dict:
        """一键诊断：对所有已配置项做真实探针，不走缓存。

        三路探针分别构造，互不串扰：
        - chat_probe_fn → ProbeService.probe_chat
        - embedding_probe_fn → ProbeService.probe_embedding
        - storage_probe_fn_factory → 接收 storage 实例返回无参闭包，调用
          self._probe_minio(storage)，保留 storage.secure，避免位置参数 hack。
        """
        from apps.system_config.services.probe_service import ProbeService

        probe = ProbeService()

        # 清缓存后重新计算
        cache.delete("settings:health:status")

        def chat_probe_fn(provider_type, base_url, api_key, model_name):
            return probe.probe_chat(provider_type, base_url, api_key, model_name).ok

        def embedding_probe_fn(provider_type, base_url, api_key, model_name):
            return probe.probe_embedding(provider_type, base_url, api_key, model_name).ok

        def storage_probe_fn_factory(storage):
            def _probe():
                return self._probe_minio(storage)
            return _probe

        return self.get_health_status(
            use_cache=False,
            chat_probe_fn=chat_probe_fn,
            embedding_probe_fn=embedding_probe_fn,
            storage_probe_fn_factory=storage_probe_fn_factory,
        )

    def _compute_chat_model_status(self, chat_probe_fn: Optional[Callable]) -> dict:
        """计算 Chat 模型状态。"""
        default_chat = ModelConfig.objects.filter(
            is_default=True, is_active=True, model_type="chat"
        ).select_related("provider").first()

        if not default_chat:
            return {
                "status": "error",
                "label": "未配置",
                "sublabel": "",
                "provider_type": None,
                "is_default": False,
                "is_mock": False,
                "last_probe_at": None,
                "last_probe_ok": None,
                "impact_hint": CHAT_MODEL_IMPACT,
                "score": 0,
                "score_max": 30,
            }

        provider = default_chat.provider
        is_mock = provider.provider_type == "mock"

        if is_mock:
            return {
                "status": "mock",
                "label": default_chat.model_name,
                "sublabel": f"{provider.name} · Mock Provider",
                "provider_type": "mock",
                "is_default": True,
                "is_mock": True,
                "model_config_id": default_chat.id,
                "provider_id": provider.id,
                "last_probe_at": None,
                "last_probe_ok": None,
                "impact_hint": CHAT_MODEL_IMPACT,
                "score": 0,
                "score_max": 30,
            }

        probe_ok = None
        if chat_probe_fn is not None:
            probe_ok = chat_probe_fn(
                provider.provider_type,
                provider.base_url,
                provider.get_api_key(),
                default_chat.model_name,
            )

        if probe_ok is None:
            # 未做真实探针，仅根据配置存在判定
            return {
                "status": "ok",
                "label": default_chat.model_name,
                "sublabel": f"{provider.name} · 已配置",
                "provider_type": provider.provider_type,
                "is_default": True,
                "is_mock": False,
                "last_probe_at": None,
                "last_probe_ok": None,
                "impact_hint": CHAT_MODEL_IMPACT,
                "score": 30,
                "score_max": 30,
            }

        if probe_ok:
            return {
                "status": "ok",
                "label": default_chat.model_name,
                "sublabel": f"{provider.name} · 真实可用",
                "provider_type": provider.provider_type,
                "is_default": True,
                "is_mock": False,
                "last_probe_at": timezone.now().isoformat(),
                "last_probe_ok": True,
                "impact_hint": CHAT_MODEL_IMPACT,
                "score": 30,
                "score_max": 30,
            }

        return {
            "status": "warning",
            "label": default_chat.model_name,
            "sublabel": f"{provider.name} · 探针失败",
            "provider_type": provider.provider_type,
            "is_default": True,
            "is_mock": False,
            "last_probe_at": timezone.now().isoformat(),
            "last_probe_ok": False,
            "impact_hint": CHAT_MODEL_IMPACT,
            "score": 15,
            "score_max": 30,
        }

    def _compute_embedding_model_status(self, embedding_probe_fn: Optional[Callable] = None) -> dict:
        """计算 Embedding 模型状态。

        embedding_probe_fn 为 None 时仅基于数据库配置判定；非 None 时调用
        embedding_probe_fn(provider, base_url, api_key, model_name) 真实探测。
        """
        default_embedding = EmbeddingConfig.objects.filter(
            is_default=True, is_active=True
        ).first()

        if not default_embedding:
            return {
                "status": "error",
                "label": "未配置",
                "sublabel": "",
                "provider_type": None,
                "is_default": False,
                "last_probe_at": None,
                "last_probe_ok": None,
                "impact_hint": EMBEDDING_MODEL_IMPACT,
                "score": 0,
                "score_max": 20,
            }

        probe_ok = None
        if embedding_probe_fn is not None:
            probe_ok = embedding_probe_fn(
                default_embedding.provider,
                default_embedding.base_url,
                default_embedding.get_api_key(),
                default_embedding.model_name,
            )

        if probe_ok is None:
            # 未做真实探针，仅根据配置存在判定
            return {
                "status": "ok",
                "label": default_embedding.model_name,
                "sublabel": f"{default_embedding.name} · 已配置",
                "provider_type": default_embedding.provider,
                "is_default": True,
                "last_probe_at": None,
                "last_probe_ok": None,
                "impact_hint": EMBEDDING_MODEL_IMPACT,
                "score": 20,
                "score_max": 20,
            }

        if probe_ok:
            return {
                "status": "ok",
                "label": default_embedding.model_name,
                "sublabel": f"{default_embedding.name} · 真实可用",
                "provider_type": default_embedding.provider,
                "is_default": True,
                "last_probe_at": timezone.now().isoformat(),
                "last_probe_ok": True,
                "impact_hint": EMBEDDING_MODEL_IMPACT,
                "score": 20,
                "score_max": 20,
            }

        return {
            "status": "warning",
            "label": default_embedding.model_name,
            "sublabel": f"{default_embedding.name} · 探针失败",
            "provider_type": default_embedding.provider,
            "is_default": True,
            "last_probe_at": timezone.now().isoformat(),
            "last_probe_ok": False,
            "impact_hint": EMBEDDING_MODEL_IMPACT,
            "score": 10,
            "score_max": 20,
        }

    def _compute_rag_status(self, embedding_status: dict) -> dict:
        """计算 RAG 状态。"""
        rag = RagSettings.get_singleton()
        retrieval_mode = rag.retrieval_mode

        has_embedding = embedding_status["status"] in ("ok", "warning")

        if retrieval_mode == "postgres_fulltext":
            return {
                "status": "ok" if has_embedding else "warning",
                "label": "PostgreSQL 全文检索",
                "sublabel": "已启用" if has_embedding else "已启用但无可用 embedding",
                "retrieval_mode": retrieval_mode,
                "impact_hint": RAG_SEARCH_IMPACT,
                "score": 20 if has_embedding else 10,
                "score_max": 20,
            }

        # vector / hybrid
        if has_embedding:
            return {
                "status": "ok",
                "label": {"vector": "向量检索", "hybrid": "混合检索"}.get(retrieval_mode, retrieval_mode),
                "sublabel": "已启用",
                "retrieval_mode": retrieval_mode,
                "impact_hint": RAG_SEARCH_IMPACT,
                "score": 20,
                "score_max": 20,
            }

        return {
            "status": "warning",
            "label": {"vector": "向量检索", "hybrid": "混合检索"}.get(retrieval_mode, retrieval_mode),
            "sublabel": "已启用但无可用 embedding",
            "retrieval_mode": retrieval_mode,
            "impact_hint": RAG_SEARCH_IMPACT,
            "score": 10,
            "score_max": 20,
        }

    def _compute_storage_status(self, storage_probe_fn_factory: Optional[Callable] = None) -> dict:
        """计算文件存储状态。

        storage_probe_fn_factory 为 None 时仅基于数据库配置判定；非 None 时
        调用 storage_probe_fn_factory(storage)()，工厂内可访问 storage.secure
        等完整字段，避免位置参数 hack 丢失 secure。
        """
        storage = StorageConfig.objects.filter(is_default=True).first()

        if not storage:
            return {
                "status": "error",
                "label": "未配置",
                "sublabel": "",
                "last_probe_at": None,
                "last_probe_ok": None,
                "impact_hint": FILE_STORAGE_IMPACT,
                "score": 0,
                "score_max": 20,
            }

        probe_ok = None
        if storage_probe_fn_factory is not None:
            probe_ok = storage_probe_fn_factory(storage)()

        if probe_ok is None:
            return {
                "status": "ok",
                "label": "MinIO",
                "sublabel": storage.public_endpoint or storage.endpoint,
                "last_probe_at": None,
                "last_probe_ok": None,
                "impact_hint": FILE_STORAGE_IMPACT,
                "score": 20,
                "score_max": 20,
            }

        if probe_ok:
            return {
                "status": "ok",
                "label": "MinIO",
                "sublabel": storage.public_endpoint or storage.endpoint,
                "last_probe_at": timezone.now().isoformat(),
                "last_probe_ok": True,
                "impact_hint": FILE_STORAGE_IMPACT,
                "score": 20,
                "score_max": 20,
            }

        return {
            "status": "warning",
            "label": "MinIO",
            "sublabel": f"{storage.endpoint} · 探针失败",
            "last_probe_at": timezone.now().isoformat(),
            "last_probe_ok": False,
            "impact_hint": FILE_STORAGE_IMPACT,
            "score": 10,
            "score_max": 20,
        }

    def _probe_minio(self, storage) -> bool:
        """探测 MinIO 连通性。"""
        try:
            from minio import Minio

            client = Minio(
                storage.endpoint,
                access_key=storage.get_access_key(),
                secret_key=storage.get_secret_key(),
                secure=storage.secure,
            )
            client.bucket_exists(storage.bucket)
            return True
        except Exception:
            return False

    def _compute_security_audit_status(self) -> dict:
        """计算安全审计状态。"""
        setting = SystemSetting.get_singleton()
        enabled = setting.enable_audit_log

        return {
            "status": "ok" if enabled else "warning",
            "label": "已启用" if enabled else "审计日志未启用",
            "audit_log_enabled": enabled,
            "impact_hint": SECURITY_AUDIT_IMPACT,
            "score": 10 if enabled else 5,
            "score_max": 10,
        }

    def _compute_mock_warning(self, chat_status: dict, embedding_status: dict) -> dict | None:
        """检测默认模型是否指向 Mock Provider。"""
        if chat_status.get("is_mock"):
            return {
                "show": True,
                "level": "chat",
                "message": "当前默认 Chat 模型指向 Mock Provider，LLM 调用将返回空结果",
                "model_config_id": chat_status.get("model_config_id"),
                "provider_id": chat_status.get("provider_id"),
            }
        return None
