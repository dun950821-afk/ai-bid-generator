# backend/apps/generation/management/commands/update_requirement_extraction_prompts.py
"""更新条款抽取提示词模板（7 个模板统一加标题规则）。

参考 update_outline_prompt.py 的模式：为现有部署的 7 个条款抽取模板创建 v2.0 版本并 publish。
命令幂等，可重复执行。
"""

import copy

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.generation.constants import PromptVersionStatus
from apps.generation.models import PromptTemplate, PromptVersion


# 标题规则段 —— 与 seed_prompts.py 中的 CLAUSE_TITLE_RULES 保持一致
CLAUSE_TITLE_RULES = """**条款标题规则**：
1. title 必须有值，不得为空字符串
2. 优先使用原文中的小节/段落标题（如「资格要求」「付款方式」「投标截止时间」）
3. 原文无明确标题时，由你基于 content 概括生成不超过 10 个字的简短标题
4. 不得直接复制 content 全文作为 title
5. title 应能让评审人快速识别该条款要点，避免「其他」「相关要求」等模糊表述"""

TITLE_DESC = "条款标题（≤10字，优先原文小节标题，原文无标题时概括生成）"

# 解析分块参考段说明 —— 与 seed_prompts.py 保持一致
CHUNK_CONTEXT_PROMPT_SECTION = """**解析分块参考**（带章节路径和页码的结构化分块，辅助定位）：
{{ chunk_context }}"""

# 7 个模板的更新数据
TEMPLATES_TO_UPDATE = [
    {
        "key": "requirement_extraction.default",
        "system_prompt_append": CLAUSE_TITLE_RULES,
        "title_description": TITLE_DESC,
        "title_in_required": True,  # 该模板原本 required 缺 title
    },
    {
        "key": "requirement_extraction_scoring.default",
        "system_prompt_append": CLAUSE_TITLE_RULES,
        "title_description": TITLE_DESC,
        "title_in_required": False,  # V2 模板 required 已含 title
    },
    {
        "key": "requirement_extraction_mandatory.default",
        "system_prompt_append": CLAUSE_TITLE_RULES,
        "title_description": TITLE_DESC,
        "title_in_required": False,
    },
    {
        "key": "requirement_extraction_qualification.default",
        "system_prompt_append": CLAUSE_TITLE_RULES,
        "title_description": TITLE_DESC,
        "title_in_required": False,
    },
    {
        "key": "requirement_extraction_commercial.default",
        "system_prompt_append": CLAUSE_TITLE_RULES,
        "title_description": TITLE_DESC,
        "title_in_required": False,
    },
    {
        "key": "requirement_extraction_technical.default",
        "system_prompt_append": CLAUSE_TITLE_RULES,
        "title_description": TITLE_DESC,
        "title_in_required": False,
    },
    {
        "key": "requirement_extraction_submission.default",
        "system_prompt_append": CLAUSE_TITLE_RULES,
        "title_description": TITLE_DESC,
        "title_in_required": False,
    },
]


