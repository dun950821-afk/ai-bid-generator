# 大纲提取与章节生成 - 设计文档

> 版本：v1.0
> 日期：2026-06-03
> 状态：设计评审

---

## 一、概述

### 1.1 背景

投标文件生成系统已完成招标文件解析和条款抽取功能，现需实现大纲提取与章节生成功能，为后续投标文件撰写提供结构化支撑。

### 1.2 目标

- 支持两种大纲来源：系统预设模板、AI解析招标文件
- 支持多级嵌套章节结构（树形）
- 支持单章节生成和批量生成
- 章节生成需整合知识库检索、招标条款、用户自定义提示词
- 确保层级内容不重复、有层级感

### 1.3 核心原则

- `outline` app 负责业务编排（大纲创建、章节树管理、生成编排、版本管理）
- `generation` app 只作为 AI 能力层（接收 prompt + variables，调用 LLM，返回结果）
- `workflow` app 预留关联，第一版不强依赖
- 耗时任务统一通过 `AsyncTask` 跟踪
- 系统已预留 `apps/outline/` 目录，沿用现有架构风格

---

## 二、架构设计

### 2.1 目录结构

```
apps/outline/
├── models/
│   ├── __init__.py
│   ├── outline.py
│   ├── section.py
│   ├── section_version.py
│   └── section_generation_record.py
│
├── services/
│   ├── __init__.py
│   ├── outline_service.py           # 大纲创建与管理
│   ├── section_tree_service.py      # 章节树维护
│   └── section_generation_service.py # 章节生成编排
│
├── tasks.py                          # Celery 异步任务
├── constants.py                      # 状态常量
├── permissions.py                    # 权限定义
├── views.py
├── serializers.py
└── urls.py
```

### 2.2 服务边界

| App | 职责 |
|-----|------|
| `outline` | 大纲创建、章节树维护、生成编排、版本管理、状态流转 |
| `generation` | 接收 prompt + variables，调用 LLM，返回结果，记录 AI 调用 |
| `workflow` | 流程节点推进、审批动作（第一版预留关联） |
| `knowledge` | 知识库检索、RAG 上下文构建 |
| `tender` | 招标文件、条款数据 |

---

## 三、数据模型

### 3.1 Outline（大纲）

```python
class Outline(TimeStampedModel):
    """投标大纲。"""

    SOURCE_PRESET = "preset"          # 系统预设模板
    SOURCE_AI_GENERATED = "ai"        # AI解析生成

    STATUS_DRAFT = "draft"            # 草稿
    STATUS_ACTIVE = "active"          # 活跃（使用中）
    STATUS_ARCHIVED = "archived"      # 已归档

    SOURCE_CHOICES = [
        (SOURCE_PRESET, "系统预设"),
        (SOURCE_AI_GENERATED, "AI解析"),
    ]

    STATUS_CHOICES = [
        (STATUS_DRAFT, "草稿"),
        (STATUS_ACTIVE, "活跃"),
        (STATUS_ARCHIVED, "已归档"),
    ]

    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.CASCADE,
        related_name="outlines",
        verbose_name="项目",
    )
    lot = models.ForeignKey(
        "projects.Lot",
        on_delete=models.CASCADE,
        related_name="outlines",
        verbose_name="标段",
    )
    name = models.CharField("大纲名称", max_length=255)
    source = models.CharField(
        "来源",
        max_length=20,
        choices=SOURCE_CHOICES,
    )
    status = models.CharField(
        "状态",
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_DRAFT,
    )
    is_current = models.BooleanField(
        "是否当前大纲",
        default=True,
        help_text="每个标段只能有一个当前大纲",
    )

    # AI生成来源（当 source=ai 时）
    source_tender_file = models.ForeignKey(
        "tender.TenderFile",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="源招标文件",
    )

    # 工作流预留（第一版不使用）
    workflow_instance = models.ForeignKey(
        "workflow.WorkflowInstance",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="工作流实例",
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        verbose_name="创建人",
    )

    class Meta:
        db_table = "outline"
        verbose_name = "投标大纲"
        verbose_name_plural = "投标大纲"
        constraints = [
            # 每个标段只能有一个 is_current=True 的大纲
            models.UniqueConstraint(
                fields=["lot"],
                condition=models.Q(is_current=True),
                name="uniq_current_outline_per_lot",
            ),
        ]
        indexes = [
            models.Index(fields=["project"]),
            models.Index(fields=["lot"]),
            models.Index(fields=["status"]),
            models.Index(fields=["is_current"]),
        ]

    def clean(self):
        """校验 lot.project 与 project 一致性。"""
        from django.core.exceptions import ValidationError
        if self.lot_id and self.project_id:
            if self.lot.project_id != self.project_id:
                raise ValidationError({"lot": "lot 必须属于 project"})
```

### 3.2 Section（章节）

```python
class Section(TimeStampedModel):
    """大纲章节（树形结构）。"""

    # 编辑状态
    STATUS_DRAFT = "draft"            # 草稿（未生成）
    STATUS_GENERATED = "generated"    # 已生成
    STATUS_REVIEWING = "reviewing"    # 待审核
    STATUS_APPROVED = "approved"      # 已确认
    STATUS_REJECTED = "rejected"      # 已驳回

    STATUS_CHOICES = [
        (STATUS_DRAFT, "草稿"),
        (STATUS_GENERATED, "已生成"),
        (STATUS_REVIEWING, "待审核"),
        (STATUS_APPROVED, "已确认"),
        (STATUS_REJECTED, "已驳回"),
    ]

    # 生成状态
    GEN_STATUS_NOT_STARTED = "not_started"
    GEN_STATUS_PENDING = "pending"
    GEN_STATUS_RUNNING = "running"
    GEN_STATUS_SUCCESS = "success"
    GEN_STATUS_FAILED = "failed"

    GEN_STATUS_CHOICES = [
        (GEN_STATUS_NOT_STARTED, "未开始"),
        (GEN_STATUS_PENDING, "等待中"),
        (GEN_STATUS_RUNNING, "生成中"),
        (GEN_STATUS_SUCCESS, "成功"),
        (GEN_STATUS_FAILED, "失败"),
    ]

    outline = models.ForeignKey(
        "outline.Outline",
        on_delete=models.CASCADE,
        related_name="sections",
        verbose_name="大纲",
    )
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="children",
        verbose_name="父章节",
    )

    title = models.CharField("章节标题", max_length=500)
    level = models.PositiveIntegerField(
        "层级",
        default=1,
        help_text="根据 parent 自动计算，顶级章节为 1",
    )
    sort_order = models.PositiveIntegerField(
        "排序",
        default=0,
        help_text="同一 parent 下的排序序号",
    )

    # 章节内容（富文本 HTML）
    content = models.TextField("章节内容", blank=True)
    word_count = models.PositiveIntegerField("字数", default=0)

    # 状态
    status = models.CharField(
        "编辑状态",
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_DRAFT,
    )
    generation_status = models.CharField(
        "生成状态",
        max_length=20,
        choices=GEN_STATUS_CHOICES,
        default=GEN_STATUS_NOT_STARTED,
    )

    # 用户自定义提示词（生成时可编辑）
    user_prompt = models.TextField(
        "用户补充提示词",
        blank=True,
        help_text="用户在生成章节时补充的自定义要求",
    )

    class Meta:
        db_table = "outline_section"
        verbose_name = "大纲章节"
        verbose_name_plural = "大纲章节"
        ordering = ["sort_order", "id"]
        constraints = [
            # 同一 parent 下 sort_order 唯一，避免排序冲突
            models.UniqueConstraint(
                fields=["outline", "parent", "sort_order"],
                name="uniq_section_order_under_parent",
            ),
        ]
        indexes = [
            models.Index(fields=["outline", "parent", "sort_order"]),
            models.Index(fields=["outline", "level"]),
            models.Index(fields=["generation_status"]),
            models.Index(fields=["status"]),
        ]

    def clean(self):
        """校验 parent 属于同一 outline。"""
        from django.core.exceptions import ValidationError
        if self.parent_id and self.parent.outline_id != self.outline_id:
            raise ValidationError({"parent": "parent 必须属于同一 outline"})
```

