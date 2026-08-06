# backend/apps/requirements/services/dedup_service.py
"""标段级条款三层去重服务（Phase 2）。

漏斗结构：
1. 规则层：标题归一化 + 内容哈希，完全相同者直接归簇；
2. 向量层：title + content 生成 embedding，同抽取类型内余弦相似度
   达到阈值的用并查集聚簇；embedding 不可用时降级（只保留规则层结果）；
3. LLM 仲裁层：每个 size >= 2 的簇调 requirement_dedup_arbitration 场景
   选出保留条款；LLM 失败时回退确定性规则
   （来源权威性 > evidence 完整度 > 内容长度）。

去重只标记不删除：被合并条目 merged_into 指向保留条 + dedup_status=duplicate。
"""

import hashlib
import json
import logging
import math
import re
import unicodedata
import uuid
from typing import Callable, Iterable

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.generation.constants import PromptRunStatus, PromptScenario
from apps.generation.services.ai_task_execution_service import (
    AiTaskExecutionError,
    AiTaskExecutionService,
)
from apps.common.models import AsyncTask
from apps.knowledge.services.embedding_service import EmbeddingError, EmbeddingService
from apps.projects.models import Lot
from apps.requirements.constants import DedupRunStatus, RequirementDedupStatus
from apps.requirements.models import RequirementDedupRun, TenderRequirement
from apps.tender.models import TenderFile

logger = logging.getLogger(__name__)

# 单簇规模保护：超过该条数时拆小处理，防止 LLM 输入超长
MAX_CLUSTER_SIZE = 20

# 生成 embedding / 送 LLM 的单条内容截断长度
EMBEDDING_TEXT_MAX_CHARS = 8000
LLM_CONTENT_MAX_CHARS = 2000

# 来源权威性排序：招标主文件 > 澄清/补遗 > 附件
FILE_CATEGORY_RANK = {
    TenderFile.CATEGORY_TENDER: 0,
    TenderFile.CATEGORY_CLARIFICATION: 1,
    TenderFile.CATEGORY_ATTACHMENT: 2,
}

# 标题开头的编号前缀（"1."、"1、"、"（一）"、"(1)"、"第X条/章/节" 等）
_LEADING_NO_PATTERN = re.compile(
    r"^(?:第\s*[0-9０-９一二三四五六七八九十百千]+\s*[条章节款项]?"
    r"|[（(]\s*[0-9０-９一二三四五六七八九十百千]+\s*[）)]"
    r"|[0-9０-９]+(?:\.[0-9０-９]+)*\s*[.、．)]?"
    r"|[一二三四五六七八九十百千]+\s*[、.．)]"
    r")\s*"
)


class RequirementDedupError(Exception):
    """条款去重错误。"""

    pass


def get_active_dedup_run(lot) -> RequirementDedupRun | None:
    """返回该标段进行中（pending/running）的最新去重运行，无则 None。"""
    return (
        RequirementDedupRun.objects.filter(
            lot=lot,
            status__in=[DedupRunStatus.PENDING, DedupRunStatus.RUNNING],
        )
        .order_by("-created_at")
        .first()
    )


