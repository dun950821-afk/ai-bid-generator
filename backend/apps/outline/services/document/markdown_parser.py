# backend/apps/outline/services/document/markdown_parser.py
"""Markdown → 文档 AST 解析器（方案 §12）。

输入：章节 content（Turndown 从 TipTap 转出的 Markdown / AI 生成文本）
输出：ast.py 定义的节点列表

支持的语法：
- 标题 # ~ ####
- 行内格式 **粗体** / *斜体*
- 无序列表 - / *，有序列表 1.
- 表格 | ... |
- 图片 ![alt](url)
- 引用 > ...
- 分页符：单独一行的 --- 或 ***
- 材料占位符 {{ material:usage_key }}
"""

import re
from typing import List

from apps.outline.services.document.ast import (
    HeadingNode,
    ImageNode,
    InlineSegment,
    ListNode,
    MaterialNode,
    Node,
    PageBreakNode,
    ParagraphNode,
    QuoteNode,
    TableNode,
)

MATERIAL_PLACEHOLDER_RE = re.compile(r"\{\{\s*material:(\w+)\s*\}\}")
IMAGE_RE = re.compile(r"!\[([^\]]*)\]\(([^)\s]+)\)")
# 原生 HTML 图片：编辑器内容带 width 等属性时 Turndown 保留 <img> 原样输出
HTML_IMG_RE = re.compile(r"<img\b[^>]*?>", re.IGNORECASE)
HTML_IMG_SRC_RE = re.compile(r'src="([^"]+)"', re.IGNORECASE)
HTML_IMG_WIDTH_RE = re.compile(r'width="(\d+)"', re.IGNORECASE)
HTML_IMG_ALT_RE = re.compile(r'alt="([^"]*)"', re.IGNORECASE)
ORDERED_ITEM_RE = re.compile(r"^\d+\.\s+")
TABLE_SEPARATOR_RE = re.compile(r"^\|[\s\-:]+\|[\s\-:]*\|?$")
PAGE_BREAK_RE = re.compile(r"^(---|\*\*\*|- - -)$")
# 行内格式：粗体优先于斜体
INLINE_RE = re.compile(r"(\*\*.+?\*\*|\*[^*\n]+?\*)")


def parse_inline(text: str) -> List[InlineSegment]:
    """解析行内粗体/斜体为片段列表。"""
    segments: List[InlineSegment] = []
    for part in INLINE_RE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") and len(part) > 4:
            segments.append(InlineSegment(part[2:-2], bold=True))
        elif part.startswith("*") and part.endswith("*") and len(part) > 2:
            segments.append(InlineSegment(part[1:-1], italic=True))
        else:
            segments.append(InlineSegment(part))
    if not segments:
        segments.append(InlineSegment(""))
    return segments


class MarkdownParser:
    """把章节 Markdown 内容解析为 AST 节点列表。"""

    def parse(self, content: str) -> List[Node]:
        nodes: List[Node] = []
        lines = (content or "").splitlines()
        i = 0

        while i < len(lines):
            stripped = lines[i].strip()

            if not stripped:
                i += 1
                continue

            # 表格：连续 | 开头结尾的行
            if stripped.startswith("|") and stripped.endswith("|"):
                table_lines = []
                while i < len(lines):
                    line = lines[i].strip()
                    if line.startswith("|") and line.endswith("|"):
                        table_lines.append(line)
                        i += 1
                    else:
                        break
                node = self._parse_table(table_lines)
                if node:
                    nodes.append(node)
                continue

            # 材料占位符
            matches = MATERIAL_PLACEHOLDER_RE.findall(stripped)
            if matches:
                is_attachment = stripped.startswith("{{") and stripped.endswith("}}")
                for usage_key in matches:
                    nodes.append(MaterialNode(usage_key=usage_key, is_attachment=is_attachment))
                i += 1
                continue

            # 分页符
            if PAGE_BREAK_RE.match(stripped):
                nodes.append(PageBreakNode())
                i += 1
                continue

            # 标题
            heading = re.match(r"^(#{1,4})\s+(.*)$", stripped)
            if heading:
                level = len(heading.group(1))
                text = heading.group(2).strip()
                nodes.append(HeadingNode(level=level, text=self._plain_text(text)))
                i += 1
                continue

            # 引用
            if stripped.startswith("> "):
                nodes.append(QuoteNode(segments=parse_inline(stripped[2:])))
                i += 1
                continue

            # 无序列表（连续行归并为一个 ListNode）
            if stripped.startswith("- ") or stripped.startswith("* "):
                node, i = self._parse_list(lines, i, ordered=False)
                nodes.append(node)
                continue

            # 有序列表
            if ORDERED_ITEM_RE.match(stripped):
                node, i = self._parse_list(lines, i, ordered=True)
                nodes.append(node)
                continue

            # 图片（Markdown 语法或原生 HTML img，独占一行或混排都提取为 ImageNode）
            if IMAGE_RE.search(stripped) or HTML_IMG_RE.search(stripped):
                remaining = stripped
                for alt, url in IMAGE_RE.findall(stripped):
                    nodes.append(ImageNode(url=url, alt=alt))
                    remaining = IMAGE_RE.sub("", remaining, count=1)
                for img_tag in HTML_IMG_RE.findall(remaining):
                    src_m = HTML_IMG_SRC_RE.search(img_tag)
                    if not src_m:
                        continue
                    width_m = HTML_IMG_WIDTH_RE.search(img_tag)
                    alt_m = HTML_IMG_ALT_RE.search(img_tag)
                    nodes.append(ImageNode(
                        url=src_m.group(1),
                        alt=alt_m.group(1) if alt_m else "",
                        width_px=int(width_m.group(1)) if width_m else None,
                    ))
                    remaining = remaining.replace(img_tag, "", 1)
                remaining = remaining.strip()
                if remaining:
                    nodes.append(ParagraphNode(segments=parse_inline(remaining)))
                i += 1
                continue

            # 普通段落
            nodes.append(ParagraphNode(segments=parse_inline(stripped)))
            i += 1

        return nodes

    @staticmethod
    def _plain_text(text: str) -> str:
        """标题不保留行内格式标记。"""
        return re.sub(r"\*+", "", text)

    def _parse_list(self, lines: List[str], start: int, ordered: bool):
        items: List[List[InlineSegment]] = []
        i = start
        while i < len(lines):
            stripped = lines[i].strip()
            if ordered:
                if not ORDERED_ITEM_RE.match(stripped):
                    break
                items.append(parse_inline(ORDERED_ITEM_RE.sub("", stripped)))
            else:
                if not (stripped.startswith("- ") or stripped.startswith("* ")):
                    break
                items.append(parse_inline(stripped[2:]))
            i += 1
        return ListNode(ordered=ordered, items=items), i

    @staticmethod
    def _parse_table(table_lines: List[str]) -> TableNode | None:
        rows = []
        has_header = False
        for index, line in enumerate(table_lines):
            if TABLE_SEPARATOR_RE.match(line):
                if index == 1:
                    has_header = True
                continue
            cells = [cell.strip() for cell in line.split("|")]
            # 去掉首尾空元素（行首尾的 | 产生）
            if cells and cells[0] == "":
                cells = cells[1:]
            if cells and cells[-1] == "":
                cells = cells[:-1]
            if cells:
                rows.append(cells)
        if not rows:
            return None
        return TableNode(rows=rows, has_header=has_header)