### 3.3 SectionVersion（章节版本）

```python
class SectionVersion(TimeStampedModel):
    """章节版本历史。"""

    SOURCE_AI = "ai"          # AI生成
    SOURCE_MANUAL = "manual"  # 手动编辑

    SOURCE_CHOICES = [
        (SOURCE_AI, "AI生成"),
        (SOURCE_MANUAL, "手动编辑"),
    ]

    section = models.ForeignKey(
        "outline.Section",
        on_delete=models.CASCADE,
        related_name="versions",
        verbose_name="章节",
    )
    content = models.TextField("章节内容")
    version_no = models.PositiveIntegerField(
        "版本号",
        help_text="自增，每次生成或编辑递增",
    )
    source = models.CharField(
        "来源",
        max_length=20,
        choices=SOURCE_CHOICES,
    )
    word_count = models.PositiveIntegerField("字数", default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        verbose_name="创建人",
    )

    class Meta:
        db_table = "outline_section_version"
        verbose_name = "章节版本"
        verbose_name_plural = "章节版本"
        constraints = [
            models.UniqueConstraint(
                fields=["section", "version_no"],
                name="uniq_section_version",
            ),
        ]
        indexes = [
            models.Index(fields=["section", "version_no"]),
        ]

    def __str__(self):
        return f"{self.section.title} v{self.version_no} ({self.source})"
```

### 3.4 SectionGenerationRecord（生成记录）

```python
class SectionGenerationRecord(TimeStampedModel):
    """章节生成记录。"""

    STATUS_PENDING = "pending"
    STATUS_RUNNING = "running"
    STATUS_SUCCESS = "success"
    STATUS_FAILED = "failed"

    STATUS_CHOICES = [
        (STATUS_PENDING, "等待中"),
        (STATUS_RUNNING, "运行中"),
        (STATUS_SUCCESS, "成功"),
        (STATUS_FAILED, "失败"),
    ]

    section = models.ForeignKey(
        "outline.Section",
        on_delete=models.CASCADE,
        related_name="generation_records",
        verbose_name="章节",
    )
    async_task = models.ForeignKey(
        "common.AsyncTask",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="异步任务",
        help_text="单章节生成关联 section_generate，批量生成关联 outline_generate_batch",
    )

    # 主要追溯来源
    prompt_run = models.ForeignKey(
        "generation.PromptRun",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="AI运行记录",
    )

    # 冗余快照（方便查询，不依赖外键）
    prompt_template_id = models.PositiveIntegerField(
        "提示词模板ID",
        null=True,
        blank=True,
    )
    prompt_version = models.CharField(
        "提示词版本号",
        max_length=50,
        blank=True,
    )
    llm_model = models.CharField(
        "LLM模型",
        max_length=100,
        blank=True,
    )

    # 输入输出摘要（不存完整正文）
    input_summary = models.JSONField(
        "输入摘要",
        default=dict,
        help_text="例：{'keywords': [...], 'kb_count': 5, 'requirement_count': 3}",
    )
    output_summary = models.JSONField(
        "输出摘要",
        default=dict,
        help_text="例：{'word_count': 1500, 'has_tables': true}",
    )

    error_message = models.TextField("错误信息", blank=True)

    # 工作流预留（第一版不使用）
    workflow_node = models.ForeignKey(
        "workflow.WorkflowNodeInstance",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        verbose_name="工作流节点",
    )

    status = models.CharField(
        "状态",
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
    )
    finished_at = models.DateTimeField("完成时间", null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        verbose_name="创建人",
    )

    class Meta:
        db_table = "outline_section_generation_record"
        verbose_name = "章节生成记录"
        verbose_name_plural = "章节生成记录"
        indexes = [
            models.Index(fields=["section", "status"]),
            models.Index(fields=["async_task"]),
            models.Index(fields=["prompt_run"]),
        ]
```

### 3.5 PresetOutlineTemplate（预设大纲模板）

系统预设大纲模板，供用户选择创建。

```python
class PresetOutlineTemplate(TimeStampedModel):
    """预设大纲模板。"""

    name = models.CharField("模板名称", max_length=255)
    description = models.TextField("模板描述", blank=True)
    category = models.CharField(
        "分类",
        max_length=50,
        blank=True,
        help_text="如：工程类、服务类、货物类（可选）",
    )
    is_active = models.BooleanField("是否启用", default=True)

    class Meta:
        db_table = "outline_preset_template"
        verbose_name = "预设大纲模板"
        verbose_name_plural = "预设大纲模板"

    def __str__(self):
        return self.name


class PresetSectionTemplate(TimeStampedModel):
    """预设章节模板。"""

    template = models.ForeignKey(
        "outline.PresetOutlineTemplate",
        on_delete=models.CASCADE,
        related_name="sections",
        verbose_name="大纲模板",
    )
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="children",
        verbose_name="父章节模板",
    )
    title = models.CharField("章节标题", max_length=500)
    level = models.PositiveIntegerField("层级", default=1)
    sort_order = models.PositiveIntegerField("排序", default=0)

    class Meta:
        db_table = "outline_preset_section_template"
        verbose_name = "预设章节模板"
        verbose_name_plural = "预设章节模板"
        ordering = ["sort_order", "id"]
```

---

## 四、核心流程

