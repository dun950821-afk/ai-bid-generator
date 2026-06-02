# 知识库文档上传优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复知识库文档上传的三个问题：大文件超时、无进度显示、分块完成后不刷新。

**Architecture:** 后端新增按知识库查询分块 API；前端实现动态超时、上传进度条、文档状态轮询、父组件协调刷新。

**Tech Stack:** Django REST Framework, Vue 3, TypeScript, Element Plus, Axios

---

## Task 1: 后端 - 新增按知识库查询分块 API

**Files:**
- Modify: `backend/apps/knowledge/views/chunk_views.py`
- Modify: `backend/apps/knowledge/urls.py`

- [ ] **Step 1: 编写 KnowledgeBaseChunkListView 视图**

在 `backend/apps/knowledge/views/chunk_views.py` 末尾添加：

```python
from django.contrib.postgres.search import SearchVector
from django.db.models import Q


class KnowledgeBaseChunkListView(generics.ListAPIView):
    """按知识库查询分块列表。"""

    serializer_class = KnowledgeChunkSerializer
    permission_classes = [IsAuthenticated, RequirePermission]
    required_permission = "knowledge.view"
    pagination_class = DefaultPagination

    def get_queryset(self):
        kb_id = self.kwargs["kb_id"]
        queryset = KnowledgeChunk.objects.filter(
            document__knowledge_base_id=kb_id,
            document__is_deleted=False,
            document__knowledge_base__is_deleted=False,
        ).select_related("document")

        # 按 document_id 筛选
        document_id = self.request.query_params.get("document_id")
        if document_id:
            queryset = queryset.filter(document_id=document_id)

        # 按 keyword 搜索
        keyword = self.request.query_params.get("keyword")
        if keyword:
            queryset = queryset.filter(
                Q(title__icontains=keyword) | Q(content__icontains=keyword)
            )

        return queryset.order_by("document_id", "chunk_index")
```

- [ ] **Step 2: 在 urls.py 中添加路由**

在 `backend/apps/knowledge/urls.py` 的 `urlpatterns` 中添加（在 `# 分块管理` 部分后）：

```python
    # 按知识库查询分块
    path("bases/<int:kb_id>/chunks/", KnowledgeBaseChunkListView.as_view(), name="knowledge-base-chunk-list"),
```

并在文件顶部的 import 中添加 `KnowledgeBaseChunkListView`：

```python
from apps.knowledge.views import (
    KnowledgeBaseListView,
    KnowledgeBaseDetailView,
    DocumentListView,
    DocumentDetailView,
    DocumentCompleteUploadView,
    DocumentDirectUploadView,
    ChunkListView,
    ChunkDetailView,
    RetrievalTestView,
    KnowledgeBaseChunkListView,  # 新增
)
```

- [ ] **Step 3: 更新 views/__init__.py 导出**

在 `backend/apps/knowledge/views/__init__.py` 中添加导出：

```python
from .chunk_views import ChunkListView, ChunkDetailView, KnowledgeBaseChunkListView

__all__ = [
    # ... 现有导出 ...
    "KnowledgeBaseChunkListView",
]
```

- [ ] **Step 4: 提交后端更改**

```bash
git add backend/apps/knowledge/views/chunk_views.py backend/apps/knowledge/views/__init__.py backend/apps/knowledge/urls.py
git commit -m "feat(knowledge): add KnowledgeBaseChunkListView for querying chunks by kb_id

Supports pagination, document_id filter, and keyword search.
Requires knowledge.view permission."
```

---

## Task 2: 前端 API - 修改 knowledge.ts

**Files:**
- Modify: `frontend/src/api/knowledge.ts`

- [ ] **Step 1: 添加 listChunksByKnowledgeBase 函数**

在 `frontend/src/api/knowledge.ts` 的 `// 分块 API` 部分添加：

```typescript
export function listChunksByKnowledgeBase(
  kbId: number,
  params?: { page?: number; page_size?: number; document_id?: number; keyword?: string }
) {
  return http.get<PageResult<KnowledgeChunk>>(`/api/knowledge/bases/${kbId}/chunks/`, { params })
}
```

- [ ] **Step 2: 修改 directUploadDocument 函数支持进度回调和动态超时**

将现有的 `directUploadDocument` 函数替换为：

