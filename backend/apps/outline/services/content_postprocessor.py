# backend/apps/outline/services/content_postprocessor.py
"""正文后处理服务。

处理通用格式问题，确保生成内容符合规范。
"""

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


class ContentPostProcessor:
    """正文后处理服务。

    处理通用格式问题：
    - remove_leading_heading: 删除正文开头的章节标题、Markdown 标题
    - remove_section_number_pollution: 清理正文中的异常章节编号污染
    - remove_internal_ids: 清理数据库 ID、内部编号
    - remove_child_outline_dump: 清理父章节中的子章节编号清单
    - remove_generated_subsection_numbers: 清理叶子章节中私自生成的子编号
    - normalize_markdown_tables: 清理 Markdown 表格空行、统一单元格空格
    - normalize_blank_lines: 连续多个空行压缩
    - strip_ai_meta_text: 删除 AI 解释性文字
    """

    # AI 解释性文字模式
    AI_META_PATTERNS = [
        r"^以下是[^。]*[。：]",
        r"^根据[^。]*要求[，：]",
        r"^本章[^。]*如下[：]",
        r"^以上是[^。]*[。]",
        r"^本节[^。]*如下[：]",
        r"^以下是生成内容[：]",
        r"^根据您的[要求需求][，：]",
        r"^我已经为您[生成编写][，：]",
        r"^[好的明白]，.*[如下是]",
    ]

    # 章节编号模式（需要清理的）
    SECTION_NUMBER_PATTERNS = [
        r"^[一二三四五六七八九十]+、[^\n]*\n",  # 一、标题
        r"^第[一二三四五六七八九十\d]+[章节][^\n]*\n",  # 第一章、第1节
        r"^\d+(\.\d+)*[、.．][^\n]*\n",  # 1.1、标题
        r"^（[一二三四五六七八九十\d]+）[^\n]*\n",  # （一）标题
        r"^\([一二三四五六七八九十\d]+\)[^\n]*\n",  # (一)标题
    ]

    # Markdown 标题模式
    MARKDOWN_HEADING_PATTERNS = [
        r"^#{1,6}\s+[^\n]*\n",  # # 标题
        r"^#{1,6}\s*",  # 开头的 #
    ]

    # 内部 ID 模式
    INTERNAL_ID_PATTERNS = [
        r"章节\s*\d+[\s.]*\d*",  # 章节45、章节45.46
        r"ID[:：]\s*\d+",  # ID:123
        r"\bsection_id[:：]\s*\d+",  # section_id:123
        r"\b_id[:：]\s*\d+",  # _id:123
        r"数据库[编号ID][:：]\s*\d+",  # 数据库编号:123
        r"\bsort_order[:：]\s*\d+",  # sort_order:123
    ]

    # 子章节编号清单模式（父章节问题）
    CHILD_OUTLINE_DUMP_PATTERNS = [
        r"\d+\.\d+(?:\s*[、,，]\s*\d+\.\d+){2,}",  # 6.1、6.2、6.3 或 6.1, 6.2, 6.3
        r"\d+\.\d+\s*[-~至]\s*\d+\.\d+",  # 12.1-12.3 或 12.1~12.3
        r"（\d+\.\d+\s*[-~至]\s*\d+\.\d+）",  # （12.1-12.3）
    ]

    # 私自生成的子编号模式（叶子章节问题）
    GENERATED_SUBSECTION_PATTERNS = [
        r"^\d+\.\d+\.\d+[、.．\s]",  # 12.9.1 开头
        r"\n\d+\.\d+\.\d+[、.．\s]",  # 换行后的 12.9.1
        r"^\d+\.\d+\.\d+\.\d+[、.．\s]",  # 1.1.1.1 开头
    ]

    # 固定材料章节小标题模式
    FIXED_MATERIAL_SUBHEADING_PATTERNS = [
        r"^[一二三四五六七八九十]+、[^\n]*\n",  # 一、主要内容
        r"^（[一二三四五六七八九十]+）[^\n]*\n",  # （一）补充说明
    ]

    def process(self, content: str, generation_mode: str = "leaf_content", content_structure_policy: str = None) -> dict[str, Any]:
        """执行所有后处理步骤。

        Args:
            content: 生成的正文内容
            generation_mode: 生成模式
            content_structure_policy: 正文结构策略

        Returns:
            {
                "content": 处理后的内容,
                "report": 处理报告,
            }
        """
        report = {
            "steps": [],
            "changes_count": 0,
        }

        # 1. 删除开头的章节标题
        content, step_report = self.remove_leading_heading(content)
        report["steps"].append(step_report)
        report["changes_count"] += step_report.get("changes", 0)

        # 2. 清理章节编号污染
        content, step_report = self.remove_section_number_pollution(content)
        report["steps"].append(step_report)
        report["changes_count"] += step_report.get("changes", 0)

        # 3. 清理内部 ID
        content, step_report = self.remove_internal_ids(content)
        report["steps"].append(step_report)
        report["changes_count"] += step_report.get("changes", 0)

        # 4. 清理 AI 解释性文字
        content, step_report = self.strip_ai_meta_text(content)
        report["steps"].append(step_report)
        report["changes_count"] += step_report.get("changes", 0)

        # 5. 根据正文结构策略执行特定清理
        if content_structure_policy == "category_summary":
            # 父章节：清理子章节编号清单
            content, step_report = self.remove_child_outline_dump(content)
            report["steps"].append(step_report)
            report["changes_count"] += step_report.get("changes", 0)
        elif content_structure_policy == "internal_headings":
            # 技术叶子章节：清理私自生成的子编号
            content, step_report = self.remove_generated_subsection_numbers(content)
            report["steps"].append(step_report)
            report["changes_count"] += step_report.get("changes", 0)
        elif content_structure_policy == "material_placeholder":
            # 固定材料章节：清理小标题
            content, step_report = self.remove_fixed_material_subheadings(content)
            report["steps"].append(step_report)
            report["changes_count"] += step_report.get("changes", 0)

        # 6. 规范化 Markdown 表格
        content, step_report = self.normalize_markdown_tables(content)
        report["steps"].append(step_report)
        report["changes_count"] += step_report.get("changes", 0)

        # 7. 规范化空行
        content, step_report = self.normalize_blank_lines(content)
        report["steps"].append(step_report)
        report["changes_count"] += step_report.get("changes", 0)

        # 8. 清理前后空白
        content = content.strip()

        return {
            "content": content,
            "report": report,
        }

    def remove_leading_heading(self, content: str) -> tuple[str, dict[str, Any]]:
        """删除正文开头的章节标题、Markdown 标题、编号标题。

        Returns:
            (处理后的内容, 处理报告)
        """
        original_length = len(content)
        lines = content.split("\n")
        removed_lines = []

        # 从开头逐行检查，直到找到非标题行
        start_index = 0
        for i, line in enumerate(lines[:10]):  # 只检查前10行
            line_stripped = line.strip()

            # 检查是否是章节编号标题
            is_section_heading = False
            for pattern in self.SECTION_NUMBER_PATTERNS:
                if re.match(pattern, line_stripped):
                    is_section_heading = True
                    break

            # 检查是否是 Markdown 标题
            is_markdown_heading = False
            for pattern in self.MARKDOWN_HEADING_PATTERNS:
                if re.match(pattern, line_stripped):
                    # 但要排除合法的 Markdown 标题（如表格后的标题）
                    if i == 0:  # 只删除第一行的 Markdown 标题
                        is_markdown_heading = True
                    break

            if is_section_heading or is_markdown_heading:
                removed_lines.append(line_stripped)
                start_index = i + 1
            else:
                # 遇到非标题行，停止
                break

        # 重新组合内容
        content = "\n".join(lines[start_index:])

        return content, {
            "step": "remove_leading_heading",
            "changes": original_length - len(content),
            "removed": removed_lines,
        }

    def remove_section_number_pollution(self, content: str) -> tuple[str, dict[str, Any]]:
        """清理正文中的异常章节编号污染。

        删除正文中不应该出现的章节编号，如：
        - 正文段落开头突然出现的编号
        - 编号后没有实际内容的空标题
        """
        original_length = len(content)

        # 清理正文中的异常编号（非表格、非列表中的编号）
        lines = content.split("\n")
        cleaned_lines = []
        is_pollution = False  # 在循环外部初始化
        pollution_patterns = [
            r"^[一二三四五六七八九十]+、\s*$",  # 编号后无内容
            r"^\d+(\.\d+)*[、.．]\s*$",  # 数字编号后无内容
            r"^第[一二三四五六七八九十\d]+[章节]\s*$",  # 第X章后无内容
        ]

        for line in lines:
            line_stripped = line.strip()

            # 如果是空行，保留
            if not line_stripped:
                cleaned_lines.append(line)
                continue

            # 如果是表格行（包含 |），保留
            if "|" in line_stripped:
                cleaned_lines.append(line)
                continue

            # 如果是列表项（以 - 或 * 开头），保留
            if line_stripped.startswith("-") or line_stripped.startswith("*"):
                cleaned_lines.append(line)
                continue

            # 检查是否是异常的章节编号
            is_pollution = False
            for pattern in pollution_patterns:
                if re.match(pattern, line_stripped):
                    is_pollution = True
                    break

            if not is_pollution:
                cleaned_lines.append(line)

        content = "\n".join(cleaned_lines)

        return content, {
            "step": "remove_section_number_pollution",
            "changes": original_length - len(content),
            "removed_patterns": pollution_patterns if is_pollution else [],
        }

    def remove_internal_ids(self, content: str) -> tuple[str, dict[str, Any]]:
        """清理数据库 ID、内部编号等不应出现在正文中的引用。

        Returns:
            (处理后的内容, 处理报告)
        """
        original_length = len(content)
        removed_matches = []

        for pattern in self.INTERNAL_ID_PATTERNS:
            matches = re.findall(pattern, content)
            if matches:
                removed_matches.extend(matches)
                content = re.sub(pattern, "[相关章节]", content)

        return content, {
            "step": "remove_internal_ids",
            "changes": original_length - len(content),
            "removed_matches": removed_matches,
        }

    def remove_child_outline_dump(self, content: str) -> tuple[str, dict[str, Any]]:
        """清理父章节中的子章节编号清单。

        删除类似 "6.1、6.2、6.3" 或 "12.1-12.3、12.4、12.5-12.9" 的编号清单。

        Returns:
            (处理后的内容, 处理报告)
        """
        original_length = len(content)
        removed_matches = []

        for pattern in self.CHILD_OUTLINE_DUMP_PATTERNS:
            matches = re.findall(pattern, content)
            if matches:
                removed_matches.extend(matches)
                # 替换为概括性表达
                content = re.sub(pattern, "相关子章节", content)

        return content, {
            "step": "remove_child_outline_dump",
            "changes": original_length - len(content),
            "removed_matches": removed_matches,
        }

    def remove_generated_subsection_numbers(self, content: str) -> tuple[str, dict[str, Any]]:
        """清理叶子章节中私自生成的子编号。

        删除类似 "12.9.1"、"1.1.1" 的三级或更深编号。

        Returns:
            (处理后的内容, 处理报告)
        """
        original_length = len(content)
        removed_matches = []

        for pattern in self.GENERATED_SUBSECTION_PATTERNS:
            matches = re.findall(pattern, content)
            if matches:
                removed_matches.extend(matches)
                # 替换为空（删除编号，保留后面的内容）
                content = re.sub(pattern, "\n**", content)

        return content, {
            "step": "remove_generated_subsection_numbers",
            "changes": original_length - len(content),
            "removed_matches": removed_matches,
        }

    def remove_fixed_material_subheadings(self, content: str) -> tuple[str, dict[str, Any]]:
        """清理固定材料章节中的小标题。

        删除类似 "一、主要内容"、"二、补充说明" 的小标题。

        Returns:
            (处理后的内容, 处理报告)
        """
        original_length = len(content)
        removed_matches = []

        for pattern in self.FIXED_MATERIAL_SUBHEADING_PATTERNS:
            matches = re.findall(pattern, content)
            if matches:
                removed_matches.extend(matches)
                # 删除小标题行
                content = re.sub(pattern, "", content)

        return content, {
            "step": "remove_fixed_material_subheadings",
            "changes": original_length - len(content),
            "removed_matches": removed_matches,
        }

    def normalize_markdown_tables(self, content: str) -> tuple[str, dict[str, Any]]:
        """清理 Markdown 表格空行、统一单元格空格、保证表格紧凑。

        Returns:
            (处理后的内容, 处理报告)
        """
        original_length = len(content)
        changes = 0

        # 查找所有 Markdown 表格
        table_pattern = r"(\|[^\n]+\|\n(?:\|[^\n]+\|\n|\|[-:]+\|\n)+)"
        tables = re.findall(table_pattern, content)

        for table in tables:
            # 清理表格内的空行
            table_lines = table.split("\n")
            cleaned_table_lines = []

            for line in table_lines:
                # 保留分隔行（|---|---|）
                if re.match(r"\|[-:]+\|", line.strip()):
                    cleaned_table_lines.append(line)
                    continue

                # 保留有内容的行
                if line.strip() and "|" in line:
                    # 清理单元格内的多余空格
                    cells = line.split("|")
                    cleaned_cells = []
                    for cell in cells:
                        cleaned_cells.append(cell.strip())
                    cleaned_line = "|" + "|".join(cleaned_cells) + "|"
                    cleaned_table_lines.append(cleaned_line)
                    if cleaned_line != line:
                        changes += 1
                # 删除表格内的空行（不包含 | 的行）
                elif "|" not in line.strip() and line.strip():
                    changes += 1
                    continue

            # 检查分隔行是否有连续的 |-| 段（表示空行分隔）
            new_table = "\n".join(cleaned_table_lines)

            # 替换原表格
            content = content.replace(table, new_table)

        return content, {
            "step": "normalize_markdown_tables",
            "changes": changes,
            "tables_found": len(tables),
        }

    def normalize_blank_lines(self, content: str) -> tuple[str, dict[str, Any]]:
        """压缩连续多个空行。

        Returns:
            (处理后的内容, 处理报告)
        """
        original_length = len(content)

        # 将连续的3个及以上空行压缩为2个
        content = re.sub(r"\n{3,}", "\n\n", content)

        # 将连续的2个空行压缩为1个（对于非表格内容）
        # 但保留表格后的空行和段落间的空行

        return content, {
            "step": "normalize_blank_lines",
            "changes": original_length - len(content),
        }

    def strip_ai_meta_text(self, content: str) -> tuple[str, dict[str, Any]]:
        """删除 AI 解释性文字。

        如："以下是生成内容"、"根据要求生成" 等。

        Returns:
            (处理后的内容, 处理报告)
        """
        original_length = len(content)
        removed_matches = []

        # 检查开头
        lines = content.split("\n")
        new_lines = []

        for line in lines:
            line_stripped = line.strip()
            is_meta = False

            for pattern in self.AI_META_PATTERNS:
                if re.match(pattern, line_stripped):
                    is_meta = True
                    removed_matches.append(line_stripped)
                    break

            if not is_meta:
                new_lines.append(line)

        content = "\n".join(new_lines)

        # 检查结尾
        content = content.strip()
        ending_patterns = [
            r"[以上下列本][章节内容][^。]*[已完毕成]+$",
            r"希望[能对您有帮助]+$",
        ]

        for pattern in ending_patterns:
            match = re.search(pattern, content)
            if match:
                removed_matches.append(match.group())
                content = re.sub(pattern, "", content)

        content = content.strip()

        return content, {
            "step": "strip_ai_meta_text",
            "changes": original_length - len(content),
            "removed_matches": removed_matches,
        }

    def check_forbidden_output(self, content: str) -> dict[str, Any]:
        """检查是否包含禁止输出的内容。

        Returns:
            {
                "has_section_number": bool,
                "has_markdown_heading": bool,
                "has_internal_id": bool,
                "has_ai_meta": bool,
                "has_child_outline_dump": bool,
                "has_generated_subsection": bool,
                "issues": [...],
            }
        """
        issues = []

        # 检查章节编号
        for pattern in self.SECTION_NUMBER_PATTERNS:
            matches = re.findall(pattern, content)
            if matches:
                issues.append({
                    "type": "section_number",
                    "matches": matches[:5],
                    "message": "正文包含章节编号污染",
                })

        # 检查 Markdown 标题（开头）
        lines = content.split("\n")
        if lines:
            first_line = lines[0].strip()
            for pattern in self.MARKDOWN_HEADING_PATTERNS:
                if re.match(pattern, first_line):
                    issues.append({
                        "type": "markdown_heading",
                        "matches": [first_line],
                        "message": "正文开头包含 Markdown 标题",
                    })
                    break

        # 检查内部 ID
        for pattern in self.INTERNAL_ID_PATTERNS:
            matches = re.findall(pattern, content)
            if matches:
                issues.append({
                    "type": "internal_id",
                    "matches": matches[:5],
                    "message": "正文包含内部 ID 引用",
                })

        # 检查 AI 解释性文字
        for pattern in self.AI_META_PATTERNS:
            matches = re.findall(pattern, content)
            if matches:
                issues.append({
                    "type": "ai_meta",
                    "matches": matches[:5],
                    "message": "正文包含 AI 解释性文字",
                })

        # 检查子章节编号清单
        for pattern in self.CHILD_OUTLINE_DUMP_PATTERNS:
            matches = re.findall(pattern, content)
            if matches:
                issues.append({
                    "type": "child_outline_dump",
                    "matches": matches[:5],
                    "message": "父章节包含子章节编号清单",
                })

        # 检查私自生成的子编号
        for pattern in self.GENERATED_SUBSECTION_PATTERNS:
            matches = re.findall(pattern, content)
            if matches:
                issues.append({
                    "type": "generated_subsection",
                    "matches": matches[:5],
                    "message": "叶子章节包含私自生成的子编号",
                })

        return {
            "has_section_number": any(i["type"] == "section_number" for i in issues),
            "has_markdown_heading": any(i["type"] == "markdown_heading" for i in issues),
            "has_internal_id": any(i["type"] == "internal_id" for i in issues),
            "has_ai_meta": any(i["type"] == "ai_meta" for i in issues),
            "has_child_outline_dump": any(i["type"] == "child_outline_dump" for i in issues),
            "has_generated_subsection": any(i["type"] == "generated_subsection" for i in issues),
            "issues": issues,
        }