class Command(BaseCommand):
    help = "更新条款抽取提示词模板（7 个模板统一加标题规则）"

    @transaction.atomic
    def handle(self, *args, **options):
        updated_count = 0
        skipped_count = 0

        for tmpl_data in TEMPLATES_TO_UPDATE:
            template = PromptTemplate.objects.filter(key=tmpl_data["key"]).first()
            if not template:
                self.stdout.write(self.style.WARNING(
                    f"未找到模板 {tmpl_data['key']}，跳过"
                ))
                skipped_count += 1
                continue

            # 获取当前 published 版本作为基础
            current_published = PromptVersion.objects.filter(
                template=template,
                status=PromptVersionStatus.PUBLISHED,
            ).first()

            if current_published:
                base_system_prompt = current_published.system_prompt
                base_user_prompt = current_published.user_prompt
                base_output_schema = current_published.output_schema or {}
                base_variable_schema = current_published.variable_schema or {}
            else:
                self.stdout.write(self.style.WARNING(
                    f"模板 {tmpl_data['key']} 无 published 版本，跳过"
                ))
                skipped_count += 1
                continue

            # 在 system_prompt 末尾追加标题规则段（如果尚未追加）
            if "条款标题规则" not in base_system_prompt:
                new_system_prompt = base_system_prompt.rstrip() + "\n\n" + tmpl_data["system_prompt_append"]
            else:
                new_system_prompt = base_system_prompt

            # 更新 user_prompt：插入解析分块参考段（如果尚未包含）
            if "{{ chunk_context }}" not in base_user_prompt:
                # 在 {{ document_text }} 之后插入分块段
                if "{{ document_text }}" in base_user_prompt:
                    new_user_prompt = base_user_prompt.replace(
                        "{{ document_text }}",
                        "{{ document_text }}\n\n" + CHUNK_CONTEXT_PROMPT_SECTION,
                    )
                else:
                    # 旧版 requirement_extraction.default 用 chunk_content，不插入分块段
                    new_user_prompt = base_user_prompt
            else:
                new_user_prompt = base_user_prompt

            # 更新 output_schema
            new_output_schema = self._update_schema(
                base_output_schema,
                tmpl_data["title_description"],
                tmpl_data["title_in_required"],
            )

            # 更新 variable_schema：加 chunk_context 属性
            new_variable_schema = self._update_variable_schema(base_variable_schema)

            # 创建或更新版本 2.0
            existing_v2 = PromptVersion.objects.filter(
                template=template, version="2.0"
            ).first()

            if existing_v2:
                existing_v2.system_prompt = new_system_prompt
                existing_v2.user_prompt = new_user_prompt
                existing_v2.output_schema = new_output_schema
                existing_v2.variable_schema = new_variable_schema
                existing_v2.changelog = "增加条款标题规则，title 加入 required，title description 统一，user_prompt 加解析分块参考段，variable_schema 加 chunk_context"
                existing_v2.save()
                version = existing_v2
                self.stdout.write(f"更新版本 2.0 (ID={version.id}) for {tmpl_data['key']}")
            else:
                version = PromptVersion.objects.create(
                    template=template,
                    version="2.0",
                    system_prompt=new_system_prompt,
                    user_prompt=new_user_prompt,
                    output_schema=new_output_schema,
                    variable_schema=new_variable_schema,
                    changelog="增加条款标题规则，title 加入 required，title description 统一，user_prompt 加解析分块参考段，variable_schema 加 chunk_context",
                    status=PromptVersionStatus.DRAFT,
                )
                self.stdout.write(f"创建版本 2.0 (ID={version.id}) for {tmpl_data['key']}")

            # 发布新版本
            version.publish()
            self.stdout.write(self.style.SUCCESS(
                f"已发布 {tmpl_data['key']} v2.0"
            ))
            updated_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"\n完成：更新 {updated_count} 个模板，跳过 {skipped_count} 个"
        ))

    def _update_variable_schema(self, schema: dict) -> dict:
        """更新 variable_schema：加 chunk_context 属性。"""
        new_schema = copy.deepcopy(schema)
        properties = new_schema.get("properties", {})
        if "chunk_context" not in properties:
            properties["chunk_context"] = {
                "type": "string",
                "description": "解析分块参考（带章节路径和页码的结构化分块）",
            }
        return new_schema

    def _update_schema(
        self,
        schema: dict,
        title_description: str,
        title_in_required: bool,
    ) -> dict:
        """更新 output_schema：title 字段加 description，必要时加入 required。"""
        new_schema = copy.deepcopy(schema)

        properties = new_schema.get("properties", {})
        for array_key in ("requirements", "items"):
            if array_key not in properties:
                continue
            array_def = properties[array_key]
            items_def = array_def.get("items", {})
            item_props = items_def.get("properties", {})

            if "title" in item_props:
                if isinstance(item_props["title"], dict):
                    item_props["title"]["description"] = title_description
                else:
                    item_props["title"] = {"type": "string", "description": title_description}

            if title_in_required:
                required = items_def.get("required", [])
                if "title" not in required:
                    required.append("title")
                    items_def["required"] = required

        return new_schema
