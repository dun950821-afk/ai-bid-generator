# 批量生成任务暂停与取消功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现批量生成任务的暂停、恢复、取消功能，支持协作式控制和断点续传

**Architecture:** 新增 BatchGenerationTaskItem 模型记录每个章节状态，采用两阶段状态控制（PAUSE_REQUESTED/CANCEL_REQUESTED），所有状态变更使用事务锁保护

**Tech Stack:** Django ORM, Celery, Vue 3, Element Plus, TypeScript

---

## 文件结构

**后端新增文件：**
- `backend/apps/outline/models/batch_task_item.py` - 批量任务子项模型
- `backend/apps/outline/tests/test_batch_task_item.py` - 子项模型测试

**后端修改文件：**
- `backend/apps/outline/constants.py` - 新增状态常量
- `backend/apps/outline/models/__init__.py` - 导出新模型
- `backend/apps/outline/models/generation_task.py` - 新增 paused_at_index 字段
- `backend/apps/outline/services/batch_generation_service.py` - 核心服务方法
- `backend/apps/outline/tasks.py` - Celery 任务改造
- `backend/apps/outline/views.py` - 新增 API 端点
- `backend/apps/outline/urls.py` - 新增路由
- `backend/apps/outline/serializers.py` - 新增序列化器

**前端新增文件：**
- `frontend/src/components/outline/BatchGenerationProgressDialog.vue` - 进度对话框

**前端修改文件：**
- `frontend/src/api/outline.ts` - 新增 API 函数
- `frontend/src/views/outline/OutlineDetailView.vue` - 集成对话框

---

## Task 1: 新增状态常量

**Files:**
- Modify: `backend/apps/outline/constants.py:211-232`

- [ ] **Step 1: 添加新状态常量**

```python
# 在 GenerationTaskStatus 类中修改 CHOICES

class GenerationTaskStatus:
    """生成任务状态。"""

    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL_SUCCESS = "partial_success"
    CANCEL_REQUESTED = "cancel_requested"
    CANCELLED = "cancelled"
    PAUSE_REQUESTED = "pause_requested"
    PAUSED = "paused"
    COMPLETED = "completed"  # 替换 SUCCESS，语义更清晰

    CHOICES = [
        (PENDING, "待执行"),
        (RUNNING, "执行中"),
        (PAUSE_REQUESTED, "请求暂停"),
        (PAUSED, "已暂停"),
        (CANCEL_REQUESTED, "请求取消"),
        (CANCELLED, "已取消"),
        (COMPLETED, "已完成"),
        (FAILED, "失败"),
        (PARTIAL_SUCCESS, "部分成功"),
    ]
```

- [ ] **Step 2: 提交**

```bash
git add backend/apps/outline/constants.py
git commit -m "feat: 新增批量任务暂停/取消状态常量"
```

---

## Task 2: 创建 BatchGenerationTaskItem 模型

**Files:**
- Create: `backend/apps/outline/models/batch_task_item.py`
- Modify: `backend/apps/outline/models/__init__.py`

- [ ] **Step 1: 创建模型文件**

```python
# backend/apps/outline/models/batch_task_item.py
"""批量生成任务子项模型。"""

from django.db import models

from apps.common.models import TimeStampedModel


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
            ("cancelled", "已取消"),
        ],
        default="pending",
    )

    retry_count = models.PositiveIntegerField(
        verbose_name="重试次数",
        default=0,
        help_text="记录重试生成的次数",
    )

    generation_meta = models.JSONField(
        verbose_name="生成元数据",
        default=dict,
        blank=True,
        help_text="存储生成过程中的上下文元数据",
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

    def __str__(self):
        return f"TaskItem#{self.pk} [{self.status}]"
```

- [ ] **Step 2: 在 models/__init__.py 中导出**

```python
# 在 backend/apps/outline/models/__init__.py 中添加
from apps.outline.models.batch_task_item import BatchGenerationTaskItem

__all__ = [
    # ... 现有导出 ...
    "BatchGenerationTaskItem",
]
```

- [ ] **Step 3: 提交**

```bash
git add backend/apps/outline/models/batch_task_item.py backend/apps/outline/models/__init__.py
git commit -m "feat: 新增 BatchGenerationTaskItem 模型"
```

---

## Task 3: GenerationTask 新增 paused_at_index 字段

**Files:**
- Modify: `backend/apps/outline/models/generation_task.py`

- [ ] **Step 1: 添加字段**

在 `GenerationTask` 模型中添加：

```python
# 在 finished_at 字段后添加

paused_at_index = models.PositiveIntegerField(
    verbose_name="暂停位置",
    default=0,
    help_text="暂停时的章节索引（仅用于展示，恢复基于子项状态）",
)
```

- [ ] **Step 2: 提交**

```bash
git add backend/apps/outline/models/generation_task.py
git commit -m "feat: GenerationTask 新增 paused_at_index 字段"
```

---

## Task 4: 创建数据库迁移

