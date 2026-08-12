# -*- coding: utf-8 -*-
"""Phase 0 验证脚本: 常熟农商银行招标文件 → 响应格式识别可行性验证。

Step 1 (--step parse): 从 MinIO 拉取 TenderFile, DocxParser 解析, 保存 markdown,
    定位"第四部分 响应文件格式"与附件 1~8, 输出统计。
Step 2 (--step ai): 基于解析结果调用 LLM, 识别附件 1~8 及每个附件的填充类型,
    输出结构化 JSON 报告。

用法(容器内):
    python scripts/phase0_response_template_analysis.py --step parse
    python scripts/phase0_response_template_analysis.py --step ai
"""

import argparse
import json
import os
import re
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django

django.setup()

from apps.tender.models import TenderFile
from apps.common.services.storage import StorageService
from apps.tender.services.parsers.docx_parser import DocxParser

WORK_DIR = "/tmp/phase0_response"
TENDER_FILE_ID = 44  # 常熟农商银行安全众测服务采购项目邀请招标文件.docx

ANCHOR_PATTERNS = [
    ("第四部分", r"第四部分"),
    ("响应文件格式", r"响应文件格式"),
]
ATTACHMENT_PATTERNS = [
    ("附件1", r"附件\s*1[、.．:]"),
    ("附件2", r"附件\s*2[、.．:]"),
    ("附件3", r"附件\s*3[、.．:]"),
    ("附件4", r"附件\s*4[、.．:]"),
    ("附件5", r"附件\s*5[、.．:]"),
    ("附件6", r"附件\s*6[、.．:]"),
    ("附件7", r"附件\s*7[、.．:]"),
    ("附件8", r"附件\s*8[、.．:]"),
]


def load_markdown() -> str:
    """从 MinIO 拉取并解析, 返回 markdown; 已存在则直接读缓存。"""
    os.makedirs(WORK_DIR, exist_ok=True)
    md_path = os.path.join(WORK_DIR, "tender_44.md")
    if os.path.exists(md_path):
        with open(md_path, encoding="utf-8") as f:
            return f.read()

    tf = TenderFile.objects.get(pk=TENDER_FILE_ID)
    print(f"[parse] TenderFile#{tf.id} {tf.original_name} status={tf.status}")
    storage = StorageService()
    content = storage.get_object(tf.object_key)
    print(f"[parse] 原始文件大小: {len(content)} bytes")

    result = DocxParser().parse(content, tf.original_name)
    print(f"[parse] 解析引擎={result.parse_engine} 质量={result.parse_quality} 页数={result.page_count}")
    print(f"[parse] markdown 长度: {len(result.markdown)} 字符")

    with open(md_path, "w", encoding="utf-8") as f:
        f.write(result.markdown)
    print(f"[parse] markdown 已保存: {md_path}")
    return result.markdown


def locate_section(md: str):
    """定位"第四部分 响应文件格式"区域并输出附件 1~8 命中情况。"""
    print("\n===== Step 1: 章节与附件定位 =====")
    # 找"第四部分 响应文件格式"
    part_match = None
    for label, pattern in ANCHOR_PATTERNS:
        m = re.search(pattern, md)
        if m:
            print(f"[locate] 命中: {label} @ char {m.start()}")
            part_match = m
        else:
            print(f"[locate] 未命中: {label}")

    # 附件命中(全文档)
    hits = []
    for label, pattern in ATTACHMENT_PATTERNS:
        for m in re.finditer(pattern, md):
            line_start = md.rfind("\n", 0, m.start()) + 1
            line_end = md.find("\n", m.start())
            if line_end == -1:
                line_end = len(md)
            line = md[line_start:line_end].strip()[:80]
            hits.append((label, m.start(), line))
            break  # 每个附件只记录第一次命中
    print("\n[locate] 附件命中(第一次出现):")
    for label, pos, line in hits:
        print(f"  {label} @ char {pos}: {line}")

    # 输出"第四部分"之后的预览(前 3000 字符)
    if part_match:
        start = part_match.start()
        preview = md[start:start + 3000]
        print("\n[locate] '第四部分' 之后 3000 字符预览:")
        print("=" * 60)
        print(preview)
        print("=" * 60)