def trigger_lot_dedup(lot, created_by, source: str = "manual") -> dict | None:
    """预建 RequirementDedupRun + AsyncTask，并在事务提交后分发 Celery 去重任务。

    视图手动触发和抽取完成后的自动触发共用本函数。

    防重入：lot 已有 pending/running 的 DedupRun 时不再触发，返回 None。

    Args:
        lot: 标段
        created_by: 触发用户
        source: 触发来源标识（仅用于日志，如 "manual" / "auto_after_extract"）

    Returns:
        {"dedup_run": RequirementDedupRun, "task": AsyncTask}；
        已有进行中的去重运行时返回 None。
    """
    if get_active_dedup_run(lot) is not None:
        logger.info(
            "Skip lot dedup trigger (source=%s): lot_id=%s already has an active run",
            source,
            lot.id,
        )
        return None

    # 延迟导入避免循环依赖（tasks 模块依赖本模块的 RequirementDedupService）
    from apps.requirements.tasks import deduplicate_lot_requirements_task

    # 预生成 Celery task ID
    celery_task_id = str(uuid.uuid4())

    # 预创建 RequirementDedupRun 和 AsyncTask（原子事务）
    with transaction.atomic():
        dedup_run = RequirementDedupRun.objects.create(
            lot=lot,
            project=lot.project,
            status=DedupRunStatus.PENDING,
            params={
                "cosine_threshold": float(
                    getattr(settings, "REQUIREMENT_DEDUP_COSINE_THRESHOLD", 0.92)
                ),
                "trigger_source": source,
            },
            created_by=created_by,
        )

        task = AsyncTask.objects.create(
            task_type="requirement_dedup",
            celery_task_id=celery_task_id,
            status=AsyncTask.STATUS_PENDING,
            progress=0,
            current_step="等待执行",
            total_steps=1,
            related_object_type="Lot",
            related_object_id=str(lot.id),
            input_payload={"dedup_run_id": dedup_run.id},
            created_by=created_by,
        )

        dedup_run.async_task = task
        dedup_run.save(update_fields=["async_task"])

    # 事务提交后触发异步任务
    transaction.on_commit(
        lambda: deduplicate_lot_requirements_task.apply_async(
            args=[task.id, lot.id, {"dedup_run_id": dedup_run.id}],
            task_id=celery_task_id,
            queue="parse_queue",
        )
    )

    logger.info(
        "Lot dedup triggered (source=%s): lot_id=%s, run_id=%s, task_id=%s",
        source,
        lot.id,
        dedup_run.id,
        task.id,
    )
    return {"dedup_run": dedup_run, "task": task}


def normalize_title(title: str) -> str:
    """标题归一化：全半角统一、去空白、去开头编号。"""
    text = unicodedata.normalize("NFKC", title or "")
    text = _LEADING_NO_PATTERN.sub("", text)
    return re.sub(r"\s+", "", text)


def normalize_content(content: str) -> str:
    """内容归一化：全半角统一、去全部空白（用于哈希比较）。"""
    text = unicodedata.normalize("NFKC", content or "")
    return re.sub(r"\s+", "", text)


def content_hash(content: str) -> str:
    """归一化内容的 MD5 哈希。"""
    return hashlib.md5(normalize_content(content).encode("utf-8")).hexdigest()


def cosine_similarity(vec_a: Iterable[float], vec_b: Iterable[float]) -> float:
    """纯 Python 余弦相似度。"""
    a = list(vec_a)
    b = list(vec_b)
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


class _UnionFind:
    """并查集（按候选下标聚簇）。"""

    def __init__(self, size: int):
        self.parent = list(range(size))

    def find(self, x: int) -> int:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, x: int, y: int) -> None:
        rx, ry = self.find(x), self.find(y)
        if rx != ry:
            self.parent[max(rx, ry)] = min(rx, ry)

    def clusters(self) -> list[list[int]]:
        groups: dict[int, list[int]] = {}
        for i in range(len(self.parent)):
            groups.setdefault(self.find(i), []).append(i)
        return list(groups.values())