### 4.1 大纲创建流程

#### 4.1.1 预设模板创建

```
1. 用户选择"使用预设模板"
2. 选择标段（Lot）
3. 系统加载预设模板列表
4. 用户选择模板
5. 服务层事务内执行：
   a. 将同 lot 下其他 Outline.is_current 置为 False
   b. 创建新 Outline（source=preset）
   c. 复制模板章节到 Section
6. 用户可编辑章节标题、顺序、层级
```

#### 4.1.2 AI解析创建

```
1. 用户选择"AI解析生成"
2. 选择招标文件（TenderFile）
3. 校验：TenderFile 必须绑定 Lot（tender_file.lot 不为空）
4. 调用 AI（scenario=outline_extraction）提取文档结构
5. 返回章节树数据
6. 用户可编辑章节标题、顺序、层级
7. 确认后保存为 Outline + Section
```

### 4.2 章节生成流程（核心）

```
┌─────────────────────────────────────────────────────────────────┐
│                        章节生成流程                               │
├─────────────────────────────────────────────────────────────────┤
│  1. 用户点击"生成章节"                                           │
│     ↓                                                            │
│  2. 校验并发防重                                                  │
│     - 如果 generation_status in ["pending", "running"]           │
│       - 返回已有 AsyncTask（不允许再次创建）                      │
│     ↓                                                            │
│  3. AI 分析章节需求（同步调用，可能耗时）                          │
│     - scenario = section_needs_analysis                         │
│     - 输入：章节标题、层级、大纲上下文                             │
│     - 输出：需要的资料类型、检索关键词、背景描述                   │
│     - 注意：分析失败不影响用户手动填写提示词                       │
│     ↓                                                            │
│  4. 展示分析结果 + 检索预览                                       │
│     - 显示：AI建议的检索关键词、预期资料类型                       │
│     - 用户可编辑"AI提示词框"补充要求                              │
│     ↓                                                            │
│  5. 用户确认生成                                                  │
│     ↓                                                            │
│  6. 系统执行知识库检索                                            │
│     - 公司资质知识库                                              │
│     - 历史案例知识库                                              │
│     - 其他项目关联知识库                                          │
│     ↓                                                            │
│  7. 汇总生成上下文                                                │
│     - 章节标题 + 层级                                             │
│     - 检索到的知识内容                                            │
│     - 关联的招标条款                                              │
│     - 用户自定义提示词                                            │
│     - 父章节内容（保持上下文连贯）                                 │
│     - 同级前置章节摘要（避免内容重复）                             │
│     ↓                                                            │
│  8. 创建 AsyncTask + SectionGenerationRecord                     │
│     ↓                                                            │
│  9. 触发 Celery 任务                                              │
│     - 任务参数：section_id、record_id、analysis_result、          │
│                 user_prompt、user_id                              │
│     - 上下文在任务内部重新构建（不传递大段正文）                   │
│     ↓                                                            │
│  10. 调用 AI 生成章节内容                                         │
│      - scenario = section_writing                                │
│      ↓                                                            │
│  11. 保存结果                                                     │
│      - 更新 Section.content                                       │
│      - 创建 SectionVersion（version_no 事务内生成）               │
│      - 更新 SectionGenerationRecord                               │
│      - 完整正文只保存到 Section.content 和 SectionVersion.content │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 批量生成流程

```
1. 用户点击"生成全部章节"
2. 创建一个 AsyncTask（task_type=outline_generate_batch）
3. 为每个章节创建一条 SectionGenerationRecord（共享同一个 async_task）
4. 触发 Celery 批量任务
5. 任务依次生成每个章节：
   - 更新整体进度（progress、current_step）
   - 前端可展示：共 20 个章节，已完成 8 个，失败 1 个
6. 完成后更新 AsyncTask.result_payload
```

---

## 五、服务设计

### 5.1 OutlineService

```python
class OutlineService:
    """大纲管理服务。"""

    @transaction.atomic
    def create_from_preset(
        self,
        lot_id: int,
        template_id: int,
        name: str | None = None,
        created_by,
    ) -> Outline:
        """从预设模板创建大纲。

        事务内：
        1. 校验 lot.project 一致性
        2. 将同 lot 下其他 Outline.is_current 置为 False
        3. 创建新 Outline
        4. 复制模板章节到 Section
        """
        lot = Lot.objects.select_related("project").get(pk=lot_id)
        project = lot.project
        template = PresetOutlineTemplate.objects.get(pk=template_id, is_active=True)

        # 置空其他当前大纲
        Outline.objects.filter(lot=lot, is_current=True).update(is_current=False)

        # 创建大纲
        outline = Outline.objects.create(
            project=project,
            lot=lot,
            name=name or f"{lot.name} - {template.name}",
            source=Outline.SOURCE_PRESET,
            status=Outline.STATUS_DRAFT,
            is_current=True,
            created_by=created_by,
        )

        # 复制模板章节
        self._copy_template_sections(outline, template)

        return outline

    @transaction.atomic
    def create_from_ai(
        self,
        tender_file_id: int,
        name: str | None = None,
        created_by,
    ) -> Outline:
        """AI解析招标文件生成大纲。

        校验：
        - TenderFile 必须绑定 Lot
        """
        tender_file = TenderFile.objects.select_related("project", "lot").get(
            pk=tender_file_id
        )

        # 校验：tender_file.lot 必不为空
        if not tender_file.lot:
            raise ValidationError({"tender_file": "招标文件必须绑定标段"})

        lot = tender_file.lot
        project = tender_file.project

        # 置空其他当前大纲
        Outline.objects.filter(lot=lot, is_current=True).update(is_current=False)

        # 调用 AI 解析大纲结构
        sections_data = self._extract_outline_from_tender(tender_file, created_by)

        # 创建大纲
        outline = Outline.objects.create(
            project=project,
            lot=lot,
            name=name or f"{lot.name} - AI解析大纲",
            source=Outline.SOURCE_AI_GENERATED,
            source_tender_file=tender_file,
            status=Outline.STATUS_DRAFT,
            is_current=True,
            created_by=created_by,
        )

        # 创建章节
        self._create_sections_from_ai_result(outline, sections_data)

        return outline

    def _extract_outline_from_tender(self, tender_file, created_by) -> list[dict]:
        """调用 AI 提取招标文件大纲结构。"""
        prompt_run = AiTaskExecutionService().execute(
            scenario="outline_extraction",
            variables={
                "document_text": DocumentTextService().get_document_text(tender_file),
            },
            created_by=created_by,
        )

        if prompt_run.status != "succeeded":
            raise Exception(f"大纲解析失败: {prompt_run.error_message}")

        return prompt_run.output_json.get("sections", [])

    def _copy_template_sections(self, outline, template):
        """复制模板章节到大纲。"""
        template_sections = PresetSectionTemplate.objects.filter(
            template=template
        ).order_by("sort_order")

        for ts in template_sections:
            Section.objects.create(
                outline=outline,
                parent_id=None,  # 第一版不支持复制嵌套结构，后续可扩展
                title=ts.title,
                level=ts.level,
                sort_order=ts.sort_order,
            )

    def _create_sections_from_ai_result(self, outline, sections_data):
        """从 AI 解析结果创建章节。"""
        sort_order = 0
        for section_data in sections_data:
            Section.objects.create(
                outline=outline,
                parent_id=None,  # 第一版扁平结构，后续可支持嵌套
                title=section_data.get("title", ""),
                level=section_data.get("level", 1),
                sort_order=sort_order,
            )
            sort_order += 1
