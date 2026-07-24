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
        probe_fn: Optional[Callable] = None,
    ) -> dict:
        """获取健康状态。

        Args:
            use_cache: 是否使用 Redis 缓存（True 时若缓存命中则不重探）
            probe_fn: 自定义探针函数（测试用），签名 (provider_type, base_url,
                      api_key, model_name) -> bool。None 时不做真实探针，
                      只读数据库状态。
        """
        if use_cache and probe_fn is None:
            cached = cache.get("settings:health:status")
            if cached:
                return cached

        chat_status = self._compute_chat_model_status(probe_fn)
        embedding_status = self._compute_embedding_model_status()
        rag_status = self._compute_rag_status(embedding_status)
        storage_status = self._compute_storage_status()
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

        if use_cache and probe_fn is None:
            cache.set("settings:health:status", result, self.CACHE_TIMEOUT)

        return result

    def diagnose(self) -> dict:
        """一键诊断：对所有已配置项做真实探针，不走缓存。

        Chat 模型通过 probe_fn 探测；Embedding 与文件存储通过各自的
        专用探针（ProbeService.probe_embedding / _probe_minio）直接探测，
        并将结果合并回健康状态。
        """
        from apps.system_config.services.probe_service import ProbeService

        probe = ProbeService()

        # 清缓存后重新计算（chat 通过 probe_fn 探测）
        cache.delete("settings:health:status")

        def chat_probe_fn(provider_type, base_url, api_key, model_name, test_kind="chat"):
            result = probe.probe_chat(provider_type, base_url, api_key, model_name)
            return result.ok

        result = self.get_health_status(use_cache=False, probe_fn=chat_probe_fn)

        # Embedding：直接真实探测并覆盖状态
        default_embedding = EmbeddingConfig.objects.filter(
            is_default=True, is_active=True
        ).first()
        if default_embedding:
            emb_result = probe.probe_embedding(
                default_embedding.provider,
                default_embedding.base_url,
                default_embedding.get_api_key(),
                default_embedding.model_name,
            )
            if emb_result.ok:
                result["embedding_model"] = {
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
            else:
                result["embedding_model"] = {
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
            # 重新计算 RAG 状态（依赖 embedding 状态）
            result["rag_search"] = self._compute_rag_status(result["embedding_model"])

        # 文件存储：直接真实探测并覆盖状态
        storage = StorageConfig.objects.filter(is_default=True).first()
        if storage:
            if self._probe_minio(storage):
                result["file_storage"] = {
                    "status": "ok",
                    "label": "MinIO",
                    "sublabel": storage.public_endpoint or storage.endpoint,
                    "last_probe_at": timezone.now().isoformat(),
                    "last_probe_ok": True,
                    "impact_hint": FILE_STORAGE_IMPACT,
                    "score": 20,
                    "score_max": 20,
                }
            else:
                result["file_storage"] = {
                    "status": "warning",
                    "label": "MinIO",
                    "sublabel": f"{storage.endpoint} · 探针失败",
                    "last_probe_at": timezone.now().isoformat(),
                    "last_probe_ok": False,
                    "impact_hint": FILE_STORAGE_IMPACT,
                    "score": 10,
                    "score_max": 20,
                }

        # 重新计算 total_score 与 pending_count
        result["total_score"] = (
            result["chat_model"]["score"]
            + result["embedding_model"]["score"]
            + result["rag_search"]["score"]
            + result["file_storage"]["score"]
            + result["security_audit"]["score"]
        )
        result["pending_count"] = sum(
            1
            for s in [
                result["chat_model"],
                result["embedding_model"],
                result["rag_search"],
                result["file_storage"],
                result["security_audit"],
            ]
            if s["status"] in ("warning", "error", "mock")
        )

        return result

    def _compute_chat_model_status(self, probe_fn: Optional[Callable]) -> dict:
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
                "last_probe_at": None,
                "last_probe_ok": None,
                "impact_hint": CHAT_MODEL_IMPACT,
                "score": 0,
                "score_max": 30,
            }

        probe_ok = None
        if probe_fn is not None:
            probe_ok = probe_fn(
                provider.provider_type,
                provider.base_url,
                provider.get_api_key(),
                default_chat.model_name,
                "chat",
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

    def _compute_embedding_model_status(self) -> dict:
        """计算 Embedding 模型状态（仅基于数据库配置；真实探针由 diagnose 触发）。"""
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

    def _compute_storage_status(self) -> dict:
        """计算文件存储状态（仅基于数据库配置；真实探针由 diagnose 触发）。"""
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
                "model_config_id": None,
                "provider_id": None,
            }
        return None
