# -*- coding: utf-8 -*-
"""响应模板识别服务。

流程:
1. 获取招标文件解析产物 markdown(优先 ParsedDocument, 缺失则现场解析);
2. 定位"响应文件格式"章节(标题含"响应文件格式"), 从该处切分附件;
3. 附件切分: 正则 `^#{1,4}\s*附件N[：:]`(Phase 0 验证 100% 可靠, 不依赖 LLM);
4. 逐附件调用 LLM 识别填充位置(AI 只做"类型判断", 不做定位);
5. 规范化 + 落款规则补全 + 低置信度降级;
6. 落库 TenderTemplateBlock, 更新模板状态/统计。

复用: LLMService(DeepSeek) / StorageService / tender 解析链路, 不另起炉灶。
"""

import json
import logging
import re
from typing import Any, Callable, Dict, List, Optional

from django.utils import timezone

from apps.common.services.storage import StorageService
from apps.response_template.constants import (
    ATTACHMENT_HEADING_RE,
    CONFIDENCE_FALLBACK,
    BlockConfirmStatus,
    BlockFillStatus,
    BlockType,
    TemplateStatus,
)
from apps.response_template.models import (
    TenderResponseTemplate,
    TenderTemplateBlock,
)

logger = logging.getLogger(__name__)

# 响应章节标题(定位用)
SECTION_HEADING_RE = re.compile(r"^#{1,6}\s*[^\n]*响应文件格式[^\n]*$", re.M)

# 空位模式(docx 中待填位置的文本形态)
PLACEHOLDER_UNDERLINE = re.compile(r"_{2,}")
PLACEHOLDER_PAREN = re.compile(r"[（(]\s*[^）)]{0,12}[）)]")

# AUTO_FIELD 关键词 → 企业字段绑定规则(CompanyProfile 实际字段)
AUTO_FIELD_BINDING_RULES = [
    (re.compile(r"响应人名称|公司名称|企业名称"), "company.name"),
    (re.compile(r"详细地址|注册地点|注册地址|办公地址|通讯地址"), "company.registered_address"),
    (re.compile(r"地址"), "company.registered_address"),
    (re.compile(r"电话|联系电话"), "company.official_phone"),
    (re.compile(r"邮箱|电子邮箱"), "company.official_email"),
    (re.compile(r"法定代表人|法人姓名"), "company.legal_representative"),
    (re.compile(r"注册资本"), "company.registered_capital"),
    (re.compile(r"成立时间|注册日期"), "company.established_date"),
    (re.compile(r"经营范围"), "company.business_scope"),
    (re.compile(r"项目联系人|联系人"), "company.contact_person"),
    (re.compile(r"项目名称|根据贵方|采购文件规定的|项目采购文件"), "project.name"),
    (re.compile(r"日\s*期|年\s*月\s*日"), "project.bid_date"),
]

SYSTEM_PROMPT = """你是投标响应文件模板分析专家。招标文件中的"响应文件格式"部分是要求响应人按固定格式填写的模板。
系统需要自动识别每个附件中"需要处理"的填充位置，以便后续自动/半自动填充生成投标文件。

填充位置类型定义（type 字段，必须从以下枚举中选）：
- FIXED: 招标方固定文字/承诺条款，不可修改，原样保留（识别出段落主题即可，不用逐字输出）
- AUTO_FIELD: 企业信息/项目信息可自动填写的字段（公司名称、地址、电话、邮编、日期等）
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
- attachment_no: 附件编号，必须是纯数字字符串（如 "1"、"5"）
- title: 附件标题
- overall_type: 该附件整体类型（FORM=信函表单 / TABLE=表格 / PACKAGE=组合包 / DOCUMENT=说明文档）
- confidence: 0~1 的整体识别置信度
- separate_package: 该附件是否要求单独密封/单独装订（true/false）
- fields: 需要处理的填充位置列表，按出现顺序
- fields[].label: 填充位置的名称或**原文摘录**（必须使用原文中的文字，20字内，用于在文档中定位）
- fields[].type: 上面的枚举之一
- fields[].confidence: 0~1 单个位置的置信度
- fields[].note: 简短说明（例如对应企业数据的哪个字段、材料类型、AI 生成依据等）

规则：
- 只识别"需要响应人处理"的位置，纯叙述性介绍文字不要列入
- FIXED 段落最多列 3 条，代表整体即可
- 表格整表是待填结构时，识别表格本身即可，不必把每个空 cell 都列出来
- 重要：DATA_TABLE / REPEAT_TABLE / AI_RESPONSE 等**表格类**字段的 label
  必须使用表格中出现的**原文文字**（如表头第一行文字、第一列行标签，
  如"项目起止年月"、"响应人名称"），不要使用归纳性标题（如"XX表"），
  系统需要靠这些原文在 Word 中定位表格
- 落款处的"响应人（法人公章）""法定代表人签字"等列为 MANUAL，"日期"列为 AUTO_FIELD
"""

