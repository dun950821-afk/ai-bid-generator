# backend/apps/generation/tests/test_ai_task_execution_service.py
"""AiTaskExecutionService 测试用例。"""

from datetime import timedelta

import pytest
from unittest.mock import Mock, patch, MagicMock

from apps.generation.services.ai_task_execution_service import (
    AiTaskExecutionService,
    PromptVersionNotFoundError,
    ModelConfigNotFoundError,
    RagConfigError,
)
from apps.generation.constants import (
    PromptVersionStatus,
    PromptScope,
    ModelType,
    PromptRunStatus,
    PromptScenario,
)
from apps.generation.models import PromptTemplate, PromptVersion, ModelConfig, PromptRun, ModelProvider
from apps.accounts.models import User


@pytest.fixture
def mock_user():
    """Mock 用户。"""
    return Mock(spec=User, id=1, username="test_user")


@pytest.fixture
def mock_provider():
    """Mock Provider。"""
    provider = Mock(spec=ModelProvider, id=1, provider_type="deepseek")
    return provider


@pytest.fixture
def mock_model_config(mock_provider):
    """Mock ModelConfig。"""
    config = Mock(spec=ModelConfig)
    config.id = 1
    config.provider = mock_provider
    config.model_name = "deepseek-v4-flash"
    config.model_type = ModelType.CHAT
    config.is_default = True
    config.is_active = True
    config.temperature = 0.7
    config.max_tokens = 4096
    return config


@pytest.fixture
def mock_prompt_template():
    """Mock PromptTemplate。"""
    template = Mock(spec=PromptTemplate)
    template.id = 1
    template.key = "test_template"
    template.scenario = PromptScenario.REQUIREMENT_ANALYSIS
    template.scope = PromptScope.SYSTEM
    template.is_active = True
    return template


@pytest.fixture
def mock_prompt_version(mock_prompt_template):
    """Mock PromptVersion。"""
    version = Mock(spec=PromptVersion)
    version.id = 1
    version.template = mock_prompt_template
    version.version = "v1.0"
    version.status = PromptVersionStatus.PUBLISHED
    version.system_prompt = "System prompt for {{scenario}}"
    version.user_prompt = "User prompt with {{query}}"
    version.output_schema = {}
    return version


@pytest.fixture
def mock_rendered_prompt():
    """Mock 渲染后的提示词。"""
    rendered = Mock()
    rendered.system_prompt = "System prompt for requirement_analysis"
    rendered.user_prompt = "User prompt with test query"
    return rendered


@pytest.fixture
def mock_llm_response():
    """Mock LLM 响应。"""
    response = Mock()
    response.text = '{"result": "success"}'
    response.json = {"result": "success"}
    response.prompt_tokens = 100
    response.completion_tokens = 50
    response.total_tokens = 150
    return response


@pytest.fixture
def mock_retrieval_result():
    """Mock 检索结果。"""
    return {
        "query": "test query",
        "results": [
            {
                "chunk_id": 1,
                "document_title": "Test Doc",
                "knowledge_base_name": "KB1",
                "section_path": "Section 1",
                "content": "Test content",
                "page_start": 1,
                "page_end": 2,
            }
        ],
        "latency_ms": 50,
        "log_id": 100,
    }


@pytest.fixture
def mock_rag_context():
    """Mock RAG 上下文。"""
    return {
        "text": "Retrieved knowledge content",
        "sources": [{"chunk_id": 1, "document_title": "Test Doc"}],
        "token_count": 100,
        "chunk_count": 1,
    }