```

### 5.2 SectionTreeService

```python
class SectionTreeService:
    """章节树维护服务。"""

    def add_section(
        self,
        outline_id: int,
        parent_id: int | None,
        title: str,
    ) -> Section:
        """添加章节。

        自动计算 level 和 sort_order。
        校验：
        - parent 必须属于同一 outline
        """
        outline = Outline.objects.get(pk=outline_id)

        if parent_id:
            parent = Section.objects.get(pk=parent_id)
            # 校验 parent 属于同一 outline
            if parent.outline_id != outline_id:
                raise ValueError("parent 必须属于同一 outline")
            level = parent.level + 1
        else:
            parent = None
            level = 1

        # 自动计算 sort_order（服务层统一维护）
        max_order = (
            Section.objects.filter(outline_id=outline_id, parent=parent)
            .aggregate(max_order=models.Max("sort_order"))["max_order"]
            or 0
        )

        section = Section.objects.create(
            outline=outline,
            parent=parent,
            title=title,
            level=level,
            sort_order=max_order + 1,
        )
        return section

    def move_section(
        self,
        section_id: int,
        new_parent_id: int | None,
        new_sort_order: int,
    ) -> Section:
        """移动章节。

        校验：
        1. 不能移动到自己
        2. 不能移动到自己的子节点（避免循环）
        3. new_parent 必须属于同一 outline
        4. 重排同级 sort_order（服务层统一维护）
        """
        section = Section.objects.get(pk=section_id)

        # 校验不能移动到自己
        if section_id == new_parent_id:
            raise ValueError("不能移动到自己")

        # 校验不能移动到子节点
        if new_parent_id and self._is_descendant(section_id, new_parent_id):
            raise ValueError("不能移动到自己的子节点")

        # 确定 new_parent
        if new_parent_id:
            new_parent = Section.objects.get(pk=new_parent_id)
            if new_parent.outline_id != section.outline_id:
                raise ValueError("目标章节必须属于同一大纲")
            new_level = new_parent.level + 1
        else:
            new_parent = None
            new_level = 1

        # 重排同级 sort_order
        self._reorder_siblings(section.outline_id, new_parent, new_sort_order)

        # 更新章节
        section.parent = new_parent
        section.level = new_level
        section.sort_order = new_sort_order
        section.save()

        # 递归更新子节点 level
        self._update_children_level(section)

        return section

    def _is_descendant(self, ancestor_id: int, node_id: int) -> bool:
        """检查 node_id 是否是 ancestor_id 的后代。"""
        node = Section.objects.get(pk=node_id)
        while node.parent_id:
            if node.parent_id == ancestor_id:
                return True
            node = node.parent
        return False

    def _reorder_siblings(self, outline_id, parent, insert_order: int):
        """重排同级章节的 sort_order，为新插入腾出位置。"""
        siblings = Section.objects.filter(
            outline_id=outline_id,
            parent=parent,
        ).exclude(sort_order=insert_order)

        for sibling in siblings:
            if sibling.sort_order >= insert_order:
                sibling.sort_order += 1
                sibling.save()

    def _update_children_level(self, section):
        """递归更新子节点的 level。"""
        for child in section.children.all():
            child.level = section.level + 1
            child.save()
            self._update_children_level(child)

    def delete_section(self, section_id: int) -> None:
        """删除章节（含子章节）。"""
        section = Section.objects.get(pk=section_id)
        # 级联删除会自动处理子章节（CASCADE）
        section.delete()

    def get_section_tree(self, outline_id: int) -> list[dict]:
        """获取章节树（带层级结构）。"""
        sections = Section.objects.filter(outline_id=outline_id).order_by(
            "sort_order", "id"
        )
        return self._build_tree(sections)

    def _build_tree(self, sections) -> list[dict]:
        """构建章节树结构。"""
        # 简化实现：第一版返回扁平列表，后续可扩展为嵌套结构
        return [
            {
                "id": s.id,
                "title": s.title,
                "level": s.level,
                "sort_order": s.sort_order,
                "parent_id": s.parent_id,
                "status": s.status,
                "generation_status": s.generation_status,
                "word_count": s.word_count,
            }
            for s in sections
        ]

    def get_ancestors(self, section_id: int) -> list[Section]:
        """获取祖先章节（用于生成上下文）。"""
        ancestors = []
        section = Section.objects.get(pk=section_id)
        while section.parent_id:
            section = section.parent
            ancestors.insert(0, section)
        return ancestors

    def get_siblings(self, section_id: int) -> list[Section]:
        """获取同级章节。"""
        section = Section.objects.get(pk=section_id)
        return Section.objects.filter(
            outline=section.outline,
            parent=section.parent,
        ).exclude(pk=section_id).order_by("sort_order")
