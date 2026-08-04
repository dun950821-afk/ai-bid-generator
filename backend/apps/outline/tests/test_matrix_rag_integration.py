# backend/apps/outline/tests/test_matrix_rag_integration.py
"""矩阵生成任务 RAG 集成测试。"""

import pytest
from unittest.mock import patch, MagicMock
from django.contrib.auth import get_user_model

from apps.outline.models import GenerationTask, Outline, OutlineKnowledgeBase
from apps.knowledge.models import KnowledgeBase
from apps.projects.models import Lot, Project

User = get_user_model()


@pytest.mark.django_db
class TestMatrixRagIntegration:
    """矩阵生成任务接入 metadata_snapshot 测试。"""

    def setup_method(self):
        self.user = User.objects.create_user(username="u", password="p")
        project = Project.objects.create(name="P", created_by=self.user)
        lot = Lot.objects.create(name="L", project=project)
        self.outline = Outline.objects.create(
            project=project, lot=lot, name="O", source="preset", created_by=self.user
        )
        kb = KnowledgeBase.objects.create(
            name="公司介绍库", kb_type="company_profile", created_by=self.user
        )
        OutlineKnowledgeBase.objects.create(outline=self.outline, knowledge_base=kb)
        # 创建一个待生成矩阵的章节，避免 task 在 "no targets" 分支提前返回
        from apps.outline.models import Section
        from apps.outline.constants import ContentMatrixStatus
        Section.objects.create(
            outline=self.outline, title="公司能力", level=1, sort_order=1,
            content_matrix_status=ContentMatrixStatus.PENDING,
        )

    def test_matrix_task_passes_company_context_to_ai(self):
        from apps.outline.tasks import generate_content_matrix_task
        from apps.outline.constants import GenerationTaskType, GenerationTaskStatus

        task = GenerationTask.objects.create(
            task_type=GenerationTaskType.MATRIX_GENERATION,
            outline=self.outline, status=GenerationTaskStatus.PENDING,
            total_count=1, created_by=self.user, params={},
        )

        captured_vars = {}

        def fake_execute(self, scenario, variables, created_by, business_context=None):
            captured_vars.update(variables)
            mock_run = MagicMock()
            mock_run.status = "succeeded"
            mock_run.output_text = '{"sections": []}'
            mock_run.output_json = {"sections": []}
            mock_run.error_message = ""
            return mock_run

        with patch("apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute",
                   fake_execute), \
             patch("apps.outline.services.matrix_service.MatrixService.acquire_matrix_generation_lock",
                   return_value=True), \
             patch("apps.outline.services.matrix_service.MatrixService.release_matrix_generation_lock"):
            generate_content_matrix_task(self.outline.id, task.id)

        assert "company_context_block" in captured_vars
        assert "公司介绍库" in captured_vars["company_context_block"]
        assert "available_knowledge_bases" in captured_vars
