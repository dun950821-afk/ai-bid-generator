# backend/apps/requirements/tests/test_requirement_extract_v3.py
"""3.0 提示词重设计后端支持测试。

覆盖：输出结构识别（detect_output_mode）/ 页码解析（parse_page_range）/
score_status 落库 / 大类细项一致性标记 / 误分类三级过滤。
"""

import pytest
from unittest.mock import patch
from uuid import uuid4

from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.requirements.services.requirement_extract_service import (
    RequirementExtractService,
    RequirementExtractionError,
    detect_output_mode,
    parse_page_range,
)
from apps.requirements.models import TenderRequirement, RequirementFilterLog
from apps.tender.models import TenderFile

# tender 测试 fixtures（tender_file / parsed_document）定义在 apps.tender.tests.conftest，
# 不在 requirements 测试目录的 conftest 路径上，通过 pytest_plugins 复用，不新建。
pytest_plugins = ["apps.tender.tests.conftest"]


# ============================================================================
# detect_output_mode：LLM 输出结构识别
# ============================================================================

class TestDetectOutputMode:
    def test_list_mode(self):
        """数组格式 -> items。"""
        assert detect_output_mode([{"title": "a"}]) == "items"

    def test_items_dict_mode(self):
        """{items: [...]} 格式 -> items。"""
        assert detect_output_mode({"items": [{"title": "a"}]}) == "items"

    def test_groups_mode(self):
        """{groups: [...]} 格式 -> groups。"""
        assert detect_output_mode({"groups": [{"title": "a"}]}) == "groups"

    def test_groups_takes_precedence(self):
        """groups 与 items 并存时优先 groups（评分场景双结构）。"""
        assert detect_output_mode({"groups": [], "items": []}) == "groups"

    def test_unknown_modes(self):
        """无法识别的结构 -> unknown。"""
        assert detect_output_mode({"foo": "bar"}) == "unknown"
        assert detect_output_mode(None) == "unknown"
        assert detect_output_mode("string") == "unknown"


# ============================================================================
# parse_page_range：页码字符串解析
# ============================================================================

class TestParsePageRange:
    def test_integer(self):
        """整数页码直接透传。"""
        assert parse_page_range(22) == (22, None)

    def test_p_prefix(self):
        """P22 格式。"""
        assert parse_page_range("P22") == (22, None)

    def test_range(self):
        """P22-P23 范围格式。"""
        assert parse_page_range("P22-P23") == (22, 23)

    def test_chinese_format(self):
        """第22页 格式。"""
        assert parse_page_range("第22页") == (22, None)

    def test_plain_numbers(self):
        """22-23 裸数字范围。"""
        assert parse_page_range("22-23") == (22, 23)

    def test_tilde_range(self):
        """P22～P23 波浪线范围。"""
        assert parse_page_range("P22～P23") == (22, 23)

    def test_discrete_pages_only_first(self):
        """P22、P24 是两个离散页，只取首个 start。"""
        assert parse_page_range("P22、P24") == (22, None)

    def test_none_and_empty(self):
        """空值安全。"""
        assert parse_page_range(None) == (None, None)
        assert parse_page_range("") == (None, None)

    def test_reversed_range_falls_back_to_single(self):
        """倒序范围（P23-P22）视为单页，end 置空。"""
        assert parse_page_range("P23-P22") == (23, None)


# ============================================================================
# _group_to_item：评分大类 -> 扁平条款映射
# ============================================================================

class TestGroupToItem:
    def setup_method(self):
        self.service = RequirementExtractService()

    def test_group_mapping_full(self):
        """大类字段完整透传，细项拼装进 content。"""
        group = {
            "title": "服务方案",
            "description": "投标人应提供服务方案",
            "score": 20,
            "score_text": "满分20分",
            "score_status": "identified",
            "evidence": "服务方案满分20分，由评标委员会打分",
            "source": "第三章 评标办法",
            "source_page": "P22-P23",
            "detail_points": [
                {
                    "point_id": "P1", "title": "方案完整性",
                    "requirement": "方案完整", "score": 10,
                    "evidence": "方案完整得10分",
                },
                {
                    "point_id": "P2", "title": "方案合理性",
                    "requirement": "方案合理", "score": 10,
                    "evidence": "方案合理得10分",
                },
            ],
        }
        item = self.service._group_to_item(group, "scoring")

        assert item["title"] == "服务方案"
        assert item["score"] == 20
        assert item["score_status"] == "identified"
        assert item["score_text"] == "满分20分"
        assert item["source_text"] == "服务方案满分20分，由评标委员会打分"
        assert item["source_section"] == "第三章 评标办法"
        assert item["source_page"] == "P22-P23"
        assert item["requirement_type"] == "scoring"
        assert item["raw_group"] == group
        assert "服务方案" in item["content"]
        assert "- 方案完整性" in item["content"]
        assert "（依据：方案完整得10分）" in item["content"]

    def test_group_technical_defaults_to_tech_req(self):
        """technical 场景 groups 无 requirement_type 字段时，映射为 tech_req。"""
        item = self.service._group_to_item({
            "title": "项目实施方案",
            "description": "D",
            "detail_points": [],
        }, "technical")
        assert item["requirement_type"] == "tech_req"

    def test_group_invalid_requirement_type_falls_back(self):
        """group 自带无效类型时按 extraction_type 兜底。"""
        item = self.service._group_to_item({
            "title": "T",
            "requirement_type": "bogus",
            "detail_points": [],
        }, "technical")
        assert item["requirement_type"] == "tech_req"

    def test_group_explicit_type_wins(self):
        """group 自带有效类型时优先使用。"""
        item = self.service._group_to_item({
            "title": "T",
            "requirement_type": "scoring",
            "detail_points": [],
        }, "technical")
        assert item["requirement_type"] == "scoring"

    def test_group_classification_reason_passed_through(self):
        """3.1 technical group 的 classification_reason 透传。"""
        item = self.service._group_to_item({
            "title": "数据迁移",
            "description": "D",
            "classification_reason": "原文要求制定数据迁移方案，属于项目实施技术要求",
            "detail_points": [],
        }, "technical")
        assert item["classification_reason"] == "原文要求制定数据迁移方案，属于项目实施技术要求"

    def test_group_empty_title_fallback(self):
        """大类无 title 时用描述前 10 字兜底。"""
        item = self.service._group_to_item({
            "description": "这是超过十个字的描述文字",
            "detail_points": [],
        }, "scoring")
        assert item["title"].startswith("这是超过十个字")

    def test_group_empty_point_skipped(self):
        """空细项不拼进 content。"""
        item = self.service._group_to_item({
            "title": "T",
            "description": "D",
            "detail_points": [{"title": "", "requirement": ""}],
        }, "scoring")
        assert "- : " not in item["content"]


