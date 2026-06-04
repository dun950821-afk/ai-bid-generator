# 内容责任矩阵与章节防重复生成方案设计

## 概述

本方案解决投标文件逐章节生成时的内容重复问题。核心原则：

> **父章节只写总述和承接，子章节写具体内容；每个内容点只能放在一个唯一章节，其他章节只引用不重复展开。**

## 方案流程

```
1. 大纲创建 → 自动生成内容责任矩阵
2. 用户查看/编辑矩阵 → 确认章节边界
3. 批量生成正文 → 叶子章节优先，父章节后写
4. 全文防重复校验 → 确保边界一致
```

## 核心时序图

```
用户创建大纲
    ↓
generate_outline_task
    ↓
创建 Section（矩阵状态=pending，正文状态=pending）
    ↓
generate_content_matrix_task（GenerationTask 记录）
    ↓
写入 content_matrix，状态变为 generated/edited
    ↓
用户编辑确认（可选）
    ↓
precheck 检查矩阵状态、依赖冲突
    ↓
calculate_generation_order 计算推荐顺序
    ↓
batch_generate_task（GenerationTask 记录）
    ↓
逐章节调用 section_content_generation_prompt
    ↓
写入 content，生成 content_summary
    ↓
可选：duplicate_check_prompt 防重复校验
```

---

## 模块一：数据模型设计

### 1.1 Section 模型新增字段

```python
class Section(models.Model):
    # 原有字段...

    # ========== 内容责任矩阵相关字段 ==========

    content_matrix = models.JSONField(
        verbose_name="内容责任矩阵",
        default=dict,
        blank=True,
        help_text="定义章节的写作边界和生成策略"
    )

    content_matrix_status = models.CharField(
        verbose_name="矩阵状态",
        max_length=20,
        default="pending",
        choices=CONTENT_MATRIX_STATUS_CHOICES,
        db_index=True,
    )

    content_matrix_version = models.PositiveIntegerField(
        verbose_name="矩阵版本号",
        default=1
    )

    content_matrix_updated_at = models.DateTimeField(
        verbose_name="矩阵更新时间",
        null=True,
        blank=True,
        db_index=True,
    )

    content_matrix_error = models.TextField(
        verbose_name="矩阵生成失败原因",
        blank=True,
        default=""
    )

    # ========== 正文生成相关字段 ==========

    content_generation_status = models.CharField(
        verbose_name="正文生成状态",
        max_length=20,
        default="pending",
        choices=CONTENT_GENERATION_STATUS_CHOICES,
        db_index=True,
    )

    content_generation_error = models.TextField(
        verbose_name="正文生成失败原因",
        blank=True,
        default=""
    )

    content_generated_at = models.DateTimeField(
        verbose_name="正文生成时间",
        null=True,
        blank=True,
        db_index=True,
    )

    content_word_count = models.PositiveIntegerField(
        verbose_name="正文字数",
        default=0
    )

    content_summary = models.TextField(
        verbose_name="章节摘要",
        blank=True,
        default=""
    )
```

### 1.2 GenerationTask 任务模型

```python
class GenerationTask(models.Model):
    """统一生成任务模型，记录矩阵生成和正文批量生成的执行状态。"""

    TASK_TYPE_CHOICES = [
        ("matrix_generation", "矩阵生成"),
        ("section_batch_generation", "章节批量生成"),
    ]

    TASK_STATUS_CHOICES = [
        ("pending", "待执行"),
        ("running", "执行中"),
        ("success", "成功"),
        ("failed", "失败"),
        ("partial_success", "部分成功"),
        ("cancel_requested", "请求取消"),
        ("cancelled", "已取消"),
        ("paused", "已暂停"),
    ]

    task_type = models.CharField(
        verbose_name="任务类型",
        max_length=30,
        choices=TASK_TYPE_CHOICES,
        db_index=True,
    )

    outline = models.ForeignKey(
        Outline,
        on_delete=models.CASCADE,
        related_name="generation_tasks",
        verbose_name="关联大纲",
    )

    status = models.CharField(
        verbose_name="任务状态",
        max_length=20,
        default="pending",
        choices=TASK_STATUS_CHOICES,
        db_index=True,
    )

    total_count = models.PositiveIntegerField(
        verbose_name="总数",
        default=0
    )

    success_count = models.PositiveIntegerField(
        verbose_name="成功数",
        default=0
    )

    failed_count = models.PositiveIntegerField(
        verbose_name="失败数",
        default=0
    )

    skipped_count = models.PositiveIntegerField(
        verbose_name="跳过数",
        default=0
    )

    current_section_id = models.IntegerField(
        verbose_name="当前处理章节ID",
        null=True,
        blank=True
    )

    error_message = models.TextField(
        verbose_name="错误信息",
        blank=True,
        default=""
    )

    celery_task_id = models.CharField(
        verbose_name="Celery 任务ID",
        max_length=255,
        blank=True,
        default=""
    )

    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        verbose_name="创建人",
    )

    created_at = models.DateTimeField(
        verbose_name="创建时间",
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        verbose_name="更新时间",
        auto_now=True
    )

    finished_at = models.DateTimeField(
        verbose_name="完成时间",
        null=True,
        blank=True
    )

    # ========== 任务参数与结果 ==========

    params = models.JSONField(
        verbose_name="任务参数",
        default=dict,
        blank=True,
        help_text="存储 section_ids、force_overwrite、parallel、skip_on_failure 等参数"
    )

    result = models.JSONField(
        verbose_name="任务结果",
        default=dict,
        blank=True,
        help_text="存储失败明细、警告信息等结果数据"
    )
```

### 1.3 content_matrix JSON 结构

```json
{
  "section_role": "technical_solution",

  "write_scope": "系统架构、功能模块、接口设计、核心技术路线等内容。",
  "exclude_scope": "不重复项目背景、人员简历、资格证明、商务报价等内容。",

  "reference_sections": [
    {
      "id": 12,
      "section_number": "十二（二）",
      "title": "总体技术方案"
    }
  ],

  "no_duplicate_sections": [
    {
      "id": 8,
      "section_number": "八",
      "title": "资格证明材料"
    }
  ],

  "dependency_sections": [
    {
      "id": 3,
      "section_number": "十二（一）",
      "title": "项目整体理解与需求分析"
    }
  ],

  "expression_form": "body_text",
  "writing_depth": "detailed",

  "related_requirements": [101, 102],

  "generation_priority": 10,

  "ai_reasoning_summary": "本章属于技术方案核心章节，应详细展开技术实现，但避免重复需求分析和项目管理内容。",
  "manual_notes": ""
}
```

**字段说明**：
- `related_requirements`：存储 TenderRequirement ID 数组，生成上下文时后端查询组装完整对象
- `reference_sections`、`no_duplicate_sections`、`dependency_sections`：存储对象数组，包含 id、section_number、title
- `generation_priority`：0-100 整数，数值越大正文生成越靠前

### 1.4 常量定义