```typescript
/**
 * 直接上传知识库文档（推荐）。
 * 后端接收 multipart/form-data，计算 SHA256，上传 MinIO，触发处理。
 */
export function directUploadDocument(
  kbId: number,
  file: File,
  onProgress?: (percent: number) => void
) {
  const formData = new FormData()
  formData.append('file', file)

  // 动态超时计算
  const fileSizeMB = file.size / 1024 / 1024
  const timeout = Math.min(
    Math.max(fileSizeMB * 15 * 1000 + 30 * 1000, 60 * 1000),  // 最少60秒，每MB预留15秒
    20 * 60 * 1000  // 最大20分钟
  )

  return http.post<{ document_id: number; status: string; task_id: number }>(
    `/api/knowledge/bases/${kbId}/documents/upload/`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout,
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100)
          onProgress(percent)
        }
      },
    }
  )
}
```

- [ ] **Step 3: 提交 API 更改**

```bash
git add frontend/src/api/knowledge.ts
git commit -m "feat(knowledge): add listChunksByKnowledgeBase and dynamic timeout for upload

- Add listChunksByKnowledgeBase API for querying chunks by kb_id
- Add dynamic timeout calculation based on file size
- Add onProgress callback for upload progress tracking"
```

---

## Task 3: 前端 - 修改上传对话框添加进度条

**Files:**
- Modify: `frontend/src/views/knowledge/components/KnowledgeUploadDialog.vue`

- [ ] **Step 1: 添加上传进度状态和进度条组件**

将整个 `<script setup lang="ts">` 部分替换为：

```typescript
<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { directUploadDocument } from '@/api/knowledge'

const props = defineProps<{
  modelValue: boolean
  knowledgeBaseId: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  uploaded: [documentId: number]
}>()

const selectedFile = ref<File | null>(null)
const uploading = ref(false)
const uploadProgress = ref(0)

const handleFileChange = (file: any) => {
  selectedFile.value = file.raw
}

const handleExceed = () => {
  ElMessage.warning('一次只能上传一个文件')
}

const handleUpload = async () => {
  if (!selectedFile.value) {
    ElMessage.warning('请选择文件')
    return
  }

  uploading.value = true
  uploadProgress.value = 0

  try {
    const res = await directUploadDocument(
      props.knowledgeBaseId,
      selectedFile.value,
      (percent) => {
        uploadProgress.value = percent
      }
    )
    ElMessage.success('上传完成，系统正在后台解析文档...')
    emit('update:modelValue', false)
    emit('uploaded', res.data.document_id)
    selectedFile.value = null
    uploadProgress.value = 0
  } catch (e: any) {
    console.error('上传错误:', e)
    let errorMsg = '上传失败'
    if (e.response?.data?.message) {
      errorMsg = e.response.data.message
    } else if (e.response?.data?.detail) {
      errorMsg = e.response.data.detail
    } else if (e.message) {
      errorMsg = e.message
    }
    ElMessage.error(errorMsg)
  } finally {
    uploading.value = false
  }
}

const formatSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>
```

- [ ] **Step 2: 在模板中添加进度条**

将 `<div v-if="selectedFile" class="selected-file">` 部分替换为：

```vue
    <div v-if="selectedFile" class="selected-file">
      <span class="selected-file-name">{{ selectedFile.name }}</span>
      <span class="selected-file-size">{{ formatSize(selectedFile.size) }}</span>
    </div>

    <div v-if="uploading" class="upload-progress">
      <el-progress :percentage="uploadProgress" :stroke-width="8" />
      <span class="progress-text">上传中 {{ uploadProgress }}%</span>
    </div>
```

- [ ] **Step 3: 添加进度条样式**

在 `<style scoped>` 部分末尾添加：

```css
.upload-progress {
  margin-top: 16px;
}

.progress-text {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
  text-align: center;
}
```

- [ ] **Step 4: 修改 emit 定义，uploaded 事件传递 documentId**

（已在 Step 1 中包含）

- [ ] **Step 5: 提交上传对话框更改**

```bash
git add frontend/src/views/knowledge/components/KnowledgeUploadDialog.vue
git commit -m "feat(knowledge): add upload progress bar to upload dialog

- Show upload percentage during file upload
- Emit document_id on uploaded event for polling"
```

---

## Task 4: 前端 - 实现 DocumentTab 轮询机制

**Files:**
- Modify: `frontend/src/views/knowledge/components/DocumentTab.vue`

- [ ] **Step 1: 添加轮询相关导入和状态**

将 `<script setup lang="ts">` 部分替换为：