# ============================================================================
# _filter_misclassified：误分类三级过滤
# ============================================================================

@pytest.mark.django_db
class TestMisclassificationFilter:
    def _make_tender_file(self):
        from apps.accounts.models import User
        from apps.projects.models import Project
        user = User.objects.create_user(username="filter-user", password="x")
        project = Project.objects.create(name="过滤测试项目", created_by=user)
        return TenderFile.objects.create(
            project=project,
            original_name="filter.pdf",
            object_key="test/filter.pdf",
            file_size=100,
            created_by=user,
            status="parsed",
        )

    def test_technical_hard_filter_drops_and_logs(self):
        """technical：标题精确命中硬过滤清单 -> 丢弃 + 记日志。"""
        tender_file = self._make_tender_file()
        service = RequirementExtractService()
        items = [{
            "title": "投标报价",
            "content": "投标人应提交投标报价",
            "requirement_type": "commercial",
        }]

        kept = service._filter_misclassified(items, "technical", tender_file)

        assert kept == []
        log = RequirementFilterLog.objects.get(tender_file=tender_file)
        assert log.filter_level == "hard"
        assert log.matched_keyword == "投标报价"
        assert log.extraction_type == "technical"
        assert log.raw_llm_item["title"] == "投标报价"

    def test_technical_suspect_soft_marks(self):
        """technical：内容命中疑似关键词 -> 保留 + 软标记 + 记日志。"""
        tender_file = self._make_tender_file()
        service = RequirementExtractService()
        item = {
            "title": "项目经理要求",
            "content": "项目经理应具备一级建造师资格证书",
            "requirement_type": "tech_req",
        }

        kept = service._filter_misclassified([item], "technical", tender_file)

        assert len(kept) == 1
        assert kept[0]["filter_status"] == "suspected"
        assert "filter_reason" in kept[0]
        log = RequirementFilterLog.objects.get(
            tender_file=tender_file, filter_level="suspected",
        )
        assert log.matched_keyword == "证书"

    def test_technical_clean_item_untouched(self):
        """technical：无命中的正常条款不标记不记日志。"""
        tender_file = self._make_tender_file()
        service = RequirementExtractService()
        item = {
            "title": "项目管理方案",
            "content": "投标人应提供项目管理组织架构",
            "requirement_type": "tech_req",
        }

        kept = service._filter_misclassified([item], "technical", tender_file)

        assert len(kept) == 1
        assert "filter_status" not in kept[0]
        assert RequirementFilterLog.objects.count() == 0

    def test_technical_demoted_keyword_not_dropped(self):
        """3.1 过滤收敛：投标文件制作/类似项目业绩不再 hard 删除（可能是技术标格式要求）。"""
        tender_file = self._make_tender_file()
        service = RequirementExtractService()
        item = {
            "title": "投标文件制作要求",
            "content": "技术标书应采用 A4 格式编制并装订",
            "requirement_type": "tech_req",
        }

        kept = service._filter_misclassified([item], "technical", tender_file)

        assert len(kept) == 1
        assert "filter_status" not in kept[0]
        assert RequirementFilterLog.objects.count() == 0

    def test_technical_soft_mark_for_demoted_content(self):
        """3.1：内容命中降级关键词（如类似项目业绩）只软标记不删除。"""
        tender_file = self._make_tender_file()
        service = RequirementExtractService()
        item = {
            "title": "项目经验说明",
            "content": "投标人应说明类似项目业绩的实施经验",
            "requirement_type": "tech_req",
        }

        kept = service._filter_misclassified([item], "technical", tender_file)

        assert len(kept) == 1
        assert kept[0]["filter_status"] == "suspected"

    def test_scoring_qualification_check_dropped_when_no_score(self):
        """scoring：标题命中硬过滤清单且无分值 -> 丢弃。"""
        tender_file = self._make_tender_file()
        service = RequirementExtractService()
        items = [{
            "title": "资格审查",
            "content": "投标人须通过资格审查",
            "requirement_type": "qualification",
            "score": None,
        }]

        kept = service._filter_misclassified(items, "scoring", tender_file)

        assert kept == []
        assert RequirementFilterLog.objects.get(
            tender_file=tender_file, filter_level="hard",
        ).matched_keyword == "资格审查"

    def test_scoring_qualification_with_score_kept(self):
        """scoring：标题含资质但带分值 -> 必须保留（如「具有ISO 27001认证得2分」）。"""
        tender_file = self._make_tender_file()
        service = RequirementExtractService()
        item = {
            "title": "企业资质",
            "content": "具有ISO 27001认证得2分",
            "requirement_type": "scoring",
            "score": 2,
        }

        kept = service._filter_misclassified([item], "scoring", tender_file)

        assert len(kept) == 1
        assert RequirementFilterLog.objects.count() == 0

    def test_scoring_not_applicable_dropped(self):
        """scoring：score_status=not_applicable 视为无分值 -> 丢弃。"""
        tender_file = self._make_tender_file()
        service = RequirementExtractService()
        items = [{
            "title": "投标文件递交",
            "content": "投标文件递交要求",
            "requirement_type": "submission",
            "score": None,
            "score_status": "not_applicable",
        }]

        kept = service._filter_misclassified(items, "scoring", tender_file)

        assert kept == []

    def test_filter_only_applies_to_own_scenario(self):
        """其他场景（如 commercial）不受 technical 硬过滤影响。"""
        tender_file = self._make_tender_file()
        service = RequirementExtractService()
        item = {
            "title": "投标报价",
            "content": "报价要求",
            "requirement_type": "commercial",
        }

        kept = service._filter_misclassified([item], "commercial", tender_file)

        assert len(kept) == 1