USER_PROMPT_TEMPLATE = """以下是招标文件《{tender_name}》"{source_section}"中的一个附件（响应模板片段）。

请分析该附件，识别所有需要处理的填充位置，输出 JSON：

【附件内容开始】
{attachment_content}
【附件内容结束】
"""


class ResponseTemplateAnalyzer:
    """响应模板识别服务。"""

    def __init__(self):
        self.storage = StorageService()

    # ------------------------------------------------------------------
    # 对外入口
    # ------------------------------------------------------------------
    def analyze(
        self, template: TenderResponseTemplate,
        progress_cb: Optional[Callable[[int, str], None]] = None,
    ) -> dict:
        """执行识别, 落库块记录, 更新模板状态。返回统计 dict。

        progress_cb(pct, step) 可选进度回调(队列管理用)。
        """
        template.status = TemplateStatus.ANALYZING
        template.save(update_fields=["status", "updated_at"])

        def _cb(pct: int, step: str):
            if progress_cb:
                progress_cb(pct, step)

        try:
            _cb(5, "解析招标文件")
            md = self._get_markdown(template)
            section_md, section_title = self._locate_section(md)
            attachments = self._split_attachments(section_md)

            if not attachments:
                raise ValueError("未在招标文件中找到'响应文件格式'章节的附件")

            _cb(15, f"定位到 {len(attachments)} 个附件, 开始 AI 识别")
            results, schema = self._analyze_attachments(
                template, attachments,
                progress_cb=progress_cb,
            )
            _cb(85, "识别完成, 写入块记录")
            blocks = self._persist_blocks(template, results, attachments)

            summary = self._build_summary(results, blocks, attachments)
            template.schema_json = schema
            template.summary_json = summary
            template.confidence = summary["avg_confidence"]
            template.source_section = section_title
            template.status = TemplateStatus.ANALYZED
            template.error_message = ""
            template.save(update_fields=[
                "schema_json", "summary_json", "confidence",
                "source_section", "status", "updated_at",
            ])
            logger.info(
                "response template analyzed: template=%s blocks=%s summary=%s",
                template.id, len(blocks), summary,
            )
            return summary
        except Exception as exc:
            template.status = TemplateStatus.FAILED
            template.error_message = f"{type(exc).__name__}: {exc}"[:1000]
            template.save(update_fields=["status", "error_message", "updated_at"])
            logger.exception("response template analyze failed: template=%s", template.id)
            raise

    # ------------------------------------------------------------------
    # 解析产物获取
    # ------------------------------------------------------------------
    def _get_markdown(self, template: TenderResponseTemplate) -> str:
        """优先取 ParsedDocument.markdown_uri, 缺失则现场解析。"""
        pd = template.parsed_document
        if pd and pd.markdown_uri:
            try:
                content = self.storage.get_object(pd.markdown_uri)
                text = content.decode("utf-8", errors="replace")
                if text.strip():
                    return text
            except Exception:
                logger.warning("parsed markdown read failed, fallback to re-parse: %s", pd.markdown_uri)

        # 现场解析原始文件
        from apps.tender.services.parse_service import ParseService

        tf = template.source_file
        raw = self.storage.get_object(tf.object_key)
        result = ParseService()._do_parse(raw, tf.original_name)
        return result.markdown

    # ------------------------------------------------------------------
    # 章节定位 + 附件切分
    # ------------------------------------------------------------------
    def _locate_section(self, md: str):
        """定位响应文件格式章节。返回 (从章节开始的 markdown, 章节标题)。"""
        m = SECTION_HEADING_RE.search(md)
        if m:
            return md[m.start():], m.group(0).strip().lstrip("#").strip()
        # 兜底: 直接从第一个附件标题开始
        m2 = re.search(ATTACHMENT_HEADING_RE, md, re.M)
        if m2:
            return md[m2.start():], "响应文件格式"
        return md, ""

    def _split_attachments(self, md: str) -> list[dict]:
        """按 `## 附件N:` 切分。返回 [{no, title, content}]。"""
        matches = list(re.finditer(ATTACHMENT_HEADING_RE, md, re.M))
        blocks = []
        for i, m in enumerate(matches):
            end = matches[i + 1].start() if i + 1 < len(matches) else len(md)
            content = md[m.start():end].strip()
            if not content:
                continue
            blocks.append({
                "no": m.group(1),
                "title": m.group(2).strip(),
                "content": content,
            })
        return blocks

    # ------------------------------------------------------------------
    # AI 识别
    # ------------------------------------------------------------------
    def _analyze_attachments(
        self, template, attachments: list[dict],
        progress_cb: Optional[Callable[[int, str], None]] = None,
    ) -> tuple[list[dict], list]:
        """逐附件调用 LLM。返回 (识别结果列表, schema 原始输出列表)。"""
        from apps.generation.constants import ModelType
        from apps.generation.models import ModelConfig
        from apps.generation.services.llm_service import LLMService

        model_config = ModelConfig.objects.get(
            model_type=ModelType.CHAT, is_default=True, is_active=True,
        )
        llm = LLMService()
        tender_name = template.source_file.original_name
        source_section = template.source_section or "响应文件格式"

        results = []
        schema = []
        total = max(len(attachments), 1)
        for idx, attachment in enumerate(attachments):
            user_prompt = USER_PROMPT_TEMPLATE.format(
                tender_name=tender_name,
                source_section=source_section,
                attachment_content=attachment["content"],
            )
            try:
                resp = llm.chat(
                    model_config,
                    system_prompt=SYSTEM_PROMPT,
                    user_prompt=user_prompt,
                    response_format={"type": "json_object"},
                )
                data = resp.json if isinstance(resp.json, dict) else json.loads(resp.text)
            except Exception as exc:
                logger.warning("attachment analyze failed: no=%s err=%s", attachment["no"], exc)
                data = {
                    "attachment_no": attachment["no"],
                    "title": attachment["title"],
                    "overall_type": "UNKNOWN",
                    "confidence": 0.0,
                    "fields": [],
                    "error": str(exc)[:300],
                }
            data = self._normalize(data, attachment)
            schema.append(data)
            results.append(data)
            if progress_cb:
                # 15% 基础上, 每个附件推进 (70% / total)
                pct = min(85, 15 + int(70 * (idx + 1) / total))
                progress_cb(pct, f"AI 识别附件 {attachment['no']}({attachment['title'][:16]})")
        return results, schema

    def _normalize(self, data: dict, attachment: dict) -> dict:
        """规范化 AI 输出: attachment_no、字段结构、落款补全、降级、去重。"""
        no = re.sub(r"\D", "", str(data.get("attachment_no", "")))
        data["attachment_no"] = no or attachment["no"]

        fields = []
        seen_labels = set()  # 同附件内按归一化 label 去重(保留首个/高置信度)
        for f in data.get("fields", []):
            if not isinstance(f, dict):
                continue
            ftype = str(f.get("type", "MANUAL")).upper()
            if ftype not in dict(BlockType.CHOICES):
                ftype = "MANUAL"
            conf = float(f.get("confidence") or 0.3)
            label = str(f.get("label", "")).strip()[:100]
            if not label:
                continue
            # 低置信度降级为人工确认
            if conf < CONFIDENCE_FALLBACK:
                ftype = "MANUAL"
            # AI 误判修正: 授权代表等个人信息应为人工填写
            if re.search(r"身份证号|[（(]\s*姓名\s*[）)]", label):
                ftype = "MANUAL"
            # 落款(签字/盖章)标记: 前端折叠展示用, 填充策略不变(人工)
            is_signature = bool(re.search(r"公章|签字|盖章", label))
            label_key = re.sub(r"\s+", "", label)
            if label_key in seen_labels:
                continue
            seen_labels.add(label_key)
            fields.append({
                "label": label,
                "type": ftype,
                "confidence": conf,
                "note": str(f.get("note", ""))[:200],
                "is_signature": is_signature,
            })

        # 落款补全: 附件内容含落款字样但 AI 漏识别时补充
        content = attachment.get("content", "")
        has_signature = any(p in content for p in ["法人公章", "签字或盖章", "签字或盖章处"])
        labels = "".join(f["label"] for f in fields)
        labels_norm = re.sub(r"\s+", "", labels)
        if has_signature and "公章" not in labels:
            fields.append({
                "label": "响应人（法人公章）",
                "type": "MANUAL",
                "confidence": 0.9,
                "note": "落款盖章(规则补全)",
                "is_signature": True,
            })
        # labels_norm: "日    期" 去空白后已是"日期", 避免补出重复日期块
        if "日" in content and re.search(r"日\s*期", content) and "日期" not in labels_norm:
            fields.append({
                "label": "日期",
                "type": "AUTO_FIELD",
                "confidence": 0.9,
                "note": "落款日期(规则补全)",
                "is_signature": False,
            })

        data["fields"] = fields
        return data

    # ------------------------------------------------------------------
    # 落库
    # ------------------------------------------------------------------
    def _persist_blocks(self, template, results: list[dict], attachments: list[dict]) -> list:
        """把识别结果落库为 TenderTemplateBlock。"""
        # 重建(识别是幂等的: 重新识别时清掉旧块)
        template.blocks.all().delete()

        blocks = []
        order = 0
        seen = set()  # (attachment_no, 归一化 label) 兜底去重
        for result in results:
            no = result.get("attachment_no", "?")
            att = next((a for a in attachments if a["no"] == no), None)
            is_sep = bool(result.get("separate_package"))
            for field in result.get("fields", []):
                dedupe_key = (no, re.sub(r"\s+", "", field["label"]))
                if dedupe_key in seen:
                    continue
                seen.add(dedupe_key)
                order += 1
                block = TenderTemplateBlock(
                    template=template,
                    block_key=f"附件{no}-{order:02d}",
                    title=field["label"],
                    block_type=field["type"],
                    order=order,
                    anchor_text=field["label"],
                    anchor_type="text",
                    confidence=field.get("confidence"),
                    source_config={
                        "attachment_no": no,
                        "attachment_title": att["title"] if att else "",
                        "is_signature": bool(field.get("is_signature")),
                    },
                    binding_config=self._build_binding(field),
                    ai_result=field,
                    is_separate_package=is_sep,
                    confirm_status=BlockConfirmStatus.UNCONFIRMED,
                    fill_status=BlockFillStatus.EMPTY,
                )
                block.save()
                blocks.append(block)
        return blocks

    def _build_binding(self, field: dict) -> dict:
        """AUTO_FIELD / DATA_TABLE 按关键词规则绑定企业字段; MATERIAL_SLOT 绑定材料 usage_key。"""
        ftype = field["type"]
        label = field["label"]
        if ftype in (BlockType.AUTO_FIELD, BlockType.DATA_TABLE):
            for pattern, binding in AUTO_FIELD_BINDING_RULES:
                if pattern.search(label):
                    return {"field": binding}
            return {}
        if ftype == BlockType.MATERIAL_SLOT:
            if "营业" in label or "执照" in label:
                return {"usage_key": "business_license"}
            if "资格" in label or "资质" in label:
                return {"usage_key": "qualification_cert"}
            if "社保" in label:
                return {"usage_key": "social_security"}
            return {}
        return {}

    # ------------------------------------------------------------------
    # 统计
    # ------------------------------------------------------------------
    def _build_summary(self, results: list[dict], blocks: list, attachments: list[dict]) -> dict:
        type_dist = {}
        for b in blocks:
            type_dist[b.block_type] = type_dist.get(b.block_type, 0) + 1

        confs = [r.get("confidence") for r in results if isinstance(r.get("confidence"), (int, float))]
        avg_conf = round(sum(confs) / len(confs), 2) if confs else None

        errors = [r.get("error") for r in results if r.get("error")]
        separate = [
            f"附件{r['attachment_no']}" for r in results if r.get("separate_package")
        ]

        return {
            "attachments": len(attachments),
            "attachments_recognized": len(results),
            "fields": len(blocks),
            "type_distribution": type_dist,
            "avg_confidence": avg_conf,
            "separate_attachments": separate,
            "errors": errors,
        }
