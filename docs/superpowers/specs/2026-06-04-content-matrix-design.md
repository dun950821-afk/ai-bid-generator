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

---

## 模块一：数据模型设计

### Section 模型新增字段

```python
class Section(models.Model):
    # 原有字段...

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
```

### content_matrix JSON 结构

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

### 常量定义

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

# 映射字典（避免重复 dict 调用）
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

### 触发时机

| 场景 | 触发方式 | 说明 |
|------|----------|------|
| 大纲创建后自动生成 | `generate_outline_task` 完成后触发 | 整体生成全量矩阵 |
| 用户手动重新生成 | 前端按钮触发 | 可选择整体或单章节 |
| 单章节重新生成 | 前端按钮触发 | 只覆盖当前章节 |

### generation_priority 含义

**规则**：数值越大，正文生成越靠前。

| 章节类型 | 推荐优先级 | 说明 |
|----------|------------|------|
| 叶子技术章节 | 80-100 | 具体内容章节，优先生成 |
| 普通子章节 | 60-80 | 非技术类子章节 |
| 父级总述章节 | 20-40 | 承接类章节，后生成 |
| 最终汇总类章节 | 0-10 | 索引、目录等，最后生成 |

### 任务流程

```
大纲创建完成
    ↓
创建所有章节 Section，矩阵状态 = pending
    ↓
触发 generate_content_matrix_task(outline_id)
    ↓
获取任务锁，防止重复执行
    ↓
查询本次需要生成的章节（pending/failed/generated，edited 需确认才覆盖）
    ↓
保存原状态快照（用于失败恢复）
    ↓
将目标章节状态更新为 generating，清空 error
    ↓
组装完整目录结构、章节层级、招标要求摘要
    ↓
判断是否需要降级（章节 > 200 或 token 超限）
    ↓
调用 AI 生成矩阵（全量或分组）
    ↓
解析并校验 JSON
    ↓
合法章节写入 content_matrix，状态更新为 generated
    ↓
缺失/失败章节记录 content_matrix_error，状态更新为 failed
    ↓
释放任务锁
```

### AI 输出校验流程

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

### 重新生成失败保护

**原则**：重新生成是"成功后覆盖"，不是"一开始就清空"。

| 场景 | 原状态 | 生成失败后 |
|------|--------|------------|
| 首次生成 | pending | failed（保留空矩阵） |
| 重新生成 | generated | generated（保留原矩阵，写入 error） |
| 重新生成 | edited | edited（保留原矩阵，写入 error） |

### 目标章节筛选

```python
def get_target_sections(outline_id: int, force_overwrite: bool = False):
    """获取本次需要生成矩阵的章节。"""
    sections = Section.objects.filter(outline_id=outline_id)

    if force_overwrite:
        # 强制覆盖所有章节
        return sections.all()

    # 默认保留 edited 状态的章节
    return sections.filter(
        content_matrix_status__in=["pending", "failed", "generated"]
    )
```

### 超大目录降级策略

```python
def generate_content_matrix_task(outline_id: int):
    outline = Outline.objects.get(pk=outline_id)
    sections = Section.objects.filter(outline=outline)

    section_count = sections.count()

    if section_count <= 200:
        # 全量一次生成
        generate_matrix_batch(outline, sections)
    else:
        # 按一级章节分组生成
        root_sections = sections.filter(parent=None)
        for root in root_sections:
            # 获取该一级章节下的所有子章节
            subtree = get_subtree_sections(root)
            generate_matrix_batch(outline, subtree, full_context=sections)

        # 跨组冲突校验
        validate_cross_group_conflicts(outline)
```

### 任务并发保护

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

### 状态流转

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
```

### 人工编辑逻辑

**规则**：只要用户修改 `content_matrix` 中任一字段，都视为人工编辑。

| 操作 | 状态变化 | 字段更新 |
|------|----------|----------|
| 用户修改矩阵任意字段 | generated → edited | version += 1, updated_at = now() |
| 用户编辑 manual_notes | generated → edited | version += 1, updated_at = now() |
| 重新生成覆盖 edited | edited → generating → generated | version += 1, 需前端确认 |

### AI 输出 Schema

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

### 实现约定

```
1. AI 输出中的章节引用字段统一使用 section_id 数组，后端校验后补全章节编号和标题，再写入 content_matrix。
2. 重新生成任务开始前记录章节原状态，生成失败时恢复原状态，避免破坏已有矩阵。
3. 矩阵生成任务必须使用任务锁，并在 finally 中释放锁，防止并发写入。
4. 缓存锁超时时间建议不低于 30 分钟，超大目录可结合数据库任务状态做二次保护。
5. generation_priority 仅用于后续正文批量生成顺序，不代表矩阵生成顺序。
```

---

## 模块三：批量生成顺序与上下文设计

### 推荐生成顺序计算

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

### 目标章节筛选

```python
def get_target_sections(outline_id: int, force_overwrite: bool = False):
    """获取本次需要生成矩阵的章节。"""
    sections = Section.objects.filter(outline_id=outline_id)

    if force_overwrite:
        return sections.all()

    return sections.filter(
        content_matrix_status__in=["pending", "failed", "generated"]
    )
