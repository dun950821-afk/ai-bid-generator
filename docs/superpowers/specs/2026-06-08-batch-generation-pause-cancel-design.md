# 批量生成任务暂停与取消功能设计

## 背景

当前批量生成功能存在以下问题：
1. 失败后无法继续执行剩余章节
2. 用户无法主动暂停或取消正在执行的任务
3. 长时间任务无法中断，用户体验差

## 目标

1. 支持批量生成任务的**暂停**和**恢复**
2. 支持批量生成任务的**取消**
3. 失败章节不影响后续章节执行
4. 暂停/取消在章节边界生效，不中断当前正在生成的章节
5. 恢复时从断点继续，不重复生成已完成章节

## 设计原则

### 协作式暂停/取消

批量生成任务采用**协作式暂停/取消**模式：
- 不会强制中断正在调用中的 LLM
- 当前章节生成完成后检查暂停/取消请求
- 下一章节不再开始
- 每章生成完成后立即保存，保证数据完整性

### 两阶段状态控制

暂停和取消都采用两阶段状态：

**暂停流程：**
```
RUNNING → PAUSE_REQUESTED → PAUSED
         (用户点击)        (章节边界生效)
```

**取消流程：**
```
RUNNING → CANCEL_REQUESTED → CANCELLED
         (用户点击)          (章节边界生效)
```

**恢复流程：**
```
PAUSED → RUNNING
        (直接恢复，不经过 PENDING)
```

## 状态模型

### GenerationTaskStatus 新增状态

```python
class GenerationTaskStatus:
    PENDING = "pending"                    # 待开始
    RUNNING = "running"                    # 运行中
    PAUSE_REQUESTED = "pause_requested"    # 申请暂停
    PAUSED = "paused"                      # 已暂停
    CANCEL_REQUESTED = "cancel_requested"  # 申请取消
    CANCELLED = "cancelled"                # 已取消
    COMPLETED = "completed"                # 已完成
    FAILED = "failed"                      # 任务失败
    PARTIAL_SUCCESS = "partial_success"    # 部分成功
```

### 状态流转图

```
PENDING ──────────────────────────────────────────► RUNNING ─────────────► COMPLETED
                                                      │                       
                                                      │ 暂停请求               
                                                      ▼                       
                                              PAUSE_REQUESTED               
                                                      │                       
                                                      │ 章节边界               
                                                      ▼                       
                                                 PAUSED ──────────────────────► RUNNING
                                                      │                        (恢复)
                                                      │ 取消请求               
                                                      ▼                       
                                              CANCEL_REQUESTED               
                                                      │                       
                                                      │ 取消请求               
                                                      ▼                       
                                                 CANCELLED                    

RUNNING ────────────────────────────────────────────► FAILED
RUNNING ────────────────────────────────────────────► PARTIAL_SUCCESS
```

## 数据模型

### 新增：BatchGenerationTaskItem

记录批量任务中每个章节的独立状态：

```python
class BatchGenerationTaskItem(TimeStampedModel):
    """批量生成任务子项，记录每个章节的生成状态。"""

    task = models.ForeignKey(
        "outline.GenerationTask",
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="关联任务",
    )

    section = models.ForeignKey(
        "outline.Section",
        on_delete=models.CASCADE,
        related_name="batch_task_items",
        verbose_name="关联章节",
    )

    sort_index = models.PositiveIntegerField(
        verbose_name="排序序号",
        help_text="任务创建时冻结的生成顺序",
    )

    status = models.CharField(
        verbose_name="状态",
        max_length=20,
        choices=[
            ("pending", "待生成"),
            ("running", "生成中"),
            ("success", "成功"),
            ("failed", "失败"),
            ("skipped", "跳过"),
            ("canceled", "已取消"),
        ],
        default="pending",
    )

    error_message = models.TextField(
        verbose_name="错误信息",
        blank=True,
        default="",
    )

    started_at = models.DateTimeField(
        verbose_name="开始时间",
        null=True,
        blank=True,
    )

    finished_at = models.DateTimeField(
        verbose_name="完成时间",
        null=True,
        blank=True,
    )

    word_count = models.PositiveIntegerField(
        verbose_name="字数",
        default=0,
    )

    class Meta:
        db_table = "outline_batch_task_item"
        verbose_name = "批量任务子项"
        verbose_name_plural = "批量任务子项"
        ordering = ["sort_index"]
        indexes = [
            models.Index(fields=["task", "status"]),
            models.Index(fields=["section"]),
        ]
```