SYSTEM_PROMPT = """你是投标响应文件模板分析专家。招标文件中的"响应文件格式"部分是要求响应人按固定格式填写的模板。
系统需要自动识别每个附件中"需要处理"的填充位置，以便后续自动/半自动填充生成投标文件。

填充位置类型定义（type 字段，必须从以下枚举中选）：
- FIXED: 招标方固定文字/承诺条款，不可修改，原样保留（识别出段落主题即可，不用逐字输出）
- AUTO_FIELD: 企业信息/项目信息可自动填写的字段（公司名称、地址、电话、邮编、日期、金额大写等）
- AI_GENERATE: 需要 AI 根据项目需求生成的正文/表格内容（工作项清单、方案描述等）
- AI_RESPONSE: 招标条款逐条应答表（要求→响应情况→是否偏离）
- DATA_TABLE: 企业数据表格（基本情况表等，按字段映射填充）
- REPEAT_TABLE: 需要复制行的表格（案例列表等，一行一个案例）
- REPEAT_BLOCK: 需要整块复制的重复区块（人员简历等，一人一块）
- MATERIAL_SLOT: 材料粘贴处（营业执照、资质证书、社保证明等）
- MANUAL: 必须人工填写（无自动数据源）
- PRICE: 报价相关内容（通常需要人工确认，可能要求单独密封）

输出要求：
- 只输出 JSON，不要任何其他文字
- attachment_no: 附件编号
- title: 附件标题
- overall_type: 该附件整体类型（FORM=信函表单 / TABLE=表格 / PACKAGE=组合包 / DOCUMENT=说明文档）
- confidence: 0~1 的整体识别置信度
- separate_package: 该附件是否要求单独密封/单独装订（true/false）
- fields: 需要处理的填充位置列表，按出现顺序
- fields[].label: 填充位置的名称或原文摘录（20字内）
- fields[].type: 上面的枚举之一
- fields[].confidence: 0~1 单个位置的置信度
- fields[].note: 简短说明（例如对应企业数据的哪个字段、材料类型、AI 生成依据等）

规则：
- 只识别"需要响应人处理"的位置，纯叙述性介绍文字不要列入
- FIXED 段落最多列 3 条，代表整体即可
- 表格如果整表是待填结构，识别表格本身即可，不必把每个空 cell 都列出来
"""

USER_PROMPT_TEMPLATE = """以下是招标文件《常熟农商银行安全众测服务采购项目邀请招标文件》"第四部分 响应文件格式"中的一个附件（响应模板片段）。

请分析该附件，识别所有需要处理的填充位置，输出 JSON：

【附件内容开始】
{attachment_content}
【附件内容结束】
"""

FIELD_TYPE_MAP = {
    "FIXED": "固定内容",
    "AUTO_FIELD": "企业自动字段",
    "AI_GENERATE": "AI生成内容",
    "AI_RESPONSE": "条款应答",
    "DATA_TABLE": "企业数据表",
    "REPEAT_TABLE": "重复行表格",
    "REPEAT_BLOCK": "重复块",
    "MATERIAL_SLOT": "材料插槽",
    "MANUAL": "人工填写",
    "PRICE": "报价",
}


def split_attachments(md: str) -> list[dict]:
    """按 `^## 附件N：` 切分附件。返回 [{no, title, content}]。"""
    marker_re = re.compile(r"^## (附件\d+[：:])(.+)$", re.M)
    matches = list(marker_re.finditer(md))
    blocks = []
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(md)
        content = md[m.start():end].strip()
        title = m.group(2).strip()
        blocks.append({"no": m.group(1).rstrip("：:"), "title": title, "content": content})
    return blocks


def analyze_attachment(llm, model_config, attachment: dict) -> dict:
    """单个附件调用 LLM 识别。"""
    user_prompt = USER_PROMPT_TEMPLATE.format(attachment_content=attachment["content"])
    resp = llm.chat(
        model_config,
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        response_format={"type": "json_object"},
    )
    try:
        result = resp.json
    except Exception:
        result = json.loads(resp.text)
    result["_meta"] = {
        "prompt_tokens": resp.prompt_tokens,
        "completion_tokens": resp.completion_tokens,
        "latency_ms": resp.latency_ms,
    }
    return result


def run_ai_analysis(md: str) -> dict:
    """Step 2: 分附件 AI 识别, 返回汇总报告。"""
    from apps.generation.services.llm_service import LLMService
    from apps.generation.models import ModelConfig
    from apps.generation.constants import ModelType

    print("===== Step 2: AI 响应模板识别 =====")
    attachments = split_attachments(md)
    print(f"[ai] 切分出 {len(attachments)} 个附件:")
    for a in attachments:
        print(f"  {a['no']} {a['title']} ({len(a['content'])} 字符)")

    model_config = ModelConfig.objects.get(
        model_type=ModelType.CHAT, is_default=True, is_active=True
    )
    print(f"[ai] 使用模型: {model_config.provider.provider_type} / {model_config.model_name}")

    llm = LLMService()
    results = []
    for i, attachment in enumerate(attachments, 1):
        print(f"[ai] 分析 {attachment['no']} ({i}/{len(attachments)}) ...", flush=True)
        try:
            result = analyze_attachment(llm, model_config, attachment)
            results.append(result)
            meta = result.get("_meta", {})
            fields = result.get("fields", [])
            print(
                f"[ai]   → 整体类型={result.get('overall_type')} "
                f"置信度={result.get('confidence')} 字段数={len(fields)} "
                f"tokens={meta.get('total_tokens', '-')} 耗时={meta.get('latency_ms', 0) / 1000:.1f}s"
            )
        except Exception as exc:
            print(f"[ai]   ✗ 失败: {exc}")
            results.append({
                "attachment_no": attachment["no"],
                "title": attachment["title"],
                "error": str(exc),
            })

    # 汇总
    report = build_report(results, attachments)
    return report