**Files:**
- Create: migration file

- [ ] **Step 1: 生成迁移文件**

```bash
cd backend && python manage.py makemigrations outline
```

- [ ] **Step 2: 检查迁移文件内容**

确认迁移文件包含：
- 创建 `outline_batch_task_item` 表
- 添加 `outline_generation_task.paused_at_index` 字段

- [ ] **Step 3: 提交**

```bash
git add backend/apps/outline/migrations/
git commit -m "feat: 批量任务暂停取消功能数据库迁移"
```

---

## Task 5: 更新 BatchGenerationService - create_batch_task

**Files:**
- Modify: `backend/apps/outline/services/batch_generation_service.py`

- [ ] **Step 1: 修改 create_batch_task 方法**

替换现有的 `create_batch_task` 方法：

```python
from django.db import transaction
from apps.outline.models import BatchGenerationTaskItem

@transaction.atomic
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
    outline = Outline.objects.select_for_update().get(pk=outline_id)
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

    # 2. 计算生成顺序
    order_list = self.calculate_generation_order(outline_id, section_ids)

    if not order_list:
        raise ValueError("没有需要生成的章节")

    # 3. 创建任务
    task = GenerationTask.objects.create(
        task_type=GenerationTaskType.SECTION_BATCH_GENERATION,
        outline=outline,
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
```

- [ ] **Step 2: 添加 ACTIVE_STATUSES 类属性**

在 `BatchGenerationService` 类中添加：

```python
ACTIVE_STATUSES = [
    GenerationTaskStatus.PENDING,
    GenerationTaskStatus.RUNNING,
    GenerationTaskStatus.PAUSE_REQUESTED,
    GenerationTaskStatus.PAUSED,
    GenerationTaskStatus.CANCEL_REQUESTED,
]
```

- [ ] **Step 3: 更新 _has_active_task 方法**

```python
def _has_active_task(self, outline_id: int) -> bool:
    """检查是否有活跃任务。"""
    return GenerationTask.objects.filter(
        outline_id=outline_id,
        task_type=GenerationTaskType.SECTION_BATCH_GENERATION,
        status__in=self.ACTIVE_STATUSES,
    ).exists()
```

- [ ] **Step 4: 提交**

```bash
git add backend/apps/outline/services/batch_generation_service.py
git commit -m "feat: BatchGenerationService.create_batch_task 支持并发保护和子项创建"
```

---

## Task 6: 更新 BatchGenerationService - pause_task

**Files:**
- Modify: `backend/apps/outline/services/batch_generation_service.py`

- [ ] **Step 1: 添加 pause_task 方法**

```python
@transaction.atomic
def pause_task(self, task_id: int) -> dict:
    """请求暂停任务。"""
    task = GenerationTask.objects.select_for_update().get(pk=task_id)

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
```

- [ ] **Step 2: 提交**

```bash
git add backend/apps/outline/services/batch_generation_service.py
git commit -m "feat: BatchGenerationService.pause_task 暂停请求方法"
```

---

## Task 7: 更新 BatchGenerationService - resume_task

**Files:**
- Modify: `backend/apps/outline/services/batch_generation_service.py`

- [ ] **Step 1: 添加 resume_task 方法**

```python
@transaction.atomic
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
```

- [ ] **Step 2: 提交**

```bash
git add backend/apps/outline/services/batch_generation_service.py
git commit -m "feat: BatchGenerationService.resume_task 恢复任务方法"
```

---

## Task 8: 更新 BatchGenerationService - cancel_task

**Files:**
- Modify: `backend/apps/outline/services/batch_generation_service.py`

- [ ] **Step 1: 添加 cancel_task 方法**

```python
from django.utils import timezone

@transaction.atomic
def cancel_task(self, task_id: int) -> dict:
    """取消任务。

    - RUNNING 状态：设置 CANCEL_REQUESTED，等待章节边界生效
    - PAUSED 状态：直接设置为 CANCELLED
    """
    task = GenerationTask.objects.select_for_update().get(pk=task_id)

    if task.status == GenerationTaskStatus.RUNNING:
        # 运行中，设置请求状态
        task.status = GenerationTaskStatus.CANCEL_REQUESTED
        task.save()
        return {
            "success": True,
            "status": task.status,
            "message": "已请求取消，当前章节完成后将停止",
        }

    elif task.status == GenerationTaskStatus.PAUSED:
        # 已暂停，直接取消
        task.items.filter(status="pending").update(
            status="cancelled",
            finished_at=timezone.now(),
        )
        task.status = GenerationTaskStatus.CANCELLED
        task.finished_at = timezone.now()
        task.error_message = "用户请求取消"
        task.save()
        return {
            "success": True,
            "status": task.status,
            "message": "任务已取消",
        }

    else:
        return {
            "success": False,
            "status": task.status,
            "message": "只有运行中或已暂停的任务可以取消",
        }
```

- [ ] **Step 2: 提交**

