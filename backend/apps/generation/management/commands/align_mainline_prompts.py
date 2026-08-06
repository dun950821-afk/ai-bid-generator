# backend/apps/generation/management/commands/align_mainline_prompts.py
"""对齐主链路提示词模板（大纲 → 章节生成主链路全量对齐）。

参照 update_requirement_extraction_prompts.py 的版本发布模式：
1. 为 11 个主链路模板创建 v2.0 并 publish（文本直接取自 seed 定义，不重复维护）；
2. section_content_generation.antiai 版本归档 + 模板停用（解决双模板仲裁）；
3. requirement_extraction_scoring 以 DB 现有 3.2 draft 为底补充评分要求规则后发布；
4. 停用遗留模板（is_active=False，不删数据）。

命令幂等，可重复执行。
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.generation.constants import PromptVersionStatus
from apps.generation.models import PromptTemplate, PromptVersion


# 11 个主链路模板（文本取自 seed 定义，见 handle 中的 seed_defs）
MAINLINE_KEYS = [
    "outline_requirement_groups.default",
    "outline_children.default",
    "outline_review.default",
    "global_fact_extract.default",
    "global_fact_supplement.default",
    "global_fact_finalize.default",
    "section_content_plan.default",
    "section_content_generation.default",
    "section_expand.default",
    "consistency_repair.default",
    "table_cleanup.default",
]

MAINLINE_V2_CHANGELOG = "主链路模板对齐 OpenBidKit（详见 docs 提示词对齐计划），由 align_mainline_prompts 命令发布"

# 遗留模板：停用但不删数据
LEGACY_KEYS = [
    "outline_generation.default",
    "section_writing.default",
    "requirement_analysis.default",
    "requirement_extraction.default",  # 旧分块版
]

# requirement_extraction_scoring 3.2 需补充的规则段
SCORING_RULE_TEXT = (
    "评审程序、评标办法说明、计分公式推导等规则性文字属于评分要求，"
    "只作为评分细项的约束内容参考，不得单独提取为评分大类"
)
SCORING_RULE_MARKER = "不得单独提取为评分大类"


class Command(BaseCommand):
    help = "对齐主链路提示词模板（建 v2.0、归档 antiai、发布 scoring 3.2、停用遗留模板）"

    @transaction.atomic
    def handle(self, *args, **options):
        # 延迟 import seed 定义，保证模板文本只有一份来源
        from apps.generation.management.commands.seed_prompts import (
            Command as SeedCommand,
        )

        seed_defs = {t["key"]: t for t in SeedCommand()._get_builtin_templates()}

        self._align_mainline(seed_defs)
        self._retire_antiai()
        self._publish_scoring_32()
        self._deactivate_legacy()

        self.stdout.write(self.style.SUCCESS("\n主链路模板对齐完成"))

    # ==================================================================
    # 1. 11 个主链路模板建 v2.0 并 publish
    # ==================================================================
    def _align_mainline(self, seed_defs: dict) -> None:
        for key in MAINLINE_KEYS:
            template = PromptTemplate.objects.filter(key=key).first()
            if not template:
                self.stdout.write(self.style.WARNING(f"未找到模板 {key}，跳过"))
                continue

            seed_def = seed_defs[key]
            version, created = PromptVersion.objects.get_or_create(
                template=template,
                version="2.0",
                defaults={
                    "system_prompt": seed_def["system_prompt"],
                    "user_prompt": seed_def["user_prompt"],
                    "output_schema": seed_def.get("output_schema", {}),
                    "variable_schema": seed_def.get("variable_schema", {}),
                    "changelog": MAINLINE_V2_CHANGELOG,
                    "status": PromptVersionStatus.DRAFT,
                },
            )
            if not created:
                # 幂等：已存在 v2.0 时用 seed 定义覆盖字段（值相同则无实际变更）
                version.system_prompt = seed_def["system_prompt"]
                version.user_prompt = seed_def["user_prompt"]
                version.output_schema = seed_def.get("output_schema", {})
                version.variable_schema = seed_def.get("variable_schema", {})
                version.changelog = MAINLINE_V2_CHANGELOG
                version.save()

            version.publish()
            action = "创建并发布" if created else "更新并发布"
            self.stdout.write(self.style.SUCCESS(f"{action} {key} v2.0"))

    # ==================================================================
    # 2. section_content_generation.antiai 版本归档 + 模板停用
    # ==================================================================
    def _retire_antiai(self) -> None:
        template = PromptTemplate.objects.filter(
            key="section_content_generation.antiai"
        ).first()
        if not template:
            self.stdout.write("未找到 section_content_generation.antiai，跳过")
            return

        archived = PromptVersion.objects.filter(
            template=template, status=PromptVersionStatus.PUBLISHED
        ).update(status=PromptVersionStatus.ARCHIVED)
        if template.is_active:
            template.is_active = False
            template.save(update_fields=["is_active"])
        self.stdout.write(self.style.SUCCESS(
            f"section_content_generation.antiai 已停用（归档 {archived} 个 published 版本）"
        ))

    # ==================================================================
    # 3. requirement_extraction_scoring 以 3.2 draft 为底补充规则后发布
    # ==================================================================
    def _publish_scoring_32(self) -> None:
        template = PromptTemplate.objects.filter(
            key="requirement_extraction_scoring.default"
        ).first()
        if not template:
            self.stdout.write(self.style.WARNING(
                "未找到 requirement_extraction_scoring.default，跳过"
            ))
            return

        version = PromptVersion.objects.filter(
            template=template, version="3.2"
        ).first()
        if not version:
            self.stdout.write(self.style.WARNING(
                "requirement_extraction_scoring 无 3.2 版本，跳过（线上 3.x 由 update 命令维护）"
            ))
            return

        # 幂等：已含类似表述则不重复追加
        if SCORING_RULE_MARKER not in version.system_prompt:
            version.system_prompt = (
                version.system_prompt.rstrip() + "\n\n" + SCORING_RULE_TEXT
            )
            version.save(update_fields=["system_prompt"])
            self.stdout.write("已在 scoring 3.2 system_prompt 末尾追加评分要求规则")
        else:
            self.stdout.write("scoring 3.2 已包含评分要求规则，跳过追加")

        if version.status != PromptVersionStatus.PUBLISHED:
            version.publish()
        self.stdout.write(self.style.SUCCESS(
            "已发布 requirement_extraction_scoring.default v3.2"
        ))

    # ==================================================================
    # 4. 停用遗留模板（不删数据；content_matrix_generation v1 保留）
    # ==================================================================
    def _deactivate_legacy(self) -> None:
        for key in LEGACY_KEYS:
            template = PromptTemplate.objects.filter(key=key).first()
            if not template:
                self.stdout.write(self.style.WARNING(f"未找到模板 {key}，跳过"))
                continue
            if template.is_active:
                template.is_active = False
                template.save(update_fields=["is_active"])
                self.stdout.write(self.style.SUCCESS(f"已停用遗留模板 {key}"))
            else:
                self.stdout.write(f"遗留模板 {key} 已是停用状态")
