# 知识库文档上传优化设计

## 背景

当前知识库文档上传存在三个问题：

1. **大文件上传超时失败** - 固定 30 秒超时，100MB 文件上传失败
2. **无上传进度显示** - 用户看不到上传进度
3. **分块完成后不刷新** - 文档处理完成后需要手动刷新页面

## 设计目标

1. 大文件上传不因固定短超时失败
2. 上传时显示进度条（仅表示文件上传，不表示后端处理）
3. 上传完成后提示后台处理中，3 秒后自动关闭对话框
4. 文档列表能显示 processing / ready / failed 状态
5. 文档处理完成后自动停止轮询并刷新分块列表
6. 组件卸载后轮询停止
7. 连续轮询失败 5 次后停止轮询
8. 分块接口支持按知识库查询、分页、筛选

## 详细设计

### 1. 上传超时优化

知识库文档上传采用动态超时，避免大文件上传因固定短超时失败。

前端在 `directUploadDocument()` 中根据文件大小计算 axios timeout：

```ts
const fileSizeMB = file.size / 1024 / 1024

const timeout = Math.min(
  Math.max(fileSizeMB * 15 * 1000 + 30 * 1000, 60 * 1000),
  20 * 60 * 1000
)
```

规则：

- 最少 60 秒
- 每 MB 预留 15 秒
- 额外增加 30 秒网络抖动时间
- 最大 20 分钟

**修改位置：**

- `frontend/src/api/knowledge.ts`

---

### 2. 上传进度与后端处理状态分离

前端需要区分"文件上传进度"和"后端解析入库进度"。

**前端 UI 状态：**

| 状态 | 说明 |
|------|------|
| uploading | 上传中，显示 0-100% 上传进度条 |
| uploaded | 上传完成，提示系统正在后台解析文档 |
| processing | 后端处理中，进入轮询阶段 |
| ready | 处理完成 |
| failed | 处理失败 |

说明：

- `uploading` / `uploaded` 是前端上传阶段状态
- `processing` / `ready` / `failed` 来源于后端文档状态
- `onUploadProgress` 只表示文件上传进度，不表示解析、分块、向量化进度

**上传成功后：**

1. 显示提示："上传完成，系统正在后台解析文档"
2. 3 秒后自动关闭上传对话框
3. 立即刷新文档列表
4. 用户可在文档列表中查看处理状态

**修改位置：**

- `frontend/src/api/knowledge.ts`
- `frontend/src/views/knowledge/components/KnowledgeUploadDialog.vue`

---

### 3. 文档状态轮询机制

上传成功后启动文档状态轮询。

**未完成状态：**

```ts
const INCOMPLETE_STATUSES = [
  "uploading",
  "uploaded",
  "processing",
  "pending",
  "chunking",
]
```

**完成状态：**

```ts
const COMPLETE_STATUSES = [
  "ready",
  "failed",
  "cancelled",
]
```

前端判断是否停止轮询时，以 `document.status` 为准：

```ts
const isComplete = doc => COMPLETE_STATUSES.includes(doc.status)
```

**轮询流程：**

```
上传成功
  ↓
立即刷新文档列表
  ↓
将 document.id 加入 pendingDocumentIds
  ↓
启动轮询
  ↓
每 30 秒查询未完成文档状态
  ↓
ready / failed / cancelled 后移出 pendingDocumentIds
  ↓
pendingDocumentIds 为空时停止轮询
  ↓
刷新文档列表和分块列表
```

**生命周期保护：**

```ts
const pollingTimer = ref<number | null>(null)
const pollingErrorCount = ref(0)
const pendingDocumentIds = ref<Set<number>>(new Set())

function stopPolling() {
  if (pollingTimer.value) {
    clearInterval(pollingTimer.value)
    pollingTimer.value = null
  }
}

onBeforeUnmount(() => {
  stopPolling()
})
```

**错误保护：**

```ts
if (error) {
  pollingErrorCount.value += 1
  if (pollingErrorCount.value >= 5) {
    stopPolling()
  }
}
```

**修改位置：**

- `frontend/src/views/knowledge/components/DocumentTab.vue`

---

### 4. 父组件统一协调刷新

DocumentTab 不直接操作 ChunkTab，由父组件统一协调。

**事件流：**

```
DocumentTab 上传成功 / 文档处理完成
  ↓ emit("document-status-changed")
KnowledgeBaseDetailView 接收
  ↓ 更新 chunkRefreshKey
ChunkTab 监听 refreshKey
  ↓ 重新加载分块列表
```

**父组件实现：**

```ts
const chunkRefreshKey = ref(0)

function handleDocumentStatusChanged(doc) {
  if (doc.status === "ready") {
    chunkRefreshKey.value += 1
  }
}
```

**模板示例：**

```vue
<DocumentTab
  @document-status-changed="handleDocumentStatusChanged"
/>

<ChunkTab
  :refresh-key="chunkRefreshKey"
/>
```

**修改位置：**

- `frontend/src/views/knowledge/KnowledgeBaseDetailView.vue`
- `frontend/src/views/knowledge/components/DocumentTab.vue`
- `frontend/src/views/knowledge/components/ChunkTab.vue`

---

### 5. 新增按知识库查询分块 API

**新增接口：**

```
GET /api/knowledge/bases/<kb_id>/chunks/
```

**查询参数：**

| 参数 | 说明 |
|------|------|
| page | 页码 |
| page_size | 每页数量，默认 20 |
| document_id | 筛选指定文档的分块 |
| keyword | 搜索分块内容 |

**请求示例：**

```
GET /api/knowledge/bases/1/chunks/?page=1&page_size=20&document_id=123&keyword=合同
```

**返回 DRF 分页格式：**

```json
{
  "count": 1200,
  "next": null,
  "previous": null,
  "results": []
}
```

**权限要求：**

- 查看分块：`knowledge.view`
- 管理分块：`knowledge.manage`

该接口必须校验用户对知识库的访问权限。

**修改位置：**

- `backend/apps/knowledge/views/chunk_views.py`
- `backend/apps/knowledge/urls.py`
- `frontend/src/api/knowledge.ts`
- `frontend/src/views/knowledge/components/KnowledgeChunkTable.vue`

**前端新增 API：**

```ts
export function listChunksByKnowledgeBase(kbId, params) {
  return http.get<PageResult<KnowledgeChunk>>(
    `/api/knowledge/bases/${kbId}/chunks/`,
    { params }
  )
}
```

---

### 6. 单个文档状态查询 API

完善 `getDocument()` 返回字段：

```json
{
  "id": 123,
  "file_name": "招标文件.docx",
  "status": "processing",
  "parse_status": "parsed",
  "chunk_status": "chunking",
  "chunk_count": 0,
  "error_message": "",
  "updated_at": "2026-06-02T10:00:00"
}
```

**字段说明：**

| 字段 | 说明 |
|------|------|
| status | 前端主状态判断字段 |
| parse_status | 解析状态，仅用于展示 |
| chunk_status | 分块/向量化状态，仅用于展示 |
| chunk_count | 当前已生成分块数 |
| error_message | 失败原因 |

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