### GenerationTask 字段调整

新增字段用于记录暂停位置：

```python
# GenerationTask 已有字段中添加：
paused_at_index = models.PositiveIntegerField(
    verbose_name="暂停位置",
    default=0,
    help_text="暂停时的章节索引",
)
```

## API 设计

### 端点列表

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/outlines/{outline_id}/batch-generation/` | 启动批量生成 |
| GET | `/api/outlines/{outline_id}/batch-generation/{task_id}/` | 获取任务进度 |
| POST | `/api/outlines/{outline_id}/batch-generation/{task_id}/pause/` | 暂停任务 |
| POST | `/api/outlines/{outline_id}/batch-generation/{task_id}/resume/` | 恢复任务 |
| POST | `/api/outlines/{outline_id}/batch-generation/{task_id}/cancel/` | 取消任务 |
| POST | `/api/outlines/{outline_id}/batch-generation/{task_id}/retry-failed/` | 重试失败章节 |

### API 详细设计

#### 1. 启动批量生成

**请求：**
```http
POST /api/outlines/{outline_id}/batch-generation/
Content-Type: application/json

{
  "section_ids": [1, 2, 3],  // 可选，不传则自动选择
  "skip_on_failure": true,
  "user_prompt_default": ""
}
```

**响应：**
```json
{
  "task_id": 123,
  "status": "pending",
  "total_count": 81,
  "message": "批量生成任务已创建"
}
```

**错误情况：**
- 大纲已有活跃任务（PENDING/RUNNING/PAUSE_REQUESTED/PAUSED/CANCEL_REQUESTED）

#### 2. 获取任务进度

**响应：**
```json
{
  "task_id": 123,
  "status": "running",
  "total": 81,
  "success": 32,
  "failed": 2,
  "skipped": 1,
  "pending": 46,
  "progress_percent": 43,
  "current_section": {
    "id": 45,
    "title": "3.2 法定代表人身份证复印件",
    "status": "running"
  },
  "started_at": "2024-01-15T10:30:00Z",
  "finished_at": null,
  "can_pause": true,
  "can_resume": false,
  "can_cancel": true,
  "items": [
    {
      "section_id": 1,
      "section_title": "第一章 投标须知",
      "status": "success",
      "word_count": 1234,
      "error_message": ""
    },
    {
      "section_id": 2,
      "section_title": "第二章 技术方案",
      "status": "failed",
      "word_count": 0,
      "error_message": "AI 生成超时"
    }
  ]
}
```

#### 3. 暂停任务

**请求：**
```http
POST /api/outlines/{outline_id}/batch-generation/{task_id}/pause/
```

**响应：**
```json
{
  "success": true,
  "status": "pause_requested",
  "message": "已请求暂停，当前章节完成后将暂停"
}
```

**错误情况：**
- 任务状态不是 RUNNING

#### 4. 恢复任务

**请求：**
```http
POST /api/outlines/{outline_id}/batch-generation/{task_id}/resume/
```

**响应：**
```json
{
  "success": true,
  "status": "running",
  "message": "批量生成已恢复"
}
```

**错误情况：**
- 任务状态不是 PAUSED

#### 5. 取消任务

**请求：**
```http
POST /api/outlines/{outline_id}/batch-generation/{task_id}/cancel/
```

**响应：**
```json
{
  "success": true,
  "status": "cancel_requested",
  "message": "已请求取消，当前章节完成后将停止"
}
```

**错误情况：**
- 任务状态不是 RUNNING 或 PAUSED

#### 6. 重试失败章节

**请求：**
```http
POST /api/outlines/{outline_id}/batch-generation/{task_id}/retry-failed/
```

**响应：**
```json
{
  "success": true,
  "status": "running",
  "retried_count": 2,
  "message": "已重新开始生成 2 个失败章节"
}
```

## 后端实现

### BatchGenerationService 新增方法

```python
class BatchGenerationService:

    def create_batch_task(
        self,
        outline_id: int,
        created_by,
        section_ids: list[int] = None,
        skip_on_failure: bool = True,
        user_prompt_default: str = "",
    ) -> GenerationTask:
        """创建批量生成任务，冻结章节列表。"""
        # 1. 检查并发保护
        if self._has_active_task(outline_id):
            raise ValueError("当前大纲已有正在执行的批量生成任务")

        # 2. 计算生成顺序
        order_list = self.calculate_generation_order(outline_id, section_ids)

        # 3. 创建任务
        task = GenerationTask.objects.create(
            task_type=GenerationTaskType.SECTION_BATCH_GENERATION,
            outline_id=outline_id,
            status=GenerationTaskStatus.PENDING,
            total_count=len(order_list),
            created_by=created_by,
            params={
                "skip_on_failure": skip_on_failure,
                "user_prompt_default": user_prompt_default,
            },
        )

        # 4. 创建子任务项，冻结顺序
        items = []
        for idx, item in enumerate(order_list):
            items.append(BatchGenerationTaskItem(
                task=task,
                section_id=item["section_id"],
                sort_index=idx,
                status="pending",
            ))
        BatchGenerationTaskItem.objects.bulk_create(items)

        return task

    def pause_task(self, task_id: int) -> dict:
        """请求暂停任务。"""
        task = GenerationTask.objects.get(pk=task_id)

        if task.status != GenerationTaskStatus.RUNNING:
            return {
                "success": False,
                "status": task.status,
                "message": "只有运行中的任务可以暂停",
            }

        task.status = GenerationTaskStatus.PAUSE_REQUESTED
        task.save()

        return {
            "success": True,
            "status": task.status,
            "message": "已请求暂停，当前章节完成后将暂停",
        }

    def resume_task(self, task_id: int) -> dict:
        """恢复暂停的任务。"""
        from apps.outline.tasks import batch_section_generation_task

        task = GenerationTask.objects.select_for_update().get(pk=task_id)

        if task.status != GenerationTaskStatus.PAUSED:
            return {
                "success": False,
                "status": task.status,
                "message": "只有已暂停的任务可以恢复",
            }

        # 更新状态
        task.status = GenerationTaskStatus.RUNNING
        task.save()

        # 重新启动 Celery 任务
        async_result = batch_section_generation_task.delay(task_id=task_id)
        task.celery_task_id = async_result.id
        task.save()

        return {
            "success": True,
            "status": task.status,
            "message": "批量生成已恢复",
        }

    def cancel_task(self, task_id: int) -> dict:
        """请求取消任务。"""
        task = GenerationTask.objects.get(pk=task_id)

        if task.status not in [
            GenerationTaskStatus.RUNNING,
            GenerationTaskStatus.PAUSED,
        ]:
            return {
                "success": False,
                "status": task.status,
                "message": "只有运行中或已暂停的任务可以取消",
            }

        task.status = GenerationTaskStatus.CANCEL_REQUESTED
        task.save()

        return {
            "success": True,
            "status": task.status,
            "message": "已请求取消，当前章节完成后将停止",
        }

    def retry_failed(self, task_id: int) -> dict:
        """重试失败的章节。"""
        task = GenerationTask.objects.get(pk=task_id)

        if task.status not in [
            GenerationTaskStatus.COMPLETED,
            GenerationTaskStatus.PARTIAL_SUCCESS,
            GenerationTaskStatus.PAUSED,
        ]:
            return {
                "success": False,
                "message": "当前任务状态不允许重试",
            }

        # 重置失败项为 pending
        failed_items = task.items.filter(status="failed")
        count = failed_items.count()
        failed_items.update(status="pending", error_message="")

        # 更新任务状态
        task.status = GenerationTaskStatus.RUNNING
        task.save()

        # 重新启动任务
        from apps.outline.tasks import batch_section_generation_task
        async_result = batch_section_generation_task.delay(task_id=task_id)
        task.celery_task_id = async_result.id
        task.save()

        return {
            "success": True,
            "status": task.status,
            "retried_count": count,
            "message": f"已重新开始生成 {count} 个失败章节",
        }

    def _has_active_task(self, outline_id: int) -> bool:
        """检查是否有活跃任务。"""
        active_statuses = [
            GenerationTaskStatus.PENDING,
            GenerationTaskStatus.RUNNING,
            GenerationTaskStatus.PAUSE_REQUESTED,
            GenerationTaskStatus.PAUSED,
            GenerationTaskStatus.CANCEL_REQUESTED,
        ]
        return GenerationTask.objects.filter(
            outline_id=outline_id,
            task_type=GenerationTaskType.SECTION_BATCH_GENERATION,
            status__in=active_statuses,
        ).exists()
