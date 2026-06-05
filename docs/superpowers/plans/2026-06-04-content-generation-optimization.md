# 正文生成优化方案实施计划

> **目标**：将正文生成从简单提示词调用升级为多数据源上下文驱动的智能生成。

---

## 架构概览

```
正文生成核心链路：

内容责任矩阵（边界控制）
         ↓
AI 解析内容（响应目标）
         ↓
RAG 素材检索（事实材料）
         ↓
上下文章节摘要（连贯防重）
         ↓
正文生成提示词
         ↓
质量校验（边界/覆盖/事实）
         ↓
保存正文 + 元数据
```

---

## Phase 3.1：接 AI 解析内容

### 任务 1.1：模型字段扩展

**文件**：`backend/apps/outline/models/section.py`

添加 `content_generation_meta` JSONField：

```python
content_generation_meta = models.JSONField(
    verbose_name="正文生成元数据",
    default=dict,
    blank=True,
    help_text="存储 used_analysis_point_ids, used_rag_material_ids, missing_info, risk_flags, quality_report",
)
```

### 任务 1.2：章节-条款匹配服务

**新建文件**：`backend/apps/outline/services/requirement_match_service.py`

核心逻辑：
- 根据 `content_matrix.related_requirements` 直接获取绑定条款
- 无绑定时根据章节标题、`write_scope`、关键词自动匹配 `TenderRequirement`
- 返回匹配的解析点列表，按优先级排序

### 任务 1.3：正文生成上下文构建

**修改文件**：`backend/apps/outline/services/section_generation_service.py`

新增 `build_generation_context()` 方法：
- 获取当前章节信息
- 获取内容责任矩阵
- 调用匹配服务获取 AI 解析内容
- 构建标准化上下文结构

### 任务 1.4：提示词模板更新

更新正文生成提示词：
- 添加 AI 解析内容区块
- 明确必须响应的得分点
- 返回结构化元数据

### 任务 1.5：前端预览 API

**新增接口**：`GET /api/outlines/{outline_id}/sections/{section_id}/generation-context/preview/`

返回生成上下文预览，用于调试。

---

## Phase 3.2：接 RAG 素材分通道检索

### 任务 2.1：RAG 通道定义

**新建文件**：`backend/apps/outline/services/rag_service.py`

定义检索通道：
- `historical_bid`：历史标书参考
- `company_info`：公司信息
- `personnel`：人员资料
- `certificate`：资质证书
- `project_case`：项目业绩

### 任务 2.2：章节类型-通道映射

根据 `section_role` 和章节标题决定检索哪些通道：
- `team_intro` → personnel
- 包含"资质/证书" → certificate
- 包含"业绩/案例" → project_case
- `technical_solution` → company_info + historical_bid

### 任务 2.3：RAG 查询构造

为每个通道构造专门的查询：
- 结合章节标题、`write_scope`、解析点关键词
- 设置合适的 `top_k`

### 任务 2.4：RAG 素材分组

检索结果按通道分组，进入提示词的不同区块。

---

## Phase 3.3：接内容责任矩阵边界

### 任务 3.1：上下文章节摘要

获取并构建：
- 父章节摘要
- 子章节摘要
- 前置兄弟章节摘要
- `reference_sections` 摘要
- `no_duplicate_sections` 摘要
- `dependency_sections` 摘要

### 任务 3.2：整体大纲结构

生成大纲树形结构文本，用于上下文。

### 任务 3.3：边界约束注入

在提示词中明确：
- `write_scope`：允许写入的内容
- `exclude_scope`：禁止写入的内容
- `no_duplicate_sections`：只能引用不能展开

---

## Phase 3.4：生成后保存元数据

### 任务 4.1：解析 LLM 输出

从 LLM 返回的 JSON 中提取：
- `content`：正文内容
- `word_count`：字数
- `summary`：章节摘要
- `used_analysis_point_ids`：使用的解析点
- `used_rag_material_ids`：使用的 RAG 素材
- `missing_info`：缺失信息
- `risk_flags`：风险标记

### 任务 4.2：保存到模型

更新 Section 模型字段：
- `content`
- `word_count`
- `content_summary`
- `content_generation_meta`
- `content_generated_at`

---

## Phase 3.5：校验和自动修订

### 任务 5.1：矩阵边界校验

检查：
- 是否超出 `write_scope`
- 是否写了 `exclude_scope`
- 是否重复 `no_duplicate_sections`

### 任务 5.2：得分点覆盖校验

检查：
- `must_respond` 是否全部覆盖
- 输出覆盖报告

### 任务 5.3：RAG 事实一致性校验

检查：
- 人员、证书、业绩信息是否来自 RAG
- 是否有虚构内容

---

## 数据结构定义

### 正文生成上下文

```python
{
    "current_section": {
        "id": 12,
        "section_number": "十二（二）",
        "title": "总体技术方案",
        "level": 2
    },
    "content_matrix": {
        "section_role": "technical_solution",
        "write_scope": "...",
        "exclude_scope": "...",
        "expression_form": "body_text",
        "writing_depth": "detailed",
        "manual_notes": "...",
        "reference_sections": [...],
        "no_duplicate_sections": [...],
        "dependency_sections": [...]
    },
    "analysis_points": {
        "must_respond": [...],
        "score_points": [...],
        "format_requirements": [...]
    },
    "rag_materials": {
        "historical_bid": [...],
        "company_info": [...],
        "personnel": [...],
        "certificate": [...],
        "project_case": [...]
    },
    "context_sections": {
        "parent_section": {...},
        "child_sections": [...],
        "preceding_siblings": [...],
        "reference_sections": [...],
        "no_duplicate_sections": [...]
    },
    "outline_structure": "...",
    "project_info": {
        "project_name": "...",
        "lot_name": "..."
    }
}
```

### 正文生成元数据

```python
{
    "used_analysis_point_ids": [101, 102],
    "used_rag_material_ids": ["rag_1", "rag_5"],
    "missing_info": [],
    "risk_flags": [],
    "quality_report": {
        "matrix_boundary_check": "pass",
        "score_point_coverage": "pass",
        "fact_check": "warning",
        "issues": [...]
    }
}
```

---

## 实施顺序

1. **Phase 3.1**（本周）：AI 解析内容接入
   - 优先级最高，决定"不漏评分项"
   
2. **Phase 3.2**（下周）：RAG 素材检索
   - 提升正文事实准确性
   
3. **Phase 3.3**（下周）：矩阵边界约束
   - 控制写作边界，防止重复
   
4. **Phase 3.4**（下周）：元数据保存
   - 记录生成过程，便于审计
   
5. **Phase 3.5**（下下周）：校验修订
   - 提升正文质量

---

## 关键提醒

1. **AI 解析内容负责"要答什么题"**
2. **RAG 负责"用什么材料作答"**
3. **内容责任矩阵负责"这一章能不能写这些内容"**
4. **历史标书只能参考结构和表达，不能照搬**
5. **人员、证书、业绩信息必须来自 RAG，不能编造**