```

### 5.3 SectionGenerationService

```python
class SectionGenerationService:
    """章节生成编排服务。"""

    def analyze_section_needs(self, section_id: int) -> dict:
        """分析章节生成需求（同步调用）。

        Returns:
            {
                "keywords": ["资质证书", "项目经验"],
                "knowledge_types": ["company_qualification", "past_cases"],
                "requirement_types": ["qualification", "scoring"],
                "background": "本章节需要展示公司的技术资质...",
                "suggested_prompt": "请重点展示ISO9001认证..."
            }

        注意：分析失败返回默认建议，不影响用户手动填写提示词。
        """
        section = Section.objects.select_related("outline", "outline__lot").get(
            pk=section_id
        )

        try:
            # 调用 AI 分析（使用 section_needs_analysis scenario）
            prompt_run = AiTaskExecutionService().execute(
                scenario="section_needs_analysis",
                variables={
                    "section_title": section.title,
                    "section_level": section.level,
                    "outline_name": section.outline.name,
                    "lot_name": section.outline.lot.name,
                },
                created_by=section.outline.created_by,
            )

            if prompt_run.status == "succeeded":
                return prompt_run.output_json or {}
            else:
                logger.warning(
                    f"Section needs analysis failed: {prompt_run.error_message}"
                )
                return self._get_default_analysis(section)

        except Exception as e:
            logger.warning(f"Section needs analysis error: {e}")
            return self._get_default_analysis(section)

    def _get_default_analysis(self, section) -> dict:
        """返回默认分析结果（当 AI 分析失败时）。"""
        return {
            "keywords": [section.title],
            "knowledge_types": [],
            "requirement_types": [],
            "background": f"本章为{section.title}",
            "suggested_prompt": "",
        }

    def prepare_generation_context(
        self,
        section_id: int,
        analysis_result: dict,
        user_prompt: str,
        user_id: int,
    ) -> dict:
        """准备生成上下文（检索知识库 + 条款）。

        注意：此方法在 Celery 任务内部调用，不传递大段正文。
        """
        section = Section.objects.select_related("outline__lot").get(pk=section_id)
        outline = section.outline
        user = User.objects.get(pk=user_id)

        # 1. 检索知识库
        keywords = analysis_result.get("keywords", [])
        knowledge_base_ids = self._get_project_knowledge_bases(outline.lot.project_id)

        retrieved_knowledge = ""
        if knowledge_base_ids and keywords:
            retrieval_result = RetrievalService().search(
                query=" ".join(keywords),
                knowledge_base_ids=knowledge_base_ids,
                top_k=10,
                created_by=user,
            )
            retrieved_knowledge = RagContextBuilder().build(
                retrieval_results=retrieval_result["results"],
                max_tokens=4000,
            )["text"]

        # 2. 获取关联条款
        related_requirements = self._get_related_requirements(
            outline.lot_id,
            analysis_result.get("requirement_types", []),
        )

        # 3. 获取父章节和前置章节内容（保持连贯性，避免重复）
        parent_context = self._get_parent_context(section)
        sibling_context = self._get_sibling_context(section)

        return {
            "section_info": {
                "title": section.title,
                "level": section.level,
                "sort_order": section.sort_order,
                "section_id": section_id,
            },
            "retrieved_knowledge": retrieved_knowledge,
            "related_requirements": related_requirements,
            "parent_context": parent_context,
            "sibling_context": sibling_context,
            "user_prompt": user_prompt,
            "analysis_result": analysis_result,
            "outline_name": outline.name,
            "lot_name": outline.lot.name,
        }

    def _get_project_knowledge_bases(self, project_id: int) -> list[int]:
        """获取项目关联的知识库。"""
        # 从项目配置或默认设置获取
        # 第一版可返回全局知识库
        return KnowledgeBase.objects.filter(
            is_active=True
        ).values_list("id", flat=True)[:5]

    def _get_related_requirements(
        self,
        lot_id: int,
        requirement_types: list[str],
    ) -> list[dict]:
        """获取关联的招标条款。"""
        if not requirement_types:
            # 默认获取所有相关条款
            requirements = TenderRequirement.objects.filter(
                tender_file__lot_id=lot_id,
                is_active=True,
            ).order_by("sort_order")[:20]
        else:
            requirements = TenderRequirement.objects.filter(
                tender_file__lot_id=lot_id,
                requirement_type__in=requirement_types,
                is_active=True,
            ).order_by("sort_order")[:20]

        return [
            {
                "requirement_no": r.requirement_no,
                "title": r.title,
                "content": r.content[:500],  # 摘要，避免过长
                "requirement_type": r.requirement_type,
            }
            for r in requirements
        ]

    def _get_parent_context(self, section) -> str:
        """获取父章节内容摘要。"""
        ancestors = SectionTreeService().get_ancestors(section.id)
        if not ancestors:
            return ""

        # 只取直接父章节的内容摘要
        parent = ancestors[-1] if ancestors else None
        if parent and parent.content:
            return f"【父章节：{parent.title}】\n{parent.content[:1000]}"

        return ""

    def _get_sibling_context(self, section) -> str:
        """获取同级前置章节摘要（避免内容重复）。"""
        siblings = Section.objects.filter(
            outline=section.outline,
            parent=section.parent,
            sort_order__lt=section.sort_order,
            generation_status="success",
        ).order_by("sort_order")[:3]

        if not siblings:
            return ""

        context_parts = []
        for s in siblings:
            if s.content:
                context_parts.append(f"【{s.title}】已涵盖：{s.content[:300]}...")

        return "\n".join(context_parts)

    @transaction.atomic
    def generate_section(
        self,
        section_id: int,
        analysis_result: dict,
        user_prompt: str,
        created_by,
        force: bool = False,
    ) -> AsyncTask:
        """生成章节内容（异步）。

        Args:
            section_id: 章节ID
            analysis_result: AI分析结果
            user_prompt: 用户补充提示词
            created_by: 创建人
            force: 是否强制重新生成

        防重逻辑：
        - 如果 generation_status in ["pending", "running"] 且 force=False
          - 返回已有 AsyncTask
        - 如果 generation_status == "running" 且 force=True
          - 不允许覆盖正在运行的任务，抛出异常

        Returns:
            AsyncTask 实例
        """
        section = Section.objects.select_for_update().get(pk=section_id)

        # 并发防重
        if section.generation_status in ["pending", "running"]:
            if not force:
                # 返回已有任务
                existing_record = SectionGenerationRecord.objects.filter(
                    section=section,
                    status__in=["pending", "running"],
                ).first()

                if existing_record and existing_record.async_task:
                    return existing_record.async_task

            if section.generation_status == "running":
                # force=true 也不得覆盖 running 任务
                raise ValueError("章节正在生成中，请等待完成后再重新生成")

        # 创建 AsyncTask
        async_task = AsyncTask.objects.create(
            task_type="section_generate",
            related_object_type="Section",
            related_object_id=str(section_id),
            input_payload={
                "section_id": section_id,
                "has_analysis": bool(analysis_result),
                "has_user_prompt": bool(user_prompt),
            },
            created_by=created_by,
        )

        # 创建生成记录
        record = SectionGenerationRecord.objects.create(
            section=section,
            async_task=async_task,
            input_summary={
                "keywords": analysis_result.get("keywords", []),
                "requirement_types": analysis_result.get("requirement_types", []),
                "has_user_prompt": bool(user_prompt),
            },
            status="pending",
            created_by=created_by,
        )

        # 更新章节状态
        section.generation_status = "pending"
        section.user_prompt = user_prompt
        section.save()

        # 触发 Celery 任务（不传递大段正文）
        generate_section_task.delay(
            section_id=section_id,
            record_id=record.id,
            analysis_result=analysis_result,
            user_prompt=user_prompt,
            user_id=created_by.id,
        )

        return async_task

    @transaction.atomic
    def generate_sections_batch(
        self,
        outline_id: int,
        created_by,
    ) -> AsyncTask:
        """批量生成大纲所有章节。

        创建一个 AsyncTask（task_type=outline_generate_batch）
        每个章节创建一条 SectionGenerationRecord
        """
        outline = Outline.objects.get(pk=outline_id)
        sections = Section.objects.filter(outline=outline).order_by("sort_order")

        # 筛选未完成的章节
        pending_sections = sections.exclude(
            generation_status__in=["pending", "running", "success"]
        )

        # 创建批量任务
        async_task = AsyncTask.objects.create(
            task_type="outline_generate_batch",
            related_object_type="Outline",
            related_object_id=str(outline_id),
            input_payload={
                "outline_id": outline_id,
                "total_sections": pending_sections.count(),
            },
            created_by=created_by,
        )

        # 为每个章节创建生成记录
        for section in pending_sections:
            SectionGenerationRecord.objects.create(
                section=section,
                async_task=async_task,
                status="pending",
                created_by=created_by,
            )
            section.generation_status = "pending"
            section.save()

        # 触发批量任务
        generate_sections_batch_task.delay(
            outline_id=outline_id,
            async_task_id=async_task.id,
            user_id=created_by.id,
        )

        return async_task

    def get_batch_generation_status(self, outline_id: int) -> dict:
        """获取批量生成进度。"""
        outline = Outline.objects.get(pk=outline_id)

        # 查找最近的批量任务
        async_task = AsyncTask.objects.filter(
            task_type="outline_generate_batch",
            related_object_type="Outline",
            related_object_id=str(outline_id),
        ).order_by("-created_at").first()

        if not async_task:
            return {"status": "not_started"}

        # 统计章节状态
        records = SectionGenerationRecord.objects.filter(
            async_task=async_task
        ).select_related("section")

        total = records.count()
        completed = records.filter(status="success").count()
        failed = records.filter(status="failed").count()
        running = records.filter(status="running").count()

        return {
            "task_id": async_task.id,
            "status": async_task.status,
            "progress": async_task.progress,
            "current_step": async_task.current_step,
            "total": total,
            "completed": completed,
            "failed": failed,
            "running": running,
            "sections": [
                {
                    "id": r.section_id,
                    "title": r.section.title,
                    "status": r.status,
                }
                for r in records
            ],
        }
