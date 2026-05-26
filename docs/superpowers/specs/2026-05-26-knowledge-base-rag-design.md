# 企业知识库与 RAG 基础设施设计文档

## 1. 概述

### 1.1 目标

在现有 AI 标书生成系统中新增一套独立的**企业知识库 + RAG 检索增强能力**，用于支撑后续标书生成时自动引用企业资质、公司介绍、历史标书、项目案例等知识资产。

### 1.2 现有链路

```
TenderFile -> ParsedDocument -> TenderChunk -> TenderRequirement
```

### 1.3 新增链路

```
KnowledgeBase -> KnowledgeDocument -> KnowledgeChunk -> RetrievalService -> RAG Context
```

### 1.4 最终生成链路

```
招标要求 TenderRequirement
    |
检索企业知识库 KnowledgeChunk
    |
组装 RAG Context
    |
PromptExecutionService
    |
PromptRun
    |
WorkflowArtifact
```

### 1.5 P0 范围

1. KnowledgeBase、KnowledgeDocument、KnowledgeChunk、RetrievalLog 模型
2. 文档上传、解析（复用 tender ParseService）、分块
3. PostgreSQL 全文检索 + 中文分词兜底
4. 知识库列表、详情、文档列表、检索测试 API
5. 前端知识库管理页面、检索测试页面
6. knowledge.manage 权限码

---

## 2. 数据模型

### 2.1 KnowledgeBase（知识库）

```python
class KnowledgeBase(TimeStampedModel):
    """知识库."""

    TYPE_CHOICES = [
        ("company_profile", "公司介绍"),
        ("case_library", "项目案例库"),
        ("qualification", "资质证书库"),
        ("product", "产品资料库"),
        ("bid_history", "历史标书库"),
        ("technical_solution", "技术方案库"),
    ]

    VISIBILITY_CHOICES = [
        ("system", "系统级"),
        ("tenant", "企业级"),
        ("project", "项目级"),
        ("private", "私有"),
    ]

    name = models.CharField("名称", max_length=255)
    description = models.TextField("描述", blank=True)
    kb_type = models.CharField("类型", max_length=32, choices=TYPE_CHOICES)
    visibility = models.CharField("可见范围", max_length=32, choices=VISIBILITY_CHOICES, default="private")
    is_active = models.BooleanField("是否启用", default=True)
    is_deleted = models.BooleanField("是否删除", default=False)
    deleted_at = models.DateTimeField("删除时间", null=True, blank=True)
    metadata = models.JSONField("元数据", default=dict, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="knowledge_bases")

    # 统计字段（冗余，用于列表展示）
    document_count = models.PositiveIntegerField("文档数", default=0)
    chunk_count = models.PositiveIntegerField("分块数", default=0)

    class Meta:
        db_table = "knowledge_base"
        verbose_name = "知识库"
        verbose_name_plural = "知识库"
        indexes = [
            models.Index(fields=["kb_type"]),
            models.Index(fields=["visibility"]),
            models.Index(fields=["is_active"]),
        ]
```

### 2.2 KnowledgeDocument（知识文档）

