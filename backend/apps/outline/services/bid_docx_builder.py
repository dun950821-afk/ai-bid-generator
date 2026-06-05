# backend/apps/outline/services/bid_docx_builder.py
"""标书 Word 文档生成服务。"""

import re
from io import BytesIO
from typing import List, Tuple

from django.core.files.base import ContentFile
from docx import Document
from docx.shared import Pt

from apps.outline.models import Section


class BidDocxBuilder:
    """将大纲章节内容组装为 Word docx。

    使用树形 DFS 顺序遍历章节，保证 Word 章节顺序和左侧目录一致。
    """

    def build(
        self,
        outline,
        sections: List[Section],
    ) -> Tuple[ContentFile, List[dict]]:
        """生成 Word 文档。

        Args:
            outline: 大纲实例
            sections: 章节查询集（扁平列表）

        Returns:
            (ContentFile, warnings): Word 文件和警告列表
        """
        warnings = []
        doc = Document()

        # 文档标题
        title_text = outline.name or "投标文件"
        title = doc.add_heading(title_text, level=0)
        title.alignment = 1  # 居中

        # 构建树形结构
        section_map = {}
        root_sections = []

        for section in sections:
            section_map[section.id] = {
                "section": section,
                "children": [],
            }

        for section in sections:
            if section.parent_id is None:
                root_sections.append(section_map[section.id])
            elif section.parent_id in section_map:
                section_map[section.parent_id]["children"].append(section_map[section.id])

        # 按 sort_order 排序
        def sort_children(nodes):
            nodes.sort(key=lambda x: x["section"].sort_order)
            for node in nodes:
                sort_children(node["children"])

        sort_children(root_sections)

        # 检查空 content
        sections_with_content = [s for s in sections if s.content and s.content.strip()]
        if not sections_with_content:
            warnings.append({
                "type": "no_content",
                "message": "没有任何章节包含内容，生成的文档将为空",
            })
        else:
            empty_sections = [s for s in sections if not s.content or not s.content.strip()]
            if empty_sections:
                titles = [s.title[:30] for s in empty_sections[:5]]
                warnings.append({
                    "type": "partial_content",
                    "message": f"部分章节内容为空：{', '.join(titles)}{'等' if len(empty_sections) > 5 else ''}",
                })

        # DFS 遍历写入章节
        def write_section(node, depth=0):
            section = node["section"]
            self._add_section(doc, section, depth)

            for child in node["children"]:
                write_section(child, depth + 1)

        for node in root_sections:
            write_section(node)

        # 保存到内存
        buffer = BytesIO()
        doc.save(buffer)
        buffer.seek(0)

        filename = f"{outline.name or '投标文件'}.docx"
        return ContentFile(buffer.read(), name=filename), warnings

    def _add_section(self, doc: Document, section: Section, depth: int):
        """添加单个章节到文档。"""
        section_title = self._get_section_title(section)

        # 标题级别：1-4，depth 从 0 开始
        heading_level = min(max(depth + 1, 1), 4)
        doc.add_heading(section_title, level=heading_level)

        # 章节内容
        content = section.content or ""
        if content.strip():
            self._add_markdown_content(doc, content)

    def _get_section_title(self, section: Section) -> str:
        """获取章节标题（含编号）。"""
        number = getattr(section, "section_number", "") or ""
        if number:
            return f"{number} {section.title}"
        return section.title

    def _add_markdown_content(self, doc: Document, content: str):
        """将 Markdown 内容添加到文档。"""
        lines = content.splitlines()
        table_lines = []

        for line in lines:
            stripped = line.strip()

            if not stripped:
                if table_lines:
                    self._flush_table(doc, table_lines)
                    table_lines = []
                continue

            # 处理表格
            if stripped.startswith("|") and stripped.endswith("|"):
                table_lines.append(stripped)
                continue

            # 非表格内容，先刷新表格
            if table_lines:
                self._flush_table(doc, table_lines)
                table_lines = []

            # 处理标题
            if stripped.startswith("### "):
                doc.add_heading(stripped.replace("### ", "", 1), level=3)
            elif stripped.startswith("## "):
                doc.add_heading(stripped.replace("## ", "", 1), level=2)
            elif stripped.startswith("# "):
                doc.add_heading(stripped.replace("# ", "", 1), level=1)
            # 处理列表
            elif stripped.startswith("- ") or stripped.startswith("* "):
                doc.add_paragraph(stripped[2:], style="List Bullet")
            elif stripped.startswith(("1. ", "2. ", "3. ", "4. ", "5. ", "6. ", "7. ", "8. ", "9. ")):
                doc.add_paragraph(stripped[3:], style="List Number")
            else:
                paragraph = doc.add_paragraph(stripped)
                for run in paragraph.runs:
                    run.font.size = Pt(10.5)

        # 处理剩余表格
        if table_lines:
            self._flush_table(doc, table_lines)

    def _flush_table(self, doc: Document, table_lines: List[str]):
        """将 Markdown 表格转换为 Word 表格。"""
        rows = []

        for line in table_lines:
            cells = [c.strip() for c in line.strip("|").split("|")]

            # 跳过分隔行
            if all(re.match(r"^:?-+:?$", c.strip()) for c in cells):
                continue

            rows.append(cells)

        if not rows:
            return

        # 计算最大列数
        max_cols = max(len(row) for row in rows)
        table = doc.add_table(rows=len(rows), cols=max_cols)
        table.style = "Table Grid"

        for i, row in enumerate(rows):
            for j in range(max_cols):
                cell = table.cell(i, j)
                cell.text = row[j] if j < len(row) else ""
                # 设置字体大小
                for paragraph in cell.paragraphs:
                    for run in paragraph.runs:
                        run.font.size = Pt(9)
