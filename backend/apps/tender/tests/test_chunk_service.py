"""ChunkService 测试。"""

import pytest

from apps.tender.constants import ChunkType, ChunkLevel
from apps.tender.models import TenderChunk
from apps.tender.services.chunk_service import ChunkService


@pytest.mark.django_db
class TestChunkService:
    """ChunkService 测试。"""

    def test_chunk_creates_chunks(self, parsed_document):
        """测试分块创建 chunks。"""
        service = ChunkService()

        # Mock the markdown loading
        mock_markdown = """# 第一章 测试章节

## 1.1 资格要求

投标人必须具备独立法人资格。

## 1.2 技术要求

技术参数应符合国家标准。
"""
        with pytest.MonkeyPatch().context() as m:
            m.setattr(service, '_load_markdown', lambda uri: mock_markdown)
            chunks = service.chunk(parsed_document)

        assert len(chunks) > 0
        for chunk in chunks:
            assert chunk.content_hash
            assert chunk.chunk_type in [c[0] for c in ChunkType.CHOICES]

    def test_chunk_levels(self, parsed_document):
        """测试三层分块结构。"""
        service = ChunkService()

        # Use longer mock markdown that exceeds MIN_CHUNK_SIZE
        mock_markdown = """# 第一章 测试章节

本章内容描述测试章节的详细信息，包含足够长的内容以确保分块能够正常创建和保存。

## 1.1 资格要求

投标人必须具备独立法人资格，并且需要提供相关的资质证明文件，这些文件需要经过相关部门的审核和认证。

## 1.2 技术要求

技术参数应符合国家标准，并且需要满足特定的技术规格要求，确保项目实施过程中的质量控制。
"""
        with pytest.MonkeyPatch().context() as m:
            m.setattr(service, '_load_markdown', lambda uri: mock_markdown)
            chunks = service.chunk(parsed_document)

        levels = {c.chunk_level for c in chunks}
        assert ChunkLevel.SECTION in levels or ChunkLevel.CLAUSE in levels

    def test_parent_child_relationship(self, parsed_document):
        """测试父子关系。"""
        service = ChunkService()

        mock_markdown = """# 第一章 测试章节

## 1.1 资格要求

投标人必须具备独立法人资格。
"""
        with pytest.MonkeyPatch().context() as m:
            m.setattr(service, '_load_markdown', lambda uri: mock_markdown)
            chunks = service.chunk(parsed_document)

        # 检查父子关系
        for chunk in chunks:
            if chunk.parent_chunk:
                assert chunk.parent_chunk.parsed_document == parsed_document
                assert chunk.parent_chunk.chunk_level == ChunkLevel.SECTION

    def test_classify_chunk(self, parsed_document):
        """测试分块类型分类。"""
        service = ChunkService()

        # 创建测试 chunk - use content with qualification keywords
        chunk = TenderChunk(
            parsed_document=parsed_document,
            chunk_level=ChunkLevel.CLAUSE,
            content="投标人必须具备资格要求和资质条件",
        )
        service._classify_chunk(chunk)

        assert chunk.chunk_type == ChunkType.QUALIFICATION
        assert len(chunk.matched_keywords) > 0

    def test_extract_features_mandatory(self, parsed_document):
        """测试特征提取 - 强制条款。"""
        service = ChunkService()

        chunk = TenderChunk(
            parsed_document=parsed_document,
            chunk_level=ChunkLevel.CLAUSE,
            content="★ 不满足上述资格条件的投标人将被拒绝",
        )
        service._extract_features(chunk)

        assert chunk.is_mandatory is True

    def test_extract_features_deadline(self, parsed_document):
        """测试特征提取 - 截止时间。"""
        service = ChunkService()

        chunk = TenderChunk(
            parsed_document=parsed_document,
            chunk_level=ChunkLevel.CLAUSE,
            content="投标截止时间为 2024年12月31日 17:00",
        )
        service._extract_features(chunk)

        assert chunk.has_deadline is True

    def test_extract_features_amount(self, parsed_document):
        """测试特征提取 - 金额。"""
        service = ChunkService()

        chunk = TenderChunk(
            parsed_document=parsed_document,
            chunk_level=ChunkLevel.CLAUSE,
            content="违约金 100 万元",
        )
        service._extract_features(chunk)

        assert chunk.has_amount is True

    def test_compute_content_hash(self, parsed_document):
        """测试内容哈希计算。"""
        service = ChunkService()

        chunk = TenderChunk(
            parsed_document=parsed_document,
            chunk_level=ChunkLevel.CLAUSE,
            section_path="第一章/1.1",
            content="测试内容",
            page_start=1,
            page_end=2,
        )
        hash_value = service._compute_hash(chunk)

        assert len(hash_value) == 64

        # 相同内容应该产生相同哈希
        chunk2 = TenderChunk(
            parsed_document=parsed_document,
            chunk_level=ChunkLevel.CLAUSE,
            section_path="第一章/1.1",
            content="测试内容",
            page_start=1,
            page_end=2,
        )
        hash_value2 = service._compute_hash(chunk2)
        assert hash_value == hash_value2

    def test_long_section_title_truncated(self, parsed_document):
        """超长章节标题（如整段承诺条款作为一级标题）不应导致 DataError。"""
        service = ChunkService()

        long_title = "一、" + "本单位承诺遵守相关法律法规及规定" * 20  # 超过 255 字符
        mock_markdown = (
            f"# {long_title}\n\n"
            + "本节内容足够长以确保分块能够正常创建并保存到数据库中。" * 6
        )
        with pytest.MonkeyPatch().context() as m:
            m.setattr(service, '_load_markdown', lambda uri: mock_markdown)
            chunks = service.chunk(parsed_document)

        section = next(c for c in chunks if c.chunk_level == ChunkLevel.SECTION)
        assert len(section.section_title) <= 255

    def test_idempotent_chunk(self, parsed_document):
        """测试幂等分块。"""
        service = ChunkService()

        mock_markdown = """# 第一章 测试章节

## 1.1 资格要求

投标人必须具备独立法人资格。
"""
        with pytest.MonkeyPatch().context() as m:
            m.setattr(service, '_load_markdown', lambda uri: mock_markdown)
            # 第一次分块
            chunks1 = service.chunk(parsed_document)
            count1 = len(chunks1)

            # 第二次分块（应该不重复）
            chunks2 = service.chunk(parsed_document)
            count2 = TenderChunk.objects.filter(parsed_document=parsed_document).count()

        assert count2 == count1  # 不应该增加