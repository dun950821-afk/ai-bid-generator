# backend/scripts/create_prompt_v3_2_drafts.py
"""创建条款抽取 3.2 提示词草稿（仅 scoring / technical）。

3.2 解决「表格断裂」与「多文件合并」问题（2026-08-04 评审通过）：
- scoring：解析后评分表可能断裂为多个片段（表头与行分离、顺序错乱、重复出现），
  必须合并重建完整评分体系，不得因表格断裂返回空结果
- technical：招标文件可能包含多个文件（主文件 + 技术规范书附件），
  文档内容为多文件合并，需完整提取所有文件中的技术要求

- 创建 version="3.2" DRAFT，绝不自动发布；4 场景（mandatory/qualification/commercial/submission）3.1 不动
- 幂等：模板已有 3.2 DRAFT 时跳过（可用 --force 删除重建）
- 用法（与 v3_1 一致）: 容器内 DJANGO_SETTINGS_MODULE 已预设后
  PYTHONPATH=/app python /tmp/create_prompt_v3_2_drafts.py [--force]
"""

import os
import sys

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")
django.setup()

from apps.generation.constants import PromptVersionStatus
from apps.generation.models import PromptTemplate, PromptVersion

# scenario → 追加到 system_prompt 的说明段（仅 scoring / technical）
V3_2_INSTRUCTIONS = {
    "requirement_extraction_scoring": (
        "评分标准常以表格形式存在，解析后可能断裂为多个片段"
        "（表头与行分离、顺序错乱、重复出现），必须合并重建完整评分体系，"
        "不得因表格断裂返回空结果。"
    ),
    "requirement_extraction_technical": (
        "招标文件可能包含多个文件（主文件 + 技术规范书附件），"
        "文档内容为多文件合并，需完整提取所有文件中的技术要求。"
    ),
}


def create_v32_drafts(force=False, created_by=None):
    """为 V3_2_INSTRUCTIONS 中每个场景创建 3.2 草稿。

    - base 取该模板已发布 3.1 的最新版本（order_by("-id").first()）
    - system_prompt 在 3.1 基础上追加场景说明，其余字段照搬 base
    - 返回 (created, skipped)：created 为已建场景列表，skipped 为 SKIP 原因列表
    """
    created, skipped = [], []
    for scenario, instruction in V3_2_INSTRUCTIONS.items():
        template = PromptTemplate.objects.filter(scenario=scenario).first()
        if not template:
            skipped.append(f"{scenario}: 模板不存在")
            continue
        base = (
            PromptVersion.objects
            .filter(template=template, version="3.1", status=PromptVersionStatus.PUBLISHED)
            .order_by("-id")
            .first()
        )
        if not base:
            skipped.append(f"{scenario}: 无已发布 3.1 版本")
            continue

        if force:
            PromptVersion.objects.filter(
                template=template, version="3.2", status=PromptVersionStatus.DRAFT
            ).delete()

        if PromptVersion.objects.filter(
            template=template, version="3.2", status=PromptVersionStatus.DRAFT
        ).exists():
            skipped.append(f"{scenario}: 3.2 草稿已存在（--force 重建）")
            continue

        PromptVersion.objects.create(
            template=template,
            version="3.2",
            status=PromptVersionStatus.DRAFT,
            system_prompt=(base.system_prompt + "\n\n" + instruction).strip(),
            user_prompt=base.user_prompt,
            output_schema=base.output_schema,
            variable_schema=base.variable_schema,
            changelog="3.2: " + instruction[:40],
            created_by=created_by or base.created_by,
        )
        created.append(scenario)
    return created, skipped


def main():
    force = "--force" in sys.argv
    admin = None
    from apps.accounts.models import User

    admin = User.objects.filter(is_superuser=True).first()
    created, skipped = create_v32_drafts(force=force, created_by=admin)
    for reason in skipped:
        print(f"SKIP {reason}")
    for scenario in created:
        print(f"CREATED {scenario} 3.2 draft")
    print(f"done. created={created} skipped={skipped}")


if __name__ == "__main__":
    main()