```python
# 章节定位
SECTION_ROLE_CHOICES = [
    ("qualification", "资格证明"),
    ("technical_solution", "技术方案"),
    ("business_response", "商务响应"),
    ("service_plan", "服务方案"),
    ("team_intro", "团队介绍"),
    ("attachment", "附件材料"),
    ("other", "其他"),
]

# 建议表达形式
EXPRESSION_FORM_CHOICES = [
    ("body_text", "正文"),
    ("table", "表格"),
    ("commitment_letter", "承诺函"),
    ("certificate", "证明材料"),
    ("attachment_index", "附件索引"),
    ("resume_table", "简历表"),
    ("mixed", "混合形式"),
]

# 写作深度
WRITING_DEPTH_CHOICES = [
    ("overview", "概述"),
    ("moderate", "适度展开"),
    ("detailed", "详细展开"),
]

# 矩阵状态
CONTENT_MATRIX_STATUS_CHOICES = [
    ("pending", "待生成"),
    ("generating", "生成中"),
    ("generated", "已生成"),
    ("edited", "已编辑"),
    ("failed", "生成失败"),
]

# 正文生成状态
CONTENT_GENERATION_STATUS_CHOICES = [
    ("pending", "待生成"),
    ("running", "生成中"),
    ("success", "已完成"),
    ("failed", "生成失败"),
    ("skipped", "已跳过"),
]

# 映射字典
SECTION_ROLE_MAP = dict(SECTION_ROLE_CHOICES)
EXPRESSION_FORM_MAP = dict(EXPRESSION_FORM_CHOICES)
WRITING_DEPTH_MAP = dict(WRITING_DEPTH_CHOICES)


def get_section_role_display(role_code: str) -> str:
    return SECTION_ROLE_MAP.get(role_code, role_code)


def get_expression_form_display(form_code: str) -> str:
    return EXPRESSION_FORM_MAP.get(form_code, form_code)


def get_writing_depth_display(depth_code: str) -> str:
    return WRITING_DEPTH_MAP.get(depth_code, depth_code)
```

---

## 模块二：矩阵生成流程设计

### 2.1 触发时机

| 场景 | 触发方式 | 说明 |
|------|----------|------|
| 大纲创建后自动生成 | `generate_outline_task` 完成后触发 | 整体生成全量矩阵 |
| 用户手动重新生成 | 前端按钮触发 | 可选择整体或单章节 |
| 单章节重新生成 | 前端按钮触发 | 只覆盖当前章节 |

### 2.2 generation_priority 含义

**规则**：数值越大，正文生成越靠前。

| 章节类型 | 推荐优先级 | 说明 |
|----------|------------|------|
| 叶子技术章节 | 80-100 | 具体内容章节，优先生成 |
| 普通子章节 | 60-80 | 非技术类子章节 |
| 父级总述章节 | 20-40 | 承接类章节，后生成 |
| 最终汇总类章节 | 0-10 | 索引、目录等，最后生成 |

### 2.3 任务流程

```
大纲创建完成
    ↓
创建所有章节 Section（矩阵状态=pending）
    ↓
创建 GenerationTask（task_type=matrix_generation）
    ↓
触发 generate_content_matrix_task(outline_id, task_id)
    ↓
获取任务锁，防止重复执行
    ↓
查询矩阵生成目标章节（pending/failed/generated，edited需确认）
    ↓
保存原状态快照（用于失败恢复）
    ↓
将目标章节状态更新为 generating，清空 error
    ↓
更新 GenerationTask.status = running
    ↓
组装完整目录结构、章节层级、招标要求摘要
    ↓
判断是否需要降级（章节 > 200 或 token 超限）
    ↓
调用 AI 生成矩阵（全量或分组）
    ↓
解析并校验 JSON
    ↓
后端补全章节编号和标题（ID数组 → 对象数组）
    ↓
合法章节写入 content_matrix，状态更新为 generated
    ↓
缺失/失败章节记录 content_matrix_error，状态更新为 failed
    ↓
更新 GenerationTask 统计和状态
    ↓
释放任务锁
```

### 2.4 矩阵生成目标章节筛选

```python
def get_matrix_generation_targets(
    outline_id: int,
    force_overwrite: bool = False,
    section_ids: list[int] | None = None,
):
    """获取本次需要生成矩阵的章节。"""
    sections = Section.objects.filter(outline_id=outline_id)

    if section_ids:
        sections = sections.filter(id__in=section_ids)

    if force_overwrite:
        # 强制覆盖所有章节
        return sections.all()

    # 默认保留 edited 状态的章节
    return sections.filter(
        content_matrix_status__in=["pending", "failed", "generated"]
    )
```

### 2.5 AI 输出校验流程

```
AI 返回 JSON
    ↓
解析 JSON（失败则全部目标章节标记 failed）
    ↓
校验 sections 是否为数组
    ↓
校验每个 section_id 是否属于当前 outline
    ↓
校验是否有遗漏章节（缺失章节标记 failed）
    ↓
校验枚举值是否合法（非法则使用默认值）
    ↓
校验引用章节 ID 是否存在（不存在则移除该引用）
    ↓
校验 write_scope 是否为空（为空则标记 failed）
    ↓
后端补全章节编号和标题（转换为对象数组）
    ↓
合法数据写入 Section
```

**校验处理规则**：

| 校验项 | 处理方式 |
|--------|----------|
| 返回了不存在的 section_id | 丢弃并记录 warning |
| 缺少某些 section_id | 对缺失章节标记 failed |
| 枚举值非法 | 使用默认值 |
| JSON 无法解析 | 全部目标章节标记 failed |
| 引用了不存在的章节 | 移除该引用并记录 warning |
| write_scope 为空 | 标记该章节 failed |

### 2.6 重新生成失败保护

**原则**：重新生成是"成功后覆盖"，不是"一开始就清空"。

| 场景 | 原状态 | 生成失败后 |
|------|--------|------------|
| 首次生成 | pending | failed（保留空矩阵） |
| 重新生成 | generated | generated（保留原矩阵，写入 error） |
| 重新生成 | edited | edited（保留原矩阵，写入 error） |

### 2.7 超大目录降级策略

```python
def generate_content_matrix_task(outline_id: int, task_id: int):
    """矩阵生成 Celery 任务。

    任务参数从 GenerationTask.params 读取：
    - section_ids: 指定生成的章节ID列表
    - force_overwrite: 是否强制覆盖 edited 状态
    """
    outline = Outline.objects.get(pk=outline_id)
    task = GenerationTask.objects.get(pk=task_id)

    # 从任务参数读取配置
    params = task.params or {}
    section_ids = params.get("section_ids")
    force_overwrite = params.get("force_overwrite", False)

    # 获取目标章节
    sections = get_matrix_generation_targets(
        outline_id=outline_id,
        force_overwrite=force_overwrite,
        section_ids=section_ids,
    )

    section_count = sections.count()

    if section_count <= 200:
        # 全量一次生成
        generate_matrix_batch(outline, sections, task)
    else:
        # 按一级章节分组生成
        root_sections = sections.filter(parent=None)
        for root in root_sections:
            subtree = get_subtree_sections(root)
            generate_matrix_batch(outline, subtree, task, full_context=sections)

        # 跨组冲突校验
        validate_cross_group_conflicts(outline)
```

