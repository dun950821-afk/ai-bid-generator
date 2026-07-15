# backend/apps/outline/services/content_revision_service.py
"""正文自动修订服务。

当质量校验失败时，尝试自动修订一次。
"""

import logging
from typing import Any

from apps.outline.models import Section

logger = logging.getLogger(__name__)


# 自动修订提示词模板
REVISION_PROMPT_TEMPLATE = """
## 自动修订要求

请对以下正文进行修订，解决标记的问题：

### 当前正文
{content}

### 需要修复的问题
{issues}

### 正文结构策略
当前章节的正文结构策略为 **{content_structure_policy}**，请遵守以下规则：

{policy_rules}

### 通用修订规则

1. **删除章节编号和标题**：不要在正文开头输出"一、"、"1.1"、"# 标题"等
2. **删除内部 ID 引用**：不要出现"章节45"、"ID:123"、"section_id:123"等
3. **删除 AI 解释性文字**：不要出现"以下是生成内容"、"根据要求生成"等
4. **修复表格格式**：确保表格紧凑、无多余空行、单元格无多余空格
5. **压缩空行**：连续多个空行压缩为单个
6. **不编造事实**：缺少信息时标注"待补充"
7. **只输出正文内容**：不要输出章节标题、Markdown 标题

### 输出格式

请输出 JSON 格式：
{{
    "content": "修订后的正文内容",
    "revision_notes": "修订说明"
}}
"""

# 策略相关规则
POLICY_RULES = {
    "category_summary": """
- 这是**父章节概述**，需要概括子章节内容
- **禁止输出子章节编号清单**：不要出现"6.1、6.2、6.3"或"12.1-12.3"等
- 用自然语言描述子章节内容，如"本章节包含技术方案、实施计划等内容"
""",
    "internal_headings": """
- 这是**技术叶子章节**，可能包含内部小标题
- **禁止生成三级以下编号**：不要出现"12.9.1"、"1.1.1.1"等
- 如需分点，使用 Markdown 列表（- 或 *）或粗体小标题（**小标题**）
""",
    "plain_paragraphs": """
- 这是**普通段落章节**，不包含特殊结构
- 使用连贯的段落描述，避免分点列表
- 保持内容简洁、逻辑清晰
""",
    "table_only": """
- 这是**表格章节**，正文以表格为主
- 确保 Markdown 表格格式正确
- 表格前后可有简短说明，但不要有复杂的段落结构
""",
    "material_placeholder": """
- 这是**固定材料章节**，需要引用外部材料
- **禁止生成小标题**：不要出现"一、主要内容"、"二、补充说明"等
- 使用占位符标注需要补充的材料，如"[待补充：营业执照复印件]"
""",
}