@pytest.mark.django_db
class TestGetPromptVersion:
    """测试 _get_prompt_version 方法。"""

    @pytest.mark.django_db
    def test_with_specified_prompt_version_id(self, mock_prompt_version):
        """指定 prompt_version_id 时使用该版本。"""
        service = AiTaskExecutionService()

        with patch.object(
            PromptVersion.objects,
            "select_related",
            return_value=Mock(get=Mock(return_value=mock_prompt_version))
        ):
            result = service._get_prompt_version("any_scenario", prompt_version_id=1)

        assert result.id == 1

    @pytest.mark.django_db
    def test_prompt_version_id_not_found(self):
        """指定的 prompt_version_id 不存在时报错。"""
        service = AiTaskExecutionService()

        with patch.object(
            PromptVersion.objects,
            "select_related",
            return_value=Mock(get=Mock(side_effect=PromptVersion.DoesNotExist))
        ):
            with pytest.raises(PromptVersionNotFoundError) as exc:
                service._get_prompt_version("any_scenario", prompt_version_id=999)

        assert "PromptVersion#999" in str(exc.value)

    @pytest.mark.django_db
    def test_single_published_version_selected(self):
        """未指定版本时选中该场景唯一 published 版本。"""
        template = PromptTemplate.objects.create(
            key="req_analysis.default",
            name="T",
            scenario=PromptScenario.REQUIREMENT_ANALYSIS,
            scope=PromptScope.SYSTEM,
            is_active=True,
        )
        version = PromptVersion.objects.create(
            template=template, version="1.0", user_prompt="p",
            status=PromptVersionStatus.PUBLISHED,
        )

        service = AiTaskExecutionService()
        result = service._get_prompt_version(
            PromptScenario.REQUIREMENT_ANALYSIS, prompt_version_id=None
        )
        assert result.pk == version.pk

    @pytest.mark.django_db
    def test_latest_published_version_wins_over_key_priority(self):
        """同场景多模板共存时取最新发布者，而不是 .antiai 后缀优先。"""
        template_default = PromptTemplate.objects.create(
            key="content_matrix_generation_v2.default",
            name="default 变体",
            scenario=PromptScenario.CONTENT_MATRIX_GENERATION_V2,
            scope=PromptScope.SYSTEM,
            is_active=True,
        )
        template_antiai = PromptTemplate.objects.create(
            key="content_matrix_generation_v2.antiai",
            name="antiai 变体",
            scenario=PromptScenario.CONTENT_MATRIX_GENERATION_V2,
            scope=PromptScope.SYSTEM,
            is_active=True,
        )
        v_default = PromptVersion.objects.create(
            template=template_default, version="1.0", user_prompt="default",
            status=PromptVersionStatus.PUBLISHED,
        )
        v_antiai = PromptVersion.objects.create(
            template=template_antiai, version="1.0", user_prompt="antiai",
            status=PromptVersionStatus.PUBLISHED,
        )
        # antiai 更早发布：人为把它的 updated_at 拨早，验证排序键是时间而非创建顺序
        PromptVersion.objects.filter(pk=v_antiai.pk).update(
            updated_at=v_default.updated_at - timedelta(days=3)
        )

        service = AiTaskExecutionService()
        result = service._get_prompt_version(
            PromptScenario.CONTENT_MATRIX_GENERATION_V2, prompt_version_id=None
        )
        assert result.pk == v_default.pk

    @pytest.mark.django_db
    def test_inactive_template_published_version_excluded(self):
        """模板停用（is_active=False）的 published 版本不参与选版。"""
        active_tpl = PromptTemplate.objects.create(
            key="m.default", name="A", scenario="scene_x",
            scope=PromptScope.SYSTEM, is_active=True,
        )
        inactive_tpl = PromptTemplate.objects.create(
            key="m.antiai", name="B", scenario="scene_x",
            scope=PromptScope.SYSTEM, is_active=False,
        )
        v_active = PromptVersion.objects.create(
            template=active_tpl, version="1.0", user_prompt="active",
            status=PromptVersionStatus.PUBLISHED,
        )
        v_inactive = PromptVersion.objects.create(
            template=inactive_tpl, version="1.0", user_prompt="inactive",
            status=PromptVersionStatus.PUBLISHED,
        )
        PromptVersion.objects.filter(pk=v_inactive.pk).update(
            updated_at=v_active.updated_at + timedelta(days=1)
        )

        service = AiTaskExecutionService()
        result = service._get_prompt_version("scene_x", prompt_version_id=None)
        assert result.pk == v_active.pk

    @pytest.mark.django_db
    def test_archived_version_excluded(self):
        """archived 版本不参与选版；仅剩 archived 时报错。"""
        template = PromptTemplate.objects.create(
            key="m.default", name="T", scenario="scene_y",
            scope=PromptScope.SYSTEM, is_active=True,
        )
        archived = PromptVersion.objects.create(
            template=template, version="1.0", user_prompt="old",
            status=PromptVersionStatus.ARCHIVED,
        )

        service = AiTaskExecutionService()
        with pytest.raises(PromptVersionNotFoundError) as exc:
            service._get_prompt_version("scene_y", prompt_version_id=None)
        assert "未找到已发布的 PromptVersion" in str(exc.value)

        # 补一个 published 后选中它
        published = PromptVersion.objects.create(
            template=template, version="1.1", user_prompt="new",
            status=PromptVersionStatus.PUBLISHED,
        )
        result = service._get_prompt_version("scene_y", prompt_version_id=None)
        assert result.pk == published.pk