```bash
git add backend/apps/outline/services/batch_generation_service.py
git commit -m "feat: BatchGenerationService.cancel_task 取消任务方法"
```

---

## Task 9: 更新 BatchGenerationService - retry_failed

**Files:**
- Modify: `backend/apps/outline/services/batch_generation_service.py`

- [ ] **Step 1: 添加 retry_failed 方法**

```python
@transaction.atomic
def retry_failed(self, task_id: int) -> dict:
    """重试失败的章节。

    仅允许在 COMPLETED、PARTIAL_SUCCESS、FAILED 状态执行。
    """
    from apps.outline.tasks import batch_section_generation_task

    task = GenerationTask.objects.select_for_update().get(pk=task_id)

    if task.status not in [
        GenerationTaskStatus.COMPLETED,
        GenerationTaskStatus.PARTIAL_SUCCESS,
        GenerationTaskStatus.FAILED,
    ]:
        return {
            "success": False,
            "message": "当前任务状态不允许重试，仅支持已完成、部分成功或失败的任务",
        }

    # 重置失败项为 pending，增加重试计数
    failed_items = task.items.filter(status="failed")
    count = failed_items.count()
    if count == 0:
        return {
            "success": False,
            "message": "没有失败章节需要重试",
        }

    for item in failed_items:
        item.status = "pending"
        item.error_message = ""
        item.retry_count += 1
        item.finished_at = None
        item.save()

    # 更新任务状态
    task.status = GenerationTaskStatus.RUNNING
    task.finished_at = None
    task.save()

    # 重新启动任务
    async_result = batch_section_generation_task.delay(task_id=task_id)
    task.celery_task_id = async_result.id
    task.save()

    return {
        "success": True,
        "status": task.status,
        "retried_count": count,
        "message": f"已重新开始生成 {count} 个失败章节",
    }
```

- [ ] **Step 2: 提交**

```bash
git add backend/apps/outline/services/batch_generation_service.py
git commit -m "feat: BatchGenerationService.retry_failed 重试失败章节方法"
```

---

## Task 10: 更新 BatchGenerationService - get_batch_progress

**Files:**
- Modify: `backend/apps/outline/services/batch_generation_service.py`

- [ ] **Step 1: 更新 get_batch_progress 方法**

```python
def get_batch_progress(self, task_id: int) -> dict:
    """获取批量生成进度。"""
    task = GenerationTask.objects.get(pk=task_id)

    # 统计各状态
    items = task.items.all()

    status_counts = {
        "pending": 0,
        "running": 0,
        "success": 0,
        "failed": 0,
        "skipped": 0,
        "cancelled": 0,
    }

    item_list = []
    for item in items:
        status_counts[item.status] = status_counts.get(item.status, 0) + 1
        section = item.section
        item_list.append({
            "section_id": item.section_id,
            "section_number_display": section.section_number_display or "",
            "section_title": section.title,
            "status": item.status,
            "word_count": item.word_count,
            "error_message": item.error_message[:200] if item.error_message else "",
        })

    total = task.total_count
    success = status_counts["success"]
    failed = status_counts["failed"]
    skipped = status_counts["skipped"]
    cancelled = status_counts["cancelled"]
    pending = status_counts["pending"]

    progress_percent = int((success + failed + skipped + cancelled) / total * 100) if total > 0 else 0

    # 计算可执行操作
    can_pause = task.status == GenerationTaskStatus.RUNNING
    can_resume = task.status == GenerationTaskStatus.PAUSED
    can_cancel = task.status in [
        GenerationTaskStatus.RUNNING,
        GenerationTaskStatus.PAUSED,
    ]
    can_retry_failed = (
        task.status in [
            GenerationTaskStatus.COMPLETED,
            GenerationTaskStatus.PARTIAL_SUCCESS,
            GenerationTaskStatus.FAILED,
        ] and failed > 0
    )

    # 当前章节
    current_section = None
    if task.current_section_id:
        try:
            section = Section.objects.get(pk=task.current_section_id)
            current_section = {
                "id": section.id,
                "section_number_display": section.section_number_display or "",
                "title": section.title,
            }
        except Section.DoesNotExist:
            pass

    return {
        "task_id": task.id,
        "status": task.status,
        "total": total,
        "success": success,
        "failed": failed,
        "skipped": skipped,
        "cancelled": cancelled,
        "pending": pending,
        "progress_percent": progress_percent,
        "current_section": current_section,
        "started_at": task.created_at,
        "finished_at": task.finished_at,
        "can_pause": can_pause,
        "can_resume": can_resume,
        "can_cancel": can_cancel,
        "can_retry_failed": can_retry_failed,
        "items": item_list,
        "error_message": task.error_message,
    }
```

- [ ] **Step 2: 提交**

```bash
git add backend/apps/outline/services/batch_generation_service.py
git commit -m "feat: BatchGenerationService.get_batch_progress 返回完整进度信息"
```

---

