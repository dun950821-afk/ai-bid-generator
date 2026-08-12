# -*- coding: utf-8 -*-
"""OoxmlFiller v1: 响应模板原位填充引擎。

原则: 修改现有 XML, 不重建 Word。在招标方原始 docx 上按"文本锚点"定位填充,
保留表格边框/列宽/字体/底纹/合并单元格等全部格式。

填充策略(按 block_type):
- FIXED            → 跳过
- AUTO_FIELD       → 文本空位替换(段落/表格cell, 下划线/括号占位)
- DATA_TABLE       → 按行标签定位表格行, 填充空 cell
- MANUAL / PRICE   → 保留原文, 标记 needs_review(生成后由用户填写)
- AI_GENERATE      → LLM 生成内容后替换空位
- AI_RESPONSE      → 从招标条款生成逐条应答, 填充应答表格
- REPEAT_TABLE     → deepcopy 模板数据行 N 份
- MATERIAL_SLOT    → 从材料包取图插入

定位方式 v1(已知限制): 文本锚点 + 归一化匹配(去空白)。
v2 将升级为 Content Control 编译定位(复用 outline template_compiler 协议)。

数据源:
- 企业字段: CompanyProfile(is_default) + Project
- 材料: BidMaterialPackage.get_material_by_usage_key
- AI 内容: LLMService(DeepSeek), 与 generation 共用同一模型配置
"""

import io
import json
import logging
import re
from typing import List, Optional, Tuple

from django.core.files.base import ContentFile

from apps.common.services.storage import StorageService
from apps.response_template.constants import BlockFillStatus, BlockType

logger = logging.getLogger(__name__)

# 空位模式
UNDERLINE_RE = re.compile(r"_{2,}")
PAREN_RE = re.compile(r"[（(]\s*[^）)]{0,12}[）)]")
# "年  月  日" 空格占位(落款日期常见形态)
YEAR_MONTH_DAY_RE = re.compile(r"\s*年\s*\d{0,2}\s*月\s*\d{0,2}\s*日")

# 图片扩展名
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp"}

# 应答状态枚举(风险闸门)
RESPONSE_VALUES = ["完全响应", "部分响应", "偏离", "待确认"]


class FillWarning:
    """填充警告(不阻断生成)。"""

    def __init__(self, block_key: str, message: str):
        self.block_key = block_key
        self.message = message

    def to_dict(self) -> dict:
        return {"block_key": self.block_key, "message": self.message}


