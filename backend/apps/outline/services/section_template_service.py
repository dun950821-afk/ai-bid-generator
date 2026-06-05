# backend/apps/outline/services/section_template_service.py
"""章节撰写模板选择服务。"""

import logging
from typing import Any

from apps.outline.models import Section, SectionWritingTemplate

logger = logging.getLogger(__name__)


class SectionTemplateService:
    """章节撰写模板选择服务。

    根据章节信息自动匹配最合适的撰写模板。

    选择优先级：
    1. 用户手动指定模板（矩阵中的 template_id）
    2. section_role 匹配
    3. 章节标题关键词匹配
    4. expression_form 匹配
    5. 默认模板
    """

    # 默认模板键
    DEFAULT_TEMPLATES = {
        "body_text": "default_body_text",
        "table": "default_table",
        "commitment_letter": "default_commitment_letter",
        "resume_table": "default_resume_table",
        "mixed": "default_mixed",
    }

    def select_template(
        self,
        section: Section,
        analysis_points: dict | None = None,
    ) -> dict[str, Any] | None:
        """为章节选择撰写模板。

        Args:
            section: 章节实例
            analysis_points: AI 解析得分点

        Returns:
            模板信息字典，如果找不到则返回 None
        """
        content_matrix = section.content_matrix or {}

        # 1. 检查是否有手动指定的模板
        manual_template_id = content_matrix.get("template_id")
        if manual_template_id:
            try:
                template = SectionWritingTemplate.objects.get(
                    id=manual_template_id,
                    enabled=True,
                )
                return self._template_to_dict(template)
            except SectionWritingTemplate.DoesNotExist:
                logger.warning(
                    f"Manual template {manual_template_id} not found for section {section.id}"
                )

        # 2. 自动匹配
        return self._auto_select_template(section, content_matrix, analysis_points)

    def _auto_select_template(
        self,
        section: Section,
        content_matrix: dict,
        analysis_points: dict | None,
    ) -> dict[str, Any] | None:
        """自动匹配模板。"""
        title = section.title or ""
        section_role = content_matrix.get("section_role", "")
        expression_form = content_matrix.get("expression_form", "body_text")
        write_scope = content_matrix.get("write_scope", "")

        # 获取所有启用的模板
        candidates = SectionWritingTemplate.objects.filter(enabled=True)

        # 计算每个模板的匹配分数
        scored = []
        for template in candidates:
            score = self._calculate_match_score(
                template=template,
                title=title,
                section_role=section_role,
                expression_form=expression_form,
                write_scope=write_scope,
                analysis_points=analysis_points,
            )
            scored.append((template, score))

        # 按分数排序
        scored.sort(key=lambda x: (x[1], x[0].priority), reverse=True)

        # 返回得分最高的模板（需要达到最低阈值）
        min_score_threshold = 30
        if scored and scored[0][1] >= min_score_threshold:
            return self._template_to_dict(scored[0][0])

        # 3. 返回默认模板
        return self._get_default_template(expression_form)

    def _calculate_match_score(
        self,
        template: SectionWritingTemplate,
        title: str,
        section_role: str,
        expression_form: str,
        write_scope: str,
        analysis_points: dict | None,
    ) -> int:
        """计算模板匹配分数。"""
        score = 0

        # section_role 匹配 (权重最高)
        if section_role and section_role in template.applicable_section_roles:
            score += 40

        # expression_form 匹配
        if expression_form == template.expression_form:
            score += 20

        # 关键词匹配
        applicable_keywords = template.applicable_keywords or []
        for keyword in applicable_keywords:
            if keyword in title:
                score += 15
            if keyword in write_scope:
                score += 10

        # 从分析点关键词匹配
        if analysis_points:
            all_points = (
                analysis_points.get("must_respond", [])
                + analysis_points.get("score_points", [])
            )
            for point in all_points:
                point_title = point.get("title", "")
                for keyword in applicable_keywords:
                    if keyword in point_title:
                        score += 5

        return score

    def _get_default_template(self, expression_form: str) -> dict[str, Any] | None:
        """获取默认模板。"""
        template_key = self.DEFAULT_TEMPLATES.get(expression_form, "default_body_text")

        try:
            template = SectionWritingTemplate.objects.get(
                template_key=template_key,
                enabled=True,
            )
            return self._template_to_dict(template)
        except SectionWritingTemplate.DoesNotExist:
            # 如果默认模板也不存在，返回 None
            return None

    def _template_to_dict(self, template: SectionWritingTemplate) -> dict[str, Any]:
        """将模板转换为字典。"""
        return {
            "id": template.id,
            "name": template.name,
            "template_key": template.template_key,
            "expression_form": template.expression_form,
            "writing_depth": template.writing_depth,
            "template_content": template.template_content,
            "required_slots": template.required_slots,
            "optional_slots": template.optional_slots,
            "table_schemas": template.table_schemas,
            "applicable_section_roles": template.applicable_section_roles,
            "applicable_keywords": template.applicable_keywords,
        }

    def get_all_templates(self) -> list[dict[str, Any]]:
        """获取所有启用的模板列表。"""
        templates = SectionWritingTemplate.objects.filter(enabled=True).order_by(
            "-priority", "name"
        )
        return [self._template_to_dict(t) for t in templates]

    def get_template_by_id(self, template_id: int) -> dict[str, Any] | None:
        """根据 ID 获取模板。"""
        try:
            template = SectionWritingTemplate.objects.get(id=template_id)
            return self._template_to_dict(template)
        except SectionWritingTemplate.DoesNotExist:
            return None