```

### Celery 任务调整

```python
@shared_task(bind=True)
def batch_section_generation_task(self, task_id: int):
    """批量正文生成任务。"""
    task = GenerationTask.objects.get(pk=task_id)

    # 获取待处理的子项，按 sort_index 排序
    pending_items = task.items.filter(
        status__in=["pending", "running"]
    ).order_by("sort_index")

    for item in pending_items:
        # === 章节边界检查 ===
        task.refresh_from_db()

        # 检查取消请求
        if task.status == GenerationTaskStatus.CANCEL_REQUESTED:
            _handle_cancel(task, item)
            return

        # 检查暂停请求
        if task.status == GenerationTaskStatus.PAUSE_REQUESTED:
            _handle_pause(task, item)
            return

        # === 更新当前处理章节 ===
        task.current_section_id = item.section_id
        task.current_section_title = item.section.title
        task.save()

        item.status = "running"
        item.started_at = timezone.now()
        item.save()

        # === 执行单章生成 ===
        try:
            _execute_single_section_generation(
                section_id=item.section_id,
                task_item_id=item.id,
                user_id=task.created_by_id,
                user_prompt=task.params.get("user_prompt_default", ""),
            )

            item.status = "success"
            item.finished_at = timezone.now()
            item.save()

            task.success_count = task.items.filter(status="success").count()
            task.save()

        except Exception as e:
            logger.exception(f"Section generation failed: {item.section_id}")

            item.status = "failed"
            item.error_message = str(e)[:500]
            item.finished_at = timezone.now()
            item.save()

            task.failed_count = task.items.filter(status="failed").count()
            task.save()

            # 失败后继续执行下一章节（skip_on_failure=True）
            if not task.params.get("skip_on_failure", True):
                task.status = GenerationTaskStatus.FAILED
                task.error_message = f"章节 {item.section.title} 生成失败"
                task.finished_at = timezone.now()
                task.save()
                return

    # === 任务完成 ===
    _finalize_task(task)