```typescript
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listDocuments, deleteDocument, getDocument, type KnowledgeDocument } from '@/api/knowledge'
import KnowledgeDocumentTable from './KnowledgeDocumentTable.vue'
import KnowledgeUploadDialog from './KnowledgeUploadDialog.vue'

// 文档状态常量
const INCOMPLETE_STATUSES = ['uploading', 'uploaded', 'processing', 'pending', 'chunking']
const COMPLETE_STATUSES = ['ready', 'failed', 'cancelled']
const POLLING_INTERVAL = 30000 // 30秒
const MAX_POLLING_ERRORS = 5

const props = defineProps<{
  knowledgeBaseId: number
}>()

const emit = defineEmits<{
  documentStatusChanged: [doc: KnowledgeDocument]
}>()

const loading = ref(false)
const documents = ref<KnowledgeDocument[]>([])
const showUploadDialog = ref(false)

// 轮询状态
const pollingTimer = ref<number | null>(null)
const pollingErrorCount = ref(0)
const pendingDocumentIds = ref<Set<number>>(new Set())

const fetchDocuments = async () => {
  loading.value = true
  try {
    const res = await listDocuments(props.knowledgeBaseId)
    documents.value = res.data.results
  } catch (e) {
    ElMessage.error('获取文档列表失败')
  } finally {
    loading.value = false
  }
}

const startPolling = () => {
  if (pollingTimer.value) return

  pollingTimer.value = window.setInterval(async () => {
    if (pendingDocumentIds.value.size === 0) {
      stopPolling()
      return
    }

    try {
      const idsToCheck = Array.from(pendingDocumentIds.value)
      for (const docId of idsToCheck) {
        const res = await getDocument(docId)
        const doc = res.data

        if (COMPLETE_STATUSES.includes(doc.status)) {
          pendingDocumentIds.value.delete(docId)
          emit('documentStatusChanged', doc)
        }
      }

      // 刷新文档列表
      await fetchDocuments()
      pollingErrorCount.value = 0

      // 所有文档都完成，停止轮询
      if (pendingDocumentIds.value.size === 0) {
        stopPolling()
      }
    } catch (e) {
      pollingErrorCount.value += 1
      if (pollingErrorCount.value >= MAX_POLLING_ERRORS) {
        stopPolling()
        ElMessage.warning('文档状态轮询失败，请手动刷新')
      }
    }
  }, POLLING_INTERVAL)
}

const stopPolling = () => {
  if (pollingTimer.value) {
    clearInterval(pollingTimer.value)
    pollingTimer.value = null
  }
}

const handleUploaded = (documentId: number) => {
  // 立即刷新文档列表
  fetchDocuments()
  // 将新文档加入轮询队列
  pendingDocumentIds.value.add(documentId)
  // 启动轮询
  startPolling()
}

const viewChunks = (_doc: KnowledgeDocument) => {
  // 跳转到分块 Tab 或展开分块列表
}

const handleDelete = async (doc: KnowledgeDocument) => {
  try {
    await ElMessageBox.confirm(`确定删除文档「${doc.file_name}」吗？`, '确认删除', {
      type: 'warning',
    })
    await deleteDocument(doc.id)
    ElMessage.success('删除成功')
    fetchDocuments()
  } catch (e) {
    // 用户取消
  }
}

onMounted(() => {
  fetchDocuments()
})

onBeforeUnmount(() => {
  stopPolling()
})
</script>
```

- [ ] **Step 2: 修改模板，传递 uploaded 事件**

将 `<KnowledgeUploadDialog>` 部分修改为：

```vue
    <KnowledgeUploadDialog
      v-model="showUploadDialog"
      :knowledge-base-id="knowledgeBaseId"
      @uploaded="handleUploaded"
    />
```

- [ ] **Step 3: 提交 DocumentTab 更改**

```bash
git add frontend/src/views/knowledge/components/DocumentTab.vue
git commit -m "feat(knowledge): implement document status polling in DocumentTab

- Poll document status every 30 seconds after upload
- Stop polling when all documents reach terminal state
- Stop polling after 5 consecutive errors
- Clean up timer on component unmount
- Emit documentStatusChanged event for parent coordination"
```

---

## Task 5: 前端 - 修改 ChunkTab 支持 refreshKey

**Files:**
- Modify: `frontend/src/views/knowledge/components/ChunkTab.vue`

- [ ] **Step 1: 添加 refreshKey prop 并监听**

将整个文件替换为：

