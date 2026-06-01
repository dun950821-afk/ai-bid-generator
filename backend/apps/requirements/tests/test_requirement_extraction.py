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
from apps.requirements.models import TenderRequirement
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


@pytest.mark.django_db
class TestRequirementExtractService:
    """测试 RequirementExtractService。"""

    def test_validate_tender_file_not_found(self):
        """文件不存在时报错。"""
        service = RequirementExtractService()

        with pytest.raises(TenderFile.DoesNotExist):
            service._validate_tender_file(99999)

    def test_get_extraction_method(self):
        """获取抽取方法标识。"""
        service = RequirementExtractService()

        assert service._get_extraction_method("rule") == ExtractionMethod.RULE
        assert service._get_extraction_method("llm") == ExtractionMethod.LLM
        assert service._get_extraction_method("hybrid") == ExtractionMethod.HYBRID

    def test_map_chunk_type_to_requirement_type(self):
        """分块类型映射到条款类型。"""
        service = RequirementExtractService()

        assert service._map_chunk_type_to_requirement_type("qualification") == "qualification"
        assert service._map_chunk_type_to_requirement_type("scoring") == "scoring"
        assert service._map_chunk_type_to_requirement_type("unknown") == "other"


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


@pytest.mark.django_db
class TestForceCleanup:
    """测试 force=true 清理逻辑。"""

    def test_force_clears_non_manual_only(self):
        """force=true 只清理 rule/llm/hybrid，保留 manual。"""
        user = User.objects.create_user(username="test3", password="test")

        file = create_test_tender_file(user)
        doc = ParsedDocument.objects.create(tender_file=file, is_active=True)

        # 创建不同抽取方式的条款
        req_rule = TenderRequirement.objects.create(
            tender_file=file,
            parsed_document=doc,
            requirement_key="rule_001",
            requirement_type=RequirementType.TECH_REQ,
            content="规则抽取",
            extraction_method=ExtractionMethod.RULE,
            mandatory_level=MandatoryLevel.OPTIONAL,
            risk_level=RiskLevel.LOW,
            created_by=user,
        )

        req_llm = TenderRequirement.objects.create(
            tender_file=file,
            parsed_document=doc,
            requirement_key="llm_001",
            requirement_type=RequirementType.TECH_REQ,
            content="LLM抽取",
            extraction_method=ExtractionMethod.LLM,
            mandatory_level=MandatoryLevel.OPTIONAL,
            risk_level=RiskLevel.LOW,
            created_by=user,
        )

        req_manual = TenderRequirement.objects.create(
            tender_file=file,
            parsed_document=doc,
            requirement_key="manual_001",
            requirement_type=RequirementType.TECH_REQ,
            content="人工添加",
            extraction_method=ExtractionMethod.MANUAL,
            mandatory_level=MandatoryLevel.OPTIONAL,
            risk_level=RiskLevel.LOW,
            created_by=user,
        )

        # 执行清理
        service = RequirementExtractService()
        deleted = service._clear_existing_requirements(file, doc)

        # 验证结果
        assert deleted == 2  # rule + llm
        assert not TenderRequirement.objects.filter(id=req_rule.id).exists()
        assert not TenderRequirement.objects.filter(id=req_llm.id).exists()
        assert TenderRequirement.objects.filter(id=req_manual.id).exists()  # manual 保留