```

---

## 六、Celery 任务

### 6.1 单章节生成任务

```python
# apps/outline/tasks.py

from celery import shared_task
from django.db import transaction
from django.utils import timezone
import logging

from apps.outline.models import Section, SectionVersion, SectionGenerationRecord
from apps.outline.services import SectionGenerationService
from apps.generation.services import AiTaskExecutionService
from django.contrib.auth import get_user_model

User = get_user_model()
logger = logging.getLogger(__name__)


@shared_task(bind=True)
def generate_section_task(
    self,
    section_id: int,
    record_id: int,
    analysis_result: dict,
    user_prompt: str,
    user_id: int,
):
    """单章节生成任务。

    注意：任务参数不传递大段上下文正文，
    具体上下文在任务内部通过 prepare_generation_context 重新构建。
    """
    try:
        section = Section.objects.get(pk=section_id)
        record = SectionGenerationRecord.objects.get(pk=record_id)
        user = User.objects.get(pk=user_id)

        # 更新状态
        section.generation_status = "running"
        section.save()
        record.status = "running"
        record.save()

        # 在任务内部构建上下文
        context = SectionGenerationService().prepare_generation_context(
            section_id=section_id,
            analysis_result=analysis_result,
            user_prompt=user_prompt,
            user_id=user_id,
        )

        # 调用 AI 生成
        prompt_run = AiTaskExecutionService().execute(
            scenario="section_writing",
            variables=context,
            created_by=user,
        )

        if prompt_run.status == "succeeded":
            content = prompt_run.output_json.get("content", "")
            word_count = len(content)

            # 保存内容（事务内生成版本号）
            with transaction.atomic():
                section = Section.objects.select_for_update().get(pk=section_id)

                # 更新章节
                section.content = content
                section.word_count = word_count
                section.generation_status = "success"
                section.status = "generated"
                section.save()

                # 创建版本（version_no 事务内计算）
                max_version = (
                    SectionVersion.objects.filter(section=section)
                    .aggregate(max_version=models.Max("version_no"))["max_version"]
                    or 0
                )
                SectionVersion.objects.create(
                    section=section,
                    content=content,
                    version_no=max_version + 1,
                    source="ai",
                    word_count=word_count,
                    created_by=user,
                )

            # 更新记录（不存完整正文）
            record.prompt_run = prompt_run
            record.prompt_template_id = prompt_run.prompt_template_id
            record.prompt_version = (
                prompt_run.prompt_version.version if prompt_run.prompt_version else ""
            )
            record.llm_model = (
                prompt_run.model_config.display_name if prompt_run.model_config else ""
            )
            record.output_summary = {
                "word_count": word_count,
                "prompt_run_id": prompt_run.id,
            }
            record.status = "success"
            record.finished_at = timezone.now()
            record.save()

        else:
            raise Exception(prompt_run.error_message or "AI 生成失败")

    except Exception as e:
        logger.exception(f"Section generation failed: section_id={section_id}")

        section = Section.objects.get(pk=section_id)
        section.generation_status = "failed"
        section.save()

        record = SectionGenerationRecord.objects.get(pk=record_id)
        record.status = "failed"
        record.error_message = str(e)[:2000]
        record.finished_at = timezone.now()
        record.save()

        raise