### 2.8 任务并发保护

```python
def acquire_matrix_generation_lock(outline_id: int) -> bool:
    """获取矩阵生成锁。"""
    cache_key = f"matrix_gen_lock:{outline_id}"
    return cache.add(cache_key, "1", timeout=1800)  # 30分钟超时


def release_matrix_generation_lock(outline_id: int):
    """释放矩阵生成锁。"""
    cache_key = f"matrix_gen_lock:{outline_id}"
    cache.delete(cache_key)


def can_start_matrix_generation(outline_id: int) -> tuple[bool, str]:
    """检查是否可以启动新的矩阵生成任务。"""
    generating_count = Section.objects.filter(
        outline_id=outline_id,
        content_matrix_status="generating"
    ).count()

    if generating_count > 0:
        return False, "矩阵正在生成中，请稍后再试"
    return True, ""
```

### 2.9 状态流转

```
首次生成：
pending → generating → generated
                ↓
              failed

重新生成（有旧矩阵）：
generated → generating → generated（成功）
                ↓
            generated（失败，恢复原状态）

重新生成（edited）：
edited → generating → generated（成功）
              ↓
          edited（失败，恢复原状态）

用户编辑：
generated → edited
edited → edited（version += 1）

任务取消：
generating → pending（首次生成取消）
generating → generated（重新生成取消，恢复原状态）
generating → edited（重新生成取消，恢复原状态）
```

### 2.10 矩阵版本与更新时间规则

**核心规则**：只要 `content_matrix` 内容被成功写入或覆盖，`content_matrix_version += 1`，`content_matrix_updated_at = now()`。

| 场景 | version | updated_at | status |
|------|---------|------------|--------|
| 首次 AI 生成成功 | 1（保持或设置） | 更新 | generated |
| AI 重新生成成功 | +1 | 更新 | generated |
| 用户编辑 | +1 | 更新 | edited |
| 强制覆盖 edited 成功 | +1 | 更新 | generated |
| 生成失败 | 不变 | 不更新 | 恢复原状态 |

**实现示例**：

```python
def write_matrix_to_section(section, matrix_data, is_user_edit=False):
    """写入矩阵数据，统一处理版本和时间更新。"""
    section.content_matrix = matrix_data
    section.content_matrix_version += 1
    section.content_matrix_updated_at = timezone.now()

    if is_user_edit:
        section.content_matrix_status = "edited"
    else:
        section.content_matrix_status = "generated"

    section.content_matrix_error = ""
    section.save(update_fields=[
        "content_matrix",
        "content_matrix_version",
        "content_matrix_updated_at",
        "content_matrix_status",
        "content_matrix_error",
    ])
```

### 2.11 人工编辑逻辑

**规则**：只要用户修改 `content_matrix` 中任一字段，都视为人工编辑。

| 操作 | 状态变化 | 字段更新 |
|------|----------|----------|
| 用户修改矩阵任意字段 | generated → edited | version += 1, updated_at = now() |
| 用户编辑 manual_notes | generated → edited | version += 1, updated_at = now() |
| 重新生成覆盖 edited | edited → generating → generated | version += 1, 需前端确认 |

### 2.11 AI 输出 Schema

```json
{
  "type": "object",
  "required": ["sections"],
  "properties": {
    "sections": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["section_id", "title", "write_scope"],
        "properties": {
          "section_id": {"type": "integer"},
          "section_number": {"type": "string"},
          "title": {"type": "string"},
          "section_role": {"type": "string", "enum": ["qualification", "technical_solution", "business_response", "service_plan", "team_intro", "attachment", "other"]},
          "write_scope": {"type": "string", "minLength": 1},
          "exclude_scope": {"type": "string"},
          "reference_sections": {"type": "array", "items": {"type": "integer"}},
          "no_duplicate_sections": {"type": "array", "items": {"type": "integer"}},
          "dependency_sections": {"type": "array", "items": {"type": "integer"}},
          "expression_form": {"type": "string", "enum": ["body_text", "table", "commitment_letter", "certificate", "attachment_index", "resume_table", "mixed"]},
          "writing_depth": {"type": "string", "enum": ["overview", "moderate", "detailed"]},
          "related_requirements": {"type": "array", "items": {"type": "integer"}},
          "generation_priority": {"type": "integer", "minimum": 0, "maximum": 100},
          "ai_reasoning_summary": {"type": "string"}
        }
      }
    }
  }
}
```

### 2.12 实现约定

```
1. AI 输出中的章节引用字段统一使用 section_id 数组，后端校验后补全章节编号和标题，再写入 content_matrix。
2. 重新生成任务开始前记录章节原状态，生成失败时恢复原状态，避免破坏已有矩阵。
3. 矩阵生成任务必须使用任务锁，并在 finally 中释放锁，防止并发写入。
4. 缓存锁超时时间建议不低于 30 分钟，超大目录可结合数据库任务状态做二次保护。
5. generation_priority 仅用于后续正文批量生成顺序，不代表矩阵生成顺序。
6. 所有矩阵生成操作通过 GenerationTask 记录，便于进度追踪和失败重试。
```

---

## 模块三：批量生成顺序与上下文设计

### 3.1 推荐生成顺序计算

**核心原则**：
- 叶子章节优先，父章节后写
- 高优先级先生成
- 依赖章节必须先完成

**排序规则优先级**：
1. 叶子深度（叶子=0 最优先）
2. generation_priority（数值大优先）
3. 层级深度（层级深优先）
4. 目录 sort_order（同优先级时稳定排序）
5. 依赖关系（被依赖者优先）

### 3.2 正文生成目标章节筛选

```python
def get_content_generation_targets(
    outline_id: int,
    section_ids: list[int] | None = None,
    include_success: bool = False,
):
    """获取本次需要生成正文的章节。

    正文生成前要求矩阵已生成或已编辑。
    """
    qs = Section.objects.filter(outline_id=outline_id)

    if section_ids:
        qs = qs.filter(id__in=section_ids)

    # 排除已成功生成的章节（除非用户明确要求重新生成）
    if not include_success:
        qs = qs.exclude(content_generation_status="success")

    # 正文生成前要求矩阵已生成或已编辑
    qs = qs.filter(content_matrix_status__in=["generated", "edited"])

    return qs
```

### 3.3 每章生成传入的上下文