class TestGetModelConfig:
    """测试 _get_model_config 方法。"""

    @pytest.mark.django_db
    def test_with_specified_model_config_id(self, mock_model_config):
        """指定 model_config_id 时使用该模型。"""
        service = AiTaskExecutionService()

        with patch.object(
            ModelConfig.objects,
            "get",
            return_value=mock_model_config
        ):
            result = service._get_model_config(model_config_id=1)

        assert result.id == 1
        assert result.model_type == ModelType.CHAT

    @pytest.mark.django_db
    def test_model_config_id_not_found(self):
        """指定的 model_config_id 不存在或不是 chat 模型时报错。"""
        service = AiTaskExecutionService()

        with patch.object(
            ModelConfig.objects,
            "get",
            side_effect=ModelConfig.DoesNotExist
        ):
            with pytest.raises(ModelConfigNotFoundError) as exc:
                service._get_model_config(model_config_id=999)

        assert "ModelConfig#999" in str(exc.value)

    @pytest.mark.django_db
    def test_use_default_chat_model(self, mock_model_config):
        """未指定 model_config_id 时使用默认 chat 模型。"""
        service = AiTaskExecutionService()

        with patch.object(
            ModelConfig.objects,
            "get",
            return_value=mock_model_config
        ):
            result = service._get_model_config(model_config_id=None)

        assert result.is_default is True
        assert result.model_type == ModelType.CHAT

    @pytest.mark.django_db
    def test_default_model_not_found(self):
        """未找到默认 chat 模型时报错。"""
        service = AiTaskExecutionService()

        with patch.object(
            ModelConfig.objects,
            "get",
            side_effect=ModelConfig.DoesNotExist
        ):
            with pytest.raises(ModelConfigNotFoundError) as exc:
                service._get_model_config(model_config_id=None)

        assert "未找到默认的 Chat 模型" in str(exc.value)


class TestExecuteRag:
    """测试 _execute_rag 方法。"""

    def test_rag_missing_knowledge_base_ids(self, mock_user):
        """RAG 启用时缺少 knowledge_base_ids 报错。"""
        service = AiTaskExecutionService()

        with pytest.raises(RagConfigError) as exc:
            service._execute_rag({"enabled": True}, {}, mock_user)

        assert "knowledge_base_ids" in str(exc.value)

    def test_rag_missing_query(self, mock_user):
        """RAG 启用时缺少 query 报错。"""
        service = AiTaskExecutionService()

        with pytest.raises(RagConfigError) as exc:
            service._execute_rag(
                {"enabled": True, "knowledge_base_ids": [1]},
                {},
                mock_user
            )

        assert "query" in str(exc.value)

    def test_rag_with_query_in_options(self, mock_user, mock_retrieval_result, mock_rag_context):
        """RAG 使用 options 中的 query。"""
        service = AiTaskExecutionService()

        with patch.object(service.retrieval_service, "search", return_value=mock_retrieval_result):
            with patch.object(service.rag_context_builder, "build", return_value=mock_rag_context):
                result = service._execute_rag(
                    {"enabled": True, "knowledge_base_ids": [1], "query": "test query"},
                    {},
                    mock_user
                )

        assert result["log_id"] == 100
        assert result["retrieved_knowledge"] == "Retrieved knowledge content"

    def test_rag_with_query_in_variables(self, mock_user, mock_retrieval_result, mock_rag_context):
        """RAG 使用 variables 中的 query。"""
        service = AiTaskExecutionService()

        with patch.object(service.retrieval_service, "search", return_value=mock_retrieval_result):
            with patch.object(service.rag_context_builder, "build", return_value=mock_rag_context):
                result = service._execute_rag(
                    {"enabled": True, "knowledge_base_ids": [1]},
                    {"query": "test query"},
                    mock_user
                )

        assert result["log_id"] == 100

    def test_rag_with_question_in_variables(self, mock_user, mock_retrieval_result, mock_rag_context):
        """RAG 使用 variables 中的 question。"""
        service = AiTaskExecutionService()

        with patch.object(service.retrieval_service, "search", return_value=mock_retrieval_result):
            with patch.object(service.rag_context_builder, "build", return_value=mock_rag_context):
                result = service._execute_rag(
                    {"enabled": True, "knowledge_base_ids": [1]},
                    {"question": "test question"},
                    mock_user
                )

        assert result["log_id"] == 100


