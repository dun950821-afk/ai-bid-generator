"""TenderChunk 模型测试。"""

import pytest
from django.db import IntegrityError

from apps.tender.constants import ChunkType, ChunkLevel
from apps.tender.models import TenderChunk


@pytest.mark.django_db
class TestTenderChunk:
    """TenderChunk 模型测试。"""

    def test_create_chunk(self, parsed_document):
        """测试创建分块。"""
        chunk = TenderChunk.objects.create(
            parsed_document=parsed_document,
            chunk_level=ChunkLevel.SECTION,
            chunk_index=0,
            content_hash="abc123",
            chunk_type=ChunkType.GENERAL,
            content="测试内容",
        )
        assert chunk.id is not None
        assert chunk.embedding_status == "pending"

    def test_unique_content_hash(self, parsed_document):
        """测试同一文档内 content_hash 唯一。"""
        TenderChunk.objects.create(
            parsed_document=parsed_document,
            chunk_level=ChunkLevel.SECTION,
            chunk_index=0,
            content_hash="unique_hash",
            chunk_type=ChunkType.GENERAL,
            content="内容1",
        )
        with pytest.raises(IntegrityError):
            TenderChunk.objects.create(
                parsed_document=parsed_document,
                chunk_level=ChunkLevel.SECTION,
                chunk_index=1,
                content_hash="unique_hash",  # 相同 hash
                chunk_type=ChunkType.GENERAL,
                content="内容2",
            )

    def test_parent_chunk_relationship(self, parsed_document):
        """测试父子关系。"""
        parent = TenderChunk.objects.create(
            parsed_document=parsed_document,
            chunk_level=ChunkLevel.SECTION,
            chunk_index=0,
            content_hash="parent_hash",
            chunk_type=ChunkType.GENERAL,
            content="父内容",
        )
        child = TenderChunk.objects.create(
            parsed_document=parsed_document,
            parent_chunk=parent,
            chunk_level=ChunkLevel.CLAUSE,
            chunk_index=0,
            content_hash="child_hash",
            chunk_type=ChunkType.GENERAL,
            content="子内容",
        )
        assert child.parent_chunk == parent
        assert parent.child_chunks.count() == 1

    def test_chunk_features(self, parsed_document):
        """测试特征字段。"""
        chunk = TenderChunk.objects.create(
            parsed_document=parsed_document,
            chunk_level=ChunkLevel.CLAUSE,
            chunk_index=0,
            content_hash="feature_hash",
            chunk_type=ChunkType.TECH_REQ,
            content="必须在2024年12月31日前交付，违约金100万元",
            is_mandatory=True,
            has_deadline=True,
            has_amount=True,
            has_penalty=True,
        )
        assert chunk.is_mandatory is True
        assert chunk.has_deadline is True
        assert chunk.has_amount is True
        assert chunk.has_penalty is True

    def test_chunk_str(self, parsed_document):
        """测试字符串表示。"""
        chunk = TenderChunk.objects.create(
            parsed_document=parsed_document,
            chunk_level=ChunkLevel.SECTION,
            chunk_index=0,
            content_hash="test_hash",
            chunk_type=ChunkType.GENERAL,
            content="测试内容",
        )
        assert str(chunk) == f"Chunk#{chunk.id} (general)"


@pytest.mark.django_db
class TestChunkSourceFile:
    def test_source_file_assignable(self, tender_file, parsed_document):
        chunk = TenderChunk.objects.create(
            parsed_document=parsed_document,
            chunk_level=ChunkLevel.SECTION,
            chunk_index=0,
            content="评分标准片段",
            content_hash="h-source-1",
            source_file=tender_file,
        )
        assert chunk.source_file_id == tender_file.id

    def test_source_file_default_null(self, parsed_document):
        chunk = TenderChunk.objects.create(
            parsed_document=parsed_document,
            chunk_level=ChunkLevel.SECTION,
            chunk_index=0,
            content="正文",
            content_hash="h-source-2",
        )
        assert chunk.source_file_id is None