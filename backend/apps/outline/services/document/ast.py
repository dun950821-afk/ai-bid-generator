# backend/apps/outline/services/document/ast.py
"""标书文档 AST（方案 §12）。

AI 内容（Markdown）先解析为结构化节点，再由 WordBodyRenderer 写入 Word。
AI 不需要知道字体/字号/行距——这些全部由模板样式决定（内容与格式分离）。
"""

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class InlineSegment:
    """行内片段（带粗体/斜体标记）。"""

    text: str
    bold: bool = False
    italic: bool = False


@dataclass
class HeadingNode:
    level: int  # 1-4
    text: str


@dataclass
class ParagraphNode:
    segments: List[InlineSegment] = field(default_factory=list)


@dataclass
class ListNode:
    ordered: bool
    items: List[List[InlineSegment]] = field(default_factory=list)


@dataclass
class TableNode:
    rows: List[List[str]] = field(default_factory=list)
    has_header: bool = True


@dataclass
class ImageNode:
    """正文图片（编辑器插图 / Mermaid 配图 / AI 生图）。"""

    url: str
    alt: str = ""
    width_px: Optional[int] = None  # HTML img 的 width 属性（像素）


@dataclass
class MaterialNode:
    """企业材料占位符 {{ material:usage_key }}。"""

    usage_key: str
    is_attachment: bool = False  # 整行只有占位符 → 附件式居中插图 + 标题


@dataclass
class PageBreakNode:
    pass


@dataclass
class QuoteNode:
    segments: List[InlineSegment] = field(default_factory=list)


Node = (
    HeadingNode
    | ParagraphNode
    | ListNode
    | TableNode
    | ImageNode
    | MaterialNode
    | PageBreakNode
    | QuoteNode
)
