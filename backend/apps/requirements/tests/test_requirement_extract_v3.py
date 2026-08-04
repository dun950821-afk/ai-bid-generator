# backend/apps/requirements/tests/test_requirement_extract_v3.py
"""3.0 提示词重设计后端支持测试。

覆盖：输出结构识别（detect_output_mode）/ 页码解析（parse_page_range）/
score_status 落库 / 大类细项一致性标记 / 误分类三级过滤。
"""

import pytest
from unittest.mock import patch

from apps.requirements.services.requirement_extract_service import (
    RequirementExtractService,
    detect_output_mode,
    parse_page_range,
)
from apps.requirements.models import TenderRequirement, RequirementFilterLog
from apps.tender.models import TenderFile


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
