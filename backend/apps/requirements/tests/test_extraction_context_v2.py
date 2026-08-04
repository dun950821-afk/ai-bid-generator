"""抽取上下文 V2 测试：build_all / scoring 优先 / 排序兜底。"""

from unittest.mock import patch

import pytest

# tender 测试 fixtures（tender_file / parsed_document）定义在 apps.tender.tests.conftest，
# 不在 requirements 测试目录的 conftest 路径上，通过 pytest_plugins 复用，不新建。
pytest_plugins = ["apps.tender.tests.conftest"]

from apps.requirements.services.extraction.context import (
    ExtractionContextBuilder,
    build_chunk_context,
)
from apps.tender.constants import ChunkLevel, ChunkType
from apps.tender.models import TenderChunk


def make_chunk(parsed_document, idx, content, page_start=None, chunk_type=ChunkType.GENERAL):
    return TenderChunk.objects.create(
        parsed_document=parsed_document,
        chunk_level=ChunkLevel.SECTION,
        chunk_index=idx,
        content=content,
        content_hash=f"h-v2-{idx}",
        page_start=page_start,
        chunk_type=chunk_type,
    )


@pytest.mark.django_db
class TestBuildChunkContextV2:
    def test_scoring_priority_includes_all_scoring_chunks_first(self, parsed_document):
        for i in range(10):
            make_chunk(parsed_document, i, f"普通内容{i}", page_start=i)
        make_chunk(parsed_document, 100, "评分表碎片A", page_start=20, chunk_type=ChunkType.SCORING)
        make_chunk(parsed_document, 101, "评分表碎片B", page_start=21, chunk_type=ChunkType.SCORING)

        out = build_chunk_context(parsed_document.tender_file, max_context_length=100000,
                                  scoring_priority=True)
        idx_a = out.index("评分表碎片A")
        idx_b = out.index("评分表碎片B")
        idx_first_other = out.index("普通内容0")
        assert idx_a < idx_first_other and idx_b < idx_first_other
        assert idx_a < idx_b

    def test_scoring_not_truncated_by_budget(self, parsed_document):
        """scoring 碎片即使超预算也完整收录。"""
        make_chunk(parsed_document, 0, "评分长碎片" * 500, chunk_type=ChunkType.SCORING)
        make_chunk(parsed_document, 1, "普通内容", page_start=1)

        out = build_chunk_context(parsed_document.tender_file, max_context_length=100,
                                  scoring_priority=True)
        assert "评分长碎片" in out
        assert "已截断" in out  # 普通内容被截断

    def test_page_start_none_sorted_by_id(self, parsed_document):
        c_none_2 = make_chunk(parsed_document, 2, "无页码B", page_start=None)
        c_1 = make_chunk(parsed_document, 1, "第1页", page_start=1)
        c_none_3 = make_chunk(parsed_document, 3, "无页码A", page_start=None)

        out = build_chunk_context(parsed_document.tender_file, max_context_length=100000)
        # 无页码按 id 升序：c_none_2 (id 小) 在前
        assert out.index("第1页") < out.index("无页码B") < out.index("无页码A")
        assert c_none_2.id < c_none_3.id

    def test_non_scoring_order_unchanged(self, parsed_document):
        make_chunk(parsed_document, 0, "内容P3", page_start=3)
        make_chunk(parsed_document, 1, "内容P1", page_start=1)
        out = build_chunk_context(parsed_document.tender_file, max_context_length=100000)
        assert out.index("内容P1") < out.index("内容P3")

    def test_block_contains_source_file(self, parsed_document, tender_file):
        make_chunk(parsed_document, 0, "带来源内容", page_start=1)
        chunk = TenderChunk.objects.filter(parsed_document=parsed_document).first()
        chunk.source_file = tender_file
        chunk.save()
        out = build_chunk_context(parsed_document.tender_file, max_context_length=100000)
        assert "来源文件: test.pdf" in out


@pytest.mark.django_db
class TestBuildAll:
    def test_build_all_returns_per_type_contexts(self, parsed_document):
        make_chunk(parsed_document, 0, "内容", page_start=1)
        builder = ExtractionContextBuilder()
        with patch.object(builder.document_text_service, "get_document_text", return_value="全文"):
            contexts = builder.build_all(
                parsed_document.tender_file, None,
                ["scoring", "technical", "commercial"],
            )

        assert set(contexts.keys()) == {"scoring", "technical", "commercial"}
        for ctx in contexts.values():
            assert ctx.document_text == "全文"
            # model_config 可空（测试库无默认 chat 模型时 get_model_config(None) 返回 None，合法状态）

    def test_build_all_scoring_chunk_context_differs_from_others(self, parsed_document):
        make_chunk(parsed_document, 0, "普通", page_start=1)
        make_chunk(parsed_document, 1, "评分表", page_start=2, chunk_type=ChunkType.SCORING)
        builder = ExtractionContextBuilder()
        with patch.object(builder.document_text_service, "get_document_text", return_value="全文"):
            contexts = builder.build_all(
                parsed_document.tender_file, None, ["scoring", "technical"],
            )
        assert contexts["scoring"].chunk_context != contexts["technical"].chunk_context
        assert contexts["scoring"].chunk_context.index("评分表") < contexts["scoring"].chunk_context.index("普通")
        assert contexts["technical"].chunk_context.index("普通") < contexts["technical"].chunk_context.index("评分表")

    def test_build_backward_compat(self, parsed_document):
        make_chunk(parsed_document, 0, "内容", page_start=1)
        builder = ExtractionContextBuilder()
        with patch.object(builder.document_text_service, "get_document_text", return_value="全文"):
            ctx = builder.build(parsed_document.tender_file, None)
        assert ctx.document_text == "全文"
        assert ctx.chunk_context
