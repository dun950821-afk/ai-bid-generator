# 重新解析功能设计

**日期：** 2026-05-28
**状态：** 待审批
**范围：** 项目详情页 - 文件列表 & 解析详情页

---

## 1. 需求概述

在项目详情页增加"重新解析"功能，允许用户对已解析的招标文件重新执行解析操作。

**核心需求：**
- 文件列表：已解析成功的文件显示"重新解析"按钮
- 解析详情页：添加"重新解析"按钮和版本选择功能
- 支持多版本：保留历史解析版本，用户可查看和切换

---

## 2. API 设计

### 2.1 接口清单

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/tender/files/{id}/reparse/` | 重新解析文件 |
| GET | `/api/tender/files/{id}/parse-versions/` | 获取解析版本列表 |
| POST | `/api/tender/files/{id}/parse-versions/{version_id}/activate/` | 激活历史版本 |

---

### 2.2 重新解析 API

**POST `/api/tender/files/{id}/reparse/`**

**请求体：** 空对象 `{}`（P0），后续可扩展解析参数

**状态校验：**

```python
# 禁止状态：正在处理中
running_statuses = ["parsing", "chunking", "processing"]

# 允许状态：已解析过或解析失败
allowed_statuses = ["parsed", "chunked", "ready", "parse_failed", "requirement_extracted"]
```

**处理逻辑：**

```python
@action(detail=True, methods=['post'])
def reparse(self, request, pk=None):
    with transaction.atomic():
        # 锁定记录防并发
        tender_file = TenderFile.objects.select_for_update().get(pk=pk)

        # 禁止处理中的文件重复触发
        if tender_file.status in ["parsing", "chunking", "processing"]:
            return Response(
                {"message": "文件正在处理中，请勿重复触发重新解析"},
                status=400,
            )

        # 仅允许已解析过的文件
        allowed = ["parsed", "chunked", "ready", "parse_failed", "requirement_extracted"]
        if tender_file.status not in allowed:
            return Response(
                {"message": "该文件状态不支持重新解析"},
                status=400,
            )

        # 记录旧版本 ID
        old_doc = ParsedDocument.objects.filter(
            tender_file=tender_file, is_active=True
        ).first()
        old_doc_id = old_doc.id if old_doc else None

        # 更新状态为解析中
        tender_file.status = "parsing"
        tender_file.save(update_fields=["status", "updated_at"])

        # 创建解析任务
        job = create_parse_job(tender_file)

        # 记录审计日志
        AuditService.record(
            module="tender",
            action="reparse",
            target_type="TenderFile",
            target_id=tender_file.id,
            operator=request.user,
            metadata={"old_active_parsed_document_id": old_doc_id},
        )

    return Response({
        "message": "已提交重新解析任务",
        "file_id": tender_file.id,
        "status": "parsing",
        "job_id": job.id,
    })
```

**返回示例：**

```json
{
  "message": "已提交重新解析任务",
  "file_id": 1,
  "status": "parsing",
  "job_id": 123
}
```

---

### 2.3 解析版本列表 API

**GET `/api/tender/files/{id}/parse-versions/`**

**处理逻辑：**

```python
@action(detail=True, methods=['get'])
def parse_versions(self, request, pk=None):
    tender_file = self.get_object()

    versions = ParsedDocument.objects.filter(
        tender_file=tender_file
    ).annotate(
        chunk_count=Count("chunks")
    ).order_by("-created_at").values(
        "id",
        "parser_version",
        "parse_engine",
        "parse_quality",
        "page_count",
        "chunk_count",
        "is_active",
        "created_at",
        "error_message",
    )

    return Response({"results": list(versions)})