```

### 6.2 批量生成任务

```python
@shared_task(bind=True)
def generate_sections_batch_task(
    self,
    outline_id: int,
    async_task_id: int,
    user_id: int,
):
    """批量生成章节任务。"""
    from apps.outline.services import SectionGenerationService

    async_task = AsyncTask.objects.get(pk=async_task_id)
    user = User.objects.get(pk=user_id)

    # 获取待生成的记录
    records = SectionGenerationRecord.objects.filter(
        async_task=async_task,
        status="pending",
    ).select_related("section").order_by("section__sort_order")

    total = records.count()
    completed = 0
    failed = 0

    for idx, record in enumerate(records, 1):
        try:
            # 分析需求（同步）
            analysis = SectionGenerationService().analyze_section_needs(
                record.section_id
            )

            # 准备上下文（任务内部构建）
            context = SectionGenerationService().prepare_generation_context(
                section_id=record.section_id,
                analysis_result=analysis,
                user_prompt=record.section.user_prompt or "",
                user_id=user_id,
            )

            # 生成章节
            prompt_run = AiTaskExecutionService().execute(
                scenario="section_writing",
                variables=context,
                created_by=user,
            )

            if prompt_run.status == "succeeded":
                content = prompt_run.output_json.get("content", "")
                word_count = len(content)

                # 保存内容（事务内）
                with transaction.atomic():
                    section = Section.objects.select_for_update().get(
                        pk=record.section_id
                    )

                    section.content = content
                    section.word_count = word_count
                    section.generation_status = "success"
                    section.status = "generated"
                    section.save()

                    max_version = (
                        SectionVersion.objects.filter(section=section)
                        .aggregate(max_version=models.Max("version_no"))["max_version"]
                        or 0
                    )
                    SectionVersion.objects.create(
                        section=section,
                        content=content,
                        version_no=max_version + 1,
                        source="ai",
                        word_count=word_count,
                        created_by=user,
                    )

                record.status = "success"
                record.output_summary = {"word_count": word_count}
                completed += 1

            else:
                record.status = "failed"
                record.error_message = prompt_run.error_message or "AI 生成失败"
                failed += 1

        except Exception as e:
            logger.exception(
                f"Batch section generation failed: section_id={record.section_id}"
            )
            record.status = "failed"
            record.error_message = str(e)[:2000]
            failed += 1

        record.finished_at = timezone.now()
        record.save()

        # 更新整体进度
        progress = int((idx / total) * 100) if total > 0 else 100
        async_task.progress = progress
        async_task.current_step = f"已完成 {completed}/{total}，失败 {failed}"
        async_task.save()

    # 完成任务
    async_task.result_payload = {
        "total": total,
        "completed": completed,
        "failed": failed,
    }
    async_task.status = "success" if failed == 0 else ("failed" if completed == 0 else "success")
    async_task.finished_at = timezone.now()
    async_task.save()
```

---

## 七、权限设计

### 7.1 权限码定义

```python
# apps/outline/permissions.py

OUTLINE_PERMISSIONS = [
    ("outline.view", "查看大纲"),
    ("outline.manage", "管理大纲（创建/编辑/删除）"),
    ("section.view", "查看章节"),
    ("section.manage", "管理章节（新增/移动/删除）"),
    ("section.generate", "生成章节内容"),
    ("section.review", "审核章节"),
]
```

### 7.2 权限校验逻辑

| 操作 | 所需权限 | 范围 | 说明 |
|------|---------|------|------|
| 查看大纲列表/详情 | `outline.view` | 项目级 | 通过 `?project_id=` 或 `?lot_id=` 筛选 |
| 创建/编辑/删除大纲 | `outline.manage` | 项目级 | 从 `lot.project` 解析项目 |
| 查看章节 | `section.view` | 项目级 | 从 `section.outline.lot.project` 解析 |
| 新增/移动/删除章节 | `section.manage` | 项目级 | 同上 |
| 生成章节 | `section.generate` | 项目级 | 同上 |
| 审核章节 | `section.review` | 项目级 | 同上 |

---

## 八、API 设计

### 8.1 大纲管理

| 方法 | 路径 | 描述 | 权限 |
|------|------|------|------|
| GET | `/api/outlines/` | 大纲列表（按项目/标段筛选） | `outline.view` |
| POST | `/api/outlines/` | 创建大纲 | `outline.manage` |
| GET | `/api/outlines/{id}/` | 大纲详情 | `outline.view` |
| PATCH | `/api/outlines/{id}/` | 更新大纲 | `outline.manage` |
| DELETE | `/api/outlines/{id}/` | 删除大纲 | `outline.manage` |
| POST | `/api/outlines/from-preset/` | 从预设模板创建 | `outline.manage` |
| POST | `/api/outlines/from-ai/` | AI解析创建 | `outline.manage` |
| GET | `/api/outlines/{id}/sections/` | 获取章节树 | `section.view` |
| POST | `/api/outlines/{id}/sections/reorder/` | 重排章节 | `section.manage` |
| POST | `/api/outlines/{id}/generate-all/` | 批量生成所有章节 | `section.generate` |
| GET | `/api/outlines/{id}/generation-status/` | 批量生成进度 | `section.view` |

### 8.2 章节管理

| 方法 | 路径 | 描述 | 权限 |
|------|------|------|------|
| GET | `/api/sections/{id}/` | 章节详情 | `section.view` |
| PATCH | `/api/sections/{id}/` | 更新章节（标题/内容） | `section.manage` |
| DELETE | `/api/sections/{id}/` | 删除章节 | `section.manage` |
| POST | `/api/sections/{id}/move/` | 移动章节 | `section.manage` |
| POST | `/api/sections/{id}/analyze/` | 分析生成需求 | `section.generate` |
| POST | `/api/sections/{id}/generate/` | 生成章节内容 | `section.generate` |
| GET | `/api/sections/{id}/versions/` | 版本历史 | `section.view` |
| POST | `/api/sections/{id}/rollback/` | 回滚到指定版本 | `section.manage` |

### 8.3 预设模板管理

| 方法 | 路径 | 描述 | 权限 |
|------|------|------|------|
| GET | `/api/preset-templates/` | 预设模板列表 | 公开 |
| GET | `/api/preset-templates/{id}/` | 模板详情（含章节） | 公开 |

### 8.4 请求/响应示例

#### 分析章节需求

```json
// POST /api/sections/{id}/analyze/
// Response
{
    "keywords": ["资质证书", "ISO认证", "项目经验"],
    "knowledge_types": ["company_qualification", "past_cases"],
    "requirement_types": ["qualification", "scoring"],
    "background": "本章节需要展示公司的技术资质和能力证明...",
    "suggested_prompt": "请重点展示ISO9001认证、近三年同类项目案例..."
}
```

#### 生成章节

```json
// POST /api/sections/{id}/generate/
// Request
{
    "user_prompt": "请重点展示ISO9001、ISO27001认证证书，以及近三年金融行业项目案例",
    "force": false
}
// Response
{
    "task_id": 123,
    "status": "pending",
    "message": "章节生成任务已提交"
}
```

#### 批量生成进度

```json
// GET /api/outlines/{id}/generation-status/
// Response
{
    "task_id": 124,
    "status": "running",
    "progress": 45,
    "current_step": "已完成 9/20，失败 0",
    "total": 20,
    "completed": 9,
    "failed": 0,
    "running": 1,
    "sections": [
        {"id": 1, "title": "第一章 投标须知", "status": "success", "word_count": 1500},
        {"id": 2, "title": "第二章 资格证明", "status": "running"},
        {"id": 3, "title": "第三章 技术方案", "status": "pending"},
        // ...
    ]
}
```

#### 版本回滚

```json
// POST /api/sections/{id}/rollback/
// Request
{
    "version_no": 2
}
// Response
{
    "message": "已回滚到版本 2",
    "current_version": {
        "version_no": 3,
        "source": "manual",
        "word_count": 1200,
        "created_at": "2026-06-03T10:30:00Z"
    }
}
```

---

## 九、前端设计

### 9.1 富文本编辑器

**V1 决策：使用 TipTap**
- 内容保存格式：HTML
- 导出 Word：由独立导出模块处理 HTML → docx 转换

```typescript
// 编辑器配置
const editorConfig = {
  content: section.content,
  editable: true,
  extensions: [
    StarterKit,
    Underline,
    TextAlign.configure({ types: ['paragraph', 'heading'] }),
    Table.configure({ resizable: true }),
    // 暂不支持图片上传，避免复杂度
  ],
}
```

### 9.2 页面结构

```
/views/outline/
├── OutlineListView.vue       # 大纲列表（按项目/标段筛选）
├── OutlineDetailView.vue     # 大纲详情 + 章节树
├── OutlineCreateDialog.vue   # 创建大纲（选择预设/AI解析）
└── components/
    ├── SectionTree.vue       # 章节树组件（支持拖拽排序）
    ├── SectionEditDrawer.vue # 章节编辑抽屉（TipTap富文本）
    └── SectionGenerateDialog.vue # 章节生成对话框（分析+检索+提示词）
