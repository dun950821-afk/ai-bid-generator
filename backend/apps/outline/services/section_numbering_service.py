# backend/apps/outline/services/section_numbering_service.py
"""章节编号计算服务。

显示规则：
- 一级章节：一、二、三、四
- 二级章节：1.1、1.2、2.1、2.2
- 三级章节：1.1.1、1.1.2
"""

from collections import defaultdict


CHINESE_NUMBERS = [
    "", "一", "二", "三", "四", "五",
    "六", "七", "八", "九", "十",
]


def to_chinese_number(num: int) -> str:
    """将 1、2、3 转为 一、二、三。"""
    if num <= 10:
        return CHINESE_NUMBERS[num]

    if num < 20:
        ones = num % 10
        return "十" + (CHINESE_NUMBERS[ones] if ones else "")

    tens = num // 10
    ones = num % 10

    return (
        CHINESE_NUMBERS[tens]
        + "十"
        + (CHINESE_NUMBERS[ones] if ones else "")
    )


import re


def strip_number_prefix(title: str) -> str:
    """去掉标题中的编号前缀，避免重复显示。"""
    if not title:
        return ""

    patterns = [
        r"^第?[一二三四五六七八九十百千万]+[、.．]\s*",  # 中文编号
        r"^\d+(\.\d+)*[、.．]?\s*",  # 阿拉伯数字编号
        r"^（[一二三四五六七八九十]+）\s*",  # 中文括号编号
        r"^\([一二三四五六七八九十]+\)\s*",  # 英文括号编号
    ]

    result = title
    for pattern in patterns:
        result = re.sub(pattern, "", result)

    return result.strip()


class SectionNumberingService:
    """
    章节编号计算服务。

    显示规则：
    - 一级章节：一、二、三、四
    - 二级章节：1.1、1.2、2.1、2.2
    - 三级章节：1.1.1、1.1.2
    """

    def build_number_map(self, sections) -> dict[int, str]:
        """
        构建章节 ID -> 编号的映射。

        Args:
            sections: 章节列表（QuerySet 或 list）

        Returns:
            dict: {section_id: "编号"}
        """
        sections = list(sections)

        # 构建父子关系
        children_map = defaultdict(list)
        roots = []

        for section in sections:
            if section.parent_id:
                children_map[section.parent_id].append(section)
            else:
                roots.append(section)

        # 重要：sort_order 只用于排序，不直接作为编号数字
        roots.sort(key=lambda s: (s.sort_order or 0, s.id))

        for parent_id in children_map:
            children_map[parent_id].sort(
                key=lambda s: (s.sort_order or 0, s.id)
            )

        number_map = {}

        for root_index, root in enumerate(roots, start=1):
            # 一级显示中文（带顿号）
            number_map[root.id] = f"{to_chinese_number(root_index)}、"

            # 子级计算使用阿拉伯数字 root_index
            self._walk_children(
                parent=root,
                parent_numeric_prefix=str(root_index),
                children_map=children_map,
                number_map=number_map,
            )

        return number_map

    def _walk_children(
        self,
        parent,
        parent_numeric_prefix: str,
        children_map: dict,
        number_map: dict,
    ):
        """递归处理子章节编号。"""
        children = children_map.get(parent.id, [])

        for child_index, child in enumerate(children, start=1):
            # 子级编号：父级数字前缀.当前同级序号
            current_number = f"{parent_numeric_prefix}.{child_index}"

            number_map[child.id] = current_number

            # 继续处理更深层级
            self._walk_children(
                parent=child,
                parent_numeric_prefix=current_number,
                children_map=children_map,
                number_map=number_map,
            )

    def get_section_display_title(self, section, number_map: dict[int, str]) -> str:
        """获取带编号的章节标题。"""
        number = number_map.get(section.id, "")
        title = strip_number_prefix(section.title) if section.title else ""

        if number:
            return f"{number}{title}"
        return title
