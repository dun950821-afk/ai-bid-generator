# backend/apps/requirements/tests/test_dedup_service.py
"""标段级条款三层去重服务测试（Phase 2）。

所有外部调用（EmbeddingService / AiTaskExecutionService）均 mock，
不依赖真实 embedding / LLM。
"""

import json
import math
from types import SimpleNamespace

import pytest
from django.test import override_settings

from apps.accounts.models import User
from apps.generation.constants import PromptRunStatus
from apps.generation.services.ai_task_execution_service import AiTaskExecutionError
from apps.knowledge.services.embedding_service import EmbeddingError
from apps.projects.models import Lot, Project
from apps.requirements.constants import DedupRunStatus, ExtractionRunStatus
from apps.requirements.models import (
    RequirementDedupRun,
    RequirementExtractionRun,
    TenderRequirement,
)
from apps.requirements.services.dedup_service import (
    MAX_CLUSTER_SIZE,
    RequirementDedupService,
    content_hash,
    normalize_title,
)
from apps.tender.models import TenderFile


# ============================================================================
# 测试工具
# ============================================================================

def make_vec(components: dict[int, float]) -> list[float]:
    """构造 1024 维向量（仅指定下标非零）。"""
    vec = [0.0] * 1024
    for idx, value in components.items():
        vec[idx] = value
    return vec


class FakeEmbeddingService:
    """按文本内容返回预置向量的假 EmbeddingService。"""

    def __init__(self, vector_by_text: dict[str, list[float]]):
        self.vector_by_text = vector_by_text
        self.calls: list[list[str]] = []

    def embed(self, texts):
        self.calls.append(list(texts))
        return {
            "vectors": [self.vector_by_text[t] for t in texts],
            "dimension": 1024,
            "token_count": 0,
            "latency_ms": 0,
        }


class RaisingEmbeddingService:
    """模拟 embedding 未配置/调用失败。"""

    def embed(self, texts):
        raise EmbeddingError("未配置默认 Embedding 模型，请在系统设置中配置")