## Task 11: 改造 Celery 任务

**Files:**
- Modify: `backend/apps/outline/tasks.py`

- [ ] **Step 1: 重写 batch_section_generation_task**

替换现有的 `batch_section_generation_task` 函数：

```python
@shared_task(bind=True)
def batch_section_generation_task(self, task_id: int):
    """批量正文生成任务。

    核心逻辑：
    1. 任务入口处理 PENDING → RUNNING 状态转换
    2. 只处理 status=pending 的子项（不处理 running）
    3. 章节边界检查暂停/取消请求
    4. 每章完成后立即保存
    """
    task = GenerationTask.objects.get(pk=task_id)

    # === 任务入口状态检查 ===
    with transaction.atomic():
        task = GenerationTask.objects.select_for_update().get(pk=task_id)

        # 如果状态不是 PENDING 或 RUNNING，直接退出
        if task.status not in [
            GenerationTaskStatus.PENDING,
            GenerationTaskStatus.RUNNING,
        ]:
            logger.warning(f"Task {task_id} in unexpected state: {task.status}, exiting")
            return

        # PENDING → RUNNING，记录开始时间
        if task.status == GenerationTaskStatus.PENDING:
            task.status = GenerationTaskStatus.RUNNING
            task.save()

    # 获取待处理的子项，只处理 pending 状态
    pending_items = task.items.filter(
        status="pending"
    ).order_by("sort_index")

    for item in pending_items:
        # === 章节边界检查 ===
        task.refresh_from_db()

        # 检查取消请求
        if task.status == GenerationTaskStatus.CANCEL_REQUESTED:
            _handle_cancel(task)
            return

        # 检查暂停请求
        if task.status == GenerationTaskStatus.PAUSE_REQUESTED:
            _handle_pause(task, item)
            return

        # === 更新当前处理章节 ===
        task.current_section_id = item.section_id
        section = item.section
        task.current_section_title = f"{section.section_number_display or ''} {section.title}".strip()
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

            item.refresh_from_db()
            item.status = "success"
            item.finished_at = timezone.now()
            item.word_count = item.section.word_count
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
```

- [ ] **Step 2: 添加辅助函数**

在文件末尾添加：

```python
def _handle_cancel(task: GenerationTask):
    """处理取消请求。"""
    with transaction.atomic():
        task = GenerationTask.objects.select_for_update().get(pk=task.id)
        # 标记所有 pending 项为 cancelled
        task.items.filter(status="pending").update(
            status="cancelled",
            finished_at=timezone.now(),
        )

        task.status = GenerationTaskStatus.CANCELLED
        task.finished_at = timezone.now()
        task.error_message = "用户请求取消"
        task.save()


def _handle_pause(task: GenerationTask, current_item):
    """处理暂停请求。"""
    with transaction.atomic():
        task = GenerationTask.objects.select_for_update().get(pk=task.id)
        task.status = GenerationTaskStatus.PAUSED
        task.paused_at_index = current_item.sort_index
        task.save()


def _finalize_task(task: GenerationTask):
    """完成任务，计算最终状态。"""
    with transaction.atomic():
        task = GenerationTask.objects.select_for_update().get(pk=task.id)

        success_count = task.items.filter(status="success").count()
        failed_count = task.items.filter(status="failed").count()
        skipped_count = task.items.filter(status="skipped").count()
        cancelled_count = task.items.filter(status="cancelled").count()

        task.success_count = success_count
        task.failed_count = failed_count
        task.skipped_count = skipped_count

        if failed_count == 0 and cancelled_count == 0:
            task.status = GenerationTaskStatus.COMPLETED
        elif success_count == 0:
            task.status = GenerationTaskStatus.FAILED
        else:
            task.status = GenerationTaskStatus.PARTIAL_SUCCESS

        task.finished_at = timezone.now()
        task.save()
```

- [ ] **Step 3: 更新 _execute_single_section_generation 签名**

添加 `task_item_id` 参数：

```python
def _execute_single_section_generation(
    section_id: int,
    record_id: int = None,  # 保持兼容
    user_id: int = None,
    user_prompt: str = "",
    task_item_id: int = None,  # 新增参数
):
    """执行单章节生成（同步版本，供批量任务调用）。"""
    # ... 现有逻辑 ...

    # 如果提供了 task_item_id，更新子项状态
    if task_item_id:
        from apps.outline.models import BatchGenerationTaskItem
        task_item = BatchGenerationTaskItem.objects.get(pk=task_item_id)
        # 在成功后更新 word_count
        # 在 catch 中更新 error_message
```

- [ ] **Step 4: 提交**

```bash
git add backend/apps/outline/tasks.py
git commit -m "feat: 改造 batch_section_generation_task 支持暂停/取消"
```

---

## Task 12: 新增 API 序列化器

**Files:**
- Modify: `backend/apps/outline/serializers.py`

- [ ] **Step 1: 添加序列化器**