class TestExecute:
    """测试 execute 方法。"""

    @pytest.mark.django_db
    def test_execute_success_with_specified_ids(
        self,
        mock_user,
        mock_prompt_version,
        mock_model_config,
        mock_rendered_prompt,
        mock_llm_response,
    ):
        """指定 prompt_version_id 和 model_config_id 执行成功。"""
        service = AiTaskExecutionService()

        # Mock 所有依赖
        with patch.object(service, "_get_prompt_version", return_value=mock_prompt_version):
            with patch.object(service, "_get_model_config", return_value=mock_model_config):
                with patch.object(service.render_service, "render", return_value=mock_rendered_prompt):
                    with patch.object(service.llm_service, "chat", return_value=mock_llm_response):
                        with patch.object(PromptRun.objects, "create") as mock_create:
                            mock_run = Mock(spec=PromptRun)
                            mock_run.id = 1
                            mock_run.status = PromptRunStatus.RUNNING
                            mock_run.metadata = {}
                            mock_run.save = Mock()
                            mock_create.return_value = mock_run

                            result = service.execute(
                                scenario=PromptScenario.REQUIREMENT_ANALYSIS,
                                variables={"query": "test"},
                                created_by=mock_user,
                                prompt_version_id=1,
                                model_config_id=1,
                            )

        assert result.status == PromptRunStatus.SUCCEEDED

    @pytest.mark.django_db
    def test_execute_business_context_unknown_key_does_not_crash(
        self, django_user_model, prompt_version, model_config, mock_llm_response
    ):
        """回归：business_context 含非模型字段键（如 lot_id）不炸 execute。

        去重仲裁传 {"lot_id": ..., "project_id": ...}，PromptRun 无 lot 字段，
        **(business_context or {}) 展开曾直接 TypeError 导致去重失败。
        """
        from apps.projects.models import Project

        user = django_user_model.objects.create_user(username="dedup-audit-user", password="x")
        project = Project.objects.create(name="去重审计项目", created_by=user)
        service = AiTaskExecutionService()
        rendered = Mock(system_prompt="sys", user_prompt="user")

        with patch.object(service, "_get_prompt_version", return_value=prompt_version):
            with patch.object(service, "_get_model_config", return_value=model_config):
                with patch.object(service.render_service, "render", return_value=rendered):
                    with patch.object(service.llm_service, "chat", return_value=mock_llm_response):
                        run = service.execute(
                            scenario=PromptScenario.REQUIREMENT_ANALYSIS,
                            variables={"content": "x"},
                            created_by=user,
                            business_context={"lot_id": 123, "project_id": project.id},
                        )

        run.refresh_from_db()
        assert run.project_id == project.id
        assert run.metadata["business_context"]["lot_id"] == 123
        assert run.status == PromptRunStatus.SUCCEEDED

    @pytest.mark.django_db
    def test_execute_without_prompt_version_id(
        self,
        mock_user,
        mock_prompt_version,
        mock_model_config,
        mock_rendered_prompt,
        mock_llm_response,
    ):
        """未指定 prompt_version_id 时使用 published 版本。"""
        service = AiTaskExecutionService()

        # Mock _get_prompt_version 验证它被调用时 prompt_version_id=None
        with patch.object(service, "_get_prompt_version", return_value=mock_prompt_version) as mock_get_pv:
            with patch.object(service, "_get_model_config", return_value=mock_model_config):
                with patch.object(service.render_service, "render", return_value=mock_rendered_prompt):
                    with patch.object(service.llm_service, "chat", return_value=mock_llm_response):
                        with patch.object(PromptRun.objects, "create") as mock_create:
                            mock_run = Mock(spec=PromptRun)
                            mock_run.id = 1
                            mock_run.status = PromptRunStatus.RUNNING
                            mock_run.metadata = {}
                            mock_run.save = Mock()
                            mock_create.return_value = mock_run

                            service.execute(
                                scenario=PromptScenario.REQUIREMENT_ANALYSIS,
                                variables={"query": "test"},
                                created_by=mock_user,
                            )

        # 验证 _get_prompt_version 被调用时 prompt_version_id=None
        mock_get_pv.assert_called_once_with(PromptScenario.REQUIREMENT_ANALYSIS, None)

    @pytest.mark.django_db
    def test_execute_with_rag_enabled(
        self,
        mock_user,
        mock_prompt_version,
        mock_model_config,
        mock_rendered_prompt,
        mock_llm_response,
        mock_retrieval_result,
        mock_rag_context,
    ):
        """RAG enabled 时注入 retrieved_knowledge。"""
        service = AiTaskExecutionService()

        rag_options = {
            "enabled": True,
            "knowledge_base_ids": [1, 2],
            "query": "test query",
        }

        with patch.object(service, "_get_prompt_version", return_value=mock_prompt_version):
            with patch.object(service, "_get_model_config", return_value=mock_model_config):
                with patch.object(service.retrieval_service, "search", return_value=mock_retrieval_result):
                    with patch.object(service.rag_context_builder, "build", return_value=mock_rag_context):
                        # 验证 render 接收到的变量中包含 retrieved_knowledge
                        captured_variables = {}
                        def capture_render(pv, vars):
                            captured_variables.update(vars)
                            return mock_rendered_prompt

                        with patch.object(service.render_service, "render", side_effect=capture_render):
                            with patch.object(service.llm_service, "chat", return_value=mock_llm_response):
                                with patch.object(PromptRun.objects, "create") as mock_create:
                                    mock_run = Mock(spec=PromptRun)
                                    mock_run.id = 1
                                    mock_run.status = PromptRunStatus.RUNNING
                                    mock_run.metadata = {}
                                    mock_run.save = Mock()
                                    mock_create.return_value = mock_run

                                    service.execute(
                                        scenario=PromptScenario.REQUIREMENT_ANALYSIS,
                                        variables={"query": "original"},
                                        created_by=mock_user,
                                        rag_options=rag_options,
                                    )

        # 验证 retrieved_knowledge 和 retrieval_sources 被注入
        assert "retrieved_knowledge" in captured_variables
        assert "retrieval_sources" in captured_variables

    @pytest.mark.django_db
    def test_execute_records_metadata(
        self,
        mock_user,
        mock_prompt_version,
        mock_model_config,
        mock_rendered_prompt,
        mock_llm_response,
    ):
        """PromptRun metadata 记录完整。"""
        service = AiTaskExecutionService()

        captured_metadata = {}
        with patch.object(service, "_get_prompt_version", return_value=mock_prompt_version):
            with patch.object(service, "_get_model_config", return_value=mock_model_config):
                with patch.object(service.render_service, "render", return_value=mock_rendered_prompt):
                    with patch.object(service.llm_service, "chat", return_value=mock_llm_response):
                        def capture_create(**kwargs):
                            captured_metadata.update(kwargs.get("metadata", {}))
                            mock_run = Mock(spec=PromptRun)
                            mock_run.id = 1
                            mock_run.status = PromptRunStatus.RUNNING
                            mock_run.metadata = kwargs.get("metadata", {})
                            mock_run.save = Mock()
                            return mock_run

                        with patch.object(PromptRun.objects, "create", side_effect=capture_create):
                            service.execute(
                                scenario=PromptScenario.REQUIREMENT_ANALYSIS,
                                variables={"query": "test"},
                                created_by=mock_user,
                                source="business_task",
                                business_context={"project_id": 123},
                            )

        # 验证 metadata 包含所有必要字段
        assert captured_metadata["source"] == "business_task"
        assert captured_metadata["scenario"] == PromptScenario.REQUIREMENT_ANALYSIS
        assert captured_metadata["business_context"] == {"project_id": 123}
        assert captured_metadata["rag_enabled"] is False
        assert captured_metadata["model_config_id"] == mock_model_config.id
        assert captured_metadata["prompt_version_id"] == mock_prompt_version.id

    @pytest.mark.django_db
    def test_execute_llm_failure_records_failed_status(
        self,
        mock_user,
        mock_prompt_version,
        mock_model_config,
        mock_rendered_prompt,
    ):
        """LLM 调用失败时 PromptRun 记录 failed 状态并抛出 AiTaskExecutionError。"""
        from apps.generation.services.ai_task_execution_service import (
            AiTaskExecutionError,
        )

        service = AiTaskExecutionService()

        with patch.object(service, "_get_prompt_version", return_value=mock_prompt_version):
            with patch.object(service, "_get_model_config", return_value=mock_model_config):
                with patch.object(service.render_service, "render", return_value=mock_rendered_prompt):
                    with patch.object(service.llm_service, "chat", side_effect=Exception("API Error")):
                        with patch.object(PromptRun.objects, "create") as mock_create:
                            mock_run = Mock(spec=PromptRun)
                            mock_run.id = 1
                            mock_run.status = PromptRunStatus.RUNNING
                            mock_run.error_message = ""
                            mock_run.latency_ms = 0
                            mock_run.save = Mock()
                            mock_create.return_value = mock_run

                            with pytest.raises(AiTaskExecutionError) as exc_info:
                                service.execute(
                                    scenario=PromptScenario.REQUIREMENT_ANALYSIS,
                                    variables={"query": "test"},
                                    created_by=mock_user,
                                )

        # PromptRun 应被保存为 FAILED, 且错误信息记录
        mock_run.save.assert_called()
        assert mock_run.status == PromptRunStatus.FAILED
        assert "API Error" in mock_run.error_message
        # 异常应包含原始错误信息
        assert "API Error" in str(exc_info.value)