# ============================================================================
# _create_requirement：score_status / 页码范围 / 一致性标记
# ============================================================================

@pytest.mark.django_db
class TestCreateRequirementV3:
    def _setup(self):
        from apps.accounts.models import User
        from apps.projects.models import Project
        from apps.requirements.models import RequirementExtractionRun
        from apps.generation.models import PromptTemplate, PromptVersion, PromptRun

        user = User.objects.create_user(username="v3-user", password="x")
        project = Project.objects.create(name="v3项目", created_by=user)
        tender_file = TenderFile.objects.create(
            project=project,
            original_name="v3.pdf",
            object_key="test/v3.pdf",
            file_size=100,
            created_by=user,
            status="parsed",
        )
        template = PromptTemplate.objects.create(
            name="v3模板", scenario="requirement_extraction_scoring", key="v3-key",
        )
        version = PromptVersion.objects.create(
            template=template, version="3.0", status="published", user_prompt="测试",
        )
        prompt_run = PromptRun.objects.create(
            prompt_template=template,
            prompt_version=version,
            scenario="requirement_extraction_scoring",
            status="succeeded",
            output_json={"items": []},
        )
        extraction_run = RequirementExtractionRun.objects.create(
            tender_file=tender_file, project=project, status="running", created_by=user,
        )
        service = RequirementExtractService()
        return user, tender_file, extraction_run, prompt_run, service

    def _create(self, service, tender_file, extraction_run, prompt_run, item):
        return service._create_requirement(
            item=item,
            tender_file=tender_file,
            extraction_run=extraction_run,
            prompt_run=prompt_run,
            extraction_type="scoring",
            created_by=None,
        )

    def test_score_info_full(self):
        """score + score_status + 分值来源说明全部落库。"""
        _, tender_file, extraction_run, prompt_run, service = self._setup()
        req = self._create(service, tender_file, extraction_run, prompt_run, {
            "title": "服务方案",
            "content": "服务方案内容",
            "requirement_type": "scoring",
            "score": 20,
            "score_status": "identified",
            "score_text": "满分20分",
            "score_basis": "评标办法",
            "calculation_note": "专家评分",
        })
        assert req.score_info["score"] == 20
        assert req.score_info["score_status"] == "identified"
        assert req.score_info["score_text"] == "满分20分"
        assert req.score_info["score_basis"] == "评标办法"

    def test_score_null_status_only(self):
        """score 为 null 但给了 score_status -> 只有状态，不写 score。"""
        _, tender_file, extraction_run, prompt_run, service = self._setup()
        req = self._create(service, tender_file, extraction_run, prompt_run, {
            "title": "演示方案",
            "content": "演示",
            "requirement_type": "scoring",
            "score": None,
            "score_status": "ambiguous",
        })
        assert req.score_info == {"score_status": "ambiguous"}

    def test_score_zero_preserved(self):
        """score=0 是明确分值，必须保留（0 不等于无分值）。"""
        _, tender_file, extraction_run, prompt_run, service = self._setup()
        req = self._create(service, tender_file, extraction_run, prompt_run, {
            "title": "废标响应",
            "content": "未按要求提交视为废标",
            "requirement_type": "scoring",
            "score": 0,
            "score_status": "identified",
        })
        assert req.score_info["score"] == 0

    def test_technical_no_score_empty_score_info(self):
        """3.1 technical 无分值 group：不写 score，只保留 not_applicable 说明。"""
        _, tender_file, extraction_run, prompt_run, service = self._setup()
        req = self._create(service, tender_file, extraction_run, prompt_run, {
            "title": "数据迁移",
            "content": "投标人应制定数据迁移方案",
            "requirement_type": "tech_req",
            "score": None,
            "score_basis": "not_applicable",
            "classification_reason": "属于项目实施技术要求",
        })
        assert "score" not in req.score_info
        assert req.score_info.get("score_basis") == "not_applicable"
        assert req.raw_llm_item["classification_reason"] == "属于项目实施技术要求"

    def test_technical_with_score_stored(self):
        """3.1 technical 有分值 group：score_info 正常落库。"""
        _, tender_file, extraction_run, prompt_run, service = self._setup()
        req = self._create(service, tender_file, extraction_run, prompt_run, {
            "title": "服务方案",
            "content": "服务方案满分20分",
            "requirement_type": "tech_req",
            "score": 20,
            "score_text": "服务方案满分20分",
            "score_basis": "explicit_total",
        })
        assert req.score_info["score"] == 20
        assert req.score_info["score_basis"] == "explicit_total"

    def test_mandatory_level_maps_to_is_mandatory(self):
        """3.1 合同法律场景 mandatory_level=mandatory -> 落库为强制。"""
        _, tender_file, extraction_run, prompt_run, service = self._setup()
        req = self._create(service, tender_file, extraction_run, prompt_run, {
            "title": "逾期交付责任",
            "content": "逾期交付每日支付0.5%违约金",
            "requirement_type": "legal",
            "mandatory_level": "mandatory",
            "is_rejection_clause": False,
        })
        assert req.mandatory_level == "mandatory"

    def test_mandatory_level_general_not_mandatory(self):
        """mandatory_level=general 不视为强制。"""
        _, tender_file, extraction_run, prompt_run, service = self._setup()
        req = self._create(service, tender_file, extraction_run, prompt_run, {
            "title": "争议解决",
            "content": "争议提交仲裁",
            "requirement_type": "legal",
            "mandatory_level": "general",
        })
        assert req.mandatory_level == "optional"

    def test_consistency_mark_not_override(self):
        """大类分值与细项合计不一致 -> 只标记，不覆盖 score。"""
        _, tender_file, extraction_run, prompt_run, service = self._setup()
        req = self._create(service, tender_file, extraction_run, prompt_run, {
            "title": "服务方案",
            "content": "服务方案",
            "requirement_type": "scoring",
            "score": 20,
            "score_status": "identified",
            "detail_points": [
                {"title": "完整性", "requirement": "完整", "score": 12},
                {"title": "合理性", "requirement": "合理", "score": 10},
            ],
        })
        assert req.score_info["score"] == 20
        assert req.score_info["consistency_review"] is True
        assert "20" in req.score_info["consistency_note"]
        assert "22" in req.score_info["consistency_note"]

    def test_consistency_ok_no_mark(self):
        """细项合计等于大类分值 -> 不标记。"""
        _, tender_file, extraction_run, prompt_run, service = self._setup()
        req = self._create(service, tender_file, extraction_run, prompt_run, {
            "title": "服务方案",
            "content": "服务方案",
            "requirement_type": "scoring",
            "score": 20,
            "score_status": "identified",
            "detail_points": [
                {"title": "完整性", "requirement": "完整", "score": 10},
                {"title": "合理性", "requirement": "合理", "score": 10},
            ],
        })
        assert "consistency_review" not in req.score_info

    def test_page_range_parsed(self):
        """source_page 字符串 P22-P23 -> start/end 拆分落库。"""
        _, tender_file, extraction_run, prompt_run, service = self._setup()
        req = self._create(service, tender_file, extraction_run, prompt_run, {
            "title": "服务方案",
            "content": "服务方案",
            "requirement_type": "scoring",
            "score": 20,
            "source_page": "P22-P23",
        })
        assert req.source_page_start == 22
        assert req.source_page_end == 23
        assert req.source_page == 22

    def test_discrete_pages_only_start(self):
        """source_page P22、P24 -> 只取 start=22。"""
        _, tender_file, extraction_run, prompt_run, service = self._setup()
        req = self._create(service, tender_file, extraction_run, prompt_run, {
            "title": "服务方案",
            "content": "服务方案",
            "requirement_type": "scoring",
            "score": 20,
            "source_page": "P22、P24",
        })
        assert req.source_page_start == 22
        assert req.source_page_end is None

    def test_raw_group_stored(self):
        """groups 模式落库时 raw_llm_item 保存原始大类结构。"""
        _, tender_file, extraction_run, prompt_run, service = self._setup()
        raw_group = {
            "title": "服务方案",
            "description": "服务方案",
            "score": 20,
            "source_page": "P22",
            "detail_points": [],
        }
        item = service._group_to_item(raw_group, "scoring")
        req = self._create(service, tender_file, extraction_run, prompt_run, item)
        assert req.raw_llm_item == raw_group

    def test_extract_single_type_groups_mode_end_to_end(self):
        """groups 输出全链路：解析 -> 过滤 -> 落库；无分值项被硬过滤。"""
        user, tender_file, extraction_run, prompt_run, service = self._setup()
        prompt_run.output_json = {
            "groups": [
                {
                    "title": "服务方案",
                    "description": "服务方案要求",
                    "score": 20,
                    "score_status": "identified",
                    "evidence": "服务方案满分20分",
                    "source": "第三章 评标办法",
                    "source_page": "P22-P23",
                    "detail_points": [
                        {"title": "完整性", "requirement": "完整", "score": 10, "evidence": "e1"},
                        {"title": "合理性", "requirement": "合理", "score": 10, "evidence": "e2"},
                    ],
                },
                {
                    "title": "资格审查",
                    "description": "审查",
                    "score": None,
                    "score_status": "not_applicable",
                    "evidence": "x",
                    "source": "第二章",
                    "source_page": "P5",
                },
            ],
        }

        with patch.object(service.ai_task_service, "execute", return_value=prompt_run):
            with patch.object(service, "_get_model_config", return_value=None):
                result = service._extract_single_type(
                    extraction_type="scoring",
                    document_text="doc",
                    tender_file=tender_file,
                    extraction_run=extraction_run,
                    created_by=user,
                    prompt_version_id=None,
                    model_config_id=None,
                )

        assert result["count"] == 1
        req = TenderRequirement.objects.get(tender_file=tender_file)
        assert req.title == "服务方案"
        assert req.score_info["score"] == 20
        assert req.source_page_start == 22
        assert req.source_page_end == 23
        assert "consistency_review" not in req.score_info
        assert req.raw_llm_item["title"] == "服务方案"
        assert RequirementFilterLog.objects.filter(
            tender_file=tender_file, filter_level="hard",
        ).count() == 1

    def test_confidence_string_sanitized(self):
        """模型偶发输出字符串置信度（如 "high"），落库应为 None 而非抛错。"""
        _, tender_file, extraction_run, prompt_run, service = self._setup()
        req = self._create(service, tender_file, extraction_run, prompt_run, {
            "title": "服务保障机制",
            "content": "服务保障机制要求",
            "requirement_type": "legal",
            "confidence": "high",
        })
        assert req.confidence is None

    def test_confidence_number_preserved(self):
        """数字置信度正常落库。"""
        _, tender_file, extraction_run, prompt_run, service = self._setup()
        req = self._create(service, tender_file, extraction_run, prompt_run, {
            "title": "服务保障机制",
            "content": "服务保障机制要求",
            "requirement_type": "legal",
            "confidence": 0.97,
        })
        assert req.confidence == 0.97

    def test_extract_single_type_unknown_output_raises(self):
        """输出结构异常（空 dict/缺 items 键）重试耗尽后应抛错进 failed_types，不静默丢失。"""
        from copy import deepcopy
        user, tender_file, extraction_run, prompt_run, service = self._setup()
        prompt_run.output_json = {}  # 生产实测：模型偶发返回空 dict
        prompt_run2 = deepcopy(prompt_run)
        prompt_run2.id = None

        with patch.object(service.ai_task_service, "execute", side_effect=[prompt_run, prompt_run2]):
            with patch.object(service, "_get_model_config", return_value=None):
                with pytest.raises(RequirementExtractionError) as exc_info:
                    service._extract_single_type(
                        extraction_type="commercial",
                        document_text="doc",
                        tender_file=tender_file,
                        extraction_run=extraction_run,
                        created_by=user,
                        prompt_version_id=None,
                        model_config_id=None,
                    )
        assert "无法识别" in str(exc_info.value)
        assert TenderRequirement.objects.filter(tender_file=tender_file).count() == 0

    def test_extract_single_type_retry_recovers(self):
        """第一次输出空结构、重试输出合法 items -> 重试成功落库。"""
        from apps.generation.models import PromptRun
        user, tender_file, extraction_run, prompt_run, service = self._setup()
        prompt_run.output_json = {}  # 首次：空 dict
        prompt_run2 = PromptRun.objects.create(
            prompt_template=prompt_run.prompt_template,
            prompt_version=prompt_run.prompt_version,
            scenario=prompt_run.scenario,
            status="succeeded",
            output_json={"items": [{
                "title": "付款方式",
                "content": "服务结束后支付",
                "requirement_type": "commercial",
                "commercial_type": "付款条件",
                "key_values": ["服务结束后支付"],
            }]},
        )

        with patch.object(service.ai_task_service, "execute", side_effect=[prompt_run, prompt_run2]):
            with patch.object(service, "_get_model_config", return_value=None):
                result = service._extract_single_type(
                    extraction_type="commercial",
                    document_text="doc",
                    tender_file=tender_file,
                    extraction_run=extraction_run,
                    created_by=user,
                    prompt_version_id=None,
                    model_config_id=None,
                )
        assert result["count"] == 1
        req = TenderRequirement.objects.get(tender_file=tender_file)
        assert req.title == "付款方式"
        assert req.requirement_type == "commercial"

    def test_extract_single_type_empty_items_is_success(self):
        """{"items": []} 是合法的"无内容"响应，应正常成功 0 条而非报错。"""
        user, tender_file, extraction_run, prompt_run, service = self._setup()
        prompt_run.output_json = {"items": []}

        with patch.object(service.ai_task_service, "execute", return_value=prompt_run):
            with patch.object(service, "_get_model_config", return_value=None):
                result = service._extract_single_type(
                    extraction_type="commercial",
                    document_text="doc",
                    tender_file=tender_file,
                    extraction_run=extraction_run,
                    created_by=user,
                    prompt_version_id=None,
                    model_config_id=None,
                )
        assert result["count"] == 0
        assert TenderRequirement.objects.filter(tender_file=tender_file).count() == 0


