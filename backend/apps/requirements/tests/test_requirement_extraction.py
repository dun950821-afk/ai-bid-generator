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
            extraction_type="tech_req",
            content="测试条款内容",
            source_chunk_id=100,
        )
        assert len(key) == 32
        assert key.isalnum()

    def test_same_input_same_key(self):
        """相同输入生成相同 key（幂等）。"""
        key1 = generate_requirement_key(1, "tech_req", "测试内容")
        key2 = generate_requirement_key(1, "tech_req", "测试内容")
        assert key1 == key2

    def test_different_input_different_key(self):
        """不同输入生成不同 key。"""
        key1 = generate_requirement_key(1, "tech_req", "内容A")
        key2 = generate_requirement_key(1, "tech_req", "内容B")
        assert key1 != key2

    def test_none_chunk_id_handled(self):
        """source_chunk_id=None 时正常处理。"""
        key = generate_requirement_key(1, "tech_req", "测试内容", source_chunk_id=None)
        assert len(key) == 32

    def test_extraction_type_as_source(self):
        """使用 extraction_type 作为源标识。"""
        key = generate_requirement_key(1, "scoring", "测试内容")
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

    def test_build_chunk_context_with_chunks(self):
        """有分块时返回带元数据的字符串。"""
        from apps.tender.models import TenderFile, ParsedDocument, TenderChunk
        from apps.projects.models import Project
        from apps.accounts.models import User

        user = User.objects.create(username="test-user1", password="x")
        project = Project.objects.create(name="测试项目", created_by=user)
        tender_file = TenderFile.objects.create(
            project=project,
            original_name="test.docx",
            object_key="test/key.docx",
            file_size=100,
            created_by=user,
            status=TenderFile.STATUS_PARSED,
        )
        parsed_doc = ParsedDocument.objects.create(
            tender_file=tender_file,
            parser_version="v1",
            is_active=True,
        )
        TenderChunk.objects.create(
            parsed_document=parsed_doc,
            chunk_index=0,
            content_hash="hash-scoring-1",
            chunk_type="scoring",
            content="评分标准：技术分 50 分",
            section_path="第三章 评标办法",
            page_start=24,
            page_end=25,
        )
        TenderChunk.objects.create(
            parsed_document=parsed_doc,
            chunk_index=1,
            content_hash="hash-general-1",
            chunk_type="general",
            content="投标人须知内容",
            section_path="第二章 投标人须知",
            page_start=7,
            page_end=8,
        )

        service = RequirementExtractService()
        result = service._build_chunk_context(tender_file, max_context_length=10000)

        assert "=== 分块 #1 ===" in result
        assert "类型: scoring" in result
        assert "章节路径: 第三章 评标办法" in result
        assert "页码: 24-25" in result
        assert "评分标准：技术分 50 分" in result
        assert "=== 分块 #2 ===" in result
        assert "类型: general" in result

    def test_build_chunk_context_no_chunks(self):
        """无分块时返回空字符串。"""
        from apps.tender.models import TenderFile
        from apps.projects.models import Project
        from apps.accounts.models import User

        user = User.objects.create(username="test-user2", password="x")
        project = Project.objects.create(name="测试项目2", created_by=user)
        tender_file = TenderFile.objects.create(
            project=project,
            original_name="test2.docx",
            object_key="test/key2.docx",
            file_size=100,
            created_by=user,
            status=TenderFile.STATUS_PARSED,
        )

        service = RequirementExtractService()
        result = service._build_chunk_context(tender_file, max_context_length=10000)
        assert result == ""

    def test_build_chunk_context_truncates_at_limit(self):
        """超限时截断并标注剩余数。"""
        from apps.tender.models import TenderFile, ParsedDocument, TenderChunk
        from apps.projects.models import Project
        from apps.accounts.models import User

        user = User.objects.create(username="test-user3", password="x")
        project = Project.objects.create(name="测试项目3", created_by=user)
        tender_file = TenderFile.objects.create(
            project=project,
            original_name="test3.docx",
            object_key="test/key3.docx",
            file_size=100,
            created_by=user,
            status=TenderFile.STATUS_PARSED,
        )
        parsed_doc = ParsedDocument.objects.create(
            tender_file=tender_file,
            parser_version="v1",
            is_active=True,
        )
        for i in range(5):
            TenderChunk.objects.create(
                parsed_document=parsed_doc,
                chunk_index=i,
                content_hash=f"hash-trunc-{i}",
                chunk_type="general",
                content="A" * 200,
                section_path=f"章节{i}",
                page_start=i + 1,
                page_end=i + 1,
            )

        service = RequirementExtractService()
        result = service._build_chunk_context(tender_file, max_context_length=300)
        assert "已截断" in result
        assert "剩余" in result

    def test_get_model_config_with_id(self):
        """_get_model_config 优先用指定 ID。"""
        from apps.generation.models import ModelConfig, ModelProvider

        provider = ModelProvider.objects.create(
            key="test-getter", name="Test", base_url="http://test"
        )
        config = ModelConfig.objects.create(
            provider=provider,
            model_name="test",
            model_type="chat",
            context_length=128000,
        )

        service = RequirementExtractService()
        result = service._get_model_config(config.id)
        assert result is not None
        assert result.id == config.id
        assert result.context_length == 128000

    def test_get_model_config_fallback_to_default(self):
        """_get_model_config 无 ID 时 fallback 到默认 chat 模型。"""
        from apps.generation.models import ModelConfig, ModelProvider

        provider = ModelProvider.objects.create(
            key="test-fallback", name="Test2", base_url="http://test"
        )
        default_config = ModelConfig.objects.create(
            provider=provider,
            model_name="default-model",
            model_type="chat",
            is_default=True,
            is_active=True,
            context_length=64000,
        )

        service = RequirementExtractService()
        result = service._get_model_config(None)
        assert result is not None
        assert result.id == default_config.id

    def test_extract_requirements_overwrite_deletes_old(self, monkeypatch):
        """overwrite=True 时删除该文件所有旧条款。"""
        from apps.requirements.models import TenderRequirement
        from apps.projects.models import Project
        from unittest.mock import patch

        user = User.objects.create_user(username="ow-user", password="test")
        project = Project.objects.create(name="测试项目-overwrite", created_by=user)
        tender_file = TenderFile.objects.create(
            project=project,
            original_name="test-ow.docx",
            object_key="test/key-ow.docx",
            file_size=100,
            created_by=user,
            status=TenderFile.STATUS_PARSED,
        )
        # 预置 3 条旧条款
        for i in range(3):
            TenderRequirement.objects.create(
                tender_file=tender_file,
                requirement_key=f"old-key-{i}",
                content=f"旧条款 {i}",
                extraction_type="scoring",
            )
        assert TenderRequirement.objects.filter(tender_file=tender_file).count() == 3

        service = RequirementExtractService()

        # Mock 掉后续抽取流程，只验证删除逻辑
        with patch.object(service, "_validate_tender_file", return_value=tender_file):
            with patch.object(service, "_validate_extraction_types", return_value=["scoring"]):
                with patch.object(service.document_text_service, "get_document_text", return_value="文档全文"):
                    with patch.object(service, "_extract_single_type", side_effect=Exception("stop after delete")):
                        try:
                            service.extract_requirements(
                                tender_file_id=tender_file.id,
                                extraction_types=["scoring"],
                                created_by=user,
                                overwrite=True,
                            )
                        except Exception:
                            pass

        # 验证旧条款已被删除
        assert TenderRequirement.objects.filter(tender_file=tender_file).count() == 0

    def test_extract_requirements_no_overwrite_keeps_old(self):
        """overwrite=False 时保留旧条款。"""
        from apps.requirements.models import TenderRequirement
        from apps.projects.models import Project
        from unittest.mock import patch

        user = User.objects.create_user(username="no-ow-user", password="test")
        project = Project.objects.create(name="测试项目-no-overwrite", created_by=user)
        tender_file = TenderFile.objects.create(
            project=project,
            original_name="test-no-ow.docx",
            object_key="test/key-no-ow.docx",
            file_size=100,
            created_by=user,
            status=TenderFile.STATUS_PARSED,
        )
        TenderRequirement.objects.create(
            tender_file=tender_file,
            requirement_key="keep-key",
            content="保留的旧条款",
            extraction_type="scoring",
        )

        service = RequirementExtractService()
        with patch.object(service, "_validate_tender_file", return_value=tender_file):
            with patch.object(service, "_validate_extraction_types", return_value=["scoring"]):
                with patch.object(service.document_text_service, "get_document_text", return_value="文档全文"):
                    with patch.object(service, "_extract_single_type", side_effect=Exception("stop")):
                        try:
                            service.extract_requirements(
                                tender_file_id=tender_file.id,
                                extraction_types=["scoring"],
                                created_by=user,
                                overwrite=False,
                            )
                        except Exception:
                            pass

        # 验证旧条款保留
        assert TenderRequirement.objects.filter(tender_file=tender_file).count() == 1

    def test_extract_single_type_variables_include_chunk_context(self):
        """_extract_single_type 的 variables 含 chunk_context 字段。"""
        from apps.projects.models import Project
        from apps.requirements.models import RequirementExtractionRun
        from apps.generation.constants import PromptRunStatus
        from apps.generation.models import PromptRun
        from unittest.mock import patch, MagicMock

        user = User.objects.create_user(username="ctx-user", password="test")
        project = Project.objects.create(name="测试项目-chunkctx", created_by=user)
        tender_file = TenderFile.objects.create(
            project=project,
            original_name="test-ctx.docx",
            object_key="test/key-ctx.docx",
            file_size=100,
            created_by=user,
            status=TenderFile.STATUS_PARSED,
        )

        # Mock PromptRun
        mock_prompt_run = MagicMock(spec=PromptRun)
        mock_prompt_run.status = PromptRunStatus.SUCCEEDED
        mock_prompt_run.output_json = []  # 空数组，不产生条款
        mock_prompt_run.prompt_version = MagicMock()
        mock_prompt_run.prompt_version.version = "1.0"
        mock_prompt_run.prompt_template_id = 1
        mock_prompt_run.prompt_version_id = 1
        mock_prompt_run.model_config = None
        mock_prompt_run.error_message = None

        service = RequirementExtractService()

        captured_variables = {}

        def fake_execute(**kwargs):
            captured_variables.update(kwargs.get("variables", {}))
            return mock_prompt_run

        with patch.object(service.ai_task_service, "execute", side_effect=fake_execute):
            with patch.object(service, "_get_model_config", return_value=None):
                # chunk_context 在无分块时为空字符串
                extraction_run = RequirementExtractionRun.objects.create(
                    tender_file=tender_file,
                    project=project,
                    extraction_types=["scoring"],
                    overwrite=False,
                    created_by=user,
                )
                service._extract_single_type(
                    extraction_type="scoring",
                    document_text="文档全文",
                    tender_file=tender_file,
                    extraction_run=extraction_run,
                    created_by=user,
                    prompt_version_id=None,
                    model_config_id=None,
                )

        assert "chunk_context" in captured_variables
        # 无分块时 chunk_context 应为空字符串
        assert captured_variables["chunk_context"] == ""


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