```vue
<!-- frontend/src/views/knowledge/components/ChunkTab.vue -->
<template>
  <div class="chunk-tab">
    <KnowledgeChunkTable :knowledge-base-id="knowledgeBaseId" :refresh-key="refreshKey" />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  knowledgeBaseId: number
  refreshKey?: number
}>()
</script>

<style scoped>
.chunk-tab {
  padding: 0;
}
</style>
```

- [ ] **Step 2: 提交 ChunkTab 更改**

```bash
git add frontend/src/views/knowledge/components/ChunkTab.vue
git commit -m "feat(knowledge): add refreshKey prop to ChunkTab for parent coordination"
```

---

## Task 6: 前端 - 修改 KnowledgeChunkTable 调用新 API

**Files:**
- Modify: `frontend/src/views/knowledge/components/KnowledgeChunkTable.vue`

- [ ] **Step 1: 重写 KnowledgeChunkTable 使用新 API**

将整个文件替换为：

```vue
<!-- frontend/src/views/knowledge/components/KnowledgeChunkTable.vue -->
<template>
  <div>
    <div class="toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索分块内容"
        style="width: 300px"
        clearable
        @keyup.enter="handleSearch"
      />
      <el-button type="primary" @click="handleSearch" style="margin-left: 8px">搜索</el-button>
    </div>

    <el-table :data="chunks" v-loading="loading" stripe>
      <el-table-column prop="chunk_index" label="序号" width="60" />
      <el-table-column prop="title" label="标题" min-width="150" />
      <el-table-column prop="section_path" label="章节路径" min-width="150" />
      <el-table-column label="内容" min-width="300">
        <template #default="{ row }">
          <span class="content-preview">{{ row.content.slice(0, 100) }}...</span>
        </template>
      </el-table-column>
      <el-table-column prop="token_count" label="Token" width="80" />
      <el-table-column prop="chunk_type_display" label="类型" width="80" />

      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button text type="primary" @click="showChunkDetail(row)">查看</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-if="total > 0"
      class="pagination"
      :current-page="currentPage"
      :page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next"
      @current-change="handlePageChange"
    />

    <KnowledgeChunkViewer
      v-model="showViewer"
      :chunk="selectedChunk"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { listChunksByKnowledgeBase, type KnowledgeChunk } from '@/api/knowledge'
import KnowledgeChunkViewer from './KnowledgeChunkViewer.vue'

const props = defineProps<{
  knowledgeBaseId: number
  refreshKey?: number
}>()

const loading = ref(false)
const chunks = ref<KnowledgeChunk[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const showViewer = ref(false)
const selectedChunk = ref<KnowledgeChunk | null>(null)

const fetchChunks = async () => {
  loading.value = true
  try {
    const res = await listChunksByKnowledgeBase(props.knowledgeBaseId, {
      page: currentPage.value,
      page_size: pageSize.value,
      keyword: keyword.value || undefined,
    })
    chunks.value = res.data.results
    total.value = res.data.count
  } catch (e) {
    ElMessage.error('获取分块列表失败')
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  currentPage.value = 1
  fetchChunks()
}

const handlePageChange = (page: number) => {
  currentPage.value = page
  fetchChunks()
}

const showChunkDetail = (chunk: KnowledgeChunk) => {
  selectedChunk.value = chunk
  showViewer.value = true
}

// 监听 refreshKey 变化，重新加载数据
watch(() => props.refreshKey, (newKey) => {
  if (newKey !== undefined && newKey > 0) {
    currentPage.value = 1
    fetchChunks()
  }
})

onMounted(() => {
  fetchChunks()
})
</script>

<style scoped>
.toolbar {
  display: flex;
  margin-bottom: 16px;
}

.content-preview {
  color: #666;
}

.pagination {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
```

- [ ] **Step 2: 提交 KnowledgeChunkTable 更改**

```bash
git add frontend/src/views/knowledge/components/KnowledgeChunkTable.vue
git commit -m "feat(knowledge): implement KnowledgeChunkTable with new API

- Use listChunksByKnowledgeBase API
- Support pagination and keyword search
- Watch refreshKey prop for parent-triggered refresh"
```

---

## Task 7: 前端 - 父组件 KnowledgeBaseDetailView 协调刷新

**Files:**
- Modify: `frontend/src/views/knowledge/KnowledgeBaseDetailView.vue`

- [ ] **Step 1: 添加 chunkRefreshKey 和事件处理**

将 `<script setup lang="ts">` 部分替换为：