```python
generation_context = {
    # 当前章节信息
    "current_section": {
        "id": section.id,
        "section_number": section.section_number,
        "title": section.title,
        "level": section.level,
    },

    # 内容责任矩阵（核心）
    "content_matrix": {
        "section_role": matrix.get("section_role"),
        "section_role_display": get_section_role_display(matrix.get("section_role")),
        "write_scope": matrix.get("write_scope"),
        "exclude_scope": matrix.get("exclude_scope"),
        "expression_form": matrix.get("expression_form"),
        "expression_form_display": get_expression_form_display(matrix.get("expression_form")),
        "writing_depth": matrix.get("writing_depth"),
        "writing_depth_display": get_writing_depth_display(matrix.get("writing_depth")),
        "ai_reasoning_summary": matrix.get("ai_reasoning_summary"),
        "manual_notes": matrix.get("manual_notes", ""),
    },

    # 可引用章节信息（含矩阵边界和内容摘要）
    "reference_sections": [
        {
            "id": s.id,
            "section_number": s.section_number,
            "title": s.title,
            "write_scope": s.content_matrix.get("write_scope", ""),
            "summary": s.content_summary or (s.content[:300] if s.content else "")
        }
        for s in get_reference_sections(section)
    ],

    # 禁止重复章节信息（含矩阵边界）
    "no_duplicate_sections": [
        {
            "id": s.id,
            "section_number": s.section_number,
            "title": s.title,
            "write_scope": s.content_matrix.get("write_scope", ""),
            "content_summary": s.content_summary or (s.content[:500] if s.content else ""),
            "has_content": bool(s.content)
        }
        for s in get_no_duplicate_sections(section)
    ],

    # 父章节信息（含矩阵边界）
    "parent_section": {
        "id": parent.id if parent else None,
        "section_number": parent.section_number if parent else "",
        "title": parent.title if parent else "",
        "write_scope": parent.content_matrix.get("write_scope", "") if parent else "",
        "exclude_scope": parent.content_matrix.get("exclude_scope", "") if parent else "",
        "content": parent.content[:1000] if parent and parent.content else "",
    },

    # 子章节摘要（父章节生成时使用）
    "child_sections": [
        {
            "id": child.id,
            "section_number": child.section_number,
            "title": child.title,
            "write_scope": child.content_matrix.get("write_scope", ""),
            "summary": child.content_summary or (child.content[:300] if child.content else ""),
            "has_content": bool(child.content)
        }
        for child in get_child_sections(section)
    ],

    # 前置兄弟章节摘要
    "preceding_siblings": [
        {
            "id": s.id,
            "section_number": s.section_number,
            "title": s.title,
            "summary": s.content_summary or (s.content[:200] if s.content else "")
        }
        for s in get_preceding_siblings(section)
    ],

    # 招标文件相关条款（后端根据 related_requirements ID 查询组装）
    "related_requirements": [
        {
            "id": r.id,
            "requirement_no": r.requirement_no,
            "title": r.title,
            "content": r.content[:500] if r.content else ""
        }
        for r in get_related_requirements(section)
    ],

    # 检索到的知识库内容
    "retrieved_knowledge": retrieved_knowledge_text,

    # 整体大纲结构
    "outline_structure": get_outline_structure(section.outline),

    # 项目信息
    "project_name": section.outline.project.name,
    "lot_name": section.outline.lot.name,

    # 章节类型标记
    "is_parent_section": section.children_count > 0,
    "is_final_section": is_final_section(section, matrix),
}

def is_final_section(section: Section, matrix: dict) -> bool:
    """判断是否为最终汇总类章节。

    组合判断规则：
    1. generation_priority <= 10
    2. 标题包含索引/目录/汇总/对照/评分等关键词
    3. expression_form 为 attachment_index 或 table
    """
    title = section.title or ""
    expression_form = matrix.get("expression_form", "")
    priority = matrix.get("generation_priority", 50)

    # 关键词判断
    final_keywords = ["索引", "目录", "汇总", "对照", "评分", "清单"]
    has_keyword = any(k in title for k in final_keywords)

    # 表达形式判断
    is_index_form = expression_form in ["attachment_index", "table"]

    return priority <= 10 or has_keyword or is_index_form
```

**上下文构建规则**：
- `related_requirements`：从 `content_matrix.related_requirements` 提取 ID，后端查询 `TenderRequirement` 组装完整对象
- `reference_sections`/`no_duplicate_sections`/`dependency_sections`：从矩阵提取 ID，后端查询 Section 补全信息

### 3.4 依赖冲突处理

```python
def validate_user_order(user_order: list[int], original_order: list[dict]) -> dict:
    """验证用户调整后的顺序是否满足依赖关系。"""
    item_map = {item["section_id"]: item for item in original_order}
    user_order_map = {sid: idx for idx, sid in enumerate(user_order)}

    conflicts = []
    for sid in user_order:
        item = item_map.get(sid)
        if not item:
            continue

        # 从 dependency_sections 提取 ID
        dependency_ids = [
            d["id"] if isinstance(d, dict) else d
            for d in item.get("dependency_sections", [])
        ]

        for dep_id in dependency_ids:
            dep_order = user_order_map.get(dep_id)
            current_order = user_order_map.get(sid)

            if dep_order is None:
                conflicts.append({
                    "section_id": sid,
                    "title": item["title"],
                    "conflict_type": "dependency_not_selected",
                    "dependency_id": dep_id,
                    "message": f"依赖章节 {item_map.get(dep_id, {}).get('title', dep_id)} 未加入生成列表"
                })
            elif dep_order > current_order:
                conflicts.append({
                    "section_id": sid,
                    "title": item["title"],
                    "conflict_type": "dependency_order_violation",
                    "dependency_id": dep_id,
                    "dependency_title": item_map.get(dep_id, {}).get("title", ""),
                    "message": f"依赖章节 {item_map.get(dep_id, {}).get('title', dep_id)} 应排在当前章节之前"
                })

    return {
        "valid": len(conflicts) == 0,
        "conflicts": conflicts,
    }
```

### 3.5 实现约定

```
1. generation_priority 只决定正文生成顺序，数值越大越靠前。
2. 最终排序应综合叶子深度、generation_priority、章节层级、目录 sort_order 和依赖关系。
3. 依赖关系使用拓扑排序处理；如发现循环依赖，应提示用户并降级为推荐顺序。
4. 父章节生成时必须传入子章节摘要，用于写总述和承接。
5. 叶子章节生成时即使父章节正文尚未生成，也必须传入父章节矩阵边界。
6. 禁止重复章节即使尚未生成正文，也应传入其矩阵写作范围，防止当前章节提前展开。
7. 用户自定义顺序必须做依赖冲突检测；强制生成需要风险确认。
8. 正文生成状态与矩阵状态分离维护，避免状态含义混淆。
```

---

## 模块四：前端界面设计

### 4.1 矩阵查看与编辑界面

- 章节树增加矩阵状态图标和快捷操作
- 矩阵编辑对话框支持编辑所有字段
- 状态图标：pending（灰色）、generating（蓝色旋转）、generated（绿色勾）、edited（橙色笔）、failed（红色叉）

### 4.2 矩阵生成状态展示

- 整体状态栏显示进度和统计
- 生成进度对话框支持最小化和取消
- 失败详情对话框支持重试和导出日志