class ContentRevisionService:
    """正文自动修订服务。"""

    def __init__(self):
        self.max_revision_count = 1  # 最多修订1次

    def can_revise(self, quality_report: dict[str, Any], revision_count: int) -> bool:
        """判断是否可以修订。

        Args:
            quality_report: 质量校验报告
            revision_count: 已修订次数

        Returns:
            是否可以修订
        """
        # 已达到最大修订次数
        if revision_count >= self.max_revision_count:
            return False

        # 只有 fail 状态才需要修订
        if quality_report.get("final_status") != "fail":
            return False

        # 检查是否有可修复的问题
        fixable_issues = self._get_fixable_issues(quality_report)
        return len(fixable_issues) > 0

    def _get_fixable_issues(self, quality_report: dict[str, Any]) -> list[dict]:
        """获取可修复的问题列表。"""
        fixable_types = [
            # 原有问题类型
            "section_number_pollution",
            "markdown_heading",
            "internal_id_reference",
            "table_internal_blank",
            "missing_separator",
            "forbidden_content",
            "exclude_scope_violation",
            # 新增问题类型
            "heading_pollution",
            "internal_id_pollution",
            "child_outline_dump",
            "generated_subsection_number",
            "fixed_material_subheading",
            "ai_meta_text",
        ]

        issues = []

        for check_name, check_report in quality_report.items():
            if isinstance(check_report, dict) and "issues" in check_report:
                for issue in check_report.get("issues", []):
                    if issue.get("type") in fixable_types:
                        issues.append(issue)

        return issues

    def build_revision_prompt(
        self,
        content: str,
        quality_report: dict[str, Any],
        generation_mode: str,
        write_scope: str = "",
        exclude_scope: str = "",
        content_structure_policy: str = None,
    ) -> str:
        """构建修订提示词。

        Args:
            content: 原始正文
            quality_report: 质量校验报告
            generation_mode: 生成模式
            write_scope: 写作范围
            exclude_scope: 排除范围
            content_structure_policy: 正文结构策略

        Returns:
            修订提示词
        """
        # 提取需要修复的问题
        fixable_issues = self._get_fixable_issues(quality_report)

        # 格式化问题描述
        issues_text = []
        for i, issue in enumerate(fixable_issues, 1):
            issues_text.append(f"{i}. {issue.get('message', issue.get('type'))}")

        # 获取策略相关规则
        policy = content_structure_policy or "plain_paragraphs"
        policy_rules = POLICY_RULES.get(policy, POLICY_RULES["plain_paragraphs"])

        return REVISION_PROMPT_TEMPLATE.format(
            content=content[:3000],  # 截断，避免过长
            issues="\n".join(issues_text) if issues_text else "格式问题",
            generation_mode=generation_mode,
            write_scope=write_scope or "按照矩阵规定",
            exclude_scope=exclude_scope or "无特别排除",
            content_structure_policy=policy,
            policy_rules=policy_rules,
        )

    def execute_revision(
        self,
        section: Section,
        content: str,
        quality_report: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        """执行自动修订。

        Args:
            section: 章节实例
            content: 原始正文
            quality_report: 质量校验报告
            context: 生成上下文

        Returns:
            {
                "success": bool,
                "revised_content": str,
                "revision_report": dict,
            }
        """
        from apps.generation.services.ai_task_execution_service import AiTaskExecutionService
        from apps.outline.services.content_postprocessor import ContentPostProcessor
        from apps.outline.services.generation_quality_service import GenerationQualityService

        generation_mode = context.get("generation_mode", "leaf_content")
        matrix = context.get("content_matrix", {})
        write_scope = matrix.get("write_scope", "")
        exclude_scope = matrix.get("exclude_scope", "")
        content_structure_policy = context.get("content_structure_policy")

        # 构建修订提示词
        revision_prompt = self.build_revision_prompt(
            content=content,
            quality_report=quality_report,
            generation_mode=generation_mode,
            write_scope=write_scope,
            exclude_scope=exclude_scope,
            content_structure_policy=content_structure_policy,
        )

        try:
            # 调用 AI 进行修订
            user = section.outline.created_by
            prompt_run = AiTaskExecutionService().execute(
                scenario="content_revision",
                variables={
                    "revision_request": revision_prompt,
                },
                created_by=user,
                business_context={"project_id": section.outline.project_id} if section.outline.project_id else {},
            )

            if prompt_run.status != "succeeded":
                return {
                    "success": False,
                    "revised_content": content,
                    "revision_report": {
                        "error": prompt_run.error_message or "AI 修订失败",
                    },
                }

            # 解析修订结果
            revised_content = self._parse_revision_result(prompt_run)

            # 后处理（传入策略）
            postprocessor = ContentPostProcessor()
            post_result = postprocessor.process(
                revised_content,
                generation_mode,
                content_structure_policy=content_structure_policy,
            )
            revised_content = post_result["content"]

            # 重新校验（传入策略）
            result_for_check = {
                "content": revised_content,
                "word_count": len(revised_content),
                "used_analysis_point_ids": [],
                "used_rag_material_ids": [],
                "missing_info": [],
                "risk_flags": [],
            }

            quality_service = GenerationQualityService()
            new_quality_report = quality_service.run_all_checks(context, result_for_check)

            # 检查修订是否成功
            if new_quality_report.get("final_status") == "fail":
                return {
                    "success": False,
                    "revised_content": content,  # 保留原内容
                    "revision_report": {
                        "error": "修订后仍未通过质量校验",
                        "new_quality_report": new_quality_report,
                    },
                }

            return {
                "success": True,
                "revised_content": revised_content,
                "revision_report": {
                    "postprocess_report": post_result["report"],
                    "quality_report": new_quality_report,
                    "revision_notes": "自动修订成功",
                },
            }

        except Exception as e:
            logger.exception(f"Content revision failed: {e}")
            return {
                "success": False,
                "revised_content": content,
                "revision_report": {
                    "error": str(e),
                },
            }

    def _parse_revision_result(self, prompt_run) -> str:
        """解析修订结果。"""
        import json
        import re

        # 优先使用 output_json
        if prompt_run.output_json and isinstance(prompt_run.output_json, dict):
            return prompt_run.output_json.get("content", "")

        # 尝试从 output_text 解析 JSON
        output_text = prompt_run.output_text or ""

        # 查找 JSON
        json_match = re.search(r"\{[\s\S]*\}", output_text)
        if json_match:
            try:
                data = json.loads(json_match.group())
                return data.get("content", "")
            except json.JSONDecodeError:
                pass

        # 直接返回输出文本
        return output_text