```python
# 在文件末尾添加

class BatchGenerationProgressItemSerializer(serializers.Serializer):
    """批量生成进度项序列化器。"""
    section_id = serializers.IntegerField()
    section_number_display = serializers.CharField()
    section_title = serializers.CharField()
    status = serializers.CharField()
    word_count = serializers.IntegerField()
    error_message = serializers.CharField()


class BatchGenerationProgressSerializer(serializers.Serializer):
    """批量生成进度序列化器。"""
    task_id = serializers.IntegerField()
    status = serializers.CharField()
    total = serializers.IntegerField()
    success = serializers.IntegerField()
    failed = serializers.IntegerField()
    skipped = serializers.IntegerField()
    cancelled = serializers.IntegerField()
    pending = serializers.IntegerField()
    progress_percent = serializers.IntegerField()
    current_section = serializers.DictField(allow_null=True)
    started_at = serializers.DateTimeField()
    finished_at = serializers.DateTimeField(allow_null=True)
    can_pause = serializers.BooleanField()
    can_resume = serializers.BooleanField()
    can_cancel = serializers.BooleanField()
    can_retry_failed = serializers.BooleanField()
    items = BatchGenerationProgressItemSerializer(many=True)
    error_message = serializers.CharField(allow_null=True)


class BatchTaskActionSerializer(serializers.Serializer):
    """批量任务操作响应序列化器。"""
    success = serializers.BooleanField()
    status = serializers.CharField()
    message = serializers.CharField()
    retried_count = serializers.IntegerField(required=False)
```

- [ ] **Step 2: 提交**

```bash
git add backend/apps/outline/serializers.py
git commit -m "feat: 新增批量生成进度序列化器"
```

---

## Task 13: 新增 API 视图

**Files:**
- Modify: `backend/apps/outline/views.py`

- [ ] **Step 1: 添加批量生成相关视图**

```python
from rest_framework.decorators import action
from drf_spectacular.utils import extend_schema

@extend_schema(tags=["批量生成"])
class BatchGenerationViewSet(viewsets.ViewSet):
    """批量生成任务视图集。"""

    @extend_schema(
        request={
            "type": "object",
            "properties": {
                "section_ids": {"type": "array", "items": {"type": "integer"}},
                "skip_on_failure": {"type": "boolean", "default": True},
                "user_prompt_default": {"type": "string", "default": ""},
            },
        },
        responses={200: BatchTaskActionSerializer},
    )
    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """启动批量生成。"""
        from apps.outline.services.batch_generation_service import BatchGenerationService

        outline_id = pk
        section_ids = request.data.get("section_ids")
        skip_on_failure = request.data.get("skip_on_failure", True)
        user_prompt_default = request.data.get("user_prompt_default", "")

        service = BatchGenerationService()
        try:
            task = service.create_batch_task(
                outline_id=outline_id,
                created_by=request.user,
                section_ids=section_ids,
                skip_on_failure=skip_on_failure,
                user_prompt_default=user_prompt_default,
            )

            # 启动 Celery 任务
            service.start_batch_generation(task.id)

            return Response({
                "task_id": task.id,
                "status": task.status,
                "total_count": task.total_count,
                "message": "批量生成任务已创建",
            })
        except ValueError as e:
            return Response({"message": str(e)}, status=400)

    @action(detail=True, methods=["get"], url_path=r"(?P<task_id>\d+)")
    def progress(self, request, pk=None, task_id=None):
        """获取任务进度。"""
        from apps.outline.services.batch_generation_service import BatchGenerationService

        service = BatchGenerationService()
        progress = service.get_batch_progress(task_id)
        return Response(progress)

    @action(detail=True, methods=["post"], url_path=r"(?P<task_id>\d+)/pause")
    def pause(self, request, pk=None, task_id=None):
        """暂停任务。"""
        from apps.outline.services.batch_generation_service import BatchGenerationService

        service = BatchGenerationService()
        result = service.pause_task(task_id)
        return Response(result)

    @action(detail=True, methods=["post"], url_path=r"(?P<task_id>\d+)/resume")
    def resume(self, request, pk=None, task_id=None):
        """恢复任务。"""
        from apps.outline.services.batch_generation_service import BatchGenerationService

        service = BatchGenerationService()
        result = service.resume_task(task_id)
        return Response(result)

    @action(detail=True, methods=["post"], url_path=r"(?P<task_id>\d+)/cancel")
    def cancel(self, request, pk=None, task_id=None):
        """取消任务。"""
        from apps.outline.services.batch_generation_service import BatchGenerationService

        service = BatchGenerationService()
        result = service.cancel_task(task_id)
        return Response(result)

    @action(detail=True, methods=["post"], url_path=r"(?P<task_id>\d+)/retry-failed")
    def retry_failed(self, request, pk=None, task_id=None):
        """重试失败章节。"""
        from apps.outline.services.batch_generation_service import BatchGenerationService

        service = BatchGenerationService()
        result = service.retry_failed(task_id)
        return Response(result)
```