### 4.3 批量生成顺序预览

- 显示推荐顺序、章节类型、依赖状态
- 支持拖拽调整顺序
- 依赖冲突提示和自动修复
- 强制覆盖 edited 矩阵的二次确认

### 4.4 正文生成进度界面

- 实时显示完成进度
- 失败章节单独重试入口
- 支持暂停、跳过、最小化

### 4.5 API 接口设计

#### 矩阵相关接口

```yaml
# 获取单章节矩阵
GET /api/outlines/{id}/sections/{sid}/matrix/
Response: {
  "section_id": 1,
  "content_matrix": {...},
  "content_matrix_status": "generated",
  "content_matrix_version": 1,
  "content_matrix_updated_at": "2026-06-04T10:00:00Z",
  "content_matrix_error": ""
}

# 更新章节矩阵（人工编辑，乐观锁）
PUT /api/outlines/{id}/sections/{sid}/matrix/
Request: {
  "content_matrix_version": 2,  # 乐观锁
  "content_matrix": {
    "section_role": "technical_solution",
    "write_scope": "...",
    "manual_notes": "重点突出国产化适配能力"
  }
}
Response: {
  "success": true,
  "content_matrix_version": 3,
  "content_matrix_status": "edited"
}
Error Response: {
  "success": false,
  "error_code": "VERSION_CONFLICT",
  "message": "矩阵内容已被其他操作更新，请刷新后再编辑。"
}

# 生成单个章节矩阵
POST /api/outlines/{id}/sections/{sid}/matrix/generate/
Request: {
  "force": false  # 是否强制覆盖 edited 状态
}
Response: {
  "task_id": 123,
  "status": "pending"
}

# 批量生成矩阵
POST /api/outlines/{id}/matrix/generate/
Request: {
  "force_overwrite": false,  # 是否覆盖已编辑
  "section_ids": []  # 为空则生成全部
}
Response: {
  "task_id": 124,
  "status": "pending",
  "target_count": 35
}

# 批量重试失败章节矩阵
POST /api/outlines/{id}/matrix/retry-failed/
Request: {
  "force": false
}
Response: {
  "task_id": 125,
  "retry_count": 5
}

# 获取矩阵整体状态
GET /api/outlines/{id}/matrix/status/
Response: {
  "total": 35,
  "pending": 0,
  "generating": 5,
  "generated": 28,
  "edited": 1,
  "failed": 1,
  "is_generating": true,
  "current_task_id": 124
}

# 导出矩阵
GET /api/outlines/{id}/matrix/export/
Response: {
  "file_url": "/downloads/matrix_outline_1.json"
}
```

#### 批量生成相关接口

```yaml
# 获取推荐生成顺序
GET /api/outlines/{id}/generation-order/
Response: {
  "sections": [
    {
      "section_id": 1,
      "section_number": "十二（一）",
      "title": "需求分析",
      "level": 2,
      "leaf_depth": 0,
      "generation_priority": 80,
      "recommended_order": 1,
      "dependency_sections": [],
      "dependency_status": [],
      "can_generate": true,
      "content_generation_status": "pending",
      "content_matrix_status": "generated"
    },
    ...
  ],
  "conflicts": []
}

# 验证自定义顺序
POST /api/outlines/{id}/generation-order/validate/
Request: {
  "section_ids": [1, 3, 2, 5, 4, 6]
}
Response: {
  "valid": false,
  "conflicts": [
    {
      "section_id": 5,
      "title": "技术方案总述",
      "conflict_type": "dependency_order_violation",
      "dependency_id": 1,
      "dependency_title": "需求分析",
      "message": "依赖章节应排在当前章节之前"
    }
  ]
}

# 生成前预检查
POST /api/outlines/{id}/batch-generate/precheck/
Request: {
  "section_ids": [1, 2, 3, 4]  # 为空则检查全部
}
Response: {
  "can_start": false,
  "warnings": [
    {
      "type": "matrix_missing",
      "severity": "high",
      "message": "2 个章节尚未生成内容责任矩阵",
      "section_ids": [12, 18]
    },
    {
      "type": "dependency_conflict",
      "severity": "medium",
      "message": "技术方案总述依赖的子章节尚未完成",
      "section_ids": [3, 4, 5]
    }
  ],
  "blocked_sections": [
    {
      "section_id": 8,
      "title": "技术方案总述",
      "reason": "依赖章节未完成"
    }
  ]
}

# 开始批量生成
POST /api/outlines/{id}/batch-generate/
Request: {
  "section_ids": [1, 2, 3, 4],  # 为空则按推荐顺序生成全部
  "parallel": true,  # 是否并行生成
  "skip_on_failure": true,  # 失败是否跳过
  "force_ignore_dependencies": false,  # 强制忽略依赖顺序
  "skip_blocked_sections": true,  # 依赖未完成时自动跳过阻塞章节
  "include_success": false  # 是否包含已成功生成的章节
}
Response: {
  "task_id": 126,
  "status": "pending",
  "target_count": 40
}

# 批量重试失败章节正文
POST /api/outlines/{id}/batch-generate/retry-failed/
Request: {
  "force_ignore_dependencies": false
}
Response: {
  "task_id": 127,
  "retry_count": 3
}
```

#### 任务控制接口

```yaml
# 获取任务状态
GET /api/generation-tasks/{task_id}/
Response: {
  "task_id": 126,
  "task_type": "section_batch_generation",
  "status": "running",
  "total_count": 40,
  "success_count": 18,
  "failed_count": 2,
  "skipped_count": 0,
  "current_section_id": 5,
  "current_section_title": "项目管理方案",
  "error_message": "",
  "created_at": "2026-06-04T10:00:00Z",
  "updated_at": "2026-06-04T10:15:00Z"
}

# 请求取消任务（软取消）
POST /api/generation-tasks/{task_id}/cancel/
Response: {
  "success": true,
  "status": "cancel_requested",
  "message": "系统将停止后续章节生成，当前正在生成的章节可能会继续完成。"
}

# 暂停任务
POST /api/generation-tasks/{task_id}/pause/
Response: {
  "success": true,
  "status": "paused"
}

# 恢复任务
POST /api/generation-tasks/{task_id}/resume/
Response: {
  "success": true,
  "status": "running"
}

# 跳过当前章节
POST /api/generation-tasks/{task_id}/skip-current/
Response: {
  "success": true,
  "skipped_section_id": 5,
  "message": "已跳过当前章节，继续下一章节"
}
```

### 4.6 实现约定

```
1. 正文生成前应检查章节内容责任矩阵状态，pending / failed / generating 状态默认阻止生成。
2. 批量生成前建议调用 precheck 接口，统一返回矩阵缺失、依赖冲突、阻塞章节等风险。
3. 前端的"强制按顺序生成"需要通过 force_ignore_dependencies 参数传递给后端。
4. 矩阵状态和正文生成状态分开维护，避免状态含义混淆。
5. 异步任务取消采用软取消机制：停止后续任务，当前执行中的 AI 调用可能继续完成。
6. 矩阵编辑使用乐观锁，前端传递 content_matrix_version，版本不一致时返回错误。
7. 后续如需支持"恢复 AI 建议"，应增加矩阵版本历史或 AI 原始快照。
```