```python
class KnowledgeDocument(TimeStampedModel):
    """知识文档."""

    # 解析状态
    PARSE_PENDING = "pending"
    PARSE_PARSING = "parsing"
    PARSE_PARSED = "parsed"
    PARSE_FAILED = "failed"
    PARSE_STATUS_CHOICES = [
        (PARSE_PENDING, "待解析"),
        (PARSE_PARSING, "解析中"),
        (PARSE_PARSED, "已解析"),
        (PARSE_FAILED, "解析失败"),
    ]

    # 分块状态
    CHUNK_PENDING = "pending"
    CHUNK_CHUNKING = "chunking"
    CHUNK_CHUNKED = "chunked"
    CHUNK_FAILED = "failed"
    CHUNK_STATUS_CHOICES = [
        (CHUNK_PENDING, "待分块"),
        (CHUNK_CHUNKING, "分块中"),
        (CHUNK_CHUNKED, "已分块"),
        (CHUNK_FAILED, "分块失败"),
    ]

    # 嵌入状态（P1 使用）
    EMBEDDING_SKIPPED = "skipped"
    EMBEDDING_PENDING = "pending"
    EMBEDDING_PROCESSING = "processing"
    EMBEDDING_DONE = "done"
    EMBEDDING_FAILED = "failed"
    EMBEDDING_STATUS_CHOICES = [
        (EMBEDDING_SKIPPED, "跳过"),
        (EMBEDDING_PENDING, "待嵌入"),
        (EMBEDDING_PROCESSING, "嵌入中"),
        (EMBEDDING_DONE, "已嵌入"),
        (EMBEDDING_FAILED, "嵌入失败"),
    ]

    # 索引状态
    INDEX_PENDING = "pending"
    INDEX_INDEXING = "indexing"
    INDEX_INDEXED = "indexed"
    INDEX_FAILED = "failed"
    INDEX_STATUS_CHOICES = [
        (INDEX_PENDING, "待索引"),
        (INDEX_INDEXING, "索引中"),
        (INDEX_INDEXED, "已索引"),
        (INDEX_FAILED, "索引失败"),
    ]

    # 总状态（列表展示用）
    STATUS_UPLOADING = "uploading"
    STATUS_PROCESSING = "processing"
    STATUS_READY = "ready"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_UPLOADING, "上传中"),
        (STATUS_PROCESSING, "处理中"),
        (STATUS_READY, "可用"),
        (STATUS_FAILED, "失败"),
    ]

    knowledge_base = models.ForeignKey(KnowledgeBase, on_delete=models.CASCADE, related_name="documents")

    # 文件信息
    file_name = models.CharField("文件名", max_length=255)
    file_uri = models.CharField("文件URI", max_length=512, blank=True)
    file_hash = models.CharField("文件哈希", max_length=64, blank=True)
    file_size = models.BigIntegerField("文件大小", default=0)
    mime_type = models.CharField("MIME类型", max_length=128, blank=True)

    # 解析相关
    parsed_uri = models.CharField("解析结果URI", max_length=512, blank=True)
    raw_result_uri = models.CharField("原始解析结果URI", max_length=512, blank=True)
    parser_version = models.CharField("解析器版本", max_length=32, blank=True)
    chunker_version = models.CharField("分块器版本", max_length=32, blank=True)

    # 状态
    status = models.CharField("总状态", max_length=16, choices=STATUS_CHOICES, default=STATUS_UPLOADING)
    parse_status = models.CharField("解析状态", max_length=16, choices=PARSE_STATUS_CHOICES, default=PARSE_PENDING)
    chunk_status = models.CharField("分块状态", max_length=16, choices=CHUNK_STATUS_CHOICES, default=CHUNK_PENDING)
    embedding_status = models.CharField("嵌入状态", max_length=16, choices=EMBEDDING_STATUS_CHOICES, default=EMBEDDING_SKIPPED)
    index_status = models.CharField("索引状态", max_length=16, choices=INDEX_STATUS_CHOICES, default=INDEX_PENDING)

    # 软删除
    is_deleted = models.BooleanField("是否删除", default=False)
    deleted_at = models.DateTimeField("删除时间", null=True, blank=True)

    # 异步任务
    parse_task = models.ForeignKey("common.AsyncTask", null=True, blank=True, on_delete=models.SET_NULL, related_name="knowledge_documents")

    # 元数据
    metadata = models.JSONField("元数据", default=dict, blank=True)
    error_message = models.TextField("错误信息", blank=True)

    # 统计
    chunk_count = models.PositiveIntegerField("分块数", default=0)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="knowledge_documents")

    class Meta:
        db_table = "knowledge_document"
        verbose_name = "知识文档"
        verbose_name_plural = "知识文档"
        constraints = [
            models.UniqueConstraint(
                fields=["knowledge_base", "file_hash"],
                condition=models.Q(file_hash__gt=""),
                name="uniq_knowledge_document_file_hash",
            ),
        ]
        indexes = [
            models.Index(fields=["knowledge_base"]),
            models.Index(fields=["status"]),
            models.Index(fields=["parse_status"]),
            models.Index(fields=["chunk_status"]),
        ]
```