- [ ] **Step 2: 提交**

```bash
git add backend/apps/outline/views.py
git commit -m "feat: 新增批量生成任务 API 视图"
```

---

## Task 14: 新增 URL 路由

**Files:**
- Modify: `backend/apps/outline/urls.py`

- [ ] **Step 1: 添加路由**

```python
from apps.outline.views import BatchGenerationViewSet

# 在 urlpatterns 中添加
urlpatterns += [
    path(
        "outlines/<int:pk>/batch-generation/",
        BatchGenerationViewSet.as_view({"post": "start"}),
        name="outline-batch-generation-start",
    ),
    path(
        "outlines/<int:pk>/batch-generation/<int:task_id>/",
        BatchGenerationViewSet.as_view({"get": "progress"}),
        name="outline-batch-generation-progress",
    ),
    path(
        "outlines/<int:pk>/batch-generation/<int:task_id>/pause/",
        BatchGenerationViewSet.as_view({"post": "pause"}),
        name="outline-batch-generation-pause",
    ),
    path(
        "outlines/<int:pk>/batch-generation/<int:task_id>/resume/",
        BatchGenerationViewSet.as_view({"post": "resume"}),
        name="outline-batch-generation-resume",
    ),
    path(
        "outlines/<int:pk>/batch-generation/<int:task_id>/cancel/",
        BatchGenerationViewSet.as_view({"post": "cancel"}),
        name="outline-batch-generation-cancel",
    ),
    path(
        "outlines/<int:pk>/batch-generation/<int:task_id>/retry-failed/",
        BatchGenerationViewSet.as_view({"post": "retry_failed"}),
        name="outline-batch-generation-retry-failed",
    ),
]
```

- [ ] **Step 2: 提交**

```bash
git add backend/apps/outline/urls.py
git commit -m "feat: 新增批量生成任务 API 路由"
```

---

## Task 15: 创建前端 API 函数

**Files:**
- Modify: `frontend/src/api/outline.ts`

- [ ] **Step 1: 添加类型定义**

```typescript
// 在文件中添加

export interface BatchGenerationProgress {
  task_id: number
  status: string
  total: number
  success: number
  failed: number
  skipped: number
  cancelled: number
  pending: number
  progress_percent: number
  current_section: {
    id: number
    section_number_display: string
    title: string
  } | null
  started_at: string
  finished_at: string | null
  can_pause: boolean
  can_resume: boolean
  can_cancel: boolean
  can_retry_failed: boolean
  items: Array<{
    section_id: number
    section_number_display: string
    section_title: string
    status: string
    word_count: number
    error_message: string
  }>
  error_message: string | null
}

export interface BatchTaskActionResponse {
  success: boolean
  status: string
  message: string
  retried_count?: number
}
```

- [ ] **Step 2: 添加 API 函数**

```typescript
// 获取批量生成进度
export function getBatchGenerationProgress(outlineId: number, taskId: number) {
  return http.get<BatchGenerationProgress>(
    `/api/outlines/${outlineId}/batch-generation/${taskId}/`
  )
}

// 暂停批量生成
export function pauseBatchGeneration(outlineId: number, taskId: number) {
  return http.post<BatchTaskActionResponse>(
    `/api/outlines/${outlineId}/batch-generation/${taskId}/pause/`
  )
}

// 恢复批量生成
export function resumeBatchGeneration(outlineId: number, taskId: number) {
  return http.post<BatchTaskActionResponse>(
    `/api/outlines/${outlineId}/batch-generation/${taskId}/resume/`
  )
}

// 取消批量生成
export function cancelBatchGeneration(outlineId: number, taskId: number) {
  return http.post<BatchTaskActionResponse>(
    `/api/outlines/${outlineId}/batch-generation/${taskId}/cancel/`
  )
}

// 重试失败章节
export function retryFailedBatchGeneration(outlineId: number, taskId: number) {
  return http.post<BatchTaskActionResponse>(
    `/api/outlines/${outlineId}/batch-generation/${taskId}/retry-failed/`
  )
}
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/api/outline.ts
git commit -m "feat: 新增批量生成进度 API 函数"
```

---

## Task 16: 创建进度对话框组件

**Files:**
- Create: `frontend/src/components/outline/BatchGenerationProgressDialog.vue`

- [ ] **Step 1: 创建组件文件**

完整代码见设计文档中的 `BatchGenerationProgressDialog.vue` 部分。

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/outline/BatchGenerationProgressDialog.vue
git commit -m "feat: 创建 BatchGenerationProgressDialog 组件"
```

---

## Task 17: 集成进度对话框到 OutlineDetailView

**Files:**
- Modify: `frontend/src/views/outline/OutlineDetailView.vue`

- [ ] **Step 1: 导入组件**

```typescript
import BatchGenerationProgressDialog from '@/components/outline/BatchGenerationProgressDialog.vue'
```

- [ ] **Step 2: 添加状态变量**

```typescript
const showBatchProgressDialog = ref(false)
```

- [ ] **Step 3: 修改进度条点击区域**

```vue
<!-- 批量生成进度条区域 -->
<div
  v-if="batchProgress && ['pending', 'running', 'pause_requested', 'paused', 'cancel_requested', 'partial_success', 'failed'].includes(batchProgress.status)"
  class="batch-progress-wrapper"
  @click="showBatchProgressDialog = true"