# ============================================================================
# RequirementListSerializer：detail_points 提取
# ============================================================================

@pytest.mark.django_db
class TestRequirementListSerializerDetailPoints:
    _user_seq = 0

    def _make_requirement(self, raw_llm_item, detail_points=None, classification_reason=""):
        from apps.accounts.models import User
        from apps.projects.models import Project
        TestRequirementListSerializerDetailPoints._user_seq += 1
        user = User.objects.create_user(
            username=f"ser-user-{TestRequirementListSerializerDetailPoints._user_seq}",
            password="x",
        )
        project = Project.objects.create(name="序列化项目", created_by=user)
        tender_file = TenderFile.objects.create(
            project=project,
            original_name="ser.pdf",
            object_key=f"test/ser-{TestRequirementListSerializerDetailPoints._user_seq}.pdf",
            file_size=100,
            created_by=user,
        )
        return TenderRequirement.objects.create(
            tender_file=tender_file,
            requirement_key="ser-key-1",
            requirement_type="tech_req",
            title="数据迁移",
            content="投标人应制定数据迁移方案",
            extraction_type="technical",
            raw_llm_item=raw_llm_item,
            detail_points=detail_points or [],
            classification_reason=classification_reason,
            created_by=user,
        )

    def test_groups_mode_detail_points_exposed(self):
        """groups 模式：detail_points 独立字段直接返回。"""
        from apps.requirements.serializers import RequirementListSerializer
        points = [
            {"point_id": "R1-1", "title": "迁移范围",
             "requirement": "完成数据清洗转换", "evidence": "x"},
        ]
        req = self._make_requirement(
            {"title": "数据迁移", "detail_points": points},
            detail_points=points,
        )
        data = RequirementListSerializer(req).data
        assert len(data["detail_points"]) == 1
        assert data["detail_points"][0]["title"] == "迁移范围"

    def test_items_mode_detail_points_empty(self):
        """items 模式：无 detail_points -> 空数组。"""
        from apps.requirements.serializers import RequirementListSerializer
        req = self._make_requirement({
            "title": "联合体投标限制",
            "content": "本项目不接受联合体投标",
            "qualification_type": "联合体要求",
        })
        data = RequirementListSerializer(req).data
        assert data["detail_points"] == []

    def test_classification_reason_exposed(self):
        """3.1 technical：classification_reason 独立字段直接返回，无则空字符串。"""
        from apps.requirements.serializers import RequirementListSerializer
        req = self._make_requirement(
            {"title": "数据迁移", "classification_reason": "属于系统建设核心实施内容"},
            classification_reason="属于系统建设核心实施内容",
        )
        data = RequirementListSerializer(req).data
        assert data["classification_reason"] == "属于系统建设核心实施内容"

        req2 = self._make_requirement({"title": "数据迁移"})
        assert RequirementListSerializer(req2).data["classification_reason"] == ""