def build_report(results: list[dict], attachments: list[dict]) -> dict:
    """汇总识别结果: 类型统计 + 字段清单 + 人工预期对比。"""
    # 人工预期(验证用,不参与 AI 调用)
    expected = {
        "附件1": {"overall_type": "FORM", "fields": ["AUTO_FIELD", "FIXED", "MANUAL"]},
        "附件2": {"overall_type": "FORM", "fields": ["AUTO_FIELD", "MANUAL"]},
        "附件3": {"overall_type": "TABLE", "fields": ["DATA_TABLE", "AUTO_FIELD", "MATERIAL_SLOT"]},
        "附件4": {"overall_type": "TABLE", "fields": ["REPEAT_TABLE"]},
        "附件5": {"overall_type": "PACKAGE", "fields": ["AI_GENERATE", "AI_RESPONSE"]},
        "附件6": {"overall_type": "PACKAGE", "fields": ["REPEAT_TABLE", "REPEAT_BLOCK", "MATERIAL_SLOT"]},
        "附件7": {"overall_type": "FORM", "fields": ["PRICE", "MANUAL"], "separate": True},
        "附件8": {"overall_type": "DOCUMENT", "fields": ["MANUAL"]},
    }

    lines = []
    lines.append("# Phase 0 验证报告: 常熟农商银行响应模板 AI 识别")
    lines.append("")
    lines.append(f"源文件: TenderFile#44 常熟农商银行安全众测服务采购项目邀请招标文件.docx")
    lines.append(f"附件数: {len(results)}")
    lines.append("")

    type_counter = {}
    total_fields = 0
    ok_compare = 0
    conf_sum = 0.0
    conf_n = 0

    for r in results:
        no = r.get("attachment_no", "?")
        title = r.get("title", "")
        if "error" in r:
            lines.append(f"## {no} {title} — ❌ 识别失败: {r['error']}")
            continue
        fields = r.get("fields", [])
        total_fields += len(fields)
        conf = r.get("confidence") or 0
        conf_sum += conf
        conf_n += 1

        # 类型对比
        exp = expected.get(no, {})
        exp_types = set(exp.get("fields", []))
        got_types = {f.get("type") for f in fields if f.get("type")}
        miss = exp_types - got_types
        extra = got_types - exp_types
        match_mark = "✓" if not miss else f"△ 缺:{','.join(sorted(miss))}"
        if extra:
            match_mark += f" +{','.join(sorted(extra))}"
        if not miss and no in expected:
            ok_compare += 1

        lines.append(f"## {no} {title}")
        lines.append(f"- 整体类型: {r.get('overall_type')} | 置信度: {conf:.2f} | 类型对比: {match_mark}")
        if r.get("separate_package"):
            lines.append(f"- ⚠ 单独密封/装订: 是")
        lines.append("")
        lines.append("| # | 填充位置 | 类型 | 置信度 | 说明 |")
        lines.append("|---|---------|------|--------|------|")
        for i, f in enumerate(fields, 1):
            ftype = f.get("type", "?")
            type_counter[ftype] = type_counter.get(ftype, 0) + 1
            label = str(f.get("label", "")).replace("|", "/")[:30]
            note = str(f.get("note", "")).replace("|", "/")[:60]
            lines.append(f"| {i} | {label} | {ftype} | {f.get('confidence', 0):.2f} | {note} |")
        lines.append("")

    lines.append("## 汇总统计")
    lines.append("")
    lines.append(f"- 字段总数: {total_fields}")
    lines.append(f"- 类型分布:")
    for t, c in sorted(type_counter.items(), key=lambda x: -x[1]):
        lines.append(f"  - {t} ({FIELD_TYPE_MAP.get(t, t)}): {c}")
    if conf_n:
        lines.append(f"- 平均整体置信度: {conf_sum / conf_n:.2f}")
    lines.append(f"- 附件级类型对比通过: {ok_compare}/{len(expected)}")
    lines.append("")

    report = {
        "source_file": "TenderFile#44",
        "attachments": results,
        "summary": {
            "total_fields": total_fields,
            "type_distribution": type_counter,
            "avg_confidence": round(conf_sum / conf_n, 2) if conf_n else None,
            "attachment_type_match": f"{ok_compare}/{len(expected)}",
        },
    }
    return {"report_md": "\n".join(lines), "report_json": report}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--step", choices=["parse", "ai"], default="parse")
    args = parser.parse_args()

    md = load_markdown()
    if args.step == "parse":
        locate_section(md)
        print("\n[step1] 完成: 解析 + 章节定位。确认质量后运行 --step ai 做 AI 识别。")
    else:
        report = run_ai_analysis(md)
        md_path = os.path.join(WORK_DIR, "report.md")
        json_path = os.path.join(WORK_DIR, "report.json")
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(report["report_md"])
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(report["report_json"], f, ensure_ascii=False, indent=2)
        print(f"\n[step2] 报告已保存: {md_path}")
        print(f"[step2] JSON 已保存: {json_path}")


if __name__ == "__main__":
    main()