```

### 每章生成传入的上下文

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

    # 可引用章节信息
    "reference_sections": [...],

    # 禁止重复章节信息（含矩阵边界）
    "no_duplicate_sections": [...],

    # 父章节信息（含矩阵边界）
    "parent_section": {...},

    # 子章节摘要（父章节生成时使用）
    "child_sections": [...],

    # 前置兄弟章节摘要
    "preceding_siblings": [...],

    # 招标文件相关条款
    "related_requirements": [...],

    # 检索到的知识库内容
    "retrieved_knowledge": ...,

    # 整体大纲结构
    "outline_structure": ...,

    # 项目信息
    "project_name": ...,
    "lot_name": ...,
}
```

### 依赖冲突处理

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

        for dep_id in item["dependency_ids"]:
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

### 实现约定

```
1. generation_priority 只决定正文生成顺序，数值越大越靠前。
2. 最终排序应综合叶子深度、generation_priority、章节层级、目录 sort_order 和依赖关系。
3. 依赖关系使用拓扑排序处理；如发现循环依赖，应提示用户并降级为推荐顺序。
4. 父章节生成时必须传入子章节摘要，用于写总述和承接。
5. 叶子章节生成时即使父章节正文尚未生成，也必须传入父章节矩阵边界。
6. 禁止重复章节即使尚未生成正文，也应传入其矩阵写作范围，防止当前章节提前展开。
7. 用户自定义顺序必须做依赖冲突检测；强制生成需要风险确认。
```

---

## 模块四：前端界面设计

### 矩阵查看与编辑界面

- 章节树增加矩阵状态图标和快捷操作
- 矩阵编辑对话框支持编辑所有字段
- 状态图标：pending（灰色）、generating（蓝色旋转）、generated（绿色勾）、edited（橙色笔）、failed（红色叉）

### 矩阵生成状态展示

- 整体状态栏显示进度和统计
- 生成进度对话框支持最小化和取消
- 失败详情对话框支持重试和导出日志

### 批量生成顺序预览

- 显示推荐顺序、章节类型、依赖状态
- 支持拖拽调整顺序
- 依赖冲突提示和自动修复
- 强制覆盖 edited 矩阵的二次确认

### 正文生成进度界面

- 实时显示完成进度
- 失败章节单独重试入口
- 支持暂停、跳过、最小化

### API 接口

```yaml
# 矩阵相关
GET    /api/outlines/{id}/sections/{sid}/matrix/
PUT    /api/outlines/{id}/sections/{sid}/matrix/
POST   /api/outlines/{id}/sections/{sid}/matrix/generate/
POST   /api/outlines/{id}/matrix/generate/
GET    /api/outlines/{id}/matrix/status/

# 批量生成相关
GET    /api/outlines/{id}/generation-order/
POST   /api/outlines/{id}/generation-order/validate/
POST   /api/outlines/{id}/batch-generate/
POST   /api/outlines/{id}/batch-generate/precheck/
```

### 实现约定

```
1. 正文生成前应检查章节内容责任矩阵状态，pending / failed / generating 状态默认阻止生成。
2. 批量生成前建议调用 precheck 接口，统一返回矩阵缺失、依赖冲突、阻塞章节等风险。
3. 前端的"强制按顺序生成"需要通过 force_ignore_dependencies 参数传递给后端。
4. 矩阵状态和正文生成状态分开维护，避免状态含义混淆。
5. 异步任务取消采用软取消机制：停止后续任务，当前执行中的 AI 调用可能继续完成。
6. 后续如需支持"恢复 AI 建议"，应增加矩阵版本历史或 AI 原始快照。
```

---

## 模块五：提示词设计

### 一、内容责任矩阵生成提示词

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

### 二、单章节正文生成提示词

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

### 三、防重复与连贯性校验提示词

用于检查已生成章节是否符合矩阵要求。

### 四、章节摘要生成提示词

用于生成 200-300 字摘要，供后续章节上下文使用。

### 实现约定

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

## 总结

本方案通过以下机制确保投标文件章节内容不重复、边界清晰：

1. **内容责任矩阵**：明确定义每个章节的写作边界
2. **叶子优先生成**：子章节先写，父章节后写总述
3. **强约束提示词**：AI 必须遵守矩阵边界
4. **防重复校验**：生成后自动检查内容一致性
5. **依赖关系管理**：确保生成顺序符合逻辑依赖

该方案可有效解决投标文件生成中常见的内容重复、边界模糊、前后不一致等问题。