@pytest.mark.django_db
class TestMigrationBackfill:
    """迁移 0007 回填：从 raw_llm_item 提取 detail_points / classification_reason。"""

    def test_backfill_extracts_fields(self):
        """带 raw_llm_item 的行回填成功，无 raw 的行不受影响。"""
        import importlib
        from apps.accounts.models import User
        from apps.projects.models import Project
        migration = importlib.import_module(
            "apps.requirements.migrations.0007_tenderrequirement_classification_reason_and_more"
        )
        user = User.objects.create_user(username="bf-user-1", password="x")
        project = Project.objects.create(name="回填项目", created_by=user)
        tender_file = TenderFile.objects.create(
            project=project,
            original_name="bf.pdf",
            object_key="test/bf-1.pdf",
            file_size=100,
            created_by=user,
        )
        points = [{"point_id": "R1-1", "title": "迁移范围"}]
        with_points = TenderRequirement.objects.create(
            tender_file=tender_file, requirement_key="bf-key-1",
            requirement_type="tech_req", title="数据迁移", content="内容",
            extraction_type="technical",
            raw_llm_item={"detail_points": points, "classification_reason": "核心实施内容"},
            created_by=user,
        )
        # 模拟旧数据：detail_points 字段为空
        TenderRequirement.objects.filter(pk=with_points.pk).update(detail_points=[])
        no_raw = TenderRequirement.objects.create(
            tender_file=tender_file, requirement_key="bf-key-2",
            requirement_type="mandatory", title="保密义务", content="内容",
            extraction_type="mandatory", raw_llm_item=None, created_by=user,
        )

        class _FakeApps:
            def get_model(self, *args):
                return TenderRequirement
        migration.backfill_detail_points(apps=_FakeApps(), schema_editor=None)

        with_points.refresh_from_db()
        no_raw.refresh_from_db()
        assert with_points.detail_points == points
        assert with_points.classification_reason == "核心实施内容"
        assert no_raw.detail_points == []
        assert no_raw.classification_reason == ""