### 2.3 KnowledgeChunk（知识分块）

```python
from django.contrib.postgres.search import SearchVectorField
from django.contrib.postgres.indexes import GinIndex


class KnowledgeChunk(TimeStampedModel):
    """知识分块."""

    CHUNK_TYPE_CHOICES = [
        ("paragraph", "段落"),
        ("table", "表格"),
        ("list", "列表"),
        ("heading", "标题"),
        ("code", "代码"),
        ("general", "通用"),
    ]

    document = models.ForeignKey(KnowledgeDocument, on_delete=models.CASCADE, related_name="chunks")

    # 分块基本信息
    chunk_index = models.PositiveIntegerField("分块序号")
    title = models.CharField("标题", max_length=255, blank=True)
    section_path = models.CharField("章节路径", max_length=512, blank=True)
    content = models.TextField("内容")
    content_hash = models.CharField("内容哈希", max_length=64)
    chunk_type = models.CharField("分块类型", max_length=32, choices=CHUNK_TYPE_CHOICES, default="general")

    # 位置信息
    page_start = models.PositiveIntegerField("起始页", null=True, blank=True)
    page_end = models.PositiveIntegerField("结束页", null=True, blank=True)
    token_count = models.PositiveIntegerField("Token数", default=0)

    # 元数据
    metadata = models.JSONField("元数据", default=dict, blank=True)

    # 全文检索
    bm25_text = models.TextField("全文检索文本", blank=True)
    search_vector = SearchVectorField(null=True, blank=True)

    # 嵌入状态（P1 使用）
    embedding_status = models.CharField("嵌入状态", max_length=16, choices=KnowledgeDocument.EMBEDDING_STATUS_CHOICES, default=KnowledgeDocument.EMBEDDING_SKIPPED)

    class Meta:
        db_table = "knowledge_chunk"
        verbose_name = "知识分块"
        verbose_name_plural = "知识分块"
        constraints = [
            models.UniqueConstraint(
                fields=["document", "content_hash"],
                name="uniq_knowledge_chunk_hash",
            ),
        ]
        indexes = [
            models.Index(fields=["document", "chunk_index"]),
            models.Index(fields=["chunk_type"]),
            GinIndex(fields=["search_vector"], name="knowledge_chunk_search_gin"),
        ]
```

### 2.4 RetrievalLog（检索日志）

```python
class RetrievalLog(TimeStampedModel):
    """检索日志."""

    RETRIEVAL_MODE_CHOICES = [
        ("postgres_fulltext", "PostgreSQL全文检索"),
        ("keyword", "关键词匹配"),
        ("vector", "向量检索"),
        ("hybrid", "混合检索"),
        ("hybrid_rerank", "混合检索+重排序"),
    ]

    query = models.TextField("查询文本")
    knowledge_bases = models.JSONField("知识库ID列表", default=list)
    filters = models.JSONField("过滤条件", default=dict, blank=True)
    top_k = models.PositiveIntegerField("Top K", default=10)
    retrieval_mode = models.CharField("检索模式", max_length=32, choices=RETRIEVAL_MODE_CHOICES, default="postgres_fulltext")

    # 检索结果
    retrieved_chunks = models.JSONField("检索结果", default=list)
    selected_chunks = models.JSONField("最终选中结果", default=list, blank=True)

    # 关联
    prompt_run = models.ForeignKey("generation.PromptRun", null=True, blank=True, on_delete=models.SET_NULL, related_name="retrieval_logs")
    workflow_node = models.ForeignKey("workflows.WorkflowNodeInstance", null=True, blank=True, on_delete=models.SET_NULL, related_name="retrieval_logs")

    # 性能指标
    latency_ms = models.PositiveIntegerField("耗时毫秒")

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="retrieval_logs")

    class Meta:
        db_table = "knowledge_retrieval_log"
        verbose_name = "检索日志"
        verbose_name_plural = "检索日志"
        indexes = [
            models.Index(fields=["created_at"]),
            models.Index(fields=["prompt_run"]),
            models.Index(fields=["workflow_node"]),
        ]
```