class TestIntegration:
    """集成测试（需要真实数据库）。"""

    @pytest.mark.django_db
    def test_real_execute_without_published_version_raises_error(self, mock_user):
        """未找到 published 版本时抛出错误。"""
        service = AiTaskExecutionService()

        with pytest.raises(PromptVersionNotFoundError):
            service.execute(
                scenario="nonexistent_scenario",
                variables={"query": "test"},
                created_by=mock_user,
            )

    @pytest.mark.django_db
    def test_real_execute_without_default_model_raises_error(self, mock_user, mock_prompt_version):
        """未找到默认模型时抛出错误。"""
        service = AiTaskExecutionService()

        # 确保没有默认 chat 模型
        ModelConfig.objects.filter(
            model_type=ModelType.CHAT,
            is_default=True,
        ).update(is_default=False)

        # Mock prompt version so we can reach model config check
        with patch.object(service, "_get_prompt_version", return_value=mock_prompt_version):
            with pytest.raises(ModelConfigNotFoundError):
                service.execute(
                    scenario="test_scenario",
                    variables={"query": "test"},
                    created_by=mock_user,
                )

class TestSchemaValidation:
    """测试 Schema 校验。"""

    def test_validate_output_valid(self):
        """Schema 校验通过。"""
        service = AiTaskExecutionService()

        schema = {
            "type": "object",
            "properties": {
                "result": {"type": "string"},
            },
            "required": ["result"],
        }
        output = {"result": "success"}

        is_valid, errors = service._validate_output(output, schema)
        assert is_valid is True
        assert errors == []

    def test_validate_output_invalid(self):
        """Schema 校验失败。"""
        service = AiTaskExecutionService()

        schema = {
            "type": "object",
            "properties": {
                "result": {"type": "string"},
            },
            "required": ["result"],
        }
        output = {"result": 123}  # 类型错误

        is_valid, errors = service._validate_output(output, schema)
        assert is_valid is False
        assert len(errors) > 0

    def test_validate_output_missing_required(self):
        """缺少必填字段。"""
        service = AiTaskExecutionService()

        schema = {
            "type": "object",
            "properties": {
                "result": {"type": "string"},
            },
            "required": ["result"],
        }
        output = {}  # 缺少 result

        is_valid, errors = service._validate_output(output, schema)
        assert is_valid is False
        assert len(errors) > 0

    @pytest.mark.django_db
    def test_execute_with_schema_validation_records_result(
        self,
        mock_user,
        mock_prompt_template,
        mock_model_config,
        mock_rendered_prompt,
    ):
        """执行时进行 Schema 校验并记录结果。"""
        service = AiTaskExecutionService()

        # Mock prompt version with schema
        mock_prompt_version = Mock(spec=PromptVersion)
        mock_prompt_version.id = 1
        mock_prompt_version.template = mock_prompt_template
        mock_prompt_version.version = "v1.0"
        mock_prompt_version.status = PromptVersionStatus.PUBLISHED
        mock_prompt_version.system_prompt = "System prompt"
        mock_prompt_version.user_prompt = "User prompt"
        mock_prompt_version.output_schema = {
            "type": "object",
            "properties": {"result": {"type": "string"}},
            "required": ["result"],
        }

        # Mock LLM response that passes schema
        mock_response = Mock()
        mock_response.text = '{"result": "success"}'
        mock_response.json = {"result": "success"}
        mock_response.prompt_tokens = 100
        mock_response.completion_tokens = 50
        mock_response.total_tokens = 150

        with patch.object(service, "_get_prompt_version", return_value=mock_prompt_version):
            with patch.object(service, "_get_model_config", return_value=mock_model_config):
                with patch.object(service.render_service, "render", return_value=mock_rendered_prompt):
                    with patch.object(service.llm_service, "chat", return_value=mock_response):
                        with patch.object(PromptRun.objects, "create") as mock_create:
                            mock_run = Mock(spec=PromptRun)
                            mock_run.id = 1
                            mock_run.status = PromptRunStatus.RUNNING
                            mock_run.metadata = {}
                            mock_run.save = Mock()
                            mock_create.return_value = mock_run

                            result = service.execute(
                                scenario=PromptScenario.REQUIREMENT_ANALYSIS,
                                variables={"query": "test"},
                                created_by=mock_user,
                            )

        # 验证 status 是 SUCCEEDED
        assert result.status == PromptRunStatus.SUCCEEDED
        # 验证 schema_valid=True
        assert result.metadata.get("schema_valid") is True
        assert result.metadata.get("schema_errors") == []

    @pytest.mark.django_db
    def test_execute_with_schema_failure_records_errors(
        self,
        mock_user,
        mock_prompt_template,
        mock_model_config,
        mock_rendered_prompt,
    ):
        """Schema 校验失败时记录错误。"""
        service = AiTaskExecutionService()

        # Mock prompt version with schema
        mock_prompt_version = Mock(spec=PromptVersion)
        mock_prompt_version.id = 1
        mock_prompt_version.template = mock_prompt_template
        mock_prompt_version.version = "v1.0"
        mock_prompt_version.status = PromptVersionStatus.PUBLISHED
        mock_prompt_version.system_prompt = "System prompt"
        mock_prompt_version.user_prompt = "User prompt"
        mock_prompt_version.output_schema = {
            "type": "object",
            "properties": {"result": {"type": "string"}},
            "required": ["result"],
        }

        # Mock LLM response that fails schema (missing required field)
        mock_response = Mock()
        mock_response.text = '{"other": "value"}'
        mock_response.json = {"other": "value"}
        mock_response.prompt_tokens = 100
        mock_response.completion_tokens = 50
        mock_response.total_tokens = 150

        with patch.object(service, "_get_prompt_version", return_value=mock_prompt_version):
            with patch.object(service, "_get_model_config", return_value=mock_model_config):
                with patch.object(service.render_service, "render", return_value=mock_rendered_prompt):
                    with patch.object(service.llm_service, "chat", return_value=mock_response):
                        with patch.object(PromptRun.objects, "create") as mock_create:
                            mock_run = Mock(spec=PromptRun)
                            mock_run.id = 1
                            mock_run.status = PromptRunStatus.RUNNING
                            mock_run.metadata = {}
                            mock_run.save = Mock()
                            mock_create.return_value = mock_run

                            result = service.execute(
                                scenario=PromptScenario.REQUIREMENT_ANALYSIS,
                                variables={"query": "test"},
                                created_by=mock_user,
                            )

        # 验证 status 仍然是 SUCCEEDED（schema 校验失败不改变状态）
        assert result.status == PromptRunStatus.SUCCEEDED
        # 验证 metadata 中记录了 schema_valid=False
        assert result.metadata.get("schema_valid") is False
        assert len(result.metadata.get("schema_errors", [])) > 0