---

## 模块五：提示词设计

### 5.1 内容责任矩阵生成提示词

#### 系统提示词

```text
你是一位资深投标文件编制专家，擅长根据招标文件目录结构，为每个章节划分写作边界，确保投标文件内容不重复、不遗漏、前后连贯。

你的任务是生成一张"内容责任矩阵"，明确每个章节写什么、不写什么、如何与其他章节衔接，并为后续逐章节生成正文提供边界约束。

核心原则：

1. 父章节只写总述、编制目的、内容范围、结构说明和承接关系，不展开子章节细节。
2. 子章节写具体内容，不重复父章节总述，不提前展开其他兄弟章节内容。
3. 每个内容点只能在一个章节详细展开，其他章节如需提及，只能使用"详见 ×× 章节"的方式简要引用。
4. 资格证明、承诺函、偏离表、报价表、人员简历、证书材料等固定格式内容，应按表格、承诺函、证明材料、附件索引或简历表方式处理，不要写成大段技术方案正文。
5. 技术方案类章节可以详细展开，表达应专业、稳健、可落地。
6. 最终汇总类章节，如评标索引表、目录、响应索引、偏离汇总表等，应以后置汇总和索引为主，不提前生成具体正文内容。
7. 如果某章节依赖其他章节内容，应在 dependency_sections 中明确列出依赖章节。
8. 如果某章节容易与其他章节重复，应在 no_duplicate_sections 中明确列出禁止重复展开的章节。

输出要求：

1. 必须严格按照 JSON 格式输出，不要添加任何解释文本、Markdown 标记或额外说明。
2. 每个输入章节都必须出现在输出结果中，不得遗漏。
3. section_id 必须与输入的章节 ID 完全对应，不得自行编造、修改或重排 ID。
4. section_number 和 title 应与输入目录保持一致。
5. section_role、expression_form、writing_depth 必须使用指定枚举值。
6. reference_sections、no_duplicate_sections、dependency_sections、related_requirements 只能输出 ID 数组。
7. generation_priority 必须为 0-100 的整数，数值越大，正文生成越靠前。
8. 父章节的 generation_priority 应低于其子章节；最终汇总类章节的 generation_priority 应最低。
9. ai_reasoning_summary 应简要说明该章节边界划分依据，便于用户后续编辑。
10. 不要输出"作为AI""根据你提供的目录"等非投标文件系统语言。
```

#### 用户提示词模板

```text
请根据以下投标文件目录结构，生成内容责任矩阵。

## 项目信息
- 项目名称：{{ project_name }}
- 标段名称：{{ lot_name }}

## 完整目录结构

{{ outline_structure }}

{{#if has_requirements }}
## 招标关键条款摘要

{{ requirements_summary }}
{{/if}}

## 输出格式要求

请输出 JSON 格式，结构如下：

{
  "sections": [
    {
      "section_id": 章节ID（必须与输入一致）,
      "section_number": "章节编号",
      "title": "章节标题",
      "section_role": "章节定位",
      "write_scope": "本章写什么（详细说明写作范围）",
      "exclude_scope": "本章不写什么（明确排除的内容）",
      "reference_sections": [可引用的章节ID数组],
      "no_duplicate_sections": [禁止重复展开的章节ID数组],
      "dependency_sections": [必须先完成的章节ID数组],
      "expression_form": "建议表达形式",
      "writing_depth": "写作深度",
      "related_requirements": [关联的招标条款ID数组],
      "generation_priority": 生成优先级（0-100，数值越大越先生成）,
      "ai_reasoning_summary": "AI划分说明（解释为什么这样划分边界）"
    }
  ]
}

## 枚举值说明

section_role 可选值：
- "qualification"：资格证明
- "technical_solution"：技术方案
- "business_response"：商务响应
- "service_plan"：服务方案
- "team_intro"：团队介绍
- "attachment"：附件材料
- "other"：其他

expression_form 可选值：
- "body_text"：正文
- "table"：表格
- "commitment_letter"：承诺函
- "certificate"：证明材料
- "attachment_index"：附件索引
- "resume_table"：简历表
- "mixed"：混合形式

writing_depth 可选值：
- "overview"：概述（适用于父章节、索引类）
- "moderate"：适度展开
- "detailed"：详细展开（适用于叶子技术章节）
```

#### 变量 Schema

```yaml
scenario: content_matrix_generation
variables:
  project_name:
    type: string
    required: true
    description: 项目名称
  lot_name:
    type: string
    required: true
    description: 标段名称
  outline_structure:
    type: string
    required: true
    description: 完整目录结构（含章节ID、编号、标题、层级、父子关系）
  requirements_summary:
    type: string
    required: false
    description: 招标关键条款摘要
output_schema:
  type: object
  required: [sections]
  properties:
    sections:
      type: array
      items:
        type: object
        required: [section_id, title, write_scope]
        properties:
          section_id: { type: integer }
          section_number: { type: string }
          title: { type: string }
          section_role: { type: string, enum: [qualification, technical_solution, business_response, service_plan, team_intro, attachment, other] }
          write_scope: { type: string, minLength: 1 }
          exclude_scope: { type: string }
          reference_sections: { type: array, items: { type: integer } }
          no_duplicate_sections: { type: array, items: { type: integer } }
          dependency_sections: { type: array, items: { type: integer } }
          expression_form: { type: string, enum: [body_text, table, commitment_letter, certificate, attachment_index, resume_table, mixed] }
          writing_depth: { type: string, enum: [overview, moderate, detailed] }
          related_requirements: { type: array, items: { type: integer } }
          generation_priority: { type: integer, minimum: 0, maximum: 100 }
          ai_reasoning_summary: { type: string }
```

### 5.2 单章节正文生成提示词

#### 系统提示词

```text
你是一位资深投标文件编制专家，现在需要根据已确定的内容责任矩阵，为指定章节撰写投标文件正文。

核心原则（必须严格遵守）：
1. 只写本章节负责的内容，绝不超出 write_scope 范围
2. 绝不写 exclude_scope 中禁止的内容
3. 禁止重复章节的内容只能引用，不得展开
4. 表达形式必须符合 expression_form 要求
5. 写作深度必须符合 writing_depth 要求
6. 父章节只写总述和承接，子章节写具体内容
7. 内容必须专业、稳健、可落地，符合投标文件语气
8. 不出现"作为AI""根据你提供的信息"等非投标文件语言

引用规范：
- 引用其他章节时使用："相关内容详见 ×× 章节"
- 禁止复制或展开其他章节的核心内容
- 禁止在父章节中提前展开子章节内容
```

#### 用户提示词模板