---

## 3. 服务层设计

### 3.1 服务目录结构

```
apps/knowledge/services/
├── __init__.py
├── document_service.py          # 文档上传、状态管理
├── document_parse_service.py    # 文档解析（复用 tender.ParseService）
├── chunk_service.py             # 知识分块
├── search_vector_service.py     # 全文索引更新
├── retrieval_service.py         # 检索服务
├── rag_context_builder.py       # RAG 上下文组装
└── knowledge_pipeline_service.py # 流水线编排
```

### 3.2 DocumentService

**职责：** 文档上传、状态管理、去重校验

**关键修正点：**
- `complete_upload()` 防重复触发：检查 `status != STATUS_UPLOADING` 时抛出异常
- `init_upload()` 校验知识库状态
- `init_upload()` 去重校验（knowledge_base + file_hash）

### 3.3 DocumentParseService

**职责：** 复用 tender 的解析能力

**关键修正点：**
- `_parse_text()` 处理编码异常：先尝试 utf-8，失败后降级到 gbk
- 复用 `apps.tender.services.parse_service.ParseService`

### 3.4 KnowledgeChunkService

**职责：** 对解析后的文档进行分块，生成 bm25_text

**关键修正点：**
- `_prepare_bm25_text()` 使用 jieba 中文分词
- `bulk_create()` 后重新统计实际 chunk_count
- 最小分块大小 50 字符

### 3.5 SearchVectorService

**职责：** 更新 PostgreSQL SearchVector 字段

**关键修正点：**
- 权重调整：title(A) > bm25_text(B) > content(C)
- 无 chunk 时不进入 ready，设为 FAILED
- `search_vector = SearchVector("title", weight="A") + SearchVector("bm25_text", weight="B") + SearchVector("content", weight="C")`

### 3.6 RetrievalService

**职责：** 执行知识检索

**关键修正点：**
- 返回类型：`dict`（非 `list[dict]`）
- `_chunk_to_log_dict()` 使用 `getattr(chunk, "rank", 0.5)`
- `_fulltext_search()` 先转 `list()` 再兜底
- `_keyword_search()` 使用 jieba 分词，限制 8 个关键词
- `_keyword_search()` 增加稳定排序：`order_by("document_id", "chunk_index")`
- `_prepare_search_query_text()` 对全文检索 query 也做 jieba 增强
- `search()` 接收 `created_by` 参数
- `_format_result()` 返回完整 `content` 和截断 `content_preview`

### 3.7 RagContextBuilder

**职责：** 将检索结果组装成 Prompt 可用的上下文

**关键修正点：**
- 超长首个 chunk 截断保底：如果 `part_tokens > max_tokens` 且 `context_parts` 为空，截断保留
- 使用完整 `content`，不用截断版本

### 3.8 KnowledgePipelineService

**职责：** 流水线编排

**关键修正点：**
- 每步后校验状态：`parse_status != PARSE_PARSED` 则抛异常
- 类名：`KnowledgeChunkService`（非 `ChunkService`）
- 更新任务状态 `AsyncTask.STATUS_RUNNING` / `STATUS_SUCCESS` / `STATUS_FAILED`
- 补充 `from django.utils import timezone`

---

## 4. API 层设计

### 4.1 路由

```python
# apps/knowledge/urls.py

urlpatterns = [
    # 知识库管理
    path("bases/", views.KnowledgeBaseListView.as_view(), name="knowledge-base-list"),
    path("bases/<int:id>/", views.KnowledgeBaseDetailView.as_view(), name="knowledge-base-detail"),

    # 文档管理
    path("bases/<int:kb_id>/documents/", views.DocumentListView.as_view(), name="document-list"),
    path("documents/<int:id>/", views.DocumentDetailView.as_view(), name="document-detail"),
    path("documents/<int:id>/complete-upload/", views.DocumentCompleteUploadView.as_view(), name="document-complete-upload"),

    # 分块管理
    path("documents/<int:doc_id>/chunks/", views.ChunkListView.as_view(), name="chunk-list"),
    path("chunks/<int:id>/", views.ChunkDetailView.as_view(), name="chunk-detail"),

    # 检索测试
    path("retrieval/test/", views.RetrievalTestView.as_view(), name="retrieval-test"),
]
```