```

### 9.3 章节生成对话框交互

```
┌─────────────────────────────────────────────────────────────────┐
│  生成章节：第一章 投标人资格证明                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────┐      │
│  │ AI 分析结果                              [重新分析]    │      │
│  │                                                        │      │
│  │ 需要的资料类型：公司资质、历史案例                       │      │
│  │ 检索关键词：资质证书、ISO认证、同类项目经验              │      │
│  │ 关联条款类型：qualification、scoring                   │      │
│  │                                                        │      │
│  │ AI建议提示：请重点展示ISO9001认证、近三年同类项目案例... │      │
│  └───────────────────────────────────────────────────────┘      │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐      │
│  │ 知识库检索预览                              [重新检索]  │      │
│  │                                                        │      │
│  │ ✓ 公司资质知识库：找到 12 条相关内容                    │      │
│  │ ✓ 历史案例知识库：找到 5 条相关内容                     │      │
│  │ ✓ 招标文件条款：关联 3 条                               │      │
│  └───────────────────────────────────────────────────────┘      │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐      │
│  │ AI 提示词框（可编辑）                                   │      │
│  │ ┌───────────────────────────────────────────────────┐│      │
│  │ │ 请重点展示：                                        ││      │
│  │ │ 1. ISO9001、ISO27001 认证证书                       ││      │
│  │ │ 2. 近三年同类项目案例（3个以上）                     ││      │
│  │ │ 3. 技术团队人员资质                                 ││      │
│  │ │                                                    ││      │
│  │ │ [用户可继续编辑补充...]                             ││      │
│  │ └───────────────────────────────────────────────────┘│      │
│  └───────────────────────────────────────────────────────┘      │
│                                                                 │
│                                    [取消]  [确认生成]           │
└─────────────────────────────────────────────────────────────────┘
```

### 9.4 章节树组件

- 支持拖拽排序（更新 sort_order）
- 支持右键菜单：新增子章节、删除、移动
- 显示章节状态图标：草稿、已生成、生成中、失败
- 显示字数统计

---

## 十、PromptScenario 扩展

```python
# apps/generation/constants.py

class PromptScenario:
    # ... 现有场景 ...

    # 大纲与章节生成（每个场景独立模板）
    OUTLINE_EXTRACTION = "outline_extraction"           # AI解析招标文件生成大纲
    SECTION_NEEDS_ANALYSIS = "section_needs_analysis"   # 分析章节生成需求
    SECTION_WRITING = "section_writing"                 # 章节内容生成
```

**Prompt 模板要求：**
- 每个场景独立 PromptTemplate，不共用一个大模板靠参数切换
- `outline_extraction`：输入文档全文，输出章节树结构
- `section_needs_analysis`：输入章节信息，输出资料需求分析
- `section_writing`：输入章节上下文，输出章节内容（含层级控制）

---

## 十一、实现约束补充

### 11.1 校验约束

1. **AI 解析生成大纲时，TenderFile 必须绑定 Lot**
   - 如果 `tender_file.lot` 为空，返回 validation_error
   - 错误信息："招标文件必须绑定标段"

2. **Section 排序由 SectionTreeService 统一维护**
   - 顶级章节和子章节排序都必须在服务层重排
   - 前端只传入目标位置，服务层负责重算 sort_order
   - 避免并发排序冲突

3. **Section.parent 校验**
   - parent 必须属于同一 outline
   - 不能移动到自己或自己的子节点

### 11.2 任务约束

4. **Celery 任务参数不得传递大段上下文正文**
   - 章节生成任务只传：`section_id`、`record_id`、`analysis_result`、`user_prompt`、`user_id`
   - 具体上下文在任务内部通过 `prepare_generation_context` 重新构建

5. **同一章节并发防重**
   - 如果 `generation_status` in `["pending", "running"]`
     - 不允许再次创建生成任务
     - 返回已有 AsyncTask
   - `force=true` 也不得并发覆盖 `running` 任务
     - 必须等待当前任务完成

### 11.3 版本约束

6. **SectionVersion.version_no 事务内生成**
   - 使用 `select_for_update` 锁定章节
   - 在事务内计算 `max_version + 1`
   - 避免并发版本号重复

### 11.4 存储约束

7. **完整章节正文只保存到业务表**
   - `Section.content`：当前版本正文
   - `SectionVersion.content`：历史版本正文
   - `AsyncTask.result_payload`：只存摘要（word_count、status）
   - `SectionGenerationRecord.input_summary/output_summary`：只存摘要
   - Celery 任务参数：不传递大段正文

---

## 十二、待办事项

### 第一版实现范围

- [ ] Outline 模型 + API
- [ ] Section 模型 + API（含树形操作）
- [ ] PresetOutlineTemplate 预设模板（2-3 个示例模板）
- [ ] OutlineService（预设创建 + AI解析创建）
- [ ] SectionTreeService（章节树维护）
- [ ] SectionGenerationService（单章节生成 + 批量生成）
- [ ] Celery 任务（单章节 + 批量）
- [ ] PromptTemplate（outline_extraction、section_needs_analysis、section_writing）
- [ ] 前端：大纲列表页
- [ ] 前端：大纲详情页（章节树）
- [ ] 前端：章节生成对话框
- [ ] 前端：章节编辑抽屉（TipTap）
- [ ] 权限配置（6 个权限码）

### 后续扩展

- [ ] 嵌套章节支持（子章节 AI 解析）
- [ ] Word 导出模块
- [ ] 工作流节点集成
- [ ] 章节审核流程
- [ ] 预设模板管理界面（管理员）