class OoxmlFiller:
    """响应模板填充引擎。"""

    def __init__(self):
        self.storage = StorageService()

    # ------------------------------------------------------------------
    # 对外入口
    # ------------------------------------------------------------------
    def fill(
        self, template, blocks: List, trim_anchor: Optional[str] = None,
    ) -> Tuple[ContentFile, List[dict], List]:
        """填充原始 docx。

        Args:
            template: 响应模板
            blocks: 待填充的块
            trim_anchor: 若指定, 生成后删除该锚点之前的所有内容
                        (用于单独密封文档按章节裁剪)

        Returns:
            (ContentFile, warnings, filled_blocks)
        """
        from docx import Document

        raw = self.storage.get_object(template.source_file.object_key)
        doc = Document(io.BytesIO(raw))

        company, project = self._load_data_sources(template)
        material_package = self._load_material_package(template)
        warnings: List[FillWarning] = []
        filled: List = []

        # 有序填充
        ordered = list(blocks)
        for block in ordered:
            try:
                status = self._fill_block(doc, block, company, project, material_package, warnings)
                block.fill_status = status
                block.save(update_fields=["fill_status", "updated_at"])
                if status != BlockFillStatus.SKIPPED:
                    filled.append(block)
            except Exception as exc:
                logger.warning("block fill failed: key=%s err=%s", block.block_key, exc)
                block.fill_status = BlockFillStatus.NEEDS_REVIEW
                block.save(update_fields=["fill_status", "updated_at"])
                warnings.append(FillWarning(block.block_key, f"填充失败: {exc}"))

        # 按章节裁剪(单独密封文档)
        if trim_anchor:
            trimmed = self._trim_to_anchor(doc, trim_anchor)
            if not trimmed:
                warnings.append(FillWarning("TRIM", f"未找到裁剪锚点: {trim_anchor}, 保留完整文档"))

        buffer = io.BytesIO()
        doc.save(buffer)
        buffer.seek(0)
        filename = f"{template.name or '响应文件'}.docx"
        content_file = ContentFile(buffer.read(), name=filename)
        return content_file, [w.to_dict() for w in warnings], filled

    def _trim_to_anchor(self, doc, anchor_text: str) -> bool:
        """删除 anchor 之前的所有 body 元素(保留 sectPr), 实现章节裁剪。"""
        anchor_norm = self._normalize(anchor_text)
        if not anchor_norm:
            return False
        body = doc.element.body
        anchor_el = None
        for el in body:
            text = self._normalize("".join(el.itertext()))
            if anchor_norm in text:
                anchor_el = el
                break
        if anchor_el is None:
            return False
        to_remove = []
        for el in body:
            if el is anchor_el:
                break
            if el.tag == "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}sectPr":
                continue
            to_remove.append(el)
        for el in to_remove:
            body.remove(el)
        return True

    # ------------------------------------------------------------------
    # 数据源
    # ------------------------------------------------------------------
    def _load_data_sources(self, template):
        from apps.enterprise.models import CompanyProfile

        company = CompanyProfile.objects.filter(is_default=True).first()
        project = template.project
        return company, project

    def _load_material_package(self, template):
        """取材料包: 优先默认企业的第一个材料包。"""
        try:
            from apps.enterprise.models import CompanyProfile

            company = CompanyProfile.objects.filter(is_default=True).first()
            if company:
                return company.material_packages.first()
        except Exception:
            logger.exception("material package load failed")
        return None

    # ------------------------------------------------------------------
    # 块分发
    # ------------------------------------------------------------------
    def _fill_block(self, doc, block, company, project, material_package, warnings) -> str:
        btype = block.block_type
        if btype == BlockType.FIXED:
            return BlockFillStatus.SKIPPED

        if btype == BlockType.AUTO_FIELD:
            value = self._resolve_field_value(block, company, project, warnings)
            if value is None:
                return BlockFillStatus.NEEDS_REVIEW
            return self._fill_text_placeholder(doc, block, value, warnings)

        if btype == BlockType.DATA_TABLE:
            value = self._resolve_field_value(block, company, project, warnings) or ""
            return self._fill_table_by_label(doc, block, value, warnings)

        if btype == BlockType.AI_GENERATE:
            text = self._generate_text(block, project)
            return self._fill_text_placeholder(doc, block, text, warnings)

        if btype == BlockType.AI_RESPONSE:
            return self._fill_response_table(doc, block, project, warnings)

        if btype == BlockType.REPEAT_TABLE:
            return self._repeat_table_rows(doc, block, warnings)

        if btype == BlockType.REPEAT_BLOCK:
            return self._repeat_block(doc, block, warnings)

        if btype == BlockType.MATERIAL_SLOT:
            return self._insert_material(doc, block, material_package, warnings)

        if btype in (BlockType.MANUAL, BlockType.PRICE):
            # 保留原文, 由用户填写
            warnings.append(FillWarning(block.block_key, f"【人工填写】{block.title}"))
            return BlockFillStatus.NEEDS_REVIEW

        return BlockFillStatus.NEEDS_REVIEW

    # ------------------------------------------------------------------
    # 企业字段解析
    # ------------------------------------------------------------------
    def _resolve_field_value(self, block, company, project, warnings) -> Optional[str]:
        """按 binding_config.field 解析值。返回 None 表示无数据源。"""
        binding = block.binding_config or {}
        field = binding.get("field", "")
        if not field:
            warnings.append(FillWarning(block.block_key, f"未绑定数据源: {block.title}"))
            return None

        if field.startswith("company."):
            if not company:
                warnings.append(FillWarning(block.block_key, f"企业资料缺失: {block.title}"))
                return None
            attr = field.split(".", 1)[1]
            value = getattr(company, attr, None)
            if hasattr(value, "strftime"):
                value = value.strftime("%Y年%m月%d日")
            if value is None or value == "":
                warnings.append(FillWarning(block.block_key, f"企业字段为空: {field}"))
                return None
            return str(value)

        if field.startswith("project."):
            attr = field.split(".", 1)[1]
            value = getattr(project, attr, None) if project else None
            if value in (None, ""):
                # 项目字段缺失(如 bid_date) → 落款日期用今天
                if attr == "bid_date":
                    from django.utils import timezone

                    return timezone.now().strftime("%Y年%m月%d日")
                warnings.append(FillWarning(block.block_key, f"项目字段为空: {field}"))
                return None
            return str(value)

        warnings.append(FillWarning(block.block_key, f"未知绑定: {field}"))
        return None

    # ------------------------------------------------------------------
    # 文本空位替换(AUTO_FIELD / AI_GENERATE)
    # ------------------------------------------------------------------
    def _fill_text_placeholder(self, doc, block, value: str, warnings) -> str:
        """找到含锚点文本的段落, 替换其中的空位(下划线/括号)。"""
        anchor = block.anchor_text.strip()
        if not anchor:
            warnings.append(FillWarning(block.block_key, "缺少定位锚点"))
            return BlockFillStatus.NEEDS_REVIEW

        para = self._find_paragraph(doc, anchor)
        if para is None:
            warnings.append(FillWarning(block.block_key, f"未找到锚点段落: {anchor}"))
            return BlockFillStatus.NEEDS_REVIEW

        text = para.text
        if UNDERLINE_RE.search(text) or PAREN_RE.search(text) or YEAR_MONTH_DAY_RE.search(text):
            new_text = self._replace_first_placeholder(text, value)
            self._set_paragraph_text(para, new_text)
            return BlockFillStatus.FILLED

        # 无空位 → 锚点后追加
        warnings.append(FillWarning(block.block_key, f"锚点段落无空位, 已追加: {anchor}"))
        self._append_text(para, value)
        return BlockFillStatus.FILLED

    def _replace_first_placeholder(self, text: str, value: str) -> str:
        """依次替换: 下划线空位 → 年月日空格占位 → 括号空位。"""
        if UNDERLINE_RE.search(text):
            return UNDERLINE_RE.sub(value, text, count=1)
        if YEAR_MONTH_DAY_RE.search(text):
            # 替换 "年 月 日" 前的空格部分为值
            return YEAR_MONTH_DAY_RE.sub(value, text, count=1)
        if PAREN_RE.search(text):
            return PAREN_RE.sub(value, text, count=1)
        return text

    def _set_paragraph_text(self, para, text: str) -> None:
        """整段重写文本(保留段落样式, run 级格式会归一)。"""
        for run in para.runs:
            run.text = ""
        if para.runs:
            para.runs[0].text = text
        else:
            para.add_run(text)

    def _append_text(self, para, text: str) -> None:
        para.add_run(text)

    # ------------------------------------------------------------------
    # 表格按行标签填充(DATA_TABLE)
    # ------------------------------------------------------------------
    def _fill_table_by_label(self, doc, block, value: str, warnings) -> str:
        """定位含锚点文本的表格行, 填充该行第一个空 cell。"""
        anchor = block.anchor_text.strip()
        cell = self._find_label_cell(doc, anchor)
        if cell is None:
            warnings.append(FillWarning(block.block_key, f"未找到表格标签: {anchor}"))
            return BlockFillStatus.NEEDS_REVIEW

        # 该行中第一个空 cell(跳过标签 cell, 仅取 w:tc 元素)
        row = cell._tc.getparent()
        target = None
        for tc in row:
            if tc.tag != "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tc":
                continue  # 跳过 trPr/tblPrEx 等非单元格元素
            if tc is cell._tc:
                continue
            cell_text = "".join(tc.itertext()).strip()
            if not cell_text or UNDERLINE_RE.search(cell_text):
                target = tc
                break
        if target is None:
            # 无空 cell → 追加到标签 cell 后面
            warnings.append(FillWarning(block.block_key, f"标签行无空 cell: {anchor}"))
            return BlockFillStatus.NEEDS_REVIEW

        from docx.table import _Cell

        target_cell = _Cell(target, cell._parent)
        self._set_cell_text(target_cell, value)
        return BlockFillStatus.FILLED

    def _set_cell_text(self, cell, text: str) -> None:
        para = cell.paragraphs[0] if cell.paragraphs else cell.add_paragraph()
        self._set_paragraph_text(para, text)

    # ------------------------------------------------------------------
    # AI 内容生成(AI_GENERATE / AI_RESPONSE)
    # ------------------------------------------------------------------
    def _generate_text(self, block, project) -> str:
        """AI 生成正文内容。上下文: 项目需求条款 + 块标题。"""
        from apps.generation.constants import ModelType
        from apps.generation.models import ModelConfig
        from apps.generation.services.llm_service import LLMService

        context = self._build_ai_context(block, project, limit=2000)
        system = "你是资深投标文件撰写专家。根据招标文件要求和项目信息, 撰写投标响应内容。要求专业、具体、可落地, 不要空话。直接输出纯文本正文内容, 禁止使用 #、*、- 等 markdown 标记, 不要任何解释。"
        user = f"招标要求与项目信息:\n{context}\n\n需要撰写的内容: {block.title}"
        resp = LLMService().chat(
            ModelConfig.objects.get(model_type=ModelType.CHAT, is_default=True, is_active=True),
            system,
            user,
        )
        return resp.text.strip() or ""

    def _fill_response_table(self, doc, block, project, warnings) -> str:
        """生成逐条应答并填充应答表格。

        应答表格结构: 采购文件章节号 | 要求描述 | 响应情况 | 是否偏离 | 偏离描述(模板各异, 按可用列适配)
        """
        from apps.generation.constants import ModelType
        from apps.generation.models import ModelConfig
        from apps.generation.services.llm_service import LLMService

        requirements = self._load_requirements(block, limit=15)
        if not requirements:
            warnings.append(FillWarning(block.block_key, "未找到招标条款, 应答表留空"))
            return BlockFillStatus.NEEDS_REVIEW

        table = self._find_table(doc, block.anchor_text)
        if table is None:
            warnings.append(FillWarning(block.block_key, f"未找到应答表格: {block.anchor_text}"))
            return BlockFillStatus.NEEDS_REVIEW

        req_text = "\n".join(f"[{r['clause_no'] or '?'}] {r['content'][:150]}" for r in requirements)
        system = (
            "你是投标条款应答专家。对招标文件的每一条要求, 逐条生成响应内容。\n"
            "规则:\n"
            "1. 响应情况必须具体、专业, 结合企业能力, 禁止空话; \n"
            "2. 状态只能从 [完全响应, 部分响应, 偏离, 待确认] 中选择, 无法确认的要求标'待确认'; \n"
            "3. 输出 JSON 数组, 每项: {\"clause\": \"章节号\", \"requirement\": \"要求\", \"response\": \"响应内容(80字内)\", \"status\": \"完全响应\", \"deviation\": \"偏离描述, 无则空\"}"
        )
        user = f"招标条款:\n{req_text}\n\n请逐条生成应答。"
        resp = LLMService().chat(
            ModelConfig.objects.get(model_type=ModelType.CHAT, is_default=True, is_active=True),
            system,
            user,
            response_format={"type": "json_object"},
        )
        try:
            data = resp.json if isinstance(resp.json, dict) else json.loads(resp.text)
        except (json.JSONDecodeError, TypeError):
            warnings.append(FillWarning(block.block_key, "应答生成结果非 JSON, 表格留空"))
            return BlockFillStatus.NEEDS_REVIEW
        # 兼容 LLM 直接返回数组的形态
        if isinstance(data, list):
            items = data
        else:
            items = data.get("items") or data.get("responses") or []

        # 写入表格: 表头之后逐行填充; 行不足则复制模板行
        self._write_rows_to_table(table, items, warnings)

        # 风险闸门: 保存应答明细, 标注待确认条目
        review_items = [
            it for it in items if str(it.get("status", "")) == "待确认"
        ]
        block.fill_payload = {
            "items": items,
            "review_count": len(review_items),
        }
        block.save(update_fields=["fill_payload", "updated_at"])
        if review_items:
            warnings.append(FillWarning(
                block.block_key,
                f"应答表含 {len(review_items)} 条'待确认'条目, 生成后需人工复核",
            ))
        return BlockFillStatus.FILLED

    def _write_rows_to_table(self, table, items: list, warnings) -> None:
        header_idx, header_text = self._detect_header_row(table)
        data_rows = table.rows[header_idx + 1:] if header_idx is not None else table.rows[1:]
        n_rows = len(data_rows)

        for i, item in enumerate(items):
            if i >= n_rows:
                new_row = self._clone_table_row(table, data_rows[-1] if data_rows else table.rows[-1])
                data_rows = list(table.rows)[header_idx + 1:]
                n_rows = len(data_rows)
            row = data_rows[i]
            cells = row.cells
            texts = [
                str(item.get("clause", "")),
                str(item.get("requirement", ""))[:80],
                str(item.get("response", "")),
                str(item.get("status", "待确认")),
                str(item.get("deviation", "")),
            ]
            for j, cell in enumerate(cells):
                if j < len(texts) and texts[j]:
                    self._set_cell_text(cell, texts[j])

    def _load_requirements(self, block, limit: int = 15) -> list:
        """从 TenderChunk 加载招标条款(技术/商务/法律要求)。"""
        from apps.tender.constants import ChunkType
        from apps.tender.models import TenderChunk

        template = block.template
        pd = template.parsed_document
        if not pd:
            return []
        chunks = (
            TenderChunk.objects
            .filter(parsed_document=pd, chunk_type__in=[ChunkType.TECH_REQ, ChunkType.COMMERCIAL, ChunkType.LEGAL])
            .order_by("chunk_index")[:limit]
        )
        return [{"clause_no": c.clause_no, "content": c.content} for c in chunks]

    def _build_ai_context(self, block, project, limit: int = 2000) -> str:
        """构建 AI 生成上下文: 项目信息 + 招标条款。"""
        parts = []
        if project:
            parts.append(f"项目名称: {project.name}")
        chunks = self._load_requirements(block, limit=10)
        for c in chunks:
            parts.append(f"[条款 {c['clause_no'] or '?'}] {c['content'][:200]}")
        text = "\n".join(parts)
        return text[:limit]

    # ------------------------------------------------------------------
    # REPEAT_TABLE: 表格行复制 + 案例自动匹配
    # ------------------------------------------------------------------
    # 案例字段 → 表格列关键词映射
    CASE_COLUMN_RULES = [
        ("period", ["起止年月", "起止时间", "实施时间", "项目周期"]),
        ("project_name", ["项目名称"]),
        ("client_name", ["甲方名称", "客户名称", "业主名称"]),
        ("client_contact", ["证明人", "联系人"]),
        ("amount", ["实施金额", "合同金额", "金额"]),
        ("scope", ["范围概述", "项目范围", "范围"]),
        ("remark", ["备注"]),
    ]

    def _repeat_table_rows(self, doc, block, warnings) -> str:
        """复制模板数据行并填充企业案例库数据。"""
        table = self._find_table(doc, block.anchor_text)
        if table is None:
            warnings.append(FillWarning(block.block_key, f"未找到表格: {block.anchor_text}"))
            return BlockFillStatus.NEEDS_REVIEW

        # 数据行 = 不含锚点文本的行(锚点通常在表头)
        anchor_norm = self._normalize(block.anchor_text)
        data_rows = []
        for row in table.rows:
            row_text = self._normalize("".join(c.text for c in row.cells))
            if anchor_norm and anchor_norm in row_text:
                continue  # 表头行
            data_rows.append(row)
        if not data_rows:
            data_rows = [table.rows[-1]]

        repeat_count = int((block.binding_config or {}).get("repeat_count", 3))
        repeat_count = max(1, min(repeat_count, 10))

        # 匹配企业案例
        cases = self._match_cases(block, limit=repeat_count)

        total = max(repeat_count, len(cases))
        template_row = data_rows[0]
        for _ in range(total - 1):
            self._clone_table_row(table, template_row)

        if not cases:
            warnings.append(FillWarning(block.block_key, "企业案例库无匹配案例, 行已复制待人工填写"))
            return BlockFillStatus.NEEDS_REVIEW

        # 按表头识别列, 逐行填充案例
        col_map = self._detect_case_columns(table)
        filled_rows = 0
        for i, case in enumerate(cases):
            row = table.rows[len(table.rows) - total + i]
            for col_idx, attr in col_map.items():
                try:
                    value = getattr(case, attr, "") or ""
                    if callable(value):
                        value = value()
                    if value not in (None, ""):
                        self._set_cell_text(row.cells[col_idx], str(value))
                except Exception:
                    continue
            filled_rows += 1

        block.fill_payload = {
            "cases": [
                {"project_name": c.project_name, "client_name": c.client_name}
                for c in cases
            ],
            "filled": filled_rows,
        }
        block.save(update_fields=["fill_payload", "updated_at"])
        return BlockFillStatus.FILLED

    # 案例匹配关键词停用词(过于泛化, 不参与相关度)
    CASE_KEYWORD_STOPWORDS = {
        "项目", "服务", "采购", "招标", "投标", "公司", "系统",
        "平台", "管理", "建设", "运维", "维护", "评估", "测试", "中心",
    }

    def _match_cases(self, block, limit: int = 5) -> list:
        """从企业案例库匹配案例(v1: 默认企业 + 关键词相关度排序)。"""
        from apps.enterprise.models import CompanyCase, CompanyProfile

        company = CompanyProfile.objects.filter(is_default=True).first()
        qs = CompanyCase.objects.all()
        if company:
            qs = qs.filter(company=company)

        # 关键词: 项目名 jieba 分词(过滤停用词)
        keywords = []
        project = block.template.project
        if project and project.name:
            import jieba

            keywords = [
                k for k in jieba.lcut(project.name)
                if len(k) >= 2 and k not in self.CASE_KEYWORD_STOPWORDS
            ]

        cases = list(qs.order_by("-created_at"))
        if keywords:
            def score(c):
                text = f"{c.project_name} {c.client_name} {c.scope}"
                return sum(1 for k in keywords if k in text)
            cases.sort(key=score, reverse=True)
        return cases[:limit]

    def _detect_case_columns(self, table) -> dict:
        """识别表头各列对应的案例字段。返回 {列index: 字段名}。"""
        header_row = table.rows[0]
        col_map = {}
        for j, cell in enumerate(header_row.cells):
            text = self._normalize(cell.text)
            for attr, keywords in self.CASE_COLUMN_RULES:
                if any(k in text for k in keywords) and attr not in col_map.values():
                    col_map[j] = attr
                    break
        return col_map

    def _clone_table_row(self, table, source_row):
        """deepcopy 行 XML, 追加到表格末尾, 保留全部格式并清空文本。"""
        from copy import deepcopy

        new_tr = deepcopy(source_row._tr)
        # 清空文本
        for t in new_tr.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"):
            t.text = ""
        source_row._tr.addnext(new_tr)
        return new_tr

    # ------------------------------------------------------------------
    # REPEAT_BLOCK: 整块复制(人员简历等)
    # ------------------------------------------------------------------
    # 块边界标题模式: "一、" "附件N" "第X部分"
    BLOCK_BOUNDARY_RE = re.compile(
        r"^[一二三四五六七八九十]+、|^附件\s*\d+[：:]|^第[一二三四五六七八九十\d]+部分"
    )

    def _repeat_block(self, doc, block, warnings) -> str:
        """定位锚点段落, 复制其后到块边界前的所有元素 N 份(保留格式)。

        锚点段落(块标题)本身保留一份, 复制内容 N-1 份追加在边界前。
        """
        from copy import deepcopy

        anchor = block.anchor_text.strip()
        para = self._find_paragraph(doc, anchor)
        if para is None:
            warnings.append(FillWarning(block.block_key, f"未找到锚点段落: {anchor}"))
            return BlockFillStatus.NEEDS_REVIEW

        anchor_el = para._p
        # 收集锚点之后的块元素, 直到遇到边界标题
        block_els = []
        for el in anchor_el.itersiblings():
            text = "".join(el.itertext()).strip()
            if text and self.BLOCK_BOUNDARY_RE.match(text):
                break
            block_els.append(el)
        if not block_els:
            warnings.append(FillWarning(block.block_key, f"锚点后无内容可复制: {anchor}"))
            return BlockFillStatus.NEEDS_REVIEW

        repeat_count = int((block.binding_config or {}).get("repeat_count", 3))
        repeat_count = max(1, min(repeat_count, 10))

        insert_after = block_els[-1]
        for _ in range(repeat_count - 1):
            for el in block_els:
                new_el = deepcopy(el)
                insert_after.addnext(new_el)
                insert_after = new_el

        block.fill_payload = {
            "copied": repeat_count,
            "elements": len(block_els),
            "note": "块内容已复制, 空位待人工填写",
        }
        block.save(update_fields=["fill_payload", "updated_at"])
        return BlockFillStatus.FILLED

    # ------------------------------------------------------------------
    # MATERIAL_SLOT: 材料图片插入
    # ------------------------------------------------------------------
    def _insert_material(self, doc, block, material_package, warnings) -> str:
        usage_key = (block.binding_config or {}).get("usage_key", "")
        material = None
        if material_package and usage_key:
            material = material_package.get_material_by_usage_key(usage_key)
        if material is None or not material.object_key:
            warnings.append(FillWarning(block.block_key, f"缺少材料: {usage_key or '未绑定'}"))
            return BlockFillStatus.NEEDS_REVIEW

        # 图片类型检测
        ext = material.object_key.rsplit(".", 1)[-1].lower() if "." in material.object_key else ""
        if f".{ext}" not in IMAGE_EXTS:
            warnings.append(FillWarning(block.block_key, f"材料非图片, 请人工插入: {material.download_filename()}"))
            return BlockFillStatus.NEEDS_REVIEW

        para = self._find_paragraph(doc, block.anchor_text)
        if para is None:
            warnings.append(FillWarning(block.block_key, f"未找到材料插入位置: {block.anchor_text}"))
            return BlockFillStatus.NEEDS_REVIEW

        try:
            from docx.shared import Mm

            data = self.storage.get_object(material.object_key)
            run = para.add_run()
            run.add_picture(io.BytesIO(data), width=Mm(140))
            return BlockFillStatus.FILLED
        except Exception as exc:
            logger.exception("material insert failed: key=%s", block.block_key)
            warnings.append(FillWarning(block.block_key, f"材料插入失败: {exc}"))
            return BlockFillStatus.NEEDS_REVIEW

    # ------------------------------------------------------------------
    # 定位工具
    # ------------------------------------------------------------------
    @staticmethod
    def _normalize(text: str) -> str:
        # 全角括号转半角, 消除全半角差异导致的锚点失配
        text = (text or "").replace("（", "(").replace("）", ")")
        return re.sub(r"\s+", "", text)

    def _find_paragraph(self, doc, anchor: str):
        """主文档 + 表格内段落中查找含锚点(归一化)的段落。

        优先返回"含锚点且含空位"的段落, 避免锚点歧义(如"地址"命中说明文字)。
        """
        anchor_norm = self._normalize(anchor)
        if not anchor_norm:
            return None
        fallback = None
        for para in doc.paragraphs:
            if anchor_norm in self._normalize(para.text):
                if self._has_placeholder(para.text):
                    return para
                if fallback is None:
                    fallback = para
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    for para in cell.paragraphs:
                        if anchor_norm in self._normalize(para.text):
                            if self._has_placeholder(para.text):
                                return para
                            if fallback is None:
                                fallback = para
        return fallback

    @staticmethod
    def _has_placeholder(text: str) -> bool:
        return bool(
            UNDERLINE_RE.search(text)
            or PAREN_RE.search(text)
            or YEAR_MONTH_DAY_RE.search(text)
        )

    def _find_label_cell(self, doc, anchor: str):
        """查找含锚点文本的表格 cell。"""
        from docx.table import _Cell

        anchor_norm = self._normalize(anchor)
        if not anchor_norm:
            return None
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    if anchor_norm in self._normalize(cell.text):
                        return cell
        return None

    def _find_table(self, doc, anchor: str):
        """查找含锚点文本(表头/标题)的表格。"""
        anchor_norm = self._normalize(anchor)
        for table in doc.tables:
            if not anchor_norm:
                return table
            for row in table.rows[:3]:
                for cell in row.cells:
                    if anchor_norm in self._normalize(cell.text):
                        return table
        return None

    def _detect_header_row(self, table) -> Tuple[Optional[int], str]:
        """识别表头行: 含"要求/响应/偏离/章节"等关键字的行。"""
        keywords = ["要求", "响应", "偏离", "章节", "序号", "项目阶段", "工作项"]
        for i, row in enumerate(table.rows[:3]):
            text = "".join(c.text for c in row.cells)
            if any(k in text for k in keywords):
                return i, text
        return None, ""