### 4.2 权限控制

所有知识库 API 需要 `knowledge.manage` 权限：

```python
permission_classes = [IsAuthenticated, RequirePermission]
required_permission = "knowledge.manage"
```

### 4.3 关键修正点

1. **删除 `documents/{id}/init-upload/` 路由**
   - 上传初始化通过 `POST /api/knowledge/bases/{kb_id}/documents/` 完成

2. **DocumentInitUploadSerializer**
   - 参数校验：`file_name`、`file_size`、`file_hash`、`mime_type`

3. **complete-upload 校验 MinIO 对象存在**
   - 检查 `object_key` 是否存在
   - 校验 `file_size` 匹配

4. **Chunk 查询过滤软删除**
   ```python
   KnowledgeChunk.objects.filter(
       document_id=doc_id,
       document__is_deleted=False,
       document__knowledge_base__is_deleted=False,
   )
   ```

5. **RetrievalTestSerializer 校验知识库可用性**
   ```python
   def validate_knowledge_base_ids(self, value):
       existing_count = KnowledgeBase.objects.filter(
           id__in=value,
           is_deleted=False,
           is_active=True,
       ).count()
       if existing_count != len(set(value)):
           raise serializers.ValidationError("存在不可用或不存在的知识库")
       return value
   ```

6. **RetrievalTestView 返回 RAG Context 预览**
   ```python
   retrieval = RetrievalService().search(...)
   rag_context = RagContextBuilder().build(retrieval["results"])
   return Response({**retrieval, "rag_context": rag_context})
   ```

---

## 5. Celery 任务

### 5.1 tasks.py

```python
from django.utils import timezone
from celery import shared_task
from apps.common.models import AsyncTask
from apps.knowledge.models import KnowledgeDocument
from apps.knowledge.services.knowledge_pipeline_service import KnowledgePipelineService


@shared_task(bind=True, max_retries=3)
def process_knowledge_document(self, document_id: int, task_id: int):
    """处理知识文档（解析 -> 分块 -> 索引）."""
    try:
        KnowledgePipelineService().process_document(document_id, task_id)
    except Exception as exc:
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=60)

        # 最终失败
        task = AsyncTask.objects.filter(id=task_id).first()
        if task:
            task.status = AsyncTask.STATUS_FAILED
            task.error_message = str(exc)[:2000]
            task.finished_at = timezone.now()
            task.save()

        document = KnowledgeDocument.objects.filter(id=document_id).first()
        if document:
            document.status = KnowledgeDocument.STATUS_FAILED
            document.error_message = str(exc)[:2000]
            document.save()
        raise


@shared_task
def rebuild_knowledge_base_index(knowledge_base_id: int):
    """重建知识库索引（P1 按钮入口）."""
    from apps.knowledge.services.search_vector_service import SearchVectorService
    from apps.knowledge.models import KnowledgeBase

    kb = KnowledgeBase.objects.filter(id=knowledge_base_id).first()
    if kb:
        SearchVectorService().update_knowledge_base(kb)
```

---

## 6. 菜单与权限配置

### 6.1 菜单配置

```python
# apps/accounts/services/menu_service.py

{
    "key": "knowledge",
    "title": "知识库管理",
    "icon": "FolderOpened",
    "route": "/knowledge",
    "permission": "knowledge.manage",
    "children": None,
}
```

### 6.2 权限注册

```python
# apps/accounts/permissions_registry.py

"knowledge": {
    "manage": {
        "name": "管理知识库",
        "description": "创建、编辑、删除知识库及文档",
    },
}
```

---

## 7. 前端设计

### 7.1 路由

