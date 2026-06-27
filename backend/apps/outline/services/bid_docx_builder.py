# backend/apps/outline/services/bid_docx_builder.py
"""标书 Word 文档生成服务。"""

import re
from io import BytesIO
from typing import List, Tuple

from django.core.files.base import ContentFile
from docx import Document
from docx.shared import Pt, Mm

from apps.outline.models import Section
from apps.outline.services.section_numbering_service import (
    SectionNumberingService,
    strip_number_prefix,
)


class BidDocxBuilder:
    """将大纲章节内容组装为 Word docx。

    使用树形 DFS 顺序遍历章节，保证 Word 章节顺序和左侧目录一致。
    支持材料占位符 {{ material:usage_key }} 自动插入图片。
    """

    # 材料占位符正则
    MATERIAL_PLACEHOLDER_RE = re.compile(r'\{\{\s*material:(\w+)\s*\}\}')

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

        # 使用统一编号服务计算章节编号
        sections = list(sections)
        number_map = SectionNumberingService().build_number_map(sections)

        # 获取材料包（如果存在）
        material_package = self._get_material_package(outline)

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
            self._add_section(doc, section, depth, number_map, material_package)

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

    def _get_material_package(self, outline):
        """获取大纲关联的材料包。"""
        try:
            return outline.material_package
        except Exception:
            return None

    def _add_section(self, doc: Document, section: Section, depth: int, number_map: dict, material_package=None):
        """添加单个章节到文档。"""
        section_title = self._get_section_title(section, number_map)

        # 标题级别：1-4，depth 从 0 开始
        heading_level = min(max(depth + 1, 1), 4)
        doc.add_heading(section_title, level=heading_level)

        # 章节内容
        content = section.content or ""
        if content.strip():
            self._add_markdown_content(doc, content, section, material_package)

    def _get_section_title(self, section: Section, number_map: dict) -> str:
        """获取章节标题（含编号）。

        使用统一编号服务生成的编号，并去掉标题中已有的编号前缀。
        """
        number = number_map.get(section.id, "")
        title = strip_number_prefix(section.title) if section.title else ""

        if number:
            return f"{number}{title}"
        return section.title or ""

    def _add_markdown_content(self, doc: Document, content: str, section: Section = None, material_package=None):
        """将 Markdown 内容添加到文档。

        支持材料占位符 {{ material:usage_key }} 自动插入图片。
        """
        lines = content.splitlines()
        table_lines = []

        for line in lines:
            stripped = line.strip()

            if not stripped:
                if table_lines:
                    self._flush_table(doc, table_lines)
                    table_lines = []
                continue

            # 检查材料占位符
            if self.MATERIAL_PLACEHOLDER_RE.search(stripped):
                # 先刷新表格
                if table_lines:
                    self._flush_table(doc, table_lines)
                    table_lines = []

                # 处理材料占位符
                self._process_material_placeholders(doc, stripped, material_package)
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
        """将 Markdown 表格转换为 Word 表格。

        Args:
            doc: Word 文档
            table_lines: 表格行列表（Markdown 格式）
        """
        if not table_lines:
            return

        # 过滤掉分隔行（如 |---|---|）
        data_lines = [
            line for line in table_lines
            if not re.match(r'^\|[\s\-:]+\|[\s\-:]+\|', line)
        ]

        if not data_lines:
            return

        # 解析表格数据
        rows_data = []
        for line in data_lines:
            cells = [cell.strip() for cell in line.split('|')]
            # 去掉首尾空元素
            cells = [c for c in cells if c or cells.index(c) not in [0, len(cells) - 1]]
            if cells:
                rows_data.append(cells)

        if not rows_data:
            return

        # 计算列数
        max_cols = max(len(row) for row in rows_data)

        # 创建表格
        table = doc.add_table(rows=len(rows_data), cols=max_cols)
        table.style = 'Table Grid'

        # 填充数据
        for i, row_data in enumerate(rows_data):
            row = table.rows[i]
            for j, cell_text in enumerate(row_data):
                if j < max_cols:
                    cell = row.cells[j]
                    cell.text = cell_text
                    # 设置字体大小
                    for paragraph in cell.paragraphs:
                        for run in paragraph.runs:
                            run.font.size = Pt(10)

    def _process_material_placeholders(self, doc: Document, line: str, material_package):
        """处理材料占位符，插入图片。

        Args:
            doc: Word 文档
            line: 包含占位符的行
            material_package: 材料包实例
        """
        matches = self.MATERIAL_PLACEHOLDER_RE.findall(line)

        if not matches or not material_package:
            # 没有匹配或没有材料包，直接输出原文本
            paragraph = doc.add_paragraph(line)
            for run in paragraph.runs:
                run.font.size = Pt(10.5)
            return

        # 检查是否是整行只有占位符（附件式插图）
        stripped_line = line.strip()
        is_attachment_mode = stripped_line.startswith("{{") and stripped_line.endswith("}}")

        for usage_key in matches:
            item = material_package.items.filter(usage_key=usage_key).select_related("material").first()

            if item and item.material and item.material.object_key:
                # 找到材料，插入图片
                try:
                    self._insert_material_image(doc, item.material, is_attachment_mode)
                except Exception as e:
                    # 图片插入失败，添加提示
                    doc.add_paragraph(f"【材料图片插入失败：{usage_key}】")
            else:
                # 材料缺失，添加提示
                doc.add_paragraph(f"【缺少材料：{usage_key}】")

    def _insert_material_image(self, doc: Document, material, is_attachment: bool = False):
        """插入材料图片到文档。

        Args:
            doc: Word 文档
            material: CompanyMaterial 实例
            is_attachment: 是否是附件式插图（居中显示）
        """
        from apps.common.services.storage import StorageService

        storage = StorageService()
        image_data = storage.get_object(material.object_key)

        image_stream = BytesIO(image_data)

        # 添加图片段落
        paragraph = doc.add_paragraph()

        if is_attachment:
            # 附件式：居中显示
            paragraph.alignment = 1  # WD_ALIGN_PARAGRAPH.CENTER

        # 计算图片宽度
        width_mm = 150 if is_attachment else 100

        run = paragraph.add_run()
        run.add_picture(image_stream, width=Mm(width_mm))

        # 如果是附件式，添加材料说明
        if is_attachment and material.title:
            caption = doc.add_paragraph(material.title)
            caption.alignment = 1  # 居中
            for run in caption.runs:
                run.font.size = Pt(9)