```

**返回示例：**

```json
{
  "results": [
    {
      "id": 10,
      "parser_version": "v1",
      "parse_engine": "builtin",
      "parse_quality": "high",
      "page_count": 12,
      "chunk_count": 89,
      "is_active": true,
      "created_at": "2026-05-28T15:30:00",
      "error_message": ""
    },
    {
      "id": 9,
      "parser_version": "v1",
      "parse_engine": "builtin",
      "parse_quality": "medium",
      "page_count": 12,
      "chunk_count": 88,
      "is_active": false,
      "created_at": "2026-05-28T14:10:00",
      "error_message": ""
    }
  ]
}
```

---

### 2.4 激活历史版本 API

**POST `/api/tender/files/{id}/parse-versions/{version_id}/activate/`**

**处理逻辑：**

```python
@action(
    detail=True,
    methods=['post'],
    url_path='parse-versions/(?P<version_id>[^/.]+)/activate'
)
def activate_version(self, request, pk=None, version_id=None):
    with transaction.atomic():
        # 锁定记录
        tender_file = TenderFile.objects.select_for_update().get(pk=pk)

        # 禁止处理中的文件切换版本
        if tender_file.status in ["parsing", "chunking", "processing"]:
            return Response(
                {"message": "文件正在处理中，不能切换解析版本"},
                status=400,
            )

        # 验证目标版本
        try:
            target_doc = ParsedDocument.objects.get(
                id=version_id,
                tender_file=tender_file
            )
        except ParsedDocument.DoesNotExist:
            return Response({"message": "版本不存在"}, status=404)

        # 切换活跃版本
        ParsedDocument.objects.filter(tender_file=tender_file).update(is_active=False)
        target_doc.is_active = True
        target_doc.save(update_fields=["is_active"])

        # 更新文件状态（不设为 requirement_extracted，避免与条款不一致）
        tender_file.status = "chunked"
        tender_file.save(update_fields=["status", "updated_at"])

        # 记录审计日志
        AuditService.record(
            module="tender",
            action="activate_parse_version",
            target_type="ParsedDocument",
            target_id=target_doc.id,
            operator=request.user,
        )

    return Response({"message": "已切换到该版本"})
```

**返回示例：**

```json
{
  "message": "已切换到该版本"
}
```

---

## 3. 数据处理策略

### 3.1 重新解析时数据处理

| 数据类型 | 处理方式 |
|----------|----------|
| 旧 `ParsedDocument` | 保留，设为 `is_active=False` |
| 旧 `TenderChunk` | 保留（关联旧 `ParsedDocument`） |
| 新 `ParsedDocument` | 创建，设为 `is_active=True` |
| 新 `TenderChunk` | 创建（关联新 `ParsedDocument`） |
| `TenderRequirement` | 保留，不自动删除 |
| 响应矩阵/大纲 | 保留，不自动删除 |

### 3.2 设计理由

1. **避免误删人工修正结果**：条款抽取可能有人工修正，自动删除会造成数据丢失
2. **支持版本回溯**：用户可随时切换回历史版本
3. **数据一致性**：新版本生成后提示用户重新执行条款抽取

### 3.3 提示文案

重新解析成功后显示：

> 解析已更新，如需更新条款，请重新执行条款抽取。

---

## 4. 前端设计

### 4.1 文件列表 - ProjectFiles.vue

#### 按钮显示逻辑

```vue
<!-- 正在处理中：禁用按钮 -->
<el-button
  v-if="['parsing', 'chunking', 'processing'].includes(row.status)"
  type="primary"
  size="small"
  disabled
>
  解析中...
</el-button>

<!-- 已解析：显示重新解析按钮 -->
<el-button
  v-else-if="['parsed', 'chunked', 'ready', 'parse_failed', 'requirement_extracted'].includes(row.status)"
  type="primary"
  size="small"
  @click="handleReparse(row)"
>
  {{ row.status === 'parse_failed' ? '重试解析' : '重新解析' }}
</el-button>
```

#### 确认弹窗逻辑

```typescript
async function handleReparse(file: TenderFile) {
  const hasRequirements = file.has_requirements

  let message = '重新解析将生成新的解析版本，并设为当前版本。历史解析版本会保留。是否继续？'

  if (hasRequirements) {
    message = '重新解析不会自动覆盖已有条款抽取结果。如需更新条款，请在解析完成后重新执行条款抽取。是否继续？'
  }

  await ElMessageBox.confirm(message, '确认重新解析', { type: 'warning' })

  // 立即禁用按钮防重复点击
  file.status = 'parsing'

  await reparseTenderFile(file.id)
  ElMessage.success('已提交重新解析任务')
  loadFiles()
}
```

---

### 4.2 解析详情页 - ParsedDocumentView.vue

#### 工具栏布局

```
+------------------------------------------------------------------+
| [返回] 文件名.pdf  [已解析]        版本选择 ▼  [重新解析] |
+------------------------------------------------------------------+
```

```vue
<div class="toolbar">
  <!-- 左侧 -->
  <div class="toolbar-left">
    <el-button @click="goBack">
      <el-icon><ArrowLeft /></el-icon>
      返回
    </el-button>
    <span class="file-name">{{ file.original_name }}</span>
    <el-tag :type="getStatusType(file.status)">
      {{ file.status_display }}
    </el-tag>
  </div>

  <!-- 右侧 -->
  <div class="toolbar-right">
    <el-select
      v-model="selectedVersionId"
      @change="handleVersionChange"
      style="width: 320px"
    >
      <el-option
        v-for="v in versions"
        :key="v.id"
        :label="formatVersionLabel(v)"
        :value="v.id"
      />
    </el-select>
    <el-button
      type="primary"
      @click="handleReparse"
      :loading="reparseLoading"
      :disabled="['parsing', 'chunking', 'processing'].includes(file.status)"
    >
      <el-icon><Refresh /></el-icon>
      重新解析
    </el-button>
  </div>
