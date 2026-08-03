"""为条款抽取提示词追加输出字段说明段。

LLM 自由输出时仅返回 title/content/is_mandatory/is_rejection_clause，
缺少 score/source_section/source_page 等字段（代码已读取但无值可落库）。
本命令为 6 个抽取场景的当前 published 版本创建新版本，system_prompt
追加「输出字段说明」段并发布。命令幂等，可重复执行。

用法: python manage.py update_requirement_extraction_fields
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.generation.constants import PromptVersionStatus
from apps.generation.models import PromptTemplate, PromptVersion

FIELD_GUIDE = """**输出字段说明**（items 数组中每个条款对象必须包含以下字段）：
- title: 条款标题（≤10字，遵守标题规则）
- content: 条款完整内容（保留原文含义）
- requirement_type: 条款类型，必须为枚举之一：qualification（资格要求）、tech_req（技术要求）、scoring（评分项）、commercial（商务条款）、submission（投标递交）、legal（合同法律）
- is_mandatory: 是否强制条款，布尔值 true/false
- is_rejection_clause: 是否废标条款（不符合即否决投标），布尔值 true/false
- score: 评分分值，数字（仅评分类条款输出，其余不输出）
- source_text: 原文依据摘录
- source_section: 原文所在章节位置
- source_page: 原文所在页码，数字
- confidence: 置信度，0 到 1 之间的数字"""

SCENARIOS = [
    "requirement_extraction_scoring",
    "requirement_extraction_mandatory",
    "requirement_extraction_qualification",
    "requirement_extraction_commercial",
    "requirement_extraction_technical",
    "requirement_extraction_submission",
]


class Command(BaseCommand):
    help = "为条款抽取提示词追加输出字段说明并发布新版本"

    @transaction.atomic
    def handle(self, *args, **options):
        updated_count = 0
        skipped_count = 0

        for scenario in SCENARIOS:
            template = PromptTemplate.objects.filter(
                scenario=scenario,
                scope="system",
                is_active=True,
            ).first()
            if not template:
                self.stdout.write(self.style.WARNING(f"未找到模板 scenario={scenario}，跳过"))
                skipped_count += 1
                continue

            # 幂等：最新版本已含字段说明则跳过
            latest = PromptVersion.objects.filter(template=template).order_by("-id").first()
            if latest and "输出字段说明" in (latest.system_prompt or ""):
                self.stdout.write(f"已含字段说明，跳过 {scenario}")
                skipped_count += 1
                continue

            current_published = PromptVersion.objects.filter(
                template=template,
                status=PromptVersionStatus.PUBLISHED,
            ).first()
            if not current_published:
                self.stdout.write(self.style.WARNING(f"{scenario} 无 published 版本，跳过"))
                skipped_count += 1
                continue

            new_system_prompt = (
                (current_published.system_prompt or "").rstrip()
                + "\n\n"
                + FIELD_GUIDE
            )

            # 版本号：基于最新版本主号 +1
            major = int(latest.version.split(".")[0]) + 1 if latest else 2
            new_version_num = f"{major}.0"

            version = PromptVersion.objects.create(
                template=template,
                version=new_version_num,
                system_prompt=new_system_prompt,
                user_prompt=current_published.user_prompt,
                output_schema=current_published.output_schema,
                variable_schema=current_published.variable_schema,
                changelog="system_prompt 追加输出字段说明（score/source_section/source_page/is_mandatory 等）",
                status=PromptVersionStatus.DRAFT,
            )
            version.publish()
            self.stdout.write(self.style.SUCCESS(f"已发布 {scenario} v{new_version_num}"))
            updated_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"\n完成：更新 {updated_count} 个场景，跳过 {skipped_count} 个"
        ))