@pytest.mark.django_db
class TestOrchestratorContextOnce:
    """编排器：共享上下文只构建一次 + ExtractionRun 复用（双 Run bug 回归）。"""

    def _make_env(self):
        from apps.accounts.models import User
        from apps.projects.models import Project
        user = User.objects.create_user(username="orch-user", password="x")
        project = Project.objects.create(name="编排项目", created_by=user)
        tender_file = TenderFile.objects.create(
            project=project,
            original_name="orch.pdf",
            object_key="test/orch.pdf",
            file_size=100,
            created_by=user,
            status="parsed",
        )
        return user, tender_file

    def test_context_built_once_and_all_types_extracted(self):
        from apps.requirements.services.requirement_extract_service import RequirementExtractService
        from apps.requirements.services.extraction.orchestrator import SingleTypeExtractor
        user, tender_file = self._make_env()
        service = RequirementExtractService()

        built = {"count": 0}
        fake_context = {
            "document_text": "doc", "chunk_context": "chunk", "model_config": None,
        }
        executed = []

        def fake_build_all(tender_file_, model_config_id, valid_types):
            built["count"] += 1
            from types import SimpleNamespace
            return {t: SimpleNamespace(**fake_context) for t in valid_types}

        def fake_extract(self, **kwargs):
            executed.append(kwargs["extraction_type"])
            return {"count": 0, "ids": [], "prompt_version": {"version": "3.1"}}

        with patch.object(
            service.orchestrator.context_builder, "build_all", fake_build_all
        ), patch.object(SingleTypeExtractor, "extract", fake_extract):
            result = service.extract_requirements(
                tender_file_id=tender_file.id,
                extraction_types=["scoring", "mandatory", "qualification",
                                  "commercial", "technical", "submission"],
                created_by=user,
            )

        assert built["count"] == 1  # 上下文只构建一次
        assert len(executed) == 6  # 6 个场景全部执行
        assert result["total_count"] == 0
        assert result["failed_types"] == []

    def test_extraction_run_reused_not_duplicated(self):
        """API 层预建 Run 传入 extraction_run_id：复用不新建（双 Run bug 回归）。"""
        from apps.accounts.models import User
        from apps.requirements.models import RequirementExtractionRun
        from apps.requirements.services.requirement_extract_service import RequirementExtractService
        from apps.requirements.services.extraction.orchestrator import SingleTypeExtractor
        user, tender_file = self._make_env()

        pre_created = RequirementExtractionRun.objects.create(
            tender_file=tender_file,
            project=tender_file.project,
            status="pending",
            extraction_types=["scoring"],
            created_by=user,
        )
        service = RequirementExtractService()

        def fake_build_all(tender_file_, model_config_id, valid_types):
            from types import SimpleNamespace
            return {t: SimpleNamespace(document_text="doc", chunk_context="", model_config=None) for t in valid_types}

        with patch.object(
            service.orchestrator.context_builder, "build_all", fake_build_all
        ), patch.object(
            SingleTypeExtractor, "extract",
            return_value={"count": 0, "ids": [], "prompt_version": {"version": "3.1"}},
        ):
            result = service.extract_requirements(
                tender_file_id=tender_file.id,
                extraction_types=["scoring"],
                created_by=user,
                extraction_run_id=pre_created.id,
            )

        assert result["run_id"] == pre_created.id
        assert RequirementExtractionRun.objects.filter(tender_file=tender_file).count() == 1
        pre_created.refresh_from_db()
        assert pre_created.status == "success"


