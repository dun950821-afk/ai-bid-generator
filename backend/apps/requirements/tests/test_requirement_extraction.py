# backend/apps/requirements/tests/test_requirement_extraction.py
"""条款抽取测试用例。"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from hashlib import sha256

from django.test import TestCase

from apps.requirements.services.requirement_key import generate_requirement_key
from apps.requirements.services.candidate_selector import CandidateSelector
from apps.requirements.services.requirement_mapper import RequirementMapper
from apps.requirements.services.requirement_extract_service import (
    RequirementExtractService,
    RequirementExtractionError,
)
from apps.requirements.services.document_text_service import DocumentTextService
from apps.requirements.models import TenderRequirement
from apps.requirements.constants import TYPE_TO_SCENARIO, EXTRACTION_TYPES, ExtractionRunStatus
from apps.tender.constants import (
    RequirementType,
    MandatoryLevel,
    RiskLevel,
    ExtractionMethod,
    ChunkType,
)
from apps.tender.models import TenderFile, ParsedDocument
from apps.accounts.models import User


class TestGenerateRequirementKey:
    """测试 requirement_key 生成。"""

    def test_generates_32_char_key(self):
        """生成 32 位哈希。"""
        key = generate_requirement_key(
            tender_file_id=1,
            source_chunk_id=100,
            requirement_type="tech_req",
            content="测试条款内容",
        )
        assert len(key) == 32
        assert key.isalnum()

    def test_same_input_same_key(self):
        """相同输入生成相同 key（幂等）。"""
        key1 = generate_requirement_key(1, 100, "tech_req", "测试内容")
        key2 = generate_requirement_key(1, 100, "tech_req", "测试内容")
        assert key1 == key2

    def test_different_input_different_key(self):
        """不同输入生成不同 key。"""
        key1 = generate_requirement_key(1, 100, "tech_req", "内容A")
        key2 = generate_requirement_key(1, 100, "tech_req", "内容B")
        assert key1 != key2

    def test_none_chunk_id_handled(self):
        """source_chunk_id=None 时正常处理。"""
        key = generate_requirement_key(1, None, "tech_req", "测试内容")
        assert len(key) == 32

    def test_extraction_type_as_source(self):
        """使用 extraction_type 作为源标识。"""
        key = generate_requirement_key(1, "scoring", "mandatory", "测试内容")
        assert len(key) == 32


class TestRequirementMapper:
    """测试 RequirementMapper。"""

    def setup_method(self):
        self.mapper = RequirementMapper()

    def test_map_basic_fields(self):
        """映射基本字段。"""
        llm_output = {
            "requirement_type": "tech_req",
            "content": "测试条款内容",
            "summary": "测试摘要",
            "mandatory_level": "mandatory",
            "risk_level": "high",
            "confidence": 0.95,
        }

        requirement = self.mapper.map_to_requirement(
            llm_output=llm_output,
            tender_file_id=1,
            parsed_document_id=1,
            source_chunk_id=100,
            prompt_version_id=1,
            prompt_run_id=1,
        )

        assert requirement.requirement_type == "tech_req"
        assert requirement.content == "测试条款内容"
        assert requirement.summary == "测试摘要"
        assert requirement.mandatory_level == "mandatory"
        assert requirement.risk_level == "high"
        assert requirement.confidence == 0.95

    def test_normalize_invalid_requirement_type(self):
        """无效条款类型映射为 other。"""
        llm_output = {
            "requirement_type": "invalid_type",
            "content": "测试内容",
        }

        requirement = self.mapper.map_to_requirement(
            llm_output=llm_output,
            tender_file_id=1,
            parsed_document_id=1,
            source_chunk_id=1,
            prompt_version_id=None,
            prompt_run_id=None,
        )

        assert requirement.requirement_type == "other"

    def test_normalize_invalid_mandatory_level(self):
        """无效强制程度映射为 unknown。"""
        llm_output = {
            "requirement_type": "tech_req",
            "content": "测试",
            "mandatory_level": "invalid",
        }

        requirement = self.mapper.map_to_requirement(
            llm_output=llm_output,
            tender_file_id=1,
            parsed_document_id=1,
            source_chunk_id=1,
            prompt_version_id=None,
            prompt_run_id=None,
        )

        assert requirement.mandatory_level == "unknown"

    def test_source_chunk_data_preserved(self):
        """来源分块数据被保存。"""
        llm_output = {
            "requirement_type": "tech_req",
            "content": "测试",
        }
        source_data = {
            "page_start": 10,
            "page_end": 12,
            "section_path": "第三章/技术要求",
            "chunk_index": 5,
            "content_hash": "abc123",
        }

        requirement = self.mapper.map_to_requirement(
            llm_output=llm_output,
            tender_file_id=1,
            parsed_document_id=1,
            source_chunk_id=1,
            prompt_version_id=None,
            prompt_run_id=None,
            source_chunk_data=source_data,
        )

        assert requirement.source_page_start == 10
        assert requirement.source_page_end == 12
        assert requirement.source_section_path == "第三章/技术要求"
        assert requirement.source_chunk_index == 5
        assert requirement.source_content_hash == "abc123"


class TestCandidateSelector:
    """测试 CandidateSelector。"""

    def setup_method(self):
        self.selector = CandidateSelector()

    def test_contains_mandatory_keywords(self):
        """检查关键词匹配。"""
        assert self.selector._contains_mandatory_keywords("必须提供证明材料") is True
        assert self.selector._contains_mandatory_keywords("应加盖公章") is True
        assert self.selector._contains_mandatory_keywords("这是一般内容") is False


class TestConstants:
    """测试常量配置。"""

    def test_type_to_scenario_mapping(self):
        """TYPE_TO_SCENARIO 包含所有支持的抽取类型。"""
        expected_types = ["scoring", "mandatory", "qualification", "commercial", "technical", "submission"]
        for t in expected_types:
            assert t in TYPE_TO_SCENARIO, f"Missing extraction type: {t}"

    def test_extraction_types_list(self):
        """EXTRACTION_TYPES 列表正确。"""
        assert set(EXTRACTION_TYPES) == set(TYPE_TO_SCENARIO.keys())

    def test_scenario_names_correct(self):
        """场景名称正确映射。"""
        assert TYPE_TO_SCENARIO["scoring"] == "requirement_extraction_scoring"
        assert TYPE_TO_SCENARIO["mandatory"] == "requirement_extraction_mandatory"
        assert TYPE_TO_SCENARIO["qualification"] == "requirement_extraction_qualification"


@pytest.mark.django_db
class TestRequirementExtractServiceV2:
    """测试 RequirementExtractService（V2）。"""

    def test_validate_tender_file_not_found(self):
        """文件不存在时报错。"""
        service = RequirementExtractService()

        with pytest.raises(TenderFile.DoesNotExist):
            service._validate_tender_file(99999)

    def test_validate_extraction_types(self):
        """校验抽取类型。"""
        service = RequirementExtractService()

        # 有效类型
        valid = service._validate_extraction_types(["scoring", "mandatory"])
        assert valid == ["scoring", "mandatory"]

        # 混合有效和无效类型
        valid = service._validate_extraction_types(["scoring", "invalid", "mandatory"])
        assert valid == ["scoring", "mandatory"]

        # 空列表应报错
        with pytest.raises(RequirementExtractionError):
            service._validate_extraction_types([])

    def _build_mocks_for_create_requirement(self):
        """构造 _create_requirement 测试所需的 mock 依赖。

        tender_file 和 extraction_run 是 ForeignKey，Django 不接受 MagicMock，
        所以用 spec=TenderFile / RequirementExtractionRun 让 isinstance 通过。
        """
        from apps.requirements.models import RequirementExtractionRun
        tender_file = MagicMock(spec=TenderFile, id=1)
        tender_file.id = 1
        extraction_run = MagicMock(spec=RequirementExtractionRun, id=1)
        extraction_run.id = 1
        prompt_run = MagicMock()
        prompt_run.prompt_version = MagicMock(version="2.0", id=1)
        prompt_run.prompt_template_id = 1
        prompt_run.model_config = MagicMock()
        prompt_run.model_config.display_name = "mock-model"
        return tender_file, extraction_run, prompt_run

    def test_create_requirement_fallback_title_long_content(self):
        """LLM 返回空 title 且 content > 10 字时，title 为 content[:10] + …。"""
        service = RequirementExtractService()
        item = {
            "title": "",
            "content": "本条款要求投标人具备建筑工程施工总承包三级及以上资质",
            "requirement_type": "qualification",
            "is_mandatory": True,
            "is_rejection_clause": True,
        }
        tender_file, extraction_run, prompt_run = self._build_mocks_for_create_requirement()

        captured = {}

        def fake_init(self, *args, **kwargs):
            captured["kwargs"] = kwargs

        with patch.object(TenderRequirement.objects, "filter") as mock_filter:
            mock_filter.return_value.first.return_value = None
            with patch.object(TenderRequirement, "__init__", fake_init):
                with patch.object(TenderRequirement, "save"):
                    service._create_requirement(
                        item=item,
                        tender_file=tender_file,
                        extraction_run=extraction_run,
                        prompt_run=prompt_run,
                        extraction_type="qualification",
                        created_by=None,
                    )
                assert captured["kwargs"]["title"] == "本条款要求投标人具备…"

    def test_create_requirement_fallback_title_short_content(self):
        """LLM 返回空 title 且 content ≤ 10 字时，title 为 content 本身（不加省略号）。"""
        service = RequirementExtractService()
        item = {
            "title": "",
            "content": "资质要求",
            "requirement_type": "qualification",
            "is_mandatory": False,
            "is_rejection_clause": False,
        }
        tender_file, extraction_run, prompt_run = self._build_mocks_for_create_requirement()

        captured = {}

        def fake_init(self, *args, **kwargs):
            captured["kwargs"] = kwargs

        with patch.object(TenderRequirement.objects, "filter") as mock_filter:
            mock_filter.return_value.first.return_value = None
            with patch.object(TenderRequirement, "__init__", fake_init):
                with patch.object(TenderRequirement, "save"):
                    service._create_requirement(
                        item=item,
                        tender_file=tender_file,
                        extraction_run=extraction_run,
                        prompt_run=prompt_run,
                        extraction_type="qualification",
                        created_by=None,
                    )
                assert captured["kwargs"]["title"] == "资质要求"

    def test_create_requirement_preserves_llm_title(self):
        """LLM 返回非空 title 时，落库的 title 为 LLM 返回值（不加工）。"""
        service = RequirementExtractService()
        item = {
            "title": "资质等级要求",
            "content": "投标人须具备建筑工程施工总承包三级及以上资质",
            "requirement_type": "qualification",
            "is_mandatory": True,
            "is_rejection_clause": True,
        }
        tender_file, extraction_run, prompt_run = self._build_mocks_for_create_requirement()

        captured = {}

        def fake_init(self, *args, **kwargs):
            captured["kwargs"] = kwargs

        with patch.object(TenderRequirement.objects, "filter") as mock_filter:
            mock_filter.return_value.first.return_value = None
            with patch.object(TenderRequirement, "__init__", fake_init):
                with patch.object(TenderRequirement, "save"):
                    service._create_requirement(
                        item=item,
                        tender_file=tender_file,
                        extraction_run=extraction_run,
                        prompt_run=prompt_run,
                        extraction_type="qualification",
                        created_by=None,
                    )
                assert captured["kwargs"]["title"] == "资质等级要求"


@pytest.mark.django_db
class TestDocumentTextService:
    """测试 DocumentTextService。"""

    def test_build_object_key(self):
        """测试对象键生成。"""
        service = DocumentTextService()

        # 创建 mock TenderFile
        mock_file = Mock()
        mock_file.id = 123

        key = service._build_object_key(mock_file)
        assert key == "parsed/123/document_text.txt"


def create_test_tender_file(user, **kwargs):
    """创建测试招标文件辅助函数。"""
    from apps.projects.models import Project

    project = Project.objects.create(
        name=f"测试项目-{user.id}",
        created_by=user,
    )
    return TenderFile.objects.create(
        project=project,
        original_name=kwargs.get("original_name", "test.pdf"),
        object_key=kwargs.get("object_key", f"test/{user.id}/test.pdf"),
        file_size=kwargs.get("file_size", 1024),
        status=kwargs.get("status", "parsed"),
        created_by=user,
    )


@pytest.mark.django_db
class TestTenderRequirementModel:
    """测试 TenderRequirement 模型。"""

    def test_requirement_key_unique_per_file(self):
        """requirement_key 在同一文件内唯一。"""
        user = User.objects.create_user(username="test", password="test")

        # 创建测试文件
        tender_file = create_test_tender_file(user)

        parsed_doc = ParsedDocument.objects.create(
            tender_file=tender_file,
            is_active=True,
        )

        # 创建第一条条款
        req1 = TenderRequirement.objects.create(
            tender_file=tender_file,
            parsed_document=parsed_doc,
            requirement_key="abc123def456",
            requirement_type=RequirementType.TECH_REQ,
            content="测试条款1",
            mandatory_level=MandatoryLevel.MANDATORY,
            risk_level=RiskLevel.HIGH,
            created_by=user,
        )

        # 尝试创建相同 requirement_key 的条款应该失败
        with pytest.raises(Exception):  # IntegrityError
            TenderRequirement.objects.create(
                tender_file=tender_file,
                parsed_document=parsed_doc,
                requirement_key="abc123def456",  # 相同 key
                requirement_type=RequirementType.SCORING,
                content="测试条款2",
                mandatory_level=MandatoryLevel.OPTIONAL,
                risk_level=RiskLevel.LOW,
                created_by=user,
            )

    def test_different_files_same_key_allowed(self):
        """不同文件可以有相同 requirement_key。"""
        user = User.objects.create_user(username="test2", password="test")

        # 创建两个文件
        file1 = create_test_tender_file(user, object_key="test/file1.pdf")
        file2 = create_test_tender_file(user, object_key="test/file2.pdf")

        doc1 = ParsedDocument.objects.create(tender_file=file1, is_active=True)
        doc2 = ParsedDocument.objects.create(tender_file=file2, is_active=True)

        # 两个文件可以有相同的 requirement_key
        req1 = TenderRequirement.objects.create(
            tender_file=file1,
            parsed_document=doc1,
            requirement_key="same_key_123",
            requirement_type=RequirementType.TECH_REQ,
            content="内容1",
            mandatory_level=MandatoryLevel.MANDATORY,
            risk_level=RiskLevel.HIGH,
            created_by=user,
        )

        req2 = TenderRequirement.objects.create(
            tender_file=file2,
            parsed_document=doc2,
            requirement_key="same_key_123",  # 相同 key，不同文件
            requirement_type=RequirementType.TECH_REQ,
            content="内容2",
            mandatory_level=MandatoryLevel.OPTIONAL,
            risk_level=RiskLevel.LOW,
            created_by=user,
        )

        assert req1.id != req2.id

    def test_extraction_type_field(self):
        """测试 extraction_type 字段。"""
        user = User.objects.create_user(username="test3", password="test")
        tender_file = create_test_tender_file(user)
        parsed_doc = ParsedDocument.objects.create(tender_file=tender_file, is_active=True)

        req = TenderRequirement.objects.create(
            tender_file=tender_file,
            parsed_document=parsed_doc,
            requirement_key="extraction_type_test",
            requirement_type=RequirementType.SCORING,
            content="评分项测试",
            extraction_type="scoring",  # 新字段
            mandatory_level=MandatoryLevel.OPTIONAL,
            risk_level=RiskLevel.LOW,
            created_by=user,
        )

        assert req.extraction_type == "scoring"