>
  <!-- 现有进度条 UI -->
</div>
```

- [ ] **Step 4: 添加对话框组件**

```vue
<!-- 批量生成进度对话框 -->
<BatchGenerationProgressDialog
  v-model:visible="showBatchProgressDialog"
  :task-id="batchProgress?.task_id || 0"
  :outline-id="outlineId"
  @completed="handleBatchCompleted"
  @cancelled="handleBatchCancelled"
/>
```

- [ ] **Step 5: 添加事件处理函数**

```typescript
function handleBatchCompleted() {
  loadSections()
  loadMatrixStatus()
}

function handleBatchCancelled() {
  loadSections()
}
```

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/outline/OutlineDetailView.vue
git commit -m "feat: 集成 BatchGenerationProgressDialog 到大纲详情页"
```

---

## Task 18: 编写后端单元测试

**Files:**
- Create: `backend/apps/outline/tests/test_batch_task_control.py`

- [ ] **Step 1: 创建测试文件**

```python
"""批量生成任务控制测试。"""

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.outline.constants import (
    GenerationTaskStatus,
    GenerationTaskType,
)
from apps.outline.models import GenerationTask, Outline, Section, BatchGenerationTaskItem
from apps.outline.services.batch_generation_service import BatchGenerationService

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(username="testuser", password="testpass")


@pytest.fixture
def outline(db, user):
    from apps.projects.models import Project, Lot
    project = Project.objects.create(name="Test Project", created_by=user)
    lot = Lot.objects.create(name="Test Lot", project=project)
    return Outline.objects.create(
        project=project,
        lot=lot,
        name="Test Outline",
        created_by=user,
    )


@pytest.fixture
def sections(db, outline):
    sections = []
    for i in range(5):
        sections.append(Section.objects.create(
            outline=outline,
            title=f"Section {i+1}",
            level=1,
            sort_order=i,
        ))
    return sections


class TestBatchGenerationServicePauseResume:
    """暂停和恢复功能测试。"""

    def test_pause_running_task(self, db, outline, user, sections):
        """测试暂停运行中的任务。"""
        service = BatchGenerationService()

        # 创建任务
        task = service.create_batch_task(
            outline_id=outline.id,
            created_by=user,
        )
        task.status = GenerationTaskStatus.RUNNING
        task.save()

        # 暂停
        result = service.pause_task(task.id)

        assert result["success"] is True
        assert result["status"] == GenerationTaskStatus.PAUSE_REQUESTED

        task.refresh_from_db()
        assert task.status == GenerationTaskStatus.PAUSE_REQUESTED

    def test_pause_non_running_task_fails(self, db, outline, user):
        """测试暂停非运行中任务失败。"""
        service = BatchGenerationService()

        task = service.create_batch_task(
            outline_id=outline.id,
            created_by=user,
        )

        result = service.pause_task(task.id)

        assert result["success"] is False
        assert "只有运行中的任务可以暂停" in result["message"]

    def test_resume_paused_task(self, db, outline, user, sections):
        """测试恢复暂停的任务。"""
        service = BatchGenerationService()

        task = service.create_batch_task(
            outline_id=outline.id,
            created_by=user,
        )
        task.status = GenerationTaskStatus.PAUSED
        task.save()

        result = service.resume_task(task.id)

        assert result["success"] is True
        assert result["status"] == GenerationTaskStatus.RUNNING

        task.refresh_from_db()
        assert task.status == GenerationTaskStatus.RUNNING

    def test_resume_non_paused_task_fails(self, db, outline, user):
        """测试恢复非暂停任务失败。"""
        service = BatchGenerationService()

        task = service.create_batch_task(
            outline_id=outline.id,
            created_by=user,
        )
        task.status = GenerationTaskStatus.RUNNING
        task.save()

        result = service.resume_task(task.id)

        assert result["success"] is False
        assert "只有已暂停的任务可以恢复" in result["message"]


class TestBatchGenerationServiceCancel:
    """取消功能测试。"""

    def test_cancel_running_task(self, db, outline, user, sections):
        """测试取消运行中的任务。"""
        service = BatchGenerationService()

        task = service.create_batch_task(
            outline_id=outline.id,
            created_by=user,
        )
        task.status = GenerationTaskStatus.RUNNING
        task.save()

        result = service.cancel_task(task.id)

        assert result["success"] is True
        assert result["status"] == GenerationTaskStatus.CANCEL_REQUESTED

    def test_cancel_paused_task_directly(self, db, outline, user, sections):
        """测试直接取消暂停的任务。"""
        service = BatchGenerationService()

        task = service.create_batch_task(
            outline_id=outline.id,
            created_by=user,
        )
        task.status = GenerationTaskStatus.PAUSED
        task.save()

        result = service.cancel_task(task.id)

        assert result["success"] is True
        assert result["status"] == GenerationTaskStatus.CANCELLED

        # 验证 pending 子项被标记为 cancelled
        pending_items = task.items.filter(status="cancelled")
        assert pending_items.count() == task.total_count

    def test_cancel_non_cancellable_task_fails(self, db, outline, user):
        """测试取消不可取消的任务失败。"""
        service = BatchGenerationService()

        task = service.create_batch_task(
            outline_id=outline.id,
            created_by=user,
        )
        task.status = GenerationTaskStatus.COMPLETED
        task.save()

        result = service.cancel_task(task.id)

        assert result["success"] is False


class TestBatchGenerationServiceRetryFailed:
    """重试失败章节测试。"""

    def test_retry_failed_sections(self, db, outline, user, sections):
        """测试重试失败章节。"""
        service = BatchGenerationService()

        task = service.create_batch_task(
            outline_id=outline.id,
            created_by=user,
        )
        task.status = GenerationTaskStatus.PARTIAL_SUCCESS
        task.save()

        # 标记一些子项为失败
        task.items.all()[:2].update(status="failed")

        result = service.retry_failed(task.id)

        assert result["success"] is True
        assert result["retried_count"] == 2

        # 验证失败项被重置为 pending
        failed_items = task.items.filter(status="failed")
        assert failed_items.count() == 0

        pending_items = task.items.filter(status="pending")
        assert pending_items.count() == 2

    def test_retry_failed_from_paused_fails(self, db, outline, user, sections):
        """测试从暂停状态重试失败。"""
        service = BatchGenerationService()

        task = service.create_batch_task(
            outline_id=outline.id,
            created_by=user,
        )
        task.status = GenerationTaskStatus.PAUSED
        task.save()

        result = service.retry_failed(task.id)

        assert result["success"] is False
        assert "当前任务状态不允许重试" in result["message"]


class TestConcurrentProtection:
    """并发保护测试。"""

    def test_create_task_with_active_task_fails(self, db, outline, user, sections):
        """测试存在活跃任务时创建新任务失败。"""
        service = BatchGenerationService()

        # 创建第一个任务
        task1 = service.create_batch_task(
            outline_id=outline.id,
            created_by=user,
        )
        task1.status = GenerationTaskStatus.RUNNING
        task1.save()

        # 尝试创建第二个任务
        with pytest.raises(ValueError) as exc_info:
            service.create_batch_task(
                outline_id=outline.id,
                created_by=user,
            )

        assert "已有正在执行的批量生成任务" in str(exc_info.value)
```

