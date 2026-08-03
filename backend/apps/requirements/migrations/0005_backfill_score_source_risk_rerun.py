# Generated manually on 2026-08-03 09:40

"""0004 回填迁移因字段名笔误（raw_extracted vs raw_llm_item）空跑，
已在 0004 修正；本迁移对已应用 0004 的环境重新执行回填。
"""

from django.db import migrations


def backfill_from_raw(apps, schema_editor):
    TenderRequirement = apps.get_model("requirements", "TenderRequirement")

    updated = 0
    for req in TenderRequirement.objects.all().iterator():
        raw = req.raw_llm_item or {}
        if not isinstance(raw, dict):
            continue

        fields = {}

        # 分值：LLM 返回 score 且当前为空
        score = raw.get("score")
        if score is not None and not req.score_info:
            fields["score_info"] = {"score": score}

        # 来源：LLM 返回章节/页码且当前为空
        source_section = (raw.get("source_section") or "").strip()
        if source_section and not req.source_section_path:
            fields["source_section_path"] = source_section[:512]
        source_page = raw.get("source_page")
        if source_page is not None and req.source_page_start is None:
            fields["source_page_start"] = source_page

        # 强制/风险：is_rejection_clause → high，is_mandatory → medium
        is_mandatory = bool(raw.get("is_mandatory"))
        is_rejection = bool(raw.get("is_rejection_clause"))
        if is_mandatory or is_rejection:
            if req.mandatory_level == "optional":
                fields["mandatory_level"] = "mandatory"
        if is_rejection and req.risk_level == "unknown":
            fields["risk_level"] = "high"
        elif is_mandatory and req.risk_level == "unknown":
            fields["risk_level"] = "medium"

        if fields:
            for key, value in fields.items():
                setattr(req, key, value)
            req.save(update_fields=list(fields) + ["updated_at"])
            updated += 1

    if updated:
        print(f"[backfill] 回填 {updated} 条条款的 score/来源/风险字段")


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("requirements", "0004_backfill_score_source_risk"),
    ]

    operations = [
        migrations.RunPython(backfill_from_raw, noop),
    ]
