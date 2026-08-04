"""抽取上下文：全文 + 分块参考 + 模型配置，一次构建供全部场景共享。"""

from dataclasses import dataclass
from typing import Any

from django.db.models import F

from apps.requirements.services.document_text_service import DocumentTextService
from apps.tender.constants import ChunkType
from apps.tender.models import TenderChunk


@dataclass
class ExtractionContext:
    """单次抽取运行共享的只读输入。"""

    document_text: str
    chunk_context: str
    model_config: Any | None


def get_model_config(model_config_id: int | None):
    """获取模型配置。优先用指定 ID，否则用默认 chat 模型。"""
    from apps.generation.models import ModelConfig
    if model_config_id:
        mc = ModelConfig.objects.filter(pk=model_config_id, is_active=True).first()
        if mc:
            return mc
    return ModelConfig.objects.filter(is_active=True, is_default=True, model_type="chat").first()


def chunk_context_budget(model_config: Any) -> int:
    """分块参考上下文预算（字符）：输入窗口的 1/4，封顶 30000。"""
    if model_config and model_config.context_length:
        return min(int(model_config.context_length * 0.25), 30000)
    return 30000


def build_chunk_context(
    tender_file,
    max_context_length: int,
    scoring_priority: bool = False,
    chunks: list | None = None,
) -> str:
    """构建解析分块上下文字符串。

    Args:
        tender_file: 招标文件实例
        max_context_length: 最大字符数上限
        scoring_priority: True 时 chunk_type=scoring 的分块完整收录（不截断），其余按预算
        chunks: 预加载分块列表（build_all 复用一次查询）

    Returns:
        拼接好的分块上下文字符串；无分块时返回空字符串
    """
    if chunks is None:
        chunks = list(
            TenderChunk.objects
            .filter(
                parsed_document__tender_file=tender_file,
                parsed_document__is_active=True,
            )
            .exclude(content="")
            .order_by(F("page_start").asc(nulls_last=True), "id")
        )

    if not chunks:
        return ""

    # scoring 场景：评分表碎片优先完整收录，其余按原序补
    if scoring_priority:
        ordered = [c for c in chunks if c.chunk_type == ChunkType.SCORING] + \
                  [c for c in chunks if c.chunk_type != ChunkType.SCORING]
    else:
        ordered = chunks

    parts = []
    current_length = 0
    total_count = len(ordered)
    scoring_remaining = sum(1 for c in ordered if c.chunk_type == ChunkType.SCORING)
    for idx, chunk in enumerate(ordered, 1):
        page_info = ""
        if chunk.page_start is not None and chunk.page_end is not None:
            page_info = f"{chunk.page_start}-{chunk.page_end}"
        elif chunk.page_start is not None:
            page_info = str(chunk.page_start)

        source_name = chunk.source_file.original_name if chunk.source_file_id else "(主文件)"
        block = (
            f"=== 分块 #{idx} ===\n"
            f"类型: {chunk.chunk_type}\n"
            f"章节路径: {chunk.section_path or '(无)'}\n"
            f"来源文件: {source_name}\n"
            f"页码: {page_info or '(无)'}\n"
            f"内容:\n{chunk.content}\n"
        )
        # scoring 碎片不受预算截断；其余分块受预算约束
        if chunk.chunk_type == ChunkType.SCORING and scoring_priority:
            parts.append(block)
            scoring_remaining -= 1
            current_length += len(block)
            continue
        if current_length + len(block) > max_context_length:
            parts.append(f"\n[注: 已截断，剩余 {total_count - idx + 1 - scoring_remaining} 个分块未显示]")
            break
        parts.append(block)
        current_length += len(block)

    return "\n".join(parts)


class ExtractionContextBuilder:
    """一次构建全文 / 分块参考 / 模型配置。"""

    def __init__(self, document_text_service: DocumentTextService | None = None):
        self.document_text_service = document_text_service or DocumentTextService()

    def build_all(self, tender_file, model_config_id: int | None, valid_types: list[str]) -> dict[str, ExtractionContext]:
        """为每个抽取类型构建独立上下文（全文/模型配置共享，chunk_context 按场景不同）。"""
        model_config = get_model_config(model_config_id)
        document_text = self.document_text_service.get_document_text(tender_file)
        chunks = list(
            TenderChunk.objects
            .filter(
                parsed_document__tender_file=tender_file,
                parsed_document__is_active=True,
            )
            .exclude(content="")
            .order_by(F("page_start").asc(nulls_last=True), "id")
        )
        budget = chunk_context_budget(model_config)
        return {
            t: ExtractionContext(
                document_text=document_text,
                chunk_context=build_chunk_context(
                    tender_file, budget,
                    scoring_priority=(t == "scoring"),
                    chunks=chunks,
                ),
                model_config=model_config,
            )
            for t in valid_types
        }

    def build(self, tender_file, model_config_id: int | None, extraction_type: str = "scoring") -> ExtractionContext:
        """单类型构建（兼容旧调用）。"""
        return self.build_all(tender_file, model_config_id, [extraction_type])[extraction_type]