```typescript
{
  path: '/knowledge',
  component: Layout,
  meta: { title: '知识库管理', permission: 'knowledge.manage' },
  children: [
    {
      path: '',
      name: 'KnowledgeBaseList',
      component: () => import('@/views/knowledge/KnowledgeBaseListView.vue'),
      meta: { title: '知识库列表', permission: 'knowledge.manage' },
    },
    {
      path: ':id',
      name: 'KnowledgeBaseDetail',
      component: () => import('@/views/knowledge/KnowledgeBaseDetailView.vue'),
      meta: { title: '知识库详情', permission: 'knowledge.manage' },
      children: [
        {
          path: 'documents',
          name: 'KnowledgeDocuments',
          component: () => import('@/views/knowledge/components/DocumentTab.vue'),
          meta: { title: '文档', permission: 'knowledge.manage' },
        },
        {
          path: 'chunks',
          name: 'KnowledgeChunks',
          component: () => import('@/views/knowledge/components/ChunkTab.vue'),
          meta: { title: '分块', permission: 'knowledge.manage' },
        },
        {
          path: 'retrieval-test',
          name: 'KnowledgeRetrievalTest',
          component: () => import('@/views/knowledge/components/RetrievalTestTab.vue'),
          meta: { title: '检索测试', permission: 'knowledge.manage' },
        },
        {
          path: 'settings',
          name: 'KnowledgeSettings',
          component: () => import('@/views/knowledge/components/SettingsTab.vue'),
          meta: { title: '设置', permission: 'knowledge.manage' },
        },
      ],
    },
  ],
}
```

### 7.2 API 封装

```typescript
// frontend/src/api/knowledge.ts

import { http } from './http'

export interface PageResult<T> {
  count: number
  next?: string | null
  previous?: string | null
  results: T[]
}

export interface KnowledgeBase {
  id: number
  name: string
  description: string
  kb_type: string
  kb_type_display: string
  visibility: string
  visibility_display: string
  is_active: boolean
  document_count: number
  chunk_count: number
  created_at: string
  updated_at: string
  created_by: number
  created_by_name: string
}

export interface KnowledgeDocument {
  id: number
  knowledge_base: number
  knowledge_base_name: string
  file_name: string
  file_size: number
  mime_type: string
  status: string
  status_display: string
  parse_status: string
  parse_status_display: string
  chunk_status: string
  chunk_status_display: string
  embedding_status: string
  index_status: string
  chunk_count: number
  error_message: string
  created_at: string
  updated_at: string
  created_by: number
  created_by_name: string
}

export interface KnowledgeChunk {
  id: number
  document: number
  document_title: string
  chunk_index: number
  title: string
  section_path: string
  content: string
  chunk_type: string
  chunk_type_display: string
  page_start: number | null
  page_end: number | null
  token_count: number
  created_at: string
}

export interface RetrievalResult {
  query: string
  results: RetrievalChunk[]
  latency_ms: number
  log_id: number
  rag_context?: RagContext
}

export interface RetrievalChunk {
  chunk_id: number
  document_id: number
  document_title: string
  knowledge_base_id: number
  knowledge_base_name: string
  kb_type: string
  score: number
  rank: number
  title: string
  section_path: string
  content: string
  content_preview: string
  full_content_length: number
  page_start: number | null
  page_end: number | null
}

export interface RagContext {
  text: string
  sources: Array<{
    chunk_id: number
    document_title: string
    knowledge_base_name: string
    section_path: string
    page_start: number | null
    page_end: number | null
  }>
  token_count: number
  chunk_count: number
}

// 知识库 API
export function listKnowledgeBases(params?: { kb_type?: string; is_active?: boolean }) {
  return http.get<PageResult<KnowledgeBase>>('/api/knowledge/bases/', { params })
}

export function createKnowledgeBase(data: { name: string; description?: string; kb_type: string; visibility?: string }) {
  return http.post<KnowledgeBase>('/api/knowledge/bases/', data)
}

export function getKnowledgeBase(id: number) {
  return http.get<KnowledgeBase>(`/api/knowledge/bases/${id}/`)
}

export function updateKnowledgeBase(id: number, data: Partial<KnowledgeBase>) {
  return http.patch<KnowledgeBase>(`/api/knowledge/bases/${id}/`, data)
}

export function deleteKnowledgeBase(id: number) {
  return http.delete(`/api/knowledge/bases/${id}/`)
}

// 文档 API
export interface InitUploadPayload {
  file_name: string
  file_size: number
  file_hash: string
  mime_type?: string
}

export interface InitUploadResponse {
  document_id: number
  upload_url: string
  upload_fields: Record<string, string>
  object_key: string
  expires_in: number
}

export function listDocuments(kbId: number, params?: { status?: string }) {
  return http.get<PageResult<KnowledgeDocument>>(`/api/knowledge/bases/${kbId}/documents/`, { params })
}

export function initUpload(kbId: number, payload: InitUploadPayload) {
  return http.post<InitUploadResponse>(`/api/knowledge/bases/${kbId}/documents/`, payload)
}

export function getDocument(id: number) {
  return http.get<KnowledgeDocument>(`/api/knowledge/documents/${id}/`)
}

export function completeUpload(id: number) {
  return http.post<{ document_id: number; status: string; task_id: number }>(`/api/knowledge/documents/${id}/complete-upload/`)
}

export function deleteDocument(id: number) {
  return http.delete(`/api/knowledge/documents/${id}/`)
}

// 分块 API
export function listChunks(docId: number) {
  return http.get<PageResult<KnowledgeChunk>>(`/api/knowledge/documents/${docId}/chunks/`)
}

export function getChunk(id: number) {
  return http.get<KnowledgeChunk>(`/api/knowledge/chunks/${id}/`)
}

// 检索测试 API
export interface RetrievalTestPayload {
  query: string
  knowledge_base_ids: number[]
  top_k?: number
  filters?: Record<string, unknown>
}

export function testRetrieval(payload: RetrievalTestPayload) {
  return http.post<RetrievalResult>('/api/knowledge/retrieval/test/', payload)
}
```

