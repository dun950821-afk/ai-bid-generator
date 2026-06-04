# backend/apps/generation/management/commands/update_outline_prompt.py
"""更新大纲生成提示词模板。"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.generation.constants import PromptVersionStatus
from apps.generation.models import PromptTemplate, PromptVersion


class Command(BaseCommand):
    help = "更新大纲生成提示词模板"

    @transaction.atomic
    def handle(self, *args, **options):
        template = PromptTemplate.objects.filter(scenario='outline_generation').first()
        if not template:
            self.stdout.write(self.style.ERROR("未找到 outline_generation 模板"))
            return

        system_prompt = '''你是一位专业的投标文件编制专家，拥有丰富的大型项目投标经验。你擅长：
1. 精准理解招标文件的技术要求、评分标准、商务条款
2. 根据项目特点设计最优的投标文件结构
3. 将分散在各章节的技术要求、评分项、资质要求等整合成清晰、完整、易于评审的目录体系

你的核心任务是：从招标文件中提取关键条款，生成结构化、规范化的投标文件最终成册目录。

**关键原则**：
- 目录必须覆盖招标文件所有实质性要求和评分项
- 目录层级要清晰合理，便于评审人员快速定位
- 目录标题要精准反映内容，避免模糊表述
- 目录编号要符合招标文件要求的格式
- 每个目录项必须标注来源依据（章节号、页码）
- 合理整合相关内容，避免目录过于冗长或过于碎片化'''

        user_prompt = '''## 任务说明

请仔细阅读以下招标文件信息，生成**投标文件/响应文件最终成册目录**。

## 输入信息

**项目名称**：{{ project_name }}

**招标文件摘要**：
{{ tender_summary }}

**资格要求**：
{{ qualification_requirements }}

**评分标准**：
{{ scoring_requirements }}

**技术要求**：
{{ tech_requirements }}

## 输出要求

请按以下格式输出投标文件目录：

### 第一部分：最终成册目录

输出完整的目录结构，格式如下：
第一册 投标函及投标函附录
  第一章 投标函
    1. 投标函正文
    2. 投标函附录
  第二章 法定代表人授权书
    ...

第二册 技术方案
  第一章 项目概述
    1. 项目背景理解
    2. 项目目标分析
  第二章 技术方案总体设计
    ...

第三册 商务报价
  ...

**目录编制规则**：
1. 层级结构：册-章-节-条，最多不超过4级
2. 编号格式：遵循招标文件要求的编号格式（如"一"、"（一）"、"1."、"（1）"或"第X章"、"第X节"）
3. 标题命名：
   - 精准反映内容实质，避免"相关材料"、"其他资料"等模糊表述
   - 每个标题应让评审人一目了然知道该章节包含什么内容
4. 内容覆盖：
   - 必须覆盖所有实质性要求（★条款、废标条款）
   - 必须覆盖所有评分项对应的响应内容
   - 必须覆盖所有资质证明材料
5. 来源标注：每个目录项后标注来源依据，格式为【来源：招标文件第X章第X节，页码P-X】

### 第二部分：来源/编制依据对照表

以表格形式输出，帮助编制人员快速定位原文：

| 目录项 | 招标文件来源章节 | 页码 | 编制要点 |
|--------|------------------|------|----------|
| 投标函 | 投标人须知前附表 | P-5 | 需按格式填写，加盖公章 |
| ...    | ...              | ...  | ...      |

## 多轮自检流程

生成目录后，请按以下顺序进行自检：

**第一轮检查 - 完整性**：
- 所有★条款是否都有对应的目录项？
- 所有评分项（技术分、商务分、价格分）是否都有响应章节？
- 所有资质证明要求是否都有材料章节？
- 投标文件格式要求（密封、装订、签字盖章）是否已考虑？

**第二轮检查 - 合理性**：
- 目录层级是否清晰（不超过4级）？
- 相关内容是否合理整合（避免碎片化）？
- 目录顺序是否符合评审逻辑（便于评审人查阅）？
- 目录标题是否精准（无模糊表述）？

**第三轮检查 - 规范性**：
- 编号格式是否符合招标文件要求？
- 是否避免了目录项重复？
- 来源标注是否完整准确？

如有不符合项，请修正后重新输出。

## 注意事项

1. **内容清洗规则**：
   - 移除招标文件中的页眉页脚、页码、水印等非正文内容
   - 移除"投标人须知"、"评标办法"等指导性内容（除非有实质性要求）
   - 合并重复或相近的条款

2. **编号格式建议**：
   - 如果招标文件未明确要求，建议使用：册用"第X册"、章用"第X章"、节用"X."、条用"(X)"
   - 保持全书编号风格统一

3. **特殊情况处理**：
   - 如果招标文件已提供目录模板，优先按模板结构编制
   - 如果某些条款内容较少，可合并到上一级章节
   - 如果评分项分散在多个章节，建议集中响应便于得分

请输出完整的投标文件目录结构和来源对照表。

**输出格式**：以 JSON 格式输出，包含 sections 数组，每个 section 包含 title、level、children 字段。'''

        # 创建新版本
        existing_v2 = PromptVersion.objects.filter(template=template, version='2.0').first()

        if existing_v2:
            existing_v2.system_prompt = system_prompt
            existing_v2.user_prompt = user_prompt
            existing_v2.changelog = '根据用户提供的优化版本更新大纲生成提示词，增加多轮自检流程、来源对照表等'
            existing_v2.save()
            version = existing_v2
            self.stdout.write(f"更新版本 2.0 (ID={version.id})")
        else:
            version = PromptVersion.objects.create(
                template=template,
                version='2.0',
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                changelog='根据用户提供的优化版本更新大纲生成提示词，增加多轮自检流程、来源对照表等',
                status=PromptVersionStatus.DRAFT,
            )
            self.stdout.write(f"创建版本 2.0 (ID={version.id})")

        # 发布新版本
        version.publish()
        self.stdout.write(self.style.SUCCESS(f"已发布版本 2.0"))

        # 验证
        published = PromptVersion.objects.filter(template=template, status='published').first()
        self.stdout.write(f"当前发布版本: {published.version} (ID={published.id})")