@pytest.mark.django_db
class TestParallelOrchestration:
    """并行编排：异常隔离 / failed_types / Run 终态语义。"""

    def _make_env(self):
        from apps.accounts.models import User
        from apps.projects.models import Project
        user = User.objects.create_user(username="par-user", password="x")
        project = Project.objects.create(name="并行项目", created_by=user)
        tender_file = TenderFile.objects.create(
            project=project,
            original_name="par.pdf",
            object_key="test/par.pdf",
            file_size=100,
            created_by=user,
            status="parsed",
        )
        return user, tender_file

    def _run(self, user, tender_file, fake_extract, extraction_types):
        from apps.requirements.services.requirement_extract_service import RequirementExtractService
        from apps.requirements.services.extraction.orchestrator import SingleTypeExtractor
        service = RequirementExtractService()

        def fake_build_all(tender_file_, model_config_id, valid_types):
            from types import SimpleNamespace
            return {t: SimpleNamespace(document_text="doc", chunk_context="", model_config=None) for t in valid_types}

        with patch.object(
            service.orchestrator.context_builder, "build_all", fake_build_all
        ), patch.object(SingleTypeExtractor, "extract", fake_extract):
            return service.extract_requirements(
                tender_file_id=tender_file.id,
                extraction_types=extraction_types,
                created_by=user,
            )

    def test_all_six_succeed(self):
        from apps.requirements.models import RequirementExtractionRun
        user, tender_file = self._make_env()
        calls = []

        def fake_extract(self, **kwargs):
            calls.append(kwargs["extraction_type"])
            return {"count": 1, "ids": [1], "prompt_version": {"version": "3.1"}}

        result = self._run(
            user, tender_file, fake_extract,
            ["scoring", "mandatory", "qualification", "commercial", "technical", "submission"],
        )

        assert result["total_count"] == 6
        assert result["failed_types"] == []
        assert sorted(calls) == sorted(["scoring", "mandatory", "qualification",
                                        "commercial", "technical", "submission"])
        run = RequirementExtractionRun.objects.get(pk=result["run_id"])
        assert run.status == "success"

    def test_partial_failure_tracks_failed_types(self):
        from apps.requirements.models import RequirementExtractionRun
        user, tender_file = self._make_env()

        def fake_extract(self, **kwargs):
            if kwargs["extraction_type"] in ("mandatory", "commercial", "submission"):
                raise RequirementExtractionError("模拟失败")
            return {"count": 1, "ids": [1], "prompt_version": {"version": "3.1"}}

        result = self._run(
            user, tender_file, fake_extract,
            ["scoring", "mandatory", "qualification", "commercial", "technical", "submission"],
        )

        assert result["total_count"] == 3
        assert result["failed_types"] == ["mandatory", "commercial", "submission"]
        run = RequirementExtractionRun.objects.get(pk=result["run_id"])
        assert run.status == "partial_success"

    def test_all_failed_marks_run_failed(self):
        from apps.requirements.models import RequirementExtractionRun
        user, tender_file = self._make_env()

        def fake_extract(self, **kwargs):
            raise RequirementExtractionError("模拟失败")

        result = self._run(user, tender_file, fake_extract, ["scoring", "technical"])

        assert result["total_count"] == 0
        assert result["failed_types"] == ["scoring", "technical"]
        run = RequirementExtractionRun.objects.get(pk=result["run_id"])
        assert run.status == "failed"
        assert "所有抽取类型失败" in run.error_message

    def test_all_success_empty_run_success(self):
        """全部成功但 0 条：SUCCESS + 空提示（触发文件 empty 状态）。"""
        from apps.requirements.models import RequirementExtractionRun
        user, tender_file = self._make_env()

        def fake_extract(self, **kwargs):
            return {"count": 0, "ids": [], "prompt_version": {"version": "3.1"}}

        result = self._run(user, tender_file, fake_extract, ["scoring", "technical"])

        assert result["total_count"] == 0
        assert result["failed_types"] == []
        run = RequirementExtractionRun.objects.get(pk=result["run_id"])
        assert run.status == "success"
        assert run.error_message == "未抽取到任何条款"

    def test_progress_callback_reports_parallel_steps(self):
        """进度回调到达 90+ 且文案含并行抽取。"""
        user, tender_file = self._make_env()
        steps = []

        def fake_extract(self, **kwargs):
            return {"count": 0, "ids": [], "prompt_version": {"version": "3.1"}}

        from apps.requirements.services.requirement_extract_service import RequirementExtractService
        from apps.requirements.services.extraction.orchestrator import SingleTypeExtractor
        service = RequirementExtractService()

        def fake_build_all(tender_file_, model_config_id, valid_types):
            from types import SimpleNamespace
            return {t: SimpleNamespace(document_text="doc", chunk_context="", model_config=None) for t in valid_types}

        def cb(progress, step):
            steps.append((progress, step))

        with patch.object(
            service.orchestrator.context_builder, "build_all", fake_build_all
        ), patch.object(SingleTypeExtractor, "extract", fake_extract):
            service.extract_requirements(
                tender_file_id=tender_file.id,
                extraction_types=["scoring", "mandatory", "qualification"],
                created_by=user,
                progress_callback=cb,
            )

        assert steps[-1][0] == 95
        assert any("并行抽取" in s for _, s in steps)


