"""知识库 Admin 配置。"""

from django.contrib import admin

from apps.knowledge.models import KnowledgeBase, KnowledgeDocument, KnowledgeChunk, RetrievalLog


@admin.register(KnowledgeBase)
class KnowledgeBaseAdmin(admin.ModelAdmin):
    list_display = ["id", "name", "kb_type", "visibility", "is_active", "document_count", "chunk_count", "created_at"]
    list_filter = ["kb_type", "visibility", "is_active"]
    search_fields = ["name", "description"]
    readonly_fields = ["document_count", "chunk_count", "created_at", "updated_at"]


@admin.register(KnowledgeDocument)
class KnowledgeDocumentAdmin(admin.ModelAdmin):
    list_display = ["id", "file_name", "knowledge_base", "status", "parse_status", "chunk_status", "chunk_count", "created_at"]
    list_filter = ["status", "parse_status", "chunk_status", "knowledge_base"]
    search_fields = ["file_name"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(KnowledgeChunk)
class KnowledgeChunkAdmin(admin.ModelAdmin):
    list_display = ["id", "document", "chunk_index", "chunk_type", "token_count", "created_at"]
    list_filter = ["chunk_type", "document"]
    search_fields = ["title", "content"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(RetrievalLog)
class RetrievalLogAdmin(admin.ModelAdmin):
    list_display = ["id", "query", "retrieval_mode", "latency_ms", "created_at"]
    list_filter = ["retrieval_mode"]
    search_fields = ["query"]
    readonly_fields = ["created_at"]