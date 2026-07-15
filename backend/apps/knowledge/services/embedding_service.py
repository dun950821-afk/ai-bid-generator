# backend/apps/knowledge/services/embedding_service.py
"""Embedding 向量生成服务。"""

import time
from typing import List

import httpx


class EmbeddingError(Exception):
    """Embedding 错误。"""
    pass


class BailianEmbeddingClient:
    """阿里百炼 Embedding 客户端。

    使用 OpenAI 兼容接口调用 text-embedding-v4。
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1",
        model_name: str = "text-embedding-v4",
        dimension: int = 1024,
        batch_size: int = 10,
        max_tokens_per_text: int = 8192,
        timeout_seconds: int = 60,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name
        self.dimension = dimension
        self.batch_size = batch_size
        self.max_tokens_per_text = max_tokens_per_text
        self.timeout_seconds = timeout_seconds

    def embed(self, texts: List[str]) -> dict:
        """生成文本向量。

        Args:
            texts: 文本列表（最多 batch_size 条）

        Returns:
            {
                "vectors": List[List[float]],
                "dimension": int,
                "token_count": int,
                "latency_ms": int,
            }
        """
        if not texts:
            return {
                "vectors": [],
                "dimension": self.dimension,
                "token_count": 0,
                "latency_ms": 0,
            }

        if len(texts) > self.batch_size:
            raise EmbeddingError(f"单次请求最多 {self.batch_size} 条文本，当前 {len(texts)} 条")

        start_time = time.time()

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.model_name,
            "input": texts,
            "dimensions": self.dimension,
        }

        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                response = client.post(
                    f"{self.base_url}/embeddings",
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as e:
            error_body = ""
            try:
                error_body = e.response.text
            except Exception:
                pass
            raise EmbeddingError(f"百炼 Embedding API 错误 [{e.response.status_code}]: {error_body}") from e
        except httpx.TimeoutException as e:
            raise EmbeddingError(f"百炼 Embedding API 超时 ({self.timeout_seconds}s)") from e
        except Exception as e:
            raise EmbeddingError(f"百炼 Embedding API 调用失败: {e}") from e

        # 解析响应
        try:
            vectors = [item["embedding"] for item in data["data"]]
            usage = data.get("usage", {})
        except (KeyError, IndexError) as e:
            raise EmbeddingError(f"百炼 Embedding API 返回格式异常: {data}") from e

        latency_ms = int((time.time() - start_time) * 1000)

        return {
            "vectors": vectors,
            "dimension": self.dimension,
            "token_count": usage.get("total_tokens", 0),
            "latency_ms": latency_ms,
        }

    def embed_batch(self, texts: List[str]) -> dict:
        """批量生成文本向量（自动分批）。

        Args:
            texts: 文本列表（不限数量）

        Returns:
            {
                "vectors": List[List[float]],
                "dimension": int,
                "token_count": int,
                "latency_ms": int,
            }
        """
        if not texts:
            return {
                "vectors": [],
                "dimension": self.dimension,
                "token_count": 0,
                "latency_ms": 0,
            }

        all_vectors = []
        total_tokens = 0
        total_latency = 0

        # 分批处理
        for i in range(0, len(texts), self.batch_size):
            batch = texts[i:i + self.batch_size]
            result = self.embed(batch)
            all_vectors.extend(result["vectors"])
            total_tokens += result["token_count"]
            total_latency += result["latency_ms"]

        return {
            "vectors": all_vectors,
            "dimension": self.dimension,
            "token_count": total_tokens,
            "latency_ms": total_latency,
        }


class EmbeddingService:
    """Embedding 服务。

    统一封装 Embedding 调用，支持从配置读取参数。
    """

    def __init__(self, config=None):
        """初始化服务。

        Args:
            config: EmbeddingConfig 实例，如果为 None 则使用默认配置
        """
        self._config = config
        self._client = None

    def _get_client(self) -> BailianEmbeddingClient:
        """获取 Embedding 客户端。"""
        if self._client:
            return self._client

        if self._config:
            config = self._config
        else:
            # 使用默认配置
            from apps.system_config.models import EmbeddingConfig
            config = EmbeddingConfig.objects.filter(
                is_default=True,
                is_active=True,
            ).first()

            if not config:
                raise EmbeddingError("未配置默认 Embedding 模型，请在系统设置中配置")

        # 获取 API Key
        api_key = config.get_api_key()
        if not api_key:
            import os
            api_key = os.environ.get(config.api_key_env, "")

        if not api_key:
            raise EmbeddingError(f"Embedding API Key 未配置，请在系统设置中配置 {config.name} 的 API Key")

        self._client = BailianEmbeddingClient(
            api_key=api_key,
            base_url=config.base_url,
            model_name=config.model_name,
            dimension=config.dimension,
            batch_size=config.batch_size,
            max_tokens_per_text=config.max_tokens_per_text,
            timeout_seconds=config.timeout_seconds,
        )

        return self._client

    def embed(self, texts: List[str]) -> dict:
        """生成文本向量。

        Args:
            texts: 文本列表

        Returns:
            {
                "vectors": List[List[float]],
                "dimension": int,
                "token_count": int,
                "latency_ms": int,
            }
        """
        client = self._get_client()
        return client.embed_batch(texts)

    def embed_chunks(self, chunk_ids: List[int]) -> dict:
        """批量为 chunk 生成向量。

        Args:
            chunk_ids: chunk ID 列表

        Returns:
            {
                "updated_count": int,
                "token_count": int,
                "latency_ms": int,
            }
        """
        from apps.knowledge.models import KnowledgeChunk
        from apps.knowledge.constants import EmbeddingStatus

        chunks = list(KnowledgeChunk.objects.filter(id__in=chunk_ids))
        if not chunks:
            return {
                "updated_count": 0,
                "token_count": 0,
                "latency_ms": 0,
            }

        # 标记进行中
        KnowledgeChunk.objects.filter(id__in=chunk_ids).update(
            embedding_status=EmbeddingStatus.PROCESSING
        )

        # 截断超长文本（百炼 max_tokens_per_text 默认 8192，按中文 ~3 字符/token 估 ~24000 字符）
        client = self._get_client()
        max_chars = client.max_tokens_per_text * 3
        texts = [chunk.content[:max_chars] for chunk in chunks]

        try:
            result = self.embed(texts)
            vectors = result["vectors"]

            # 更新 chunk
            for chunk, vector in zip(chunks, vectors):
                chunk.embedding = vector
                chunk.embedding_status = EmbeddingStatus.DONE
                chunk.save(update_fields=["embedding", "embedding_status"])

            return {
                "updated_count": len(chunks),
                "token_count": result["token_count"],
                "latency_ms": result["latency_ms"],
            }
        except Exception:
            # 标记失败
            KnowledgeChunk.objects.filter(id__in=chunk_ids).update(
                embedding_status=EmbeddingStatus.FAILED
            )
            raise