```typescript
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getKnowledgeBase, type KnowledgeBase, type KnowledgeDocument } from '@/api/knowledge'
import DocumentTab from './components/DocumentTab.vue'
import ChunkTab from './components/ChunkTab.vue'
import RetrievalTestTab from './components/RetrievalTestTab.vue'
import SettingsTab from './components/SettingsTab.vue'

const route = useRoute()
const router = useRouter()

const knowledgeBase = ref<KnowledgeBase | null>(null)
const activeTab = ref('documents')
const chunkRefreshKey = ref(0)

const fetchDetail = async () => {
  const id = Number(route.params.id)
  try {
    const res = await getKnowledgeBase(id)
    knowledgeBase.value = res.data
  } catch (e) {
    ElMessage.error('获取知识库详情失败')
    router.push('/knowledge')
  }
}

const handleDocumentStatusChanged = (doc: KnowledgeDocument) => {
  if (doc.status === 'ready') {
    chunkRefreshKey.value += 1
  }
}

onMounted(() => {
  fetchDetail()
})
</script>
```

- [ ] **Step 2: 修改模板，添加事件监听和 refreshKey 传递**

将 `<el-tabs>` 内的 Tab 部分替换为：

```vue
    <el-tabs v-model="activeTab" class="detail-tabs">
      <el-tab-pane label="文档" name="documents">
        <DocumentTab
          v-if="knowledgeBase"
          :knowledge-base-id="knowledgeBase.id"
          @document-status-changed="handleDocumentStatusChanged"
        />
      </el-tab-pane>
      <el-tab-pane label="分块" name="chunks">
        <ChunkTab
          v-if="knowledgeBase"
          :knowledge-base-id="knowledgeBase.id"
          :refresh-key="chunkRefreshKey"
        />
      </el-tab-pane>
      <el-tab-pane label="检索测试" name="retrieval">
        <RetrievalTestTab v-if="knowledgeBase" :knowledge-base-id="knowledgeBase.id" />
      </el-tab-pane>
      <el-tab-pane label="设置" name="settings">
        <SettingsTab v-if="knowledgeBase" :knowledge-base="knowledgeBase" @updated="fetchDetail" />
      </el-tab-pane>
    </el-tabs>
```

- [ ] **Step 3: 提交父组件更改**

```bash
git add frontend/src/views/knowledge/KnowledgeBaseDetailView.vue
git commit -m "feat(knowledge): add parent coordination for chunk refresh

- Add chunkRefreshKey for coordinating ChunkTab refresh
- Handle documentStatusChanged event from DocumentTab
- Pass refreshKey to ChunkTab for automatic refresh when document is ready"
```

---

## Task 8: 验证和测试

**Files:**
- Test: 手动测试

- [ ] **Step 1: 启动开发服务器**

```bash
cd /home/newaibook/ai-bid-generator
docker compose up -d
```

- [ ] **Step 2: 验证上传功能**

1. 打开知识库详情页
2. 点击"上传文档"
3. 选择一个 50MB 以上的文件
4. 观察上传进度条显示
5. 等待上传完成，确认显示"上传完成，系统正在后台解析文档..."
6. 确认对话框 3 秒后自动关闭
7. 确认文档列表自动刷新

- [ ] **Step 3: 验证轮询功能**

1. 上传一个 PDF 文档
2. 观察文档列表中的状态变化
3. 等待文档处理完成（状态变为 ready 或 failed）
4. 切换到"分块" Tab，确认分块列表自动刷新

- [ ] **Step 4: 验证分块查询功能**

1. 在分块列表中输入关键词搜索
2. 确认搜索结果正确
3. 测试分页功能

- [ ] **Step 5: 最终提交**

```bash
git add -A
git status
# 确认所有更改已提交
```

---

## 验证清单

- [ ] 大文件上传不会因固定短超时失败
- [ ] 上传时显示进度条
- [ ] 上传进度只表示文件上传，不表示解析入库
- [ ] 上传完成后提示后台处理中
- [ ] 上传完成后 3 秒自动关闭对话框
- [ ] 文档列表能显示 processing / ready / failed
- [ ] 文档处理完成后自动停止轮询
- [ ] 组件卸载后轮询停止
- [ ] 连续轮询失败 5 次后停止轮询
- [ ] 文档 ready 后刷新分块列表
- [ ] 分块接口按知识库查询
- [ ] 分块接口支持分页
- [ ] 分块接口支持 document_id 筛选
- [ ] 分块接口支持 keyword 搜索
- [ ] 查看分块使用 knowledge.view 权限
- [ ] 不引入新的 UI 库