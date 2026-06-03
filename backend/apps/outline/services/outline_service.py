# backend/apps/outline/services/outline_service.py
"""大纲管理服务。"""

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.outline.constants import OutlineSource, OutlineStatus
from apps.outline.models import Outline, Section, PresetOutlineTemplate


class OutlineService:
    """大纲管理服务。"""

    @transaction.atomic
    def create_from_preset(
        self,
        lot_id: int,
        template_id: int,
        name: str | None = None,
        created_by=None,
    ) -> Outline:
        """从预设模板创建大纲。

        事务内：
        1. 校验 lot.project 一致性
        2. 将同 lot 下其他 Outline.is_current 置为 False
        3. 创建新 Outline
        4. 复制模板章节到 Section
        """
        from apps.projects.models import Lot

        lot = Lot.objects.select_related("project").get(pk=lot_id)
        project = lot.project
        template = PresetOutlineTemplate.objects.get(pk=template_id, is_active=True)

        # 置空其他当前大纲
        Outline.objects.filter(lot=lot, is_current=True).update(is_current=False)

        # 创建大纲
        outline = Outline.objects.create(
            project=project,
            lot=lot,
            name=name or f"{lot.name} - {template.name}",
            source=OutlineSource.PRESET,
            status=OutlineStatus.DRAFT,
            is_current=True,
            created_by=created_by,
        )

        # 复制模板章节
        self._copy_template_sections(outline, template)

        return outline

    @transaction.atomic
    def create_from_ai(
        self,
        tender_file_id: int,
        sections_data: list[dict],
        name: str | None = None,
        created_by=None,
    ) -> Outline:
        """AI解析招标文件生成大纲。

        校验：
        - TenderFile 必须绑定 Lot

        Args:
            tender_file_id: 招标文件ID
            sections_data: AI解析返回的章节列表 [{"title": "...", "level": 1}, ...]
            name: 大纲名称（可选）
            created_by: 创建人
        """
        from apps.tender.models import TenderFile

        tender_file = TenderFile.objects.select_related("project", "lot").get(
            pk=tender_file_id
        )

        # 校验：tender_file.lot 必不为空
        if not tender_file.lot:
            raise ValidationError({"tender_file": "招标文件必须绑定标段"})

        lot = tender_file.lot
        project = tender_file.project

        # 置空其他当前大纲
        Outline.objects.filter(lot=lot, is_current=True).update(is_current=False)

        # 创建大纲
        outline = Outline.objects.create(
            project=project,
            lot=lot,
            name=name or f"{lot.name} - AI解析大纲",
            source=OutlineSource.AI_GENERATED,
            source_tender_file=tender_file,
            status=OutlineStatus.DRAFT,
            is_current=True,
            created_by=created_by,
        )

        # 创建章节
        self._create_sections_from_ai_result(outline, sections_data)

        return outline

    def _copy_template_sections(self, outline: Outline, template: PresetOutlineTemplate):
        """复制模板章节到大纲。"""
        from apps.outline.models import PresetSectionTemplate

        template_sections = PresetSectionTemplate.objects.filter(
            template=template
        ).order_by("sort_order")

        for ts in template_sections:
            Section.objects.create(
                outline=outline,
                parent=None,  # 第一版不支持复制嵌套结构
                title=ts.title,
                level=ts.level,
                sort_order=ts.sort_order,
            )

    def _create_sections_from_ai_result(
        self, outline: Outline, sections_data: list[dict]
    ):
        """从 AI 解析结果创建章节。"""
        for idx, section_data in enumerate(sections_data):
            Section.objects.create(
                outline=outline,
                parent=None,  # 第一版扁平结构
                title=section_data.get("title", ""),
                level=section_data.get("level", 1),
                sort_order=idx,
            )

    def set_current(self, outline_id: int) -> Outline:
        """设置大纲为当前大纲。"""
        outline = Outline.objects.get(pk=outline_id)

        with transaction.atomic():
            # 置空其他当前大纲
            Outline.objects.filter(lot=outline.lot, is_current=True).update(
                is_current=False
            )
            # 设置当前
            outline.is_current = True
            outline.save()

        return outline