### 7.3 页面设计

#### KnowledgeBaseListView

```
+-----------------------------------------------------+
| 知识库管理                        [+ 新建知识库]    |
+-----------------------------------------------------+
| 筛选：[类型 v] [状态 v]                            |
+-----------------------------------------------------+
| +-------------------------------------------------+ |
| | [folder] 公司介绍                公司介绍        | |
| |    文档: 12  分块: 345  更新: 2024-05-26        | |
| |    [进入] [编辑] [停用]                          | |
| +-------------------------------------------------+ |
| +-------------------------------------------------+ |
| | [folder] 项目案例库              项目案例库      | |
| |    文档: 45  分块: 1234  更新: 2024-05-25       | |
| |    [进入] [编辑] [停用]                          | |
| +-------------------------------------------------+ |
+-----------------------------------------------------+
```

#### KnowledgeBaseDetailView（Tab 式）

```
+-----------------------------------------------------+
| <- 返回    公司介绍                                 |
|          企业级 | 启用                             |
+-----------------------------------------------------+
| [文档] [分块] [检索测试] [设置]                    |
+-----------------------------------------------------+
| Tab 内容区域                                        |
| - 文档 Tab: 文档列表 + 上传                        |
| - 分块 Tab: 所有分块列表 + 筛选                    |
| - 检索测试 Tab: Query 输入 + 结果展示              |
| - 设置 Tab: 知识库基本信息编辑                     |
+-----------------------------------------------------+
```

#### 检索测试页（详细布局）