def _handle_cancel(task: GenerationTask, current_item: BatchGenerationTaskItem):
    """处理取消请求。"""
    # 标记所有 pending 项为 canceled
    task.items.filter(status="pending").update(
        status="canceled",
        finished_at=timezone.now(),
    )

    task.status = GenerationTaskStatus.CANCELLED
    task.finished_at = timezone.now()
    task.error_message = "用户请求取消"
    task.save()


def _handle_pause(task: GenerationTask, current_item: BatchGenerationTaskItem):
    """处理暂停请求。"""
    task.status = GenerationTaskStatus.PAUSED
    task.paused_at_index = current_item.sort_index
    task.save()


def _finalize_task(task: GenerationTask):
    """完成任务，计算最终状态。"""
    success_count = task.items.filter(status="success").count()
    failed_count = task.items.filter(status="failed").count()
    skipped_count = task.items.filter(status="skipped").count()

    task.success_count = success_count
    task.failed_count = failed_count
    task.skipped_count = skipped_count

    if failed_count == 0:
        task.status = GenerationTaskStatus.COMPLETED
    elif success_count == 0:
        task.status = GenerationTaskStatus.FAILED
    else:
        task.status = GenerationTaskStatus.PARTIAL_SUCCESS

    task.finished_at = timezone.now()
    task.save()