</div>
```

#### 版本标签格式化

```typescript
function formatVersionLabel(v: ParseVersion): string {
  const activeLabel = v.is_active ? '当前版本' : '历史版本'
  const date = new Date(v.created_at).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
  return `${activeLabel} · ${v.parser_version} · ${v.page_count}页 · ${v.chunk_count}个分块 · ${date}`
}
```

#### 切换版本确认

```typescript
async function handleVersionChange(versionId: number) {
  if (versionId === currentVersionId) return

  await ElMessageBox.confirm(
    '切换解析版本只会改变当前展示的解析结果，不会自动同步已有条款抽取、响应矩阵或大纲。如需保持一致，请切换后重新执行条款抽取。',
    '切换解析版本',
    { type: 'warning', confirmButtonText: '确认切换', cancelButtonText: '取消' }
  )

  try {
    await activateParseVersion(fileId, versionId)
    loadVersion(versionId)
    ElMessage.success('已切换到该版本')
  } catch {
    // 恢复原选择
    selectedVersionId.value = currentVersionId
  }
}
```

---

## 5. 审计日志

### 5.1 重新解析操作

```python
AuditService.record(
    module="tender",
    action="reparse",
    target_type="TenderFile",
    target_id=tender_file.id,
    operator=request.user,
    metadata={
        "old_active_parsed_document_id": old_doc_id,
    },
)
```

### 5.2 激活版本操作

```python
AuditService.record(
    module="tender",
    action="activate_parse_version",
    target_type="ParsedDocument",
    target_id=target_doc.id,
    operator=request.user,
)
```

---

## 6. 并发控制

### 6.1 后端

使用 `select_for_update()` 锁定记录：

```python
with transaction.atomic():
    tender_file = TenderFile.objects.select_for_update().get(pk=pk)
    # ... 后续操作
```

### 6.2 前端

点击后立即更新状态禁用按钮：

```typescript
// 立即禁用按钮
file.status = 'parsing'
await reparseTenderFile(file.id)
```

---

## 7. 实现清单

### 后端改动

1. `backend/apps/tender/views/tender_file_views.py`
   - 新增 `reparse` action
   - 新增 `parse_versions` action
   - 新增 `activate_version` action

2. `backend/apps/tender/urls.py`
   - 确认路由注册

3. `backend/apps/tender/services/parse_service.py`
   - 确认版本保留逻辑（已符合设计）

### 前端改动

1. `frontend/src/views/projects/ProjectFiles.vue`
   - 扩展按钮显示条件
   - 添加确认弹窗
   - 添加状态轮询

2. `frontend/src/views/tender/ParsedDocumentView.vue`
   - 添加工具栏
   - 添加版本选择下拉
   - 添加重新解析按钮
   - 添加版本切换确认

3. `frontend/src/api/tender.ts`
   - 新增 `reparseTenderFile` 函数
   - 新增 `getParseVersions` 函数
   - 新增 `activateParseVersion` 函数

---

## 8. 测试要点

1. **状态校验**
   - 处理中状态禁止重新解析
   - 处理中状态禁止切换版本

2. **并发控制**
   - 快速连续点击不创建重复任务
   - 前端按钮立即禁用

3. **版本管理**
   - 重新解析后旧版本保留
   - 新版本正确设为 active
   - 切换版本后状态正确更新

4. **审计日志**
   - 重新解析记录完整
   - 切换版本记录完整