```text
请为以下章节撰写投标文件正文。

## 当前章节信息

- 章节编号：{{ current_section.section_number }}
- 章节标题：{{ current_section.title }}
- 章节层级：{{ current_section.level }}

## 内容责任矩阵（核心约束）

### 章节定位
{{ content_matrix.section_role_display }}

### 本章写什么（必须严格遵守）
{{ content_matrix.write_scope }}

### 本章不写什么（绝对禁止）
{{ content_matrix.exclude_scope }}

### 建议表达形式
{{ content_matrix.expression_form_display }}

### 写作深度要求
{{ content_matrix.writing_depth_display }}

{{#if content_matrix.ai_reasoning_summary }}
### AI 边界划分说明
{{ content_matrix.ai_reasoning_summary }}
{{/if}}

{{#if content_matrix.manual_notes }}
### 人工补充要求（高优先级）
{{ content_matrix.manual_notes }}
{{/if}}

## 禁止重复章节（只能引用，不得展开）

{{#each no_duplicate_sections }}
### 【禁止重复】{{ section_number }} {{ title }}
写作范围：{{ write_scope }}
{{#if content_summary }}
已涵盖内容：{{ content_summary }}
{{else}}
尚未生成正文，但本章不得提前展开该章节负责的内容。
{{/if}}
本章只能使用"详见 {{ section_number }} {{ title }}"方式引用，禁止展开该章节核心内容。

{{/each}}

## 可引用章节（允许简要引用）

{{#each reference_sections }}
### 【可引用】{{ section_number }} {{ title }}
{{#if summary }}
摘要：{{ summary }}
{{/if}}
本章可使用"详见 ×× 章节"方式简要引用，但不建议大段复制。

{{/each}}

## 父章节承接

{{#if parent_section }}
### 父章节：{{ parent_section.section_number }} {{ parent_section.title }}
{{#if parent_section.content }}
父章节正文摘要：
{{ parent_section.content }}
{{else}}
父章节写作范围：{{ parent_section.write_scope }}
父章节尚未生成正文，但本章应在其框架下展开。
{{/if}}
{{else}}
本章为一级章节，无父章节承接。
{{/if}}

## 子章节摘要（父章节生成时使用）

{{#if child_sections }}
### 下级章节已生成内容摘要

{{#each child_sections }}
- {{ section_number }} {{ title }}
  写作范围：{{ write_scope }}
  {{#if summary }}已涵盖：{{ summary }}{{/if}}

{{/each}}

请基于以上子章节摘要，撰写父章节总述和承接，不得复制或展开子章节正文。
{{/if}}

## 前置兄弟章节

{{#each preceding_siblings }}
### 【前置章节】{{ section_number }} {{ title }}
已涵盖内容：{{ summary }}

{{/each}}

## 招标文件相关条款

{{#if related_requirements }}
{{#each related_requirements }}
- {{ requirement_no }} {{ title }}
  {{ content }}

{{/each}}
{{else}}
无直接关联的招标条款。
{{/if}}

## 检索到的知识库内容

{{#if retrieved_knowledge }}
{{ retrieved_knowledge }}
{{else}}
无相关知识库内容。
{{/if}}

## 整体大纲结构（供参考）

{{ outline_structure }}

## 项目信息

- 项目名称：{{ project_name }}
- 标段名称：{{ lot_name }}

## 输出要求

1. 严格按照本章的写作范围撰写，不超出边界
2. 绝不写 exclude_scope 中禁止的内容
3. 禁止重复章节只能引用，格式："详见 ×× 章节"
4. 表达形式：{{ content_matrix.expression_form_display }}
5. 写作深度：{{ content_matrix.writing_depth_display }}
6. 使用专业投标文件语气，不出现 AI 相关表述
7. 如果需要表格，使用投标文件风格表格
8. 章节开头简要承接父章节（如有），结尾可引出后续章节

{{#if is_parent_section }}
## 父章节特殊要求

本章为父级章节，请遵守以下规则：
1. 只写本章编制目的、内容范围、结构说明
2. 引出下级章节，使用"详见 ×× 章节"方式
3. 不展开子章节的具体内容
4. 不复制子章节的核心技术描述
5. 总述字数建议控制在 500-1000 字
{{/if}}

{{#if is_final_section }}
## 最终汇总章节特殊要求

本章为汇总类章节（如索引表、目录），请遵守以下规则：
1. 汇总各章节要点，建立评审对应关系
2. 使用表格形式，清晰展示章节与评分项对应
3. 不展开各章节具体内容
4. 字数建议控制在合理范围，突出索引功能
{{/if}}

## 输出格式

请严格按照 JSON 格式输出，不要添加任何解释文本：

```json
{
  "content": "本章 Markdown 格式的正文内容...",
  "word_count": 2500
}
```

其中：
- `content`：章节正文，使用 Markdown 格式
- `word_count`：正文字数统计
```

#### 变量 Schema

```yaml
scenario: section_content_generation
variables:
  current_section:
    type: object
    required: true
    properties:
      id: { type: integer }
      section_number: { type: string }
      title: { type: string }
      level: { type: integer }
  content_matrix:
    type: object
    required: true
    description: 内容责任矩阵
  no_duplicate_sections:
    type: array
    required: true
    description: 禁止重复章节列表
  reference_sections:
    type: array
    required: false
    description: 可引用章节列表
  parent_section:
    type: object
    required: false
    description: 父章节信息
  child_sections:
    type: array
    required: false
    description: 子章节摘要（父章节生成时使用）
  preceding_siblings:
    type: array
    required: false
    description: 前置兄弟章节摘要
  related_requirements:
    type: array
    required: false
    description: 关联招标条款
  retrieved_knowledge:
    type: string
    required: false
    description: 检索到的知识库内容
  outline_structure:
    type: string
    required: true
    description: 整体大纲结构
  project_name:
    type: string
    required: true
  lot_name:
    type: string
    required: true
  is_parent_section:
    type: boolean
    required: false
    description: 是否为父级章节
  is_final_section:
    type: boolean
    required: false
    description: 是否为最终汇总章节
output_schema:
  type: object
  properties:
    content:
      type: string
      description: 章节正文内容
    word_count:
      type: integer
      description: 字数统计
```

### 5.3 防重复与连贯性校验提示词

#### 系统提示词

```text
你是一位投标文件质量审核专家，负责检查章节内容是否符合内容责任矩阵要求，是否存在重复、遗漏或不连贯问题。

审核目标：
1. 是否超出 write_scope 范围
2. 是否写了 exclude_scope 中禁止的内容
3. 是否重复了禁止重复章节的内容
4. 父章节是否展开了子章节细节
5. 子章节是否重复了父章节总述
6. 是否与前置章节连贯
7. 是否为后续章节留下承接
8. 投标文件语气是否专业
```

#### 用户提示词模板