```
+-----------------------------------------------------+
| 检索测试                                           |
+----------------------+------------------------------+
| 查询输入             | 检索结果                     |
| +------------------+ | +--------------------------+ |
| | 请输入查询文本...| | | #1 智慧园区案例          | |
| |                  | | | 分数: 0.85               | |
| |                  | | | 来源: 项目案例库         | |
| +------------------+ | | 章节: 3.2 实施方案       | |
|                      | | 页码: 15-18              | |
| Top K: [10 v]        | | 内容预览...              | |
|                      | +--------------------------+ |
| [执行检索]           |                              |
|                      | +--------------------------+ |
|                      | | #2 公司资质介绍          | |
|                      | | 分数: 0.72               | |
|                      | +--------------------------+ |
+----------------------+------------------------------+
| RAG 上下文预览                                     |
| +-------------------------------------------------+ |
| | ### 来源：智慧园区案例                          | |
| | **章节**：3.2 实施方案                          | |
| | 内容...                                         | |
| +-------------------------------------------------+ |
| Token 数: 1234  |  来源数: 3  [复制上下文]         |
+-----------------------------------------------------+
```

### 7.4 组件清单

| 组件 | 用途 | 优先级 |
|------|------|--------|
| `KnowledgeBaseCard.vue` | 知识库卡片 | P0 |
| `KnowledgeBaseFormDialog.vue` | 新建/编辑知识库对话框 | P0 |
| `KnowledgeDocumentTable.vue` | 文档列表表格 | P0 |
| `KnowledgeUploadDialog.vue` | 文档上传对话框 | P0 |
| `KnowledgeDocumentStatusTag.vue` | 文档状态标签 | P0 |
| `KnowledgeChunkTable.vue` | 分块列表表格 | P0 |
| `KnowledgeChunkViewer.vue` | 分块内容查看器 | P0 |
| `RetrievalQueryPanel.vue` | 检索查询输入面板 | P0 |
| `RetrievalResultPanel.vue` | 检索结果展示面板 | P0 |
| `RagContextPreview.vue` | RAG 上下文预览组件 | P0 |

### 7.5 上传对话框样式（防溢出）

```css
.upload-dialog {
  width: 760px;
  max-width: calc(100vw - 32px);
}

.upload-dialog :deep(.el-dialog__body) {
  overflow: hidden;
}

.upload-area :deep(.el-upload),
.upload-area :deep(.el-upload-dragger) {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.selected-file-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
```

### 7.6 检索测试页增强功能

1. **一键复制 RAG Context**
   - 按钮：`[复制上下文]`
   - 点击后复制 `rag_context.text` 到剪贴板

2. **点击检索结果高亮对应来源**
   - 点击检索结果列表项时
   - 在 RAG Context 预览中高亮对应来源段落

---

## 8. 验收标准

P0 完成后必须满足：

1. 可以创建知识库
2. 可以上传知识文档
3. 可以解析文档（复用 ParseService）
4. 可以对文档分块
5. 可以查看 chunk 列表
6. 可以执行检索测试
7. 检索结果能返回 chunk、分数、来源文档
8. 检索日志能记录 query、命中结果、耗时
9. 前端有知识库列表、详情页（Tab 式）、检索测试页面
10. 后续 PromptExecutionService 能接收 retrieved_knowledge 变量
11. 所有 API 有 `knowledge.manage` 权限控制
12. 软删除知识库和文档
13. PostgreSQL 全文检索 + jieba 中文分词兜底

---

## 9. P1/P2 预留

### P1：向量检索与混合检索

- embedding 生成（阿里百炼）
- pgvector 索引
- BM25 + Vector 混合检索
- 检索配置 RetrievalConfig
- 检索日志详情页

### P2：Rerank + RAG 上下文压缩

- rerank 模型接入
- context compression
- citation assembly
- RAG 命中来源展示
- PromptRun 与 RetrievalLog 打通

---

## 10. 与 Dify 对应关系

| 我们模型 | Dify 对应 |
|---------|----------|
| KnowledgeBase | Dataset / Knowledge Base |
| KnowledgeDocument | Document |
| KnowledgeChunk | Document Segment / Chunk |
| RetrievalLog | Retrieval / Hit Testing / Trace Log |

| 我们服务 | Dify 对应 |
|---------|----------|
| DocumentService | 文档导入 / datasource / docstore |
| DocumentParseService | extractor |
| KnowledgeChunkService | splitter |
| SearchVectorService | index_processor |
| RetrievalService | retrieval |
| RagContextBuilder | pipeline / context assembly |
| KnowledgePipelineService | pipeline 编排 |