class TestProgressTracker:
    """并行进度聚合（内存态，线程安全）。"""

    def test_concurrent_marks_aggregate_correctly(self):
        import threading
        from apps.requirements.services.extraction.progress import ProgressTracker
        tracker = ProgressTracker(total=6)
        errors = []

        def worker(i):
            tracker.mark_started(f"type{i}")
            tracker.mark_finished(f"type{i}", ok=(i % 2 == 0))

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(6)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        snap = tracker.snapshot()
        assert snap["completed"] == 3
        assert snap["failed"] == 3
        assert snap["done"] is True
        assert "成功 3/6" in snap["step"]

    def test_snapshot_before_done(self):
        from apps.requirements.services.extraction.progress import ProgressTracker
        tracker = ProgressTracker(total=6)
        tracker.mark_started("scoring")
        tracker.mark_finished("scoring", ok=True)
        snap = tracker.snapshot()
        assert snap["done"] is False
        assert "1/6" in snap["step"]


# ============================================================================
# 旧 /extract/ endpoint 回归：路由已删，必须 404
# ============================================================================

@pytest.mark.django_db
class TestLegacyExtractEndpointRemoved:
    """重构后旧入口全部移除，请求旧 URL 应得到 404。"""

    def _client(self):
        user = User.objects.create_superuser(
            username="admin-extract", password="testpass123"
        )
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def _make_file(self):
        from apps.projects.models import Project
        user = User.objects.create_user(username="owner-extract", password="x")
        project = Project.objects.create(name="旧入口回归项目", created_by=user)
        return TenderFile.objects.create(
            project=project,
            original_name="tender.pdf",
            file_size=1024,
            object_key=f"test/legacy-{uuid4().hex}.pdf",
            status=TenderFile.STATUS_PARSED,
            created_by=user,
        )

    def test_old_extract_url_404(self):
        file = self._make_file()
        resp = self._client().post(
            f"/api/requirements/files/{file.id}/extract/",
            {"mode": "hybrid"},
            format="json",
        )
        assert resp.status_code == 404

    def test_old_extract_v2_still_available(self):
        """新入口 /extract-v2/ 必须仍可用（返回去重或 pending 而非 404）。"""
        file = self._make_file()
        resp = self._client().post(
            f"/api/requirements/files/{file.id}/extract-v2/",
            {"extraction_types": ["scoring"]},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["status"] == "pending"


# ============================================================================
# 编排器：per-type contexts（Task 7）
# ============================================================================

@pytest.mark.django_db
class TestOrchestratorPerTypeContext:
    def test_each_worker_gets_its_own_context(self, tender_file, bid_manager_user, parsed_document):
        from unittest.mock import MagicMock, patch
        from apps.requirements.services.extraction.orchestrator import ExtractionOrchestrator
        from apps.requirements.models import RequirementExtractionRun

        orchestrator = ExtractionOrchestrator()
        orchestrator.context_builder = MagicMock()
        per_type = {
            "scoring": MagicMock(chunk_context="scoring-ctx"),
            "technical": MagicMock(chunk_context="technical-ctx"),
        }
        orchestrator.context_builder.build_all.return_value = per_type

        seen = {}

        class FakeExtractor:
            def __init__(self, ai_task_service):
                pass

            def extract(self, **kwargs):
                seen[kwargs["extraction_type"]] = kwargs["chunk_context"]
                return {"count": 1, "ids": [1], "prompt_version": "3.1"}

        with patch("apps.requirements.services.extraction.orchestrator.SingleTypeExtractor", FakeExtractor):
            with patch("apps.requirements.services.extraction.orchestrator.AiTaskExecutionService"):
                results = orchestrator.run(
                    tender_file_id=tender_file.id,
                    extraction_types=["scoring", "technical"],
                    created_by=bid_manager_user,
                )

        assert seen == {"scoring": "scoring-ctx", "technical": "technical-ctx"}
        assert results["total_count"] == 2
        orchestrator.context_builder.build_all.assert_called_once()