```text
请对以下章节进行防重复和连贯性校验。

## 章节信息

- 章节编号：{{ section_number }}
- 章节标题：{{ title }}
- 章节层级：{{ level }}

## 内容责任矩阵

### 本章写什么
{{ write_scope }}

### 本章不写什么
{{ exclude_scope }}

### 禁止重复章节
{{#each no_duplicate_sections }}
- {{ section_number }} {{ title }}：{{ write_scope }}
{{/each}}

## 章节正文

{{ content }}

## 禁止重复章节内容摘要

{{#each no_duplicate_sections_content }}
### {{ section_number }} {{ title }}
{{ content_summary }}
{{/each}}

## 前置章节摘要

{{#each preceding_siblings }}
### {{ section_number }} {{ title }}
{{ summary }}
{{/each}}

## 后续章节计划

{{#if following_sections }}
{{#each following_sections }}
- {{ section_number }} {{ title }}：计划写 {{ planned_content }}
{{/each}}
{{else}}
无后续章节。
{{/if}}

## 校验要求

请检查以下项目：

1. **范围校验**：正文是否超出 write_scope？是否写了 exclude_scope 内容？

2. **重复校验**：是否重复了禁止重复章节的核心内容？引用是否规范？

3. **父子校验**：
   - 父章节：是否展开了子章节细节？是否只写总述和承接？
   - 子章节：是否重复了父章节总述？是否在父章节框架下展开？

4. **连贯校验**：是否与前置章节自然衔接？是否为后续章节留下承接？

5. **语气校验**：是否出现 AI 相关表述？是否专业、稳健？

6. **格式校验**：表达形式是否符合要求？表格是否合理？

## 输出格式

请输出 JSON 格式：

{
  "check_result": "pass" | "warning" | "fail",
  "issues": [
    {
      "type": "range_violation" | "duplicate_content" | "parent_expand_child" | "child_repeat_parent" | "tone_issue" | "format_issue",
      "severity": "high" | "medium" | "low",
      "description": "问题描述",
      "location": "问题位置（段落或句子摘要）",
      "suggestion": "修改建议"
    }
  ],
  "score": 0-100,
  "summary": "整体评价"
}

如果 check_result 为 fail 或 warning，必须提供具体修改建议。
```

#### 变量 Schema

```yaml
scenario: content_duplicate_check
variables:
  section_number:
    type: string
    required: true
  title:
    type: string
    required: true
  level:
    type: integer
    required: true
  write_scope:
    type: string
    required: true
  exclude_scope:
    type: string
    required: false
  no_duplicate_sections:
    type: array
    required: true
  content:
    type: string
    required: true
  no_duplicate_sections_content:
    type: array
    required: true
  preceding_siblings:
    type: array
    required: false
  following_sections:
    type: array
    required: false
output_schema:
  type: object
  required: [check_result, issues, score, summary]
  properties:
    check_result:
      type: string
      enum: [pass, warning, fail]
    issues:
      type: array
      items:
        type: object
        properties:
          type: { type: string }
          severity: { type: string, enum: [high, medium, low] }
          description: { type: string }
          location: { type: string }
          suggestion: { type: string }
    score:
      type: integer
      minimum: 0
      maximum: 100
    summary:
      type: string
```

### 5.4 章节摘要生成提示词

#### 系统提示词

```text
你是一位投标文件摘要专家，负责为已生成的章节内容撰写精简摘要，用于后续章节生成时传入上下文。

摘要要求：
1. 保留章节核心内容和关键结论
2. 突出本章已涵盖的内容范围
3. 便于其他章节判断是否需要引用
4. 字数控制在 200-300 字
```

#### 用户提示词模板

```text
请为以下章节生成摘要，用于其他章节生成时传入上下文。

## 章节信息

- 章节编号：{{ section_number }}
- 章节标题：{{ title }}
- 写作范围：{{ write_scope }}

## 章节正文

{{ content }}

## 输出要求

请生成 200-300 字的摘要，包含：
1. 本章核心内容概述
2. 本章已涵盖的关键结论
3. 本章与其他章节的关系（如有引用）

## 输出格式

请严格按照 JSON 格式输出：

```json
{
  "summary": "200-300 字的章节摘要..."
}
```

注意：字数统计按中文字符计算，控制在 200-300 字范围内。
```

#### 变量 Schema

```yaml
scenario: section_summary_generation
variables:
  section_number:
    type: string
    required: true
  title:
    type: string
    required: true
  write_scope:
    type: string
    required: true
  content:
    type: string
    required: true
output_schema:
  type: object
  properties:
    summary:
      type: string
      minLength: 200
      maxLength: 300
      description: 章节摘要
```

### 5.5 实现约定

```
1. 所有提示词必须包含明确的边界约束（write_scope、exclude_scope）。
2. 禁止重复章节即使未生成正文，也要传入其矩阵写作范围。
3. 父章节生成时必须传入子章节摘要，避免展开子章节内容。
4. 叶子章节生成时即使父章节正文未生成，也要传入父章节矩阵边界。
5. 校验提示词的输出必须为 JSON 格式，便于程序解析问题。
6. 摘要生成用于后续章节上下文，字数控制在 200-300 字。
7. 人工备注 (manual_notes) 作为高优先级约束，放在提示词显著位置。
8. 提示词中不出现"作为AI"等表述，确保输出符合投标文件语气。
```

---

## 落地实施步骤

### 第一阶段：数据模型和矩阵生成

1. Section 模型新增矩阵字段和正文生成字段
2. 创建 GenerationTask 任务模型
3. 实现矩阵生成 Celery 任务
4. 大纲创建后自动触发矩阵生成
5. 矩阵生成状态 API 和前端状态展示

### 第二阶段：矩阵编辑界面和状态展示

1. 矩阵编辑对话框组件
2. 矩阵状态图标和快捷操作
3. 矩阵编辑 API（含乐观锁）
4. 矩阵重新生成和失败重试

### 第三阶段：批量生成顺序计算

1. 推荐生成顺序计算算法
2. 生成顺序预览界面
3. 拖拽调整和依赖冲突检测
4. precheck 预检查接口

### 第四阶段：正文生成上下文和提示词接入

1. 正文生成目标章节筛选
2. 上下文构建（含矩阵边界、子章节摘要）
3. 四类提示词接入系统
4. GenerationTask 进度追踪

### 第五阶段：防重复校验、失败重试、任务控制

1. 防重复校验可选功能
2. 章节摘要自动生成
3. 任务控制 API（取消、暂停、跳过）
4. 批量重试失败章节
5. 全文一致性校验

---

## 总结

本方案通过以下机制确保投标文件章节内容不重复、边界清晰：

1. **内容责任矩阵**：明确定义每个章节的写作边界
2. **叶子优先生成**：子章节先写，父章节后写总述
3. **强约束提示词**：AI 必须遵守矩阵边界
4. **防重复校验**：生成后自动检查内容一致性
5. **依赖关系管理**：确保生成顺序符合逻辑依赖
6. **状态分离管理**：矩阵状态与正文状态分开维护
7. **任务进度追踪**：GenerationTask 记录所有生成任务状态

该方案可有效解决投标文件生成中常见的内容重复、边界模糊、前后不一致等问题。