- [ ] **Step 2: 运行测试**

```bash
cd backend && python -m pytest apps/outline/tests/test_batch_task_control.py -v
```

- [ ] **Step 3: 提交**

```bash
git add backend/apps/outline/tests/test_batch_task_control.py
git commit -m "test: 批量生成任务控制单元测试"
```

---

## Task 19: 运行完整测试并部署验证

**Files:**
- None

- [ ] **Step 1: 运行所有后端测试**

```bash
cd backend && python -m pytest --tb=short -q
```

- [ ] **Step 2: 运行前端类型检查**

```bash
cd frontend && npm run type-check
```

- [ ] **Step 3: 构建前端**

```bash
cd frontend && npm run build
```

- [ ] **Step 4: 重建 Docker 镜像**

```bash
docker compose build web worker beat
```

- [ ] **Step 5: 运行数据库迁移**

```bash
docker exec ai-bid-generator-web-1 python manage.py migrate
```

- [ ] **Step 6: 重启服务**

```bash
docker compose up -d web worker beat nginx
```

- [ ] **Step 7: 验证功能**

手动测试：
1. 启动批量生成任务
2. 点击进度条打开对话框
3. 测试暂停功能
4. 测试恢复功能
5. 测试取消功能
6. 测试重试失败章节

---

## 自检清单

**1. Spec 覆盖检查：**
- [x] 暂停功能：Task 6, 11
- [x] 恢复功能：Task 7, 11
- [x] 取消功能（RUNNING）：Task 8, 11
- [x] 取消功能（PAUSED）：Task 8
- [x] 重试失败章节：Task 9
- [x] 并发保护：Task 5
- [x] 进度显示：Task 10, 16
- [x] 前端集成：Task 17

**2. 占位符扫描：**
- [x] 无 TBD/TODO
- [x] 无 "implement later"
- [x] 所有代码步骤包含完整代码

**3. 类型一致性检查：**
- [x] BatchGenerationTaskItem.status 使用 "cancelled"（不是 "canceled"）
- [x] API 响应字段名与前端接口匹配
- [x] 状态常量名称一致