class FakeAiTaskService:
    """假 AiTaskExecutionService。

    picker: 接收候选列表（dict list），返回 kept_id；
    error: 非空时 execute 抛该异常。
    """

    def __init__(self, picker=None, error: Exception | None = None):
        self.picker = picker
        self.error = error
        self.calls: list[dict] = []

    def execute(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        candidates = json.loads(kwargs["variables"]["candidates"])
        kept_id = self.picker(candidates) if self.picker else candidates[0]["id"]
        return SimpleNamespace(
            status=PromptRunStatus.SUCCEEDED,
            output_json={"kept_id": kept_id, "reason": "信息更完整"},
            error_message="",
        )


def _make_env(username: str):
    """创建 用户/项目/标段/主文件+附件文件/各自 active 抽取 run。"""
    user = User.objects.create_user(username=username, password="x")
    project = Project.objects.create(name=f"去重项目-{username}", created_by=user)
    lot = Lot.objects.create(project=project, name=f"标段-{username}")
    main_file = TenderFile.objects.create(
        project=project,
        lot=lot,
        original_name="招标主文件.pdf",
        object_key=f"test/dedup-{username}-main.pdf",
        file_size=100,
        created_by=user,
        file_category=TenderFile.CATEGORY_TENDER,
    )
    attach_file = TenderFile.objects.create(
        project=project,
        lot=lot,
        original_name="附件清单.pdf",
        object_key=f"test/dedup-{username}-attach.pdf",
        file_size=100,
        created_by=user,
        file_category=TenderFile.CATEGORY_ATTACHMENT,
    )
    main_run = RequirementExtractionRun.objects.create(
        tender_file=main_file,
        project=project,
        status=ExtractionRunStatus.SUCCESS,
        extraction_types=["qualification"],
        is_active=True,
        created_by=user,
    )
    attach_run = RequirementExtractionRun.objects.create(
        tender_file=attach_file,
        project=project,
        status=ExtractionRunStatus.SUCCESS,
        extraction_types=["qualification"],
        is_active=True,
        created_by=user,
    )
    return user, lot, main_file, attach_file, main_run, attach_run


def _req(tender_file, run, key, title, content, **kwargs):
    defaults = {"extraction_type": "qualification"}
    defaults.update(kwargs)
    return TenderRequirement.objects.create(
        tender_file=tender_file,
        requirement_key=key,
        title=title,
        content=content,
        extraction_run=run,
        **defaults,
    )


def _emb_text(req) -> str:
    return f"{req.title}\n{req.content}"


def _same_vector_service(*reqs) -> FakeEmbeddingService:
    """让给定条款共享同一向量（保证向量层聚成一簇）。"""
    vec = make_vec({0: 1.0})
    return FakeEmbeddingService({_emb_text(r): vec for r in reqs})


# ============================================================================
# 规则层归一化
# ============================================================================

class TestNormalize:
    def test_title_numbering_prefixes(self):
        assert normalize_title("1. 资格要求") == "资格要求"
        assert normalize_title("1、资格要求") == "资格要求"
        assert normalize_title("（一）资格要求") == "资格要求"
        assert normalize_title("(2) 资格要求") == "资格要求"
        assert normalize_title("第三条 资格要求") == "资格要求"
        assert normalize_title("第3条 资格要求") == "资格要求"
        assert normalize_title("一、资格要求") == "资格要求"
        assert normalize_title("2.1.3 技术要求") == "技术要求"

    def test_title_full_width_and_whitespace(self):
        # 全角数字/空格统一
        assert normalize_title("１.  资格 要求") == "资格要求"
        assert normalize_title(" 资格要求　") == "资格要求"

    def test_content_hash_ignores_whitespace_and_width(self):
        assert content_hash("投标人 应当具备 资质") == content_hash("投标人应当具备资质")
        assert content_hash("３日内") == content_hash("3日内")


# ============================================================================
# 规则层归簇 + 运行落库
# ============================================================================

@pytest.mark.django_db
class TestRuleLayer:
    def test_exact_duplicates_clustered(self):
        user, lot, main_file, attach_file, main_run, attach_run = _make_env("rule1")
        r1 = _req(main_file, main_run, "rule1-k1", "1. 资格要求", "投标人应具备资质。")
        r2 = _req(attach_file, attach_run, "rule1-k2", "（一）资格要求", "投标人应具备资质。")
        r3 = _req(main_file, main_run, "rule1-k3", "付款方式", "按进度付款。")

        ai = FakeAiTaskService(picker=lambda cands: cands[0]["id"])
        service = RequirementDedupService(
            ai_task_service=ai,
            embedding_service=RaisingEmbeddingService(),  # 降级：仅规则层
        )
        result = service.run(lot_id=lot.id, created_by=user)

        r1.refresh_from_db()
        r2.refresh_from_db()
        r3.refresh_from_db()
        # r1/r2 归簇：LLM 选第一个（候选按 id 排序，r1 在前）
        assert r1.dedup_status == "kept"
        assert r2.dedup_status == "duplicate"
        assert r2.merged_into_id == r1.id
        # r3 不重复，保持未去重
        assert r3.dedup_status == "none"

        assert result["total_count"] == 3
        assert result["cluster_count"] == 1
        assert result["duplicate_count"] == 1
        assert result["llm_arbitrated_count"] == 1

        run = RequirementDedupRun.objects.get(pk=result["dedup_run_id"])
        assert run.status == DedupRunStatus.SUCCESS
        assert run.total_count == 3
        assert run.cluster_count == 1
        assert run.duplicate_count == 1
        assert run.started_at and run.finished_at

    def test_embedding_degraded_recorded_in_run(self):
        user, lot, main_file, attach_file, main_run, attach_run = _make_env("rule2")
        _req(main_file, main_run, "rule2-k1", "资格要求", "投标人应具备资质。")
        _req(attach_file, attach_run, "rule2-k2", "资格要求", "投标人应具备资质。")

        service = RequirementDedupService(
            ai_task_service=FakeAiTaskService(),
            embedding_service=RaisingEmbeddingService(),
        )
        result = service.run(lot_id=lot.id, created_by=user)

        run = RequirementDedupRun.objects.get(pk=result["dedup_run_id"])
        assert run.status == DedupRunStatus.SUCCESS
        assert run.params["embedding_degraded"] is True
        assert "未配置" in run.params["embedding_error"]
        # 规则层结果仍然生效
        assert run.cluster_count == 1
        assert run.duplicate_count == 1


# ============================================================================
# 向量层聚簇与阈值
# ============================================================================

@pytest.mark.django_db
class TestVectorLayer:
    def test_same_vector_clusters_and_persists_embedding(self):
        user, lot, main_file, attach_file, main_run, attach_run = _make_env("vec1")
        r1 = _req(main_file, main_run, "vec1-k1", "资格要求", "投标人应具备资质。")
        r2 = _req(attach_file, attach_run, "vec1-k2", "企业资质", "投标人须具有相关资质证书。")

        service = RequirementDedupService(
            ai_task_service=FakeAiTaskService(),
            embedding_service=_same_vector_service(r1, r2),
        )
        result = service.run(lot_id=lot.id, created_by=user)

        assert result["cluster_count"] == 1
        assert result["duplicate_count"] == 1
        # embedding 落库
        r1.refresh_from_db()
        r2.refresh_from_db()
        assert r1.embedding is not None
        assert r2.embedding is not None

    def test_orthogonal_vectors_not_clustered(self):
        user, lot, main_file, attach_file, main_run, attach_run = _make_env("vec2")
        r1 = _req(main_file, main_run, "vec2-k1", "资格要求", "投标人应具备资质。")
        r2 = _req(attach_file, attach_run, "vec2-k2", "企业资质", "投标人须具有相关资质证书。")

        emb = FakeEmbeddingService({
            _emb_text(r1): make_vec({0: 1.0}),
            _emb_text(r2): make_vec({1: 1.0}),  # 正交，cosine = 0
        })
        service = RequirementDedupService(
            ai_task_service=FakeAiTaskService(),
            embedding_service=emb,
        )
        result = service.run(lot_id=lot.id, created_by=user)

        assert result["cluster_count"] == 0
        assert result["duplicate_count"] == 0
        r1.refresh_from_db()
        r2.refresh_from_db()
        assert r1.dedup_status == "none"
        assert r2.dedup_status == "none"

    def test_threshold_boundary(self):
        """cosine = 1/√2 ≈ 0.7071：阈值 0.70 归簇，0.71 不归簇。"""
        for threshold, expected_clusters in ((0.70, 1), (0.71, 0)):
            with override_settings(REQUIREMENT_DEDUP_COSINE_THRESHOLD=threshold):
                user, lot, main_file, attach_file, main_run, attach_run = _make_env(
                    f"vec3-{threshold}"
                )
                r1 = _req(main_file, main_run, f"k1-{threshold}", "资格要求", "内容A。")
                r2 = _req(attach_file, attach_run, f"k2-{threshold}", "企业资质", "内容B。")

                emb = FakeEmbeddingService({
                    _emb_text(r1): make_vec({0: 1.0}),
                    _emb_text(r2): make_vec({0: 1.0, 1: 1.0}),  # cosine = 1/√2
                })
                service = RequirementDedupService(
                    ai_task_service=FakeAiTaskService(),
                    embedding_service=emb,
                )
                result = service.run(lot_id=lot.id, created_by=user)
                assert result["cluster_count"] == expected_clusters

    def test_different_extraction_types_not_clustered(self):
        """向量相同但抽取类型不同，不聚簇。"""
        user, lot, main_file, attach_file, main_run, attach_run = _make_env("vec4")
        r1 = _req(main_file, main_run, "vec4-k1", "资格要求", "内容A。", extraction_type="qualification")
        r2 = _req(attach_file, attach_run, "vec4-k2", "评分项", "内容B。", extraction_type="scoring")

        service = RequirementDedupService(
            ai_task_service=FakeAiTaskService(),
            embedding_service=_same_vector_service(r1, r2),
        )
        result = service.run(lot_id=lot.id, created_by=user)
        assert result["cluster_count"] == 0


# ============================================================================
# LLM 仲裁与确定性回退
# ============================================================================

@pytest.mark.django_db
class TestArbitration:
    def test_llm_pick_respected(self):
        """LLM 选附件条款时，以 LLM 为准（覆盖确定性规则）。"""
        user, lot, main_file, attach_file, main_run, attach_run = _make_env("arb1")
        r_main = _req(main_file, main_run, "arb1-k1", "资格要求", "投标人应具备资质。")
        r_attach = _req(attach_file, attach_run, "arb1-k2", "企业资质", "投标人须具有相关资质证书。")

        ai = FakeAiTaskService(picker=lambda cands: r_attach.id)
        service = RequirementDedupService(
            ai_task_service=ai,
            embedding_service=_same_vector_service(r_main, r_attach),
        )
        service.run(lot_id=lot.id, created_by=user)

        r_main.refresh_from_db()
        r_attach.refresh_from_db()
        assert r_attach.dedup_status == "kept"
        assert r_main.dedup_status == "duplicate"
        assert r_main.merged_into_id == r_attach.id

    def test_llm_invalid_kept_id_falls_back(self):
        """LLM 返回簇外 id：回退确定性规则（主文件优先）。"""
        user, lot, main_file, attach_file, main_run, attach_run = _make_env("arb2")
        r_main = _req(main_file, main_run, "arb2-k1", "资格要求", "投标人应具备资质。")
        r_attach = _req(attach_file, attach_run, "arb2-k2", "企业资质", "投标人须具有相关资质证书。")

        ai = FakeAiTaskService(picker=lambda cands: 999999)
        service = RequirementDedupService(
            ai_task_service=ai,
            embedding_service=_same_vector_service(r_main, r_attach),
        )
        result = service.run(lot_id=lot.id, created_by=user)

        r_main.refresh_from_db()
        r_attach.refresh_from_db()
        assert r_main.dedup_status == "kept"
        assert r_attach.dedup_status == "duplicate"
        assert result["llm_arbitrated_count"] == 0

    def test_fallback_main_file_beats_attachment(self):
        user, lot, main_file, attach_file, main_run, attach_run = _make_env("arb3")
        r_main = _req(main_file, main_run, "arb3-k1", "资格要求", "投标人应具备资质。")
        r_attach = _req(attach_file, attach_run, "arb3-k2", "企业资质", "投标人须具有相关资质证书。")

        ai = FakeAiTaskService(error=AiTaskExecutionError("LLM 调用失败"))
        service = RequirementDedupService(
            ai_task_service=ai,
            embedding_service=_same_vector_service(r_main, r_attach),
        )
        service.run(lot_id=lot.id, created_by=user)

        r_main.refresh_from_db()
        r_attach.refresh_from_db()
        assert r_main.dedup_status == "kept"
        assert r_attach.dedup_status == "duplicate"

    def test_fallback_evidence_completeness(self):
        """同为主文件：有 source_page + source_text 的优先。"""
        user, lot, main_file, attach_file, main_run, attach_run = _make_env("arb4")
        r_no_ev = _req(main_file, main_run, "arb4-k1", "资格要求", "投标人应具备资质。")
        r_ev = _req(
            main_file, main_run, "arb4-k2", "企业资质", "投标人须具有相关资质证书。",
            source_page=12, source_text="原文片段",
        )

        ai = FakeAiTaskService(error=AiTaskExecutionError("LLM 调用失败"))
        service = RequirementDedupService(
            ai_task_service=ai,
            embedding_service=_same_vector_service(r_no_ev, r_ev),
        )
        service.run(lot_id=lot.id, created_by=user)

        r_no_ev.refresh_from_db()
        r_ev.refresh_from_db()
        assert r_ev.dedup_status == "kept"
        assert r_no_ev.dedup_status == "duplicate"

    def test_fallback_longer_content(self):
        """来源与证据相同：content 更长的优先。"""
        user, lot, main_file, attach_file, main_run, attach_run = _make_env("arb5")
        r_short = _req(main_file, main_run, "arb5-k1", "资格要求", "应具备资质。")
        r_long = _req(main_file, main_run, "arb5-k2", "企业资质", "投标人应具备相应资质，并提供证书。")

        ai = FakeAiTaskService(error=AiTaskExecutionError("LLM 调用失败"))
        service = RequirementDedupService(
            ai_task_service=ai,
            embedding_service=_same_vector_service(r_short, r_long),
        )
        service.run(lot_id=lot.id, created_by=user)

        r_short.refresh_from_db()
        r_long.refresh_from_db()
        assert r_long.dedup_status == "kept"
        assert r_short.dedup_status == "duplicate"


# ============================================================================
# 簇规模保护
# ============================================================================

@pytest.mark.django_db
class TestClusterSizeGuard:
    def test_oversized_cluster_uses_fallback_only(self):
        """单簇 > MAX_CLUSTER_SIZE：拆小余 1 并回后超规，只用确定性回退（不调 LLM）。"""
        user, lot, main_file, attach_file, main_run, attach_run = _make_env("big1")
        reqs = [
            _req(main_file, main_run, f"big1-k{i}", f"标题{i}", f"内容 {i}。")
            for i in range(MAX_CLUSTER_SIZE + 1)
        ]

        ai = FakeAiTaskService()
        service = RequirementDedupService(
            ai_task_service=ai,
            embedding_service=_same_vector_service(*reqs),
        )
        result = service.run(lot_id=lot.id, created_by=user)

        assert result["cluster_count"] == 1
        assert result["duplicate_count"] == MAX_CLUSTER_SIZE
        assert result["llm_arbitrated_count"] == 0
        assert len(ai.calls) == 0  # 超规簇不调 LLM
        kept = TenderRequirement.objects.filter(
            tender_file__lot=lot, dedup_status="kept"
        )
        assert kept.count() == 1


# ============================================================================
# 重跑幂等
# ============================================================================

@pytest.mark.django_db
class TestRerunIdempotent:
    def test_rerun_resets_and_remarks(self):
        user, lot, main_file, attach_file, main_run, attach_run = _make_env("rerun1")
        r1 = _req(main_file, main_run, "rerun1-k1", "资格要求", "投标人应具备资质。")
        r2 = _req(attach_file, attach_run, "rerun1-k2", "企业资质", "投标人须具有相关资质证书。")

        def make_service():
            return RequirementDedupService(
                ai_task_service=FakeAiTaskService(),
                embedding_service=_same_vector_service(r1, r2),
            )

        first = make_service().run(lot_id=lot.id, created_by=user)
        second = make_service().run(lot_id=lot.id, created_by=user)

        assert first["duplicate_count"] == second["duplicate_count"] == 1

        r1.refresh_from_db()
        r2.refresh_from_db()
        statuses = {r1.dedup_status, r2.dedup_status}
        assert statuses == {"kept", "duplicate"}
        # duplicate 必须指向 kept（不允许指向 duplicate 形成链）
        dup = r1 if r1.dedup_status == "duplicate" else r2
        kept = r2 if dup is r1 else r1
        assert dup.merged_into_id == kept.id
        assert kept.dedup_status == "kept"
        assert kept.merged_into_id is None

    def test_only_active_run_requirements_are_candidates(self):
        """非当前版本 run / 已失效条款不参与去重。"""
        user, lot, main_file, attach_file, main_run, attach_run = _make_env("rerun2")
        old_run = RequirementExtractionRun.objects.create(
            tender_file=main_file,
            project=main_file.project,
            status=ExtractionRunStatus.SUCCESS,
            extraction_types=["qualification"],
            is_active=False,
            created_by=user,
        )
        r1 = _req(main_file, main_run, "rerun2-k1", "资格要求", "投标人应具备资质。")
        r_old = _req(main_file, old_run, "rerun2-k2", "资格要求", "投标人应具备资质。")
        r_inactive = _req(
            attach_file, attach_run, "rerun2-k3", "资格要求", "投标人应具备资质。",
            is_active=False,
        )

        service = RequirementDedupService(
            ai_task_service=FakeAiTaskService(),
            embedding_service=RaisingEmbeddingService(),
        )
        result = service.run(lot_id=lot.id, created_by=user)

        assert result["total_count"] == 1
        assert result["cluster_count"] == 0
        r1.refresh_from_db()
        r_old.refresh_from_db()
        r_inactive.refresh_from_db()
        assert r1.dedup_status == "none"
        assert r_old.dedup_status == "none"
        assert r_inactive.dedup_status == "none"
