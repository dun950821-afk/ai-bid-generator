# backend/apps/outline/tests/test_outline_children_retry.py
"""大纲逐大类生成的重试与跳过逻辑测试。

规则：每个大类失败/空响应最多重试 2 次（共 3 次尝试）；
仍失败则跳过该大类并记录 warning，不再让单个大类毁掉整个大纲生成。
"""

from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model

from apps.outline.models import Outline
from apps.outline.services.outline_review_service import OutlineReviewService
from apps.projects.models import Lot, Project

User = get_user_model()

GROUPS = [
    {"title": "安全技术能力", "description": "安全技术能力描述"},
    {"title": "服务方案", "description": "服务方案描述"},
]

# 三级结构的子目录（满足 MIN_OUTLINE_DEPTH=3 校验）
CHILDREN_L3 = [
    {"id": "1.1", "title": "二级", "children": [{"id": "1.1.1", "title": "三级"}]}
]


def _run(status="succeeded", children=None):
    return SimpleNamespace(
        status=status,
        output_json={"children": children or []},
        error_message="LLM 调用失败" if status != "succeeded" else "",
    )


@pytest.mark.django_db
class TestOutlineChildrenRetry:
    def setup_method(self):
        self.user = User.objects.create_user(username="u", password="p")
        project = Project.objects.create(name="P", created_by=self.user)
        lot = Lot.objects.create(name="L", project=project)
        self.outline = Outline.objects.create(
            project=project, lot=lot, name="O", source="preset", created_by=self.user
        )

    def _generate(self, side_effects):
        service = OutlineReviewService()
        with patch.object(service, "_load_project_overview", return_value=""), \
             patch.object(service, "_load_requirements_text", return_value=""), \
             patch(
                 "apps.generation.services.ai_task_execution_service.AiTaskExecutionService.execute",
                 side_effect=side_effects,
             ) as mock_exec:
            tree = service._generate_aligned_outline(None, self.outline, GROUPS, self.user)
        return tree, mock_exec

    def test_retry_recovers_from_empty_response(self):
        """第一次空响应、第二次成功：大类正常生成，共调用 2 次。"""
        tree, mock_exec = self._generate([
            _run(children=[]),                 # 大类1 第1次：空
            _run(children=CHILDREN_L3),        # 大类1 第2次：成功
            _run(children=CHILDREN_L3),        # 大类2 第1次：成功
        ])
        assert mock_exec.call_count == 3
        assert [item["title"] for item in tree] == ["安全技术能力", "服务方案"]

    def test_skip_after_retries_exhausted(self):
        """连续失败/空响应 3 次：跳过该大类，其余大类照常生成。"""
        tree, mock_exec = self._generate([
            _run(children=[]),                 # 大类1 第1次：空
            _run(status="failed"),             # 大类1 第2次：失败
            _run(children=[]),                 # 大类1 第3次：空 → 跳过
            _run(children=CHILDREN_L3),        # 大类2 成功
        ])
        assert mock_exec.call_count == 4
        assert [item["title"] for item in tree] == ["服务方案"]

    def test_all_groups_failed_raises_depth_error(self):
        """所有大类都被跳过：仍走既有的三级结构校验，抛错而不是产出空大纲。"""
        with pytest.raises(ValueError, match="三级结构"):
            self._generate([_run(children=[])] * 6)