class RequirementDedupService:
    """标段级条款三层去重服务。"""

    def __init__(self, ai_task_service=None, embedding_service=None):
        # 允许测试注入 mock；默认走真实服务
        self._ai_task_service = ai_task_service
        self._embedding_service = embedding_service

    @property
    def ai_task_service(self):
        if self._ai_task_service is None:
            self._ai_task_service = AiTaskExecutionService()
        return self._ai_task_service

    @property
    def embedding_service(self):
        if self._embedding_service is None:
            self._embedding_service = EmbeddingService()
        return self._embedding_service

    def run(
        self,
        lot_id: int,
        created_by,
        dedup_run_id: int | None = None,
        progress_callback: Callable[[int, str], None] | None = None,
    ) -> dict:
        """执行标段级条款去重，返回统计摘要。

        Args:
            lot_id: 标段 ID
            created_by: 触发用户
            dedup_run_id: 预创建的 RequirementDedupRun ID（API 触发时传入）；
                为空时由服务自行创建（同步调用场景）
            progress_callback: 进度回调 (progress: int, step: str)
        """
        lot = Lot.objects.filter(pk=lot_id).first()
        if lot is None:
            raise RequirementDedupError(f"标段不存在: {lot_id}")

        if dedup_run_id:
            dedup_run = RequirementDedupRun.objects.get(pk=dedup_run_id)
        else:
            dedup_run = RequirementDedupRun.objects.create(
                lot=lot,
                project=lot.project,
                status=DedupRunStatus.PENDING,
                params={"cosine_threshold": self._cosine_threshold()},
                created_by=created_by,
            )

        dedup_run.status = DedupRunStatus.RUNNING
        dedup_run.started_at = timezone.now()
        dedup_run.save(update_fields=["status", "started_at"])

        try:
            stats = self._execute(lot, created_by, dedup_run, progress_callback)
        except Exception as exc:
            dedup_run.status = DedupRunStatus.FAILED
            dedup_run.error_message = f"{type(exc).__name__}: {exc}"[:2000]
            dedup_run.finished_at = timezone.now()
            dedup_run.save(
                update_fields=["status", "error_message", "finished_at"]
            )
            raise

        dedup_run.status = DedupRunStatus.SUCCESS
        dedup_run.total_count = stats["total_count"]
        dedup_run.cluster_count = stats["cluster_count"]
        dedup_run.llm_arbitrated_count = stats["llm_arbitrated_count"]
        dedup_run.duplicate_count = stats["duplicate_count"]
        dedup_run.finished_at = timezone.now()
        dedup_run.save(
            update_fields=[
                "status",
                "total_count",
                "cluster_count",
                "llm_arbitrated_count",
                "duplicate_count",
                "finished_at",
            ]
        )

        logger.info(
            "Requirement dedup completed: lot_id=%s, run_id=%s, total=%d, "
            "clusters=%d, llm=%d, duplicates=%d",
            lot_id,
            dedup_run.id,
            stats["total_count"],
            stats["cluster_count"],
            stats["llm_arbitrated_count"],
            stats["duplicate_count"],
        )
        return {"dedup_run_id": dedup_run.id, **stats}

    # ------------------------------------------------------------------
    # 内部实现
    # ------------------------------------------------------------------

    def _cosine_threshold(self) -> float:
        return float(getattr(settings, "REQUIREMENT_DEDUP_COSINE_THRESHOLD", 0.92))

    def _execute(self, lot, created_by, dedup_run, progress_callback) -> dict:
        def report(progress: int, step: str):
            if progress_callback:
                progress_callback(progress, step)

        # 0. 重跑幂等：复位本 lot 历史去重标记
        report(5, "复位历史去重标记")
        TenderRequirement.objects.filter(
            tender_file__lot=lot,
            dedup_status__in=[
                RequirementDedupStatus.KEPT,
                RequirementDedupStatus.DUPLICATE,
            ],
        ).update(merged_into=None, dedup_status=RequirementDedupStatus.NONE)

        # 1. 候选集：lot 内所有文件当前版本的有效条款
        report(10, "加载候选条款")
        candidates = list(
            TenderRequirement.objects.filter(
                tender_file__lot=lot,
                is_active=True,
                extraction_run__is_active=True,
                dedup_status=RequirementDedupStatus.NONE,
            ).select_related("tender_file")
        )

        stats = {
            "total_count": len(candidates),
            "cluster_count": 0,
            "llm_arbitrated_count": 0,
            "duplicate_count": 0,
        }
        if len(candidates) < 2:
            return stats

        uf = _UnionFind(len(candidates))

        # 2. 规则层：标题归一化 + 内容哈希，完全相同者归簇
        report(20, "规则层精确去重")
        self._apply_rule_layer(candidates, uf)

        # 3. 向量层：embedding 余弦相似度聚簇（EmbeddingError 时降级）
        report(30, "向量层语义聚簇")
        degraded = self._apply_vector_layer(candidates, uf, report)
        if degraded:
            params = dict(dedup_run.params or {})
            params["embedding_degraded"] = True
            params["embedding_error"] = degraded
            dedup_run.params = params
            dedup_run.save(update_fields=["params"])
            logger.warning(
                "Dedup vector layer degraded (lot_id=%s): %s", lot.id, degraded
            )

        # 4. 聚簇结果（size >= 2），超大规模簇拆小（余 1 条时并回上一簇，
        # 该簇超规后走确定性回退，不再调 LLM）
        clusters = []
        for group in uf.clusters():
            if len(group) < 2:
                continue
            members = sorted(
                (candidates[i] for i in group), key=lambda r: r.id
            )
            chunks = [
                members[start : start + MAX_CLUSTER_SIZE]
                for start in range(0, len(members), MAX_CLUSTER_SIZE)
            ]
            if len(chunks) > 1 and len(chunks[-1]) == 1:
                chunks[-2].extend(chunks[-1])
                chunks.pop()
            clusters.extend(chunks)
        stats["cluster_count"] = len(clusters)

        # 5. LLM 仲裁（失败时确定性回退）
        llm_count = 0
        duplicate_ids = []
        kept_ids = []
        for index, cluster in enumerate(clusters):
            progress = 40 + int(50 * (index + 1) / len(clusters))
            report(progress, f"仲裁重复簇 {index + 1}/{len(clusters)}")
            kept_id, via_llm = self._arbitrate_cluster(
                cluster, created_by, lot
            )
            if via_llm:
                llm_count += 1
            kept_ids.append(kept_id)
            for req in cluster:
                if req.id != kept_id:
                    duplicate_ids.append((req.id, kept_id))

        stats["llm_arbitrated_count"] = llm_count
        stats["duplicate_count"] = len(duplicate_ids)

        # 6. 落库标记
        report(95, "写出去重标记")
        self._persist_marks(candidates, kept_ids, duplicate_ids)
        return stats

    def _apply_rule_layer(self, candidates, uf: _UnionFind) -> None:
        """规则层：归一化标题 + 内容哈希完全相同的直接归簇。"""
        seen: dict[tuple[str, str], int] = {}
        for i, req in enumerate(candidates):
            key = (normalize_title(req.title), content_hash(req.content))
            if key in seen:
                uf.union(seen[key], i)
            else:
                seen[key] = i

    def _apply_vector_layer(self, candidates, uf: _UnionFind, report) -> str | None:
        """向量层：生成/复用 embedding，同抽取类型内按阈值并查集聚簇。

        Returns:
            None 表示正常；字符串表示降级原因（EmbeddingError）。
        """
        threshold = self._cosine_threshold()

        # 生成缺失的 embedding（已有 embedding 的复用，标题/内容未变时避免重复调用）
        pending = [r for r in candidates if r.embedding is None]
        if pending:
            texts = [
                f"{r.title}\n{r.content}"[:EMBEDDING_TEXT_MAX_CHARS] for r in pending
            ]
            try:
                result = self.embedding_service.embed(texts)
            except EmbeddingError as exc:
                return str(exc)
            vectors = result["vectors"]
            for req, vector in zip(pending, vectors):
                req.embedding = vector
            TenderRequirement.objects.bulk_update(pending, ["embedding"])

        # 按抽取类型分组，组内两两比较
        by_type: dict[str, list[int]] = {}
        for i, req in enumerate(candidates):
            by_type.setdefault(req.extraction_type or "", []).append(i)

        total_pairs = sum(
            len(idxs) * (len(idxs) - 1) // 2 for idxs in by_type.values()
        )
        done_pairs = 0
        for idxs in by_type.values():
            if len(idxs) < 2:
                continue
            for pos_a in range(len(idxs)):
                for pos_b in range(pos_a + 1, len(idxs)):
                    i, j = idxs[pos_a], idxs[pos_b]
                    done_pairs += 1
                    if candidates[i].embedding is None or candidates[j].embedding is None:
                        continue
                    sim = cosine_similarity(
                        candidates[i].embedding, candidates[j].embedding
                    )
                    if sim >= threshold:
                        uf.union(i, j)
            report(
                30 + int(10 * done_pairs / max(1, total_pairs)),
                "向量层语义聚簇",
            )
        return None

    def _arbitrate_cluster(self, cluster, created_by, lot) -> tuple[int, bool]:
        """仲裁单个簇，返回 (kept_id, 是否由 LLM 选出)。

        超规模簇（拆小保护后仍 > MAX_CLUSTER_SIZE）不调 LLM，直接确定性回退；
        LLM 不可用/失败/输出非法时同样回退。
        """
        if len(cluster) > MAX_CLUSTER_SIZE:
            return self._deterministic_pick_kept(cluster), False
        kept_id = self._llm_pick_kept(cluster, created_by, lot)
        if kept_id is not None:
            return kept_id, True
        return self._deterministic_pick_kept(cluster), False

    def _llm_pick_kept(self, cluster, created_by, lot) -> int | None:
        """调 requirement_dedup_arbitration 场景选保留条款；失败返回 None。"""
        payload = [
            {
                "id": req.id,
                "title": req.title,
                "content": req.content[:LLM_CONTENT_MAX_CHARS],
                "source_file": req.tender_file.original_name if req.tender_file else "",
                "source_page": req.source_page,
            }
            for req in cluster
        ]
        try:
            prompt_run = self.ai_task_service.execute(
                scenario=PromptScenario.REQUIREMENT_DEDUP_ARBITRATION,
                variables={"candidates": json.dumps(payload, ensure_ascii=False)},
                created_by=created_by,
                prompt_version_id=None,  # 自动查找场景对应的 published 版本
                source="requirement_dedup",
                business_context={
                    "lot_id": lot.id,
                    "project_id": lot.project_id,
                },
            )
        except AiTaskExecutionError as exc:
            logger.warning("Dedup arbitration LLM failed: %s", exc)
            return None

        if prompt_run.status != PromptRunStatus.SUCCEEDED:
            logger.warning(
                "Dedup arbitration run not succeeded: %s", prompt_run.error_message
            )
            return None

        output = prompt_run.output_json or {}
        kept_id = output.get("kept_id")
        valid_ids = {req.id for req in cluster}
        if isinstance(kept_id, int) and kept_id in valid_ids:
            return kept_id
        logger.warning(
            "Dedup arbitration returned invalid kept_id=%s, valid=%s",
            kept_id,
            valid_ids,
        )
        return None

    def _deterministic_pick_kept(self, cluster) -> int:
        """确定性回退：来源权威性 > evidence 完整度 > 内容更长 > id 更小。"""
        def rank(req):
            category_rank = FILE_CATEGORY_RANK.get(
                req.tender_file.file_category if req.tender_file else "", 3
            )
            evidence_complete = 0 if (req.source_page and req.source_text) else 1
            return (category_rank, evidence_complete, -len(req.content or ""), req.id)

        return min(cluster, key=rank).id

    def _persist_marks(self, candidates, kept_ids, duplicate_ids) -> None:
        """写出去重标记：kept / duplicate + merged_into。"""
        by_id = {req.id: req for req in candidates}
        to_update = []
        for kept_id in kept_ids:
            req = by_id[kept_id]
            req.dedup_status = RequirementDedupStatus.KEPT
            req.merged_into = None
            to_update.append(req)
        for dup_id, kept_id in duplicate_ids:
            req = by_id[dup_id]
            req.dedup_status = RequirementDedupStatus.DUPLICATE
            req.merged_into_id = kept_id
            to_update.append(req)
        if to_update:
            TenderRequirement.objects.bulk_update(
                to_update, ["dedup_status", "merged_into"]
            )
