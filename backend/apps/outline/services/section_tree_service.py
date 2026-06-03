# backend/apps/outline/services/section_tree_service.py
"""章节树维护服务。"""

from django.db import models

from apps.outline.models import Outline, Section


class SectionTreeService:
    """章节树维护服务。"""

    def add_section(
        self,
        outline_id: int,
        parent_id: int | None,
        title: str,
    ) -> Section:
        """添加章节。

        自动计算 level 和 sort_order。
        校验：
        - parent 必须属于同一 outline
        """
        outline = Outline.objects.get(pk=outline_id)

        if parent_id:
            parent = Section.objects.get(pk=parent_id)
            # 校验 parent 属于同一 outline
            if parent.outline_id != outline_id:
                raise ValueError("parent 必须属于同一 outline")
            level = parent.level + 1
        else:
            parent = None
            level = 1

        # 自动计算 sort_order（服务层统一维护）
        max_order = (
            Section.objects.filter(outline_id=outline_id, parent=parent)
            .aggregate(max_order=models.Max("sort_order"))["max_order"]
            or 0
        )

        section = Section.objects.create(
            outline=outline,
            parent=parent,
            title=title,
            level=level,
            sort_order=max_order + 1,
        )
        return section

    def move_section(
        self,
        section_id: int,
        new_parent_id: int | None,
        new_sort_order: int,
    ) -> Section:
        """移动章节。

        校验：
        1. 不能移动到自己
        2. 不能移动到自己的子节点（避免循环）
        3. new_parent 必须属于同一 outline
        4. 重排同级 sort_order（服务层统一维护）
        """
        section = Section.objects.get(pk=section_id)

        # 校验不能移动到自己
        if section_id == new_parent_id:
            raise ValueError("不能移动到自己")

        # 校验不能移动到子节点
        if new_parent_id and self._is_descendant(section_id, new_parent_id):
            raise ValueError("不能移动到自己的子节点")

        # 确定 new_parent
        if new_parent_id:
            new_parent = Section.objects.get(pk=new_parent_id)
            if new_parent.outline_id != section.outline_id:
                raise ValueError("目标章节必须属于同一大纲")
            new_level = new_parent.level + 1
        else:
            new_parent = None
            new_level = 1

        # 重排同级 sort_order
        self._reorder_siblings(section.outline_id, new_parent, new_sort_order)

        # 更新章节
        section.parent = new_parent
        section.level = new_level
        section.sort_order = new_sort_order
        section.save()

        # 递归更新子节点 level
        self._update_children_level(section)

        return section

    def _is_descendant(self, ancestor_id: int, node_id: int) -> bool:
        """检查 node_id 是否是 ancestor_id 的后代。"""
        node = Section.objects.get(pk=node_id)
        while node.parent_id:
            if node.parent_id == ancestor_id:
                return True
            node = node.parent
        return False

    def _reorder_siblings(self, outline_id: int, parent, insert_order: int):
        """重排同级章节的 sort_order，为新插入腾出位置。"""
        siblings = Section.objects.filter(
            outline_id=outline_id,
            parent=parent,
        ).exclude(sort_order=insert_order)

        for sibling in siblings:
            if sibling.sort_order >= insert_order:
                sibling.sort_order += 1
                sibling.save()

    def _update_children_level(self, section: Section):
        """递归更新子节点的 level。"""
        for child in section.children.all():
            child.level = section.level + 1
            child.save()
            self._update_children_level(child)

    def delete_section(self, section_id: int) -> None:
        """删除章节（含子章节）。"""
        section = Section.objects.get(pk=section_id)
        # 级联删除会自动处理子章节（CASCADE）
        section.delete()

    def get_section_tree(self, outline_id: int) -> list[dict]:
        """获取章节树（扁平列表）。"""
        sections = Section.objects.filter(outline_id=outline_id).order_by(
            "sort_order", "id"
        )
        return [
            {
                "id": s.id,
                "title": s.title,
                "level": s.level,
                "sort_order": s.sort_order,
                "parent_id": s.parent_id,
                "status": s.status,
                "generation_status": s.generation_status,
                "word_count": s.word_count,
            }
            for s in sections
        ]

    def get_ancestors(self, section_id: int) -> list[Section]:
        """获取祖先章节（用于生成上下文）。"""
        ancestors = []
        section = Section.objects.get(pk=section_id)
        while section.parent_id:
            section = section.parent
            ancestors.insert(0, section)
        return ancestors

    def get_siblings(self, section_id: int) -> list[Section]:
        """获取同级章节。"""
        section = Section.objects.get(pk=section_id)
        return (
            Section.objects.filter(
                outline=section.outline,
                parent=section.parent,
            )
            .exclude(pk=section_id)
            .order_by("sort_order")
        )