```

## 前端实现

### BatchGenerationProgressDialog.vue

```vue
<template>
  <el-dialog
    v-model="visible"
    title="批量生成进度"
    width="700px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <!-- 总体状态 -->
    <div class="progress-header">
      <div class="status-row">
        <el-tag :type="getStatusType(progress.status)" size="large">
          {{ getStatusText(progress.status) }}
        </el-tag>
        <span class="progress-count">
          {{ progress.success + progress.failed + progress.skipped }} / {{ progress.total }}
        </span>
      </div>

      <el-progress
        :percentage="progress.progress_percent"
        :status="getProgressStatus(progress.status)"
        :stroke-width="10"
      />

      <div class="stats-row">
        <span class="stat-item success">
          <el-icon><CircleCheck /></el-icon>
          成功 {{ progress.success }}
        </span>
        <span class="stat-item failed" v-if="progress.failed > 0">
          <el-icon><CircleClose /></el-icon>
          失败 {{ progress.failed }}
        </span>
        <span class="stat-item pending">
          <el-icon><Clock /></el-icon>
          待生成 {{ progress.pending }}
        </span>
      </div>

      <!-- 当前章节 -->
      <div class="current-section" v-if="progress.current_section && isRunning">
        <span class="label">正在生成：</span>
        <span class="title">{{ progress.current_section.title }}</span>
      </div>
    </div>

    <!-- 章节列表 -->
    <div class="section-list">
      <el-table :data="progress.items" max-height="300" size="small">
        <el-table-column prop="section_title" label="章节" min-width="200">
          <template #default="{ row }">
            <span class="section-title">{{ row.section_title }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getItemStatusType(row.status)" size="small">
              {{ getItemStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="word_count" label="字数" width="80">
          <template #default="{ row }">
            {{ row.word_count || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'failed'"
              link
              type="primary"
              size="small"
              @click="handleRetryItem(row)"
            >
              重试
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 操作按钮 -->
    <template #footer>
      <div class="dialog-footer">
        <!-- 运行中 -->
        <template v-if="progress.status === 'running'">
          <el-button @click="handlePause" :loading="pausing">
            <el-icon><VideoPause /></el-icon>
            暂停
          </el-button>
          <el-button type="danger" @click="handleCancel" :loading="canceling">
            <el-icon><Close /></el-icon>
            取消任务
          </el-button>
        </template>

        <!-- 正在暂停 -->
        <template v-else-if="progress.status === 'pause_requested'">
          <el-tag type="warning">正在暂停，请等待当前章节完成...</el-tag>
          <el-button type="danger" @click="handleCancel" :loading="canceling">
            取消任务
          </el-button>
        </template>

        <!-- 已暂停 -->
        <template v-else-if="progress.status === 'paused'">
          <el-button type="primary" @click="handleResume" :loading="resuming">
            <el-icon><VideoPlay /></el-icon>
            恢复
          </el-button>
          <el-button type="danger" @click="handleCancel" :loading="canceling">
            取消任务
          </el-button>
        </template>

        <!-- 正在取消 -->
        <template v-else-if="progress.status === 'cancel_requested'">
          <el-tag type="danger">正在取消，请等待当前章节完成...</el-tag>
        </template>

        <!-- 已取消 / 已完成 / 失败 -->
        <template v-else>
          <el-button v-if="hasFailedItems" type="primary" @click="handleRetryFailed">
            重试失败章节
          </el-button>
          <el-button @click="handleClose">关闭</el-button>
        </template>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { VideoPause, VideoPlay, Close, CircleCheck, CircleClose, Clock } from '@element-plus/icons-vue'
import {
  getBatchGenerationProgress,
  pauseBatchGeneration,
  resumeBatchGeneration,
  cancelBatchGeneration,
  retryFailedBatchGeneration,
} from '@/api/outline'

interface Props {
  visible: boolean
  taskId: number
  outlineId: number
}

const props = defineProps<Props>()
const emit = defineEmits(['update:visible', 'completed', 'cancelled'])

const progress = ref({
  task_id: 0,
  status: 'pending',
  total: 0,
  success: 0,
  failed: 0,
  skipped: 0,
  pending: 0,
  progress_percent: 0,
  current_section: null as { id: number; title: string } | null,
  items: [] as Array<{ section_id: number; section_title: string; status: string; word_count: number; error_message: string }>,
})

const pausing = ref(false)
const resuming = ref(false)
const canceling = ref(false)

const isRunning = computed(() => ['running', 'pause_requested', 'cancel_requested'].includes(progress.value.status))
const hasFailedItems = computed(() => progress.value.failed > 0)

let pollTimer: number | null = null

watch(() => props.visible, (val) => {
  if (val) {
    fetchProgress()
    startPolling()
  } else {
    stopPolling()
  }
})

onBeforeUnmount(() => {
  stopPolling()
})

function startPolling() {
  stopPolling()
  pollTimer = window.setInterval(() => {
    // RUNNING / PAUSE_REQUESTED / CANCEL_REQUESTED：每 2 秒轮询
    // 其他状态：停止轮询
    if (['running', 'pause_requested', 'cancel_requested'].includes(progress.value.status)) {
      fetchProgress()
    }
  }, 2000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function fetchProgress() {
  try {
    const res = await getBatchGenerationProgress(props.outlineId, props.taskId)
    progress.value = res.data

    // 任务完成/取消/失败时停止轮询
    if (['completed', 'cancelled', 'failed', 'partial_success'].includes(res.data.status)) {
      stopPolling()
    }
  } catch (err) {
    console.error('获取进度失败:', err)
  }
}

async function handlePause() {
  pausing.value = true
  try {
    const res = await pauseBatchGeneration(props.outlineId, props.taskId)
    if (res.data.success) {
      ElMessage.success(res.data.message)
      await fetchProgress()
    } else {
      ElMessage.error(res.data.message)
    }
  } catch (err) {
    ElMessage.error('暂停失败')
  } finally {
    pausing.value = false
  }
}

async function handleResume() {
  resuming.value = true
  try {
    const res = await resumeBatchGeneration(props.outlineId, props.taskId)
    if (res.data.success) {
      ElMessage.success(res.data.message)
      await fetchProgress()
      startPolling()
    } else {
      ElMessage.error(res.data.message)
    }
  } catch (err) {
    ElMessage.error('恢复失败')
  } finally {
    resuming.value = false
  }
}

async function handleCancel() {
  try {
    await ElMessageBox.confirm('确认取消此批量生成任务？已生成的章节内容将保留。', '提示')
    canceling.value = true
    const res = await cancelBatchGeneration(props.outlineId, props.taskId)
    if (res.data.success) {
      ElMessage.success(res.data.message)
      await fetchProgress()
      emit('cancelled')
    } else {
      ElMessage.error(res.data.message)
    }
  } catch {
    // 用户取消确认
  } finally {
    canceling.value = false
  }
}

async function handleRetryFailed() {
  try {
    const res = await retryFailedBatchGeneration(props.outlineId, props.taskId)
    if (res.data.success) {
      ElMessage.success(res.data.message)
      await fetchProgress()
      startPolling()
    } else {
      ElMessage.error(res.data.message)
    }
  } catch (err) {
    ElMessage.error('重试失败')
  }
}

function handleClose() {
  emit('update:visible', false)
}

function getStatusType(status: string): string {
  const map: Record<string, string> = {
    pending: 'info',
    running: 'primary',
    pause_requested: 'warning',
    paused: 'warning',
    cancel_requested: 'danger',
    cancelled: 'info',
    completed: 'success',
    failed: 'danger',
    partial_success: 'warning',
  }
  return map[status] || 'info'
}

function getStatusText(status: string): string {
  const map: Record<string, string> = {
    pending: '待开始',
    running: '生成中',
    pause_requested: '正在暂停...',
    paused: '已暂停',
    cancel_requested: '正在取消...',
    cancelled: '已取消',
    completed: '已完成',
    failed: '失败',
    partial_success: '部分成功',
  }
  return map[status] || status
}

function getProgressStatus(status: string): string {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'exception'
  return ''
}

function getItemStatusType(status: string): string {
  const map: Record<string, string> = {
    pending: 'info',
    running: 'primary',
    success: 'success',
    failed: 'danger',
    skipped: 'warning',
    canceled: 'info',
  }
  return map[status] || 'info'
}

function getItemStatusText(status: string): string {
  const map: Record<string, string> = {
    pending: '待生成',
    running: '生成中',
    success: '成功',
    failed: '失败',
    skipped: '跳过',
    canceled: '已取消',
  }
  return map[status] || status
}
</script>
```

### API 接口添加

```typescript
// frontend/src/api/outline.ts

export function getBatchGenerationProgress(outlineId: number, taskId: number) {
  return http.get<BatchGenerationProgress>(
    `/api/outlines/${outlineId}/batch-generation/${taskId}/`
  )
}

export function pauseBatchGeneration(outlineId: number, taskId: number) {
  return http.post<{ success: boolean; status: string; message: string }>(
    `/api/outlines/${outlineId}/batch-generation/${taskId}/pause/`
  )
}

export function resumeBatchGeneration(outlineId: number, taskId: number) {
  return http.post<{ success: boolean; status: string; message: string }>(
    `/api/outlines/${outlineId}/batch-generation/${taskId}/resume/`
  )
}

export function cancelBatchGeneration(outlineId: number, taskId: number) {
  return http.post<{ success: boolean; status: string; message: string }>(
    `/api/outlines/${outlineId}/batch-generation/${taskId}/cancel/`
  )
}

export function retryFailedBatchGeneration(outlineId: number, taskId: number) {
  return http.post<{ success: boolean; status: string; retried_count: number; message: string }>(
    `/api/outlines/${outlineId}/batch-generation/${taskId}/retry-failed/`
  )
}
```

### OutlineDetailView 修改

点击进度条区域时打开对话框：

```vue
<!-- 批量生成进度条区域 -->
<div
  v-if="batchProgress && ['pending', 'running'].includes(batchProgress.status)"
  class="batch-progress-wrapper"
  @click="showBatchProgressDialog = true"
>
  <!-- 现有进度条 UI -->
</div>

<!-- 批量生成进度对话框 -->
<BatchGenerationProgressDialog
  v-model:visible="showBatchProgressDialog"
  :task-id="batchProgress?.task_id || 0"
  :outline-id="outlineId"
  @completed="handleBatchCompleted"
  @cancelled="handleBatchCancelled"
/>
```

## 并发保护

### 规则

同一大纲同一时间只能有一个活跃的批量生成任务。

### 活跃状态定义

```python
ACTIVE_STATUSES = [
    GenerationTaskStatus.PENDING,
    GenerationTaskStatus.RUNNING,
    GenerationTaskStatus.PAUSE_REQUESTED,
    GenerationTaskStatus.PAUSED,
    GenerationTaskStatus.CANCEL_REQUESTED,
]
```

### 检查逻辑

在创建新任务时检查：

```python
def create_batch_task(self, outline_id: int, ...):
    if self._has_active_task(outline_id):
        active = GenerationTask.objects.filter(
            outline_id=outline_id,
            task_type=GenerationTaskType.SECTION_BATCH_GENERATION,
            status__in=self.ACTIVE_STATUSES,
        ).first()

        raise ValueError(
            f"当前大纲已有正在执行的批量生成任务 (ID: {active.id}, 状态: {active.get_status_display()})，"
            "请先完成、取消或恢复该任务"
        )
```

## 迁移计划

### 数据库迁移

1. 添加 `BatchGenerationTaskItem` 表
2. 添加 `GenerationTask.paused_at_index` 字段
3. 更新 `GenerationTaskStatus` 常量

### 兼容性

- 现有 `GenerationTask` 记录不受影响
- 新任务会创建对应的 `BatchGenerationTaskItem` 记录
- 前端需要同时支持新旧接口

## 测试要点

1. **暂停功能**
   - 运行中点击暂停 → 状态变为 `pause_requested`
   - 当前章节完成后 → 状态变为 `paused`
   - 恢复后 → 从 pending 章节继续

2. **取消功能**
   - 运行中点击取消 → 状态变为 `cancel_requested`
   - 当前章节完成后 → 状态变为 `cancelled`
   - 已暂停状态点击取消 → 直接变为 `cancel_requested`

3. **失败处理**
   - 某章节失败 → 继续执行下一章节
   - 任务结束后 → 可以重试失败章节

4. **并发保护**
   - 已有活跃任务时 → 创建新任务失败
   - 提示用户处理现有任务

5. **数据完整性**
   - 暂停时 → 当前章节内容已保存
   - 取消时 → 已生成章节内容保留
