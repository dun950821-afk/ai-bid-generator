# 矩阵与正文生成关联公司材料包与 RAG 知识库 - 设计文档

- 日期: 2026-06-27
- 范围: 矩阵生成 + 正文生成两个阶段
- 方案: 方案 B — 重构 RAG 层，引入 RetrievalOrchestrator

## 1. 背景与目标

### 1.1 现状问题

1. **矩阵生成阶段完全没有 RAG**: `generate_content_matrix_task` 调用 `content_matrix_generation` 场景时, variables 只有 `project_name / lot_name / outline_structure / requirements_summary`, 没有公司材料、没有历史标书。导致矩阵写出的 `section_role / write_scope / required_materials` 脱离公司实际能力 — 公司没有某资质, 矩阵却要求该章节「展示 ISO9001 证书」。
2. **RAG 通道映射与知识库类型错配**: `RagService.KB_TYPE_TO_CHANNEL` 用 `company / project_case / certificate / bid_document`, 但 `KnowledgeBaseType` 常量是 `company_profile / case_library / qualification / bid_history / product / technical_solution`, 名字对不上。导致 `_search_channel` 按 `kb_type` 过滤后查不到匹配的库, fallback 用全部库, 通道隔离失效。
3. **RetrievalService 默认 FULLTEXT**: `RagService._search_channel` 调用 `RetrievalService.search` 时未传 `retrieval_mode`, 而默认值是 `POSTGRES_FULLTEXT`。意味着线上 RAG 长期只跑全文检索, 向量检索能力闲置 — 这是隐性质量 bug。
4. **无溯源记录**: 正文生成不知道引用了哪些 chunk, 出了「跑题/编造」问题难排查。
5. **知识库范围靠全局活跃库**: `_get_project_knowledge_bases` 取 `KnowledgeBase.objects.filter(is_active=True)[:5/10]`, 不读大纲绑定, 跨项目串料。

### 1.2 目标

- 矩阵生成阶段: 注入公司材料元数据 + RAG 库/文档标题清单 (零向量调用), 让矩阵基于「公司能力边界」生成
- 正文生成阶段: 按大纲绑定的知识库做 HYBRID 检索 (向量+全文 RRF), 跨通道 weighted RRF 融合, 记录可追溯的 `rag_sources`
- 重构 RAG 层: 引入 `RetrievalOrchestrator`, 把散落在 `RagService` + 各 Strategy 的检索编排收敛
- 修隐性 bug: 通道映射对齐 `KnowledgeBaseType`, 默认检索模式改 HYBRID (带降级)
- 可追溯: 每次正文生成记录完整 retrieval trace, 前端可查「生成参考来源」
- 可控: 用户可手动检索 + 勾选材料, 用于下一次重新生成

### 1.3 业界参考

- 分层 RAG (Cabrillo Club): 公司材料与历史标书分库隔离, 按章节角色分配检索通道
- Hybrid 检索 + RRF 融合 (MyBids.AI / Higress-RAG): 向量语义 + 关键词匹配, RRF 融合
- 可追溯 (Nabeel-Chohan/rfp-rag-poc): 每段回答指回具体源模块
- 上下文工程 (infrastructure-catalyst): 知识库分门别类整理干净, prompt 明确「禁止编造企业信息, 缺失填待补充」

## 2. 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│  调用方                                                       │
│  - generate_content_matrix_task (矩阵生成, 元数据模式)         │
│  - section_generation_service (正文生成, 检索模式)             │
└──────────────┬───────────────────────────────────────────────┘
               │ 调用
               ▼
┌──────────────────────────────────────────────────────────────┐
│  RetrievalOrchestrator (新建, apps/knowledge/services/)       │
│  - retrieve_for_section()      → 正文: plan + execute          │
│  - collect_metadata_snapshot() → 矩阵: 元数据快照, 零向量      │
│  - resolve_channel()           → kb.rag_channel 优先, 否则映射 │
│  内部: plan_retrieval / execute / fuse / dedup                 │
└──────────────┬───────────────────────────────────────────────┘
               │ 依赖
               ▼
┌──────────────────────────────────────────────────────────────┐
│  RetrievalService (已有, 最小改造)                             │
│  - search(retrieval_mode=HYBRID)  ← RRF 融合已实现             │
│  - 默认模式改 HYBRID + FULLTEXT 降级                           │
│  - 加 retrieval_run_id / trace_meta 关联 RetrievalLog          │
└──────────────────────────────────────────────────────────────┘
```

**职责边界**:
- `RetrievalService`: 底层检索原语 (向量/全文/keyword/单通道 RRF)
- `RetrievalOrchestrator`: 业务编排 (通道规划/查询词/跨通道融合/去重/溯源)
- `RagService`: 兼容薄封装, 冻结扩展, 新能力禁止塞回

## 3. 数据模型

### 3.1 新增字段

**`KnowledgeBase.rag_channel`** (CharField, 可选 + choices)

```python
RAG_CHANNEL_CHOICES = [
    ("company_info", "公司信息"),
    ("historical_bid", "历史标书"),
    ("project_case", "项目案例"),
    ("certificate", "资质证书"),
    ("personnel", "人员资料"),
    ("", "按 kb_type 推断"),
]

rag_channel = models.CharField(
    "RAG通道", max_length=32, blank=True, default="",
    choices=RAG_CHANNEL_CHOICES,
    help_text="覆盖 kb_type 默认通道映射, 留空则按 kb_type 推断"
)
```

通道解析优先级 (Orchestrator 内聚):
```
kb.rag_channel 非空 → 用之
否则 → KB_TYPE_TO_CHANNEL[kb.kb_type]
```

**`SectionGenerationRecord.rag_sources`** (JSONField, 默认空 list)

```python
rag_sources = models.JSONField(
    "RAG引用来源", default=list, blank=True,
    help_text="前端展示用, 仅含 chunk_id/document_title/kb_name/channel/score/rank/page"
)
```

**`SectionGenerationRecord.generation_meta`** (JSONField, 默认空 dict)

```python
generation_meta = models.JSONField(
    "生成元数据", default=dict, blank=True,
    help_text="完整检索 trace: retrieval_plan/query/filters/warnings/latency_ms/used_mode"
)
```

### 3.2 新增中间表

**`OutlineKnowledgeBase`** (大纲 ↔ 知识库 M2M)

```python
class OutlineKnowledgeBase(TimeStampedModel):
    outline = models.ForeignKey(
        "outline.Outline", on_delete=models.CASCADE,
        related_name="kb_bindings", verbose_name="所属大纲"
    )
    knowledge_base = models.ForeignKey(
        "knowledge.KnowledgeBase", on_delete=models.CASCADE,
        related_name="outline_bindings", verbose_name="知识库"
    )
    sort_order = models.PositiveIntegerField("排序", default=0)
    is_active = models.BooleanField("是否启用", default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="outline_kb_bindings",
        verbose_name="创建人"
    )

    class Meta:
        db_table = "outline_knowledge_base"
        constraints = [
            models.UniqueConstraint(fields=["outline", "knowledge_base"], name="uniq_outline_kb")
        ]
        indexes = [
            models.Index(fields=["outline", "is_active"]),
            models.Index(fields=["outline", "sort_order"]),
            models.Index(fields=["knowledge_base"]),
        ]
        ordering = ["sort_order", "id"]
```

### 3.3 新增 SectionManualSource 表

记录用户手动检索并勾选的来源, 不覆盖 `SectionGenerationRecord.rag_sources`。

```python
class SectionManualSource(TimeStampedModel):
    section = models.ForeignKey(
        "outline.Section", on_delete=models.CASCADE,
        related_name="manual_sources", verbose_name="所属章节"
    )
    chunk_id = models.IntegerField("chunk ID")
    document_id = models.IntegerField("文档 ID")
    document_title = models.CharField("文档标题", max_length=255)
    kb_id = models.IntegerField("知识库 ID")
    kb_name = models.CharField("知识库名称", max_length=255)
    channel = models.CharField("RAG通道", max_length=32)
    content_preview = models.TextField("内容预览", blank=True, default="")
    section_path = models.CharField("文档内路径", max_length=255, blank=True, default="")
    page_start = models.IntegerField("起始页", null=True, blank=True)
    page_end = models.IntegerField("结束页", null=True, blank=True)
    selected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="selected_manual_sources",
        verbose_name="选择人"
    )

    class Meta:
        db_table = "section_manual_source"
        constraints = [
            models.UniqueConstraint(fields=["section", "chunk_id"], name="uniq_section_chunk")
        ]
        indexes = [
            models.Index(fields=["section"]),
            models.Index(fields=["section", "channel"]),
        ]
        ordering = ["-created_at"]
```

### 3.4 SectionVersion 加关联

```python
# SectionVersion 新增 (可选)
generated_from_record_id = models.IntegerField(
    "生成记录ID", null=True, blank=True,
    help_text="本次版本对应的 SectionGenerationRecord ID, 用于关联 rag_sources"
)
```

不重复存完整 trace, 关联查询即可。

### 3.5 RetrievalLog 加字段

```python
retrieval_run_id = models.CharField(
    "检索运行ID", max_length=64, blank=True, default="", db_index=True
)
trace_meta = models.JSONField("trace元数据", default=dict, blank=True)
fallback_reason = models.CharField(
    "降级原因", max_length=64, blank=True, default=""
)
```

`trace_meta` 结构:
```json
{
  "channel": "historical_bid",
  "outline_id": 1,
  "section_id": 20,
  "kb_ids": [3, 5, 8],
  "orchestrator_mode": "retrieval"
}
```

### 3.6 通道映射修正

`RagService.KB_TYPE_TO_CHANNEL` 迁入 Orchestrator 并对齐 `KnowledgeBaseType`:

```python
KB_TYPE_TO_CHANNEL = {
    "company_profile": "company_info",
    "case_library": "project_case",
    "qualification": "certificate",
    "product": "company_info",          # 产品资料归入公司信息通道
    "bid_history": "historical_bid",
    "technical_solution": "historical_bid",  # 技术方案归入历史标书通道
}
```

### 3.7 不动的东西

- `BidMaterialPackage` / `CompanyMaterial` / `Outline` / `KnowledgeChunk` / `KnowledgeDocument` 模型不动
- 材料包走 OneToOne 反向 (Outline.material_package), RAG 库走 M2M 中间表, Outline 本身保持干净

### 3.8 迁移清单

1. `knowledge`: `KnowledgeBase` 加 `rag_channel` 字段
2. `knowledge`: `RetrievalLog` 加 `retrieval_run_id` / `trace_meta` / `fallback_reason` 字段
3. `outline`: 新建 `OutlineKnowledgeBase` 表
4. `outline`: 新建 `SectionManualSource` 表
5. `outline`: `SectionGenerationRecord` 加 `rag_sources` / `generation_meta` 字段
6. `outline`: `SectionVersion` 加 `generated_from_record_id` 字段

## 4. RetrievalOrchestrator 接口

### 4.1 模块定位

`apps/knowledge/services/retrieval_orchestrator.py` (新建)

**职责**:
- 输入: `outline` (必填) / `section` (正文模式必填, 矩阵模式不填) / `mode` / `user` / `generation_mode` / `analysis_result` / `manual_sources` / `manual_source_mode`
- 输出: `RetrievalPlan` (规划产物) + `RetrievedContext` (检索产物)
- **不负责**: prompt 拼装 (仍由 `GenerationContextService` 做) / LLM 调用 / 正文落库

### 4.2 数据类

```python
@dataclass
class ChannelQuery:
    channel: str                       # company_info / historical_bid / ...
    query: str                         # 该通道的查询词
    top_k: int                         # 该通道返回数
    kb_ids: list[int]                  # 该通道命中的知识库 ID
    weight: float = 1.0                # 通道权重 (跨通道 RRF 用)

@dataclass
class RetrievalPlan:
    mode: str                          # RetrievalMode.METADATA / RETRIEVAL
    channel_queries: list[ChannelQuery]
    outline_kb_ids: list[int]          # 大纲绑定的全部 KB
    fallback_to_global: bool           # 大纲未绑定时是否回退全局活跃库
    reason: str                        # 规划说明 (写入 generation_meta)

@dataclass
class RetrievedChunk:
    chunk_id: int
    document_id: int
    document_title: str
    kb_id: int
    kb_name: str
    channel: str                       # 解析后的通道
    score: float                       # 融合分数
    rank: int                          # 跨通道排序
    content: str
    content_preview: str
    section_path: str
    page_start: int | None
    page_end: int | None

@dataclass
class RetrievedContext:
    retrieval_run_id: str              # uuid4
    plan: RetrievalPlan
    by_channel: dict[str, list[RetrievedChunk]]
    fused: list[RetrievedChunk]        # 跨通道 weighted RRF 融合 top-N
    sources: list[dict]                # 前端展示用精简元数据
    metadata_snapshot: dict             # 矩阵模式用
    latency_ms: int
    warnings: list[str]
```

### 4.3 常量

```python
class RetrievalMode:
    METADATA = "metadata"
    RETRIEVAL = "retrieval"

class ManualSourceMode:
    AUTO = "auto"        # 正常 plan + execute
    PREFER = "prefer"    # manual 先入 fused 前列 + 自动检索补足 + 去重
    ONLY = "only"        # 零向量调用, manual 直接转 RetrievedContext

# settings.py
RETRIEVAL_DEFAULT_MODE = "hybrid"          # 可回滚为 fulltext
RETRIEVAL_FALLBACK_TO_GLOBAL = True         # 大纲未绑定时回退全局库
MAX_DOC_TITLES_PER_KB = 10                  # 矩阵模式每库文档标题上限
MAX_DOC_TITLES_TOTAL = 80                   # 矩阵模式文档标题总量上限
```

### 4.4 公开方法

```python
class RetrievalOrchestrator:

    # 业务入口 (对外)
    def retrieve_for_section(
        self, outline, section, user=None,
        generation_mode=None, analysis_result=None,
        override_kb_ids=None,
        manual_sources=None, manual_source_mode="auto",
    ) -> RetrievedContext:
        """正文模式: plan + execute。"""

    def collect_metadata_snapshot(self, outline, user=None) -> RetrievedContext:
        """矩阵模式: 读材料包快照 + RAG 库/文档标题清单, 零向量调用。"""

    # 内部方法
    def _plan_retrieval(self, outline, section, mode, user, generation_mode, analysis_result,
                       override_kb_ids) -> RetrievalPlan: ...
    def _execute(self, plan, user, manual_sources, manual_source_mode) -> RetrievedContext: ...
    def _fuse_channels(self, by_channel, weights) -> list[RetrievedChunk]: ...
    def _dedup(self, chunks) -> list[RetrievedChunk]: ...
    def resolve_channel(self, knowledge_base) -> str: ...
```

### 4.5 关键行为

**`_plan_retrieval` (正文模式)**:
1. 读 `OutlineKnowledgeBase` 拿到大纲绑定的活跃 KB; 为空且 `RETRIEVAL_FALLBACK_TO_GLOBAL=True` 则 fallback 全局活跃库 + `warnings` 记录
2. `override_kb_ids` 非空 → 优先用调用方指定 KB
3. 对每个 KB 调 `resolve_channel` 解析通道
4. 若 `generation_mode.startswith("strict_")` → 严格通道白名单覆盖默认推断 (迁自 `_get_strict_mode_channels`)
5. 否则按 `section.section_role` + 标题关键词 + `write_scope` 推断通道 (迁自 `_determine_channels`)
6. 为每个通道生成查询词: `section.title + write_scope + 条款关键词` (迁自 `_build_search_query`)
7. 按 `section_role` 设通道 weight (qualification→certificate 高, case→project_case 高)
8. 返回 `RetrievalPlan`, 写入 `generation_meta.retrieval_plan`

**`_execute` (正文模式)**:
1. 对每个 `ChannelQuery` 调 `RetrievalService.search(retrieval_mode=HYBRID, knowledge_base_ids=channel_query.kb_ids, retrieval_run_id=..., trace_meta=...)`
2. 收集到 `by_channel`
3. 跨通道 weighted RRF: `final_score = channel.weight * rrf_score`
4. 融合去重: 同 `chunk_id` 多次命中合并 RRF 得分; `dedup_key` 支持 `chunk_id` → `(document_id, section_path, content_hash)` 三级回退
5. 裁剪 fused top-N (默认 N=8)
6. 生成 `sources` (精简元数据)

**`collect_metadata_snapshot` (矩阵模式)**:
1. 读大纲绑定 KB, 解析通道
2. 每个 KB 取 `document_set` 标题清单, 按「材料包关联→最近更新→标题命中条款关键词→代表性」排序, 每库限 `MAX_DOC_TITLES_PER_KB`, 总量限 `MAX_DOC_TITLES_TOTAL`, 记录 `truncated/total_count/included_count`
3. 读材料包: `outline.material_package` (存在则取 `company_snapshot` + `available_materials` + `missing_materials`)
4. 组装 `metadata_snapshot`, 零向量检索
5. `by_channel` / `fused` / `sources` 为空

**HYBRID 降级链路** (`RetrievalService._hybrid_search` 内):
- 向量生成失败 / embedding 服务异常 → fallback FULLTEXT
- `warnings` 记录「HYBRID 降级为 FULLTEXT」
- `RetrievalLog.fallback_reason` 记录降级原因

### 4.6 manual_source_mode 行为

- `AUTO`: 正常 `_plan_retrieval` + `_execute`
- `PREFER`: `manual_sources` 转 `RetrievedChunk` 先入 `fused` 前列, 再执行自动检索补足 top-N, 去重时合并分数
- `ONLY`: 不调向量检索, `manual_sources` 直接转 `RetrievedContext`, `by_channel` 按 channel 分组, `fused` = 全部 manual

### 4.7 RagService 兼容层

```python
class RagService:
    """兼容旧接口的薄封装。

    注意:
    - 不再新增检索编排逻辑
    - 不再维护通道映射
    - 不再生成查询词
    - 新能力统一进入 RetrievalOrchestrator
    """

    def retrieve_for_section(self, section, knowledge_base_ids=None, user=None,
                             top_k_per_channel=5, generation_mode=None):
        orchestrator = RetrievalOrchestrator()
        context = orchestrator.retrieve_for_section(
            outline=section.outline, section=section, user=user,
            generation_mode=generation_mode,
            override_kb_ids=knowledge_base_ids,  # 旧调用方显式传 KB 时优先
        )
        return self._context_to_legacy_dict(context)
```

`_context_to_legacy_dict` 基于 `context.fused` 分组 (保证跨通道融合结果真正进 prompt):
```python
def _context_to_legacy_dict(self, context: RetrievedContext) -> dict[str, list[dict]]:
    grouped = {}
    for chunk in context.fused:
        grouped.setdefault(chunk.channel, []).append(self._chunk_to_legacy_dict(chunk))
    return grouped
```

`RagService` 中 `KB_TYPE_TO_CHANNEL` / `SECTION_ROLE_TO_CHANNELS` / `KEYWORD_TO_CHANNEL` / `_determine_channels` / `_build_search_query` / `_search_channel` / `_get_strict_mode_channels` 全部迁入 Orchestrator。`_filter_rag_materials_by_mode` 拆成:
- `_apply_channel_whitelist`: 迁入 Orchestrator plan 阶段
- `_apply_material_safety_filter`: 保留作双保险, 按禁止词过滤异常材料 (后置安全过滤)

## 5. RetrievalService 改造

### 5.1 默认 retrieval_mode 改 HYBRID

```python
def search(
    self,
    query: str,
    knowledge_base_ids: list[int] | None = None,   # 改为可选, 兼容旧调用
    top_k: int = 10,
    filters: dict | None = None,
    retrieval_mode: str = RetrievalMode.HYBRID,   # 默认改 HYBRID
    created_by=None,
    retrieval_run_id: str | None = None,           # 新增
    trace_meta: dict | None = None,                 # 新增
) -> dict:
```

- Orchestrator 调用时显式传 `retrieval_mode=RetrievalMode.HYBRID` (不只依赖默认值)
- `knowledge_base_ids` 签名保持可选, Orchestrator 主路径强制传, 旧调用兼容
- `filters["kb_type"]` 降级为兼容字段 (文档注明: 不再用于 RAG 通道选择, 仅二次过滤)
- `_format_result` 不重复加 `kb_id`, 沿用 `knowledge_base_id`; Orchestrator 转 `RetrievedChunk.kb_id`
- `RetrievalService` 不感知 `rag_channel` (channel 是 Orchestrator 推导的业务属性)

### 5.2 不动的东西

- `_hybrid_search` (RRF 融合, 单通道内好实现)
- `_vector_search` / `_fulltext_search` / `_keyword_search` (底层检索原语)
- `RetrievalLog` 日志记录逻辑 (只加字段)
- `EmbeddingService` / `BailianEmbeddingClient`

## 6. 矩阵生成阶段接入

### 6.1 接入方式

`generate_content_matrix_task` 调 `RetrievalOrchestrator.collect_metadata_snapshot(outline, user)`, 拿 `RetrievedContext.metadata_snapshot`, 注入 `content_matrix_generation_v2` 的 variables。

### 6.2 新增 scenario

新建 `content_matrix_generation_v2` (保留旧版灰度对比), 配置项:
```python
CONTENT_MATRIX_SCENARIO_V2 = "content_matrix_generation_v2"
```

### 6.3 variables 新增字段

```python
variables = {
    "project_name": outline.project.name,
    "lot_name": outline.lot.name,
    "outline_structure": outline_structure,
    "requirements_summary": requirements_summary,
    # 新增
    "company_context_block": build_company_context_block(metadata_snapshot),
    "company_snapshot": metadata_snapshot.get("company_snapshot", {}),
    "available_knowledge_bases": metadata_snapshot.get("available_knowledge_bases", []),
    "available_document_titles": metadata_snapshot.get("available_document_titles", []),
    "missing_materials": metadata_snapshot.get("missing_materials", []),
}
```

### 6.4 metadata_snapshot 结构

```python
{
    "company_snapshot": {
        # 来自 BidMaterialPackage.company_snapshot
        "name": "...", "unified_social_credit_code": "...",
        "legal_representative": "...", "registered_capital": "...",
        ...
    },
    "available_knowledge_bases": [
        {"kb_id": 1, "kb_name": "公司介绍库", "kb_type": "company_profile",
         "rag_channel": "company_info", "document_count": 12, "chunk_count": 340},
        ...
    ],
    "available_document_titles": [
        {"kb_id": 1, "document_id": 10, "file_name": "公司简介2025.pdf", "kb_type": "company_profile"},
        ...
    ],
    "document_title_truncated": True,
    "document_title_total_count": 236,
    "document_title_included_count": 80,
    "missing_materials": [
        {"usage_key": "qualification_iso9001", "material_type": "...",
         "description": "ISO9001证书", "required": True},
        ...
    ],
    "has_material_package": True,
    "has_kb_bindings": True,
}
```

### 6.5 build_company_context_block

抽到 `apps/outline/services/content_matrix_context_builder.py`:

```python
def build_company_context_block(metadata_snapshot: dict) -> str:
    """渲染公司能力边界文本块, 注入矩阵 prompt。"""
    # 空数据时返回空字符串 (不破坏旧模板兼容)
    # 有数据时渲染:
    #   【公司能力边界】
    #   公司名称：XX科技有限公司
    #   统一社会信用代码：91XXX
    #   ...
    #   可用知识库：...
    #   可参考文档标题：... (限量)
    #   材料包缺失项（风险提示, 不得编造）：...
```

### 6.6 矩阵生成 Prompt 约束

```text
矩阵生成约束:
1. required_materials 只能引用当前公司材料包、available_knowledge_bases、available_document_titles 中真实存在的材料;
   不得编造未提供的资质、业绩、人员、证书、案例。
2. missing_materials 仅作为风险提示。若某章节核心内容依赖缺失材料, 应将 section_role 标记为 material_placeholder,
   或在 manual_notes 中明确"待补充 XX 材料"。
3. 当材料不足以支撑展开写作时, write_scope 应控制为"概括说明 / 待补充 / 需人工确认",
   不得生成超出材料边界的写作范围。
4. 对历史标书、项目案例等材料, 只能作为写法和能力参考, 不得直接虚构为本项目业绩。
5. required_materials 应优先输出结构化材料标识, 例如 usage_key、document_id、kb_id;
   无法确定时再输出材料名称。
```

### 6.7 错误处理与持久化

- `collect_metadata_snapshot` 失败 → 不阻断矩阵生成, `GenerationTask.result.metadata_warnings` + `generation_meta.metadata_snapshot_status="failed"`, variables 中对应字段为空
- 大纲未绑定 KB 且 `RETRIEVAL_FALLBACK_TO_GLOBAL=True` → 走全局活跃库元数据 + `warnings`
- 大纲未绑定 KB 且配置关闭 → `available_knowledge_bases=[]`, prompt 渲染「未关联知识库」提示, 矩阵仍能生成
- 警告不写 `error_message` (语义为失败原因)
- 持久化 `metadata_snapshot_summary` 到 `GenerationTask.result` (不存全量快照):
  ```python
  {
      "metadata_snapshot_summary": {
          "has_material_package": True,
          "has_kb_bindings": True,
          "kb_ids": [1, 2, 3],
          "document_title_total_count": 236,
          "document_title_included_count": 80,
          "missing_material_count": 3,
          "snapshot_at": "2026-06-27T..."
      }
  }
  ```

### 6.8 不动的东西

- `MatrixService` (锁、目标章节、校验逻辑) / `validate_matrix_output` / `enrich_section_references` 不改
- `GenerationTask.params` 不加字段 (元数据快照不持久化到任务参数, 每次实时读; 仅持久化 summary)

### 6.9 与正文阶段的衔接

矩阵生成写入的 `content_matrix.required_materials` 带真实可用材料的 `usage_key`, 正文阶段 `GenerationContextService._get_company_context` 已能读这个字段匹配材料包 — 链路天然打通, 无需额外改动。

## 7. 正文生成阶段接入

### 7.1 prepare_generation_context 改造

```python
def prepare_generation_context(self, section_id, analysis_result, user_prompt, user_id):
    section = Section.objects.select_related("outline__lot").get(pk=section_id)
    user = User.objects.get(pk=user_id)

    # 识别 generation_mode (传给 Orchestrator)
    from apps.outline.services.generation_mode_service import GenerationModeService
    generation_mode = GenerationModeService().get_generation_mode(section)

    # 1. RAG 检索 (改用 Orchestrator)
    orchestrator = RetrievalOrchestrator()
    try:
        rag_context = orchestrator.retrieve_for_section(
            outline=section.outline, section=section, user=user,
            generation_mode=generation_mode,
            analysis_result=analysis_result,
        )
        rag_materials = self._context_to_legacy_dict(rag_context)
        retrieval_meta = self._build_retrieval_meta(rag_context, generation_mode)
    except Exception as e:
        logger.warning(f"RAG retrieval failed: {e}")
        rag_materials, retrieval_meta = {}, self._empty_retrieval_meta(str(e))

    # 2. 构建上下文 (GenerationContextService 不变)
    context_service = GenerationContextService()
    context = context_service.build_generation_context(section=section, rag_materials=rag_materials)
    prompt_context = context_service.build_prompt_context(context)

    # 3. 从最终进 prompt 的 rag_materials 反推 prompt_sources
    prompt_sources = self._extract_prompt_sources(context.get("rag_materials", {}))

    return {
        "section_info": context["current_section"],
        "content_matrix": context["content_matrix"],
        "analysis_points": context["analysis_points"],
        "rag_materials": context["rag_materials"],
        "context_sections": context["context_sections"],
        "outline_structure": context["outline_structure"],
        "project_info": context["project_info"],
        "prompt_context": prompt_context,
        "user_prompt": user_prompt,
        "analysis_result": analysis_result,
        # 新增
        "rag_sources": prompt_sources,
        "retrieval_meta": self._build_retrieval_meta(
            rag_context, generation_mode,
            retrieved_count=len(rag_context.sources) if rag_context else 0,
            prompt_count=len(prompt_sources),
        ),
    }
```

`_build_retrieval_meta` 产出 §7.4 定义的完整结构 (含 retrieved_source_count / prompt_source_count / used_fused_context)。

### 7.2 落库到 SectionGenerationRecord

```python
record.rag_sources = context["rag_sources"]
record.generation_meta = {
    **(record.generation_meta or {}),
    "retrieval": context["retrieval_meta"],   # 完整 trace, 结构见 §7.4
    "generation_mode": context.get("generation_mode"),
    "content_structure_policy": context.get("content_structure_policy"),
}
record.save(update_fields=["rag_sources", "generation_meta"])
```

### 7.3 rag_sources 结构 (前端展示用, 精简)

```python
[
    {
        "chunk_id": 123, "document_id": 10, "document_title": "公司简介2025.pdf",
        "kb_id": 1, "kb_name": "公司介绍库", "channel": "company_info",
        "score": 0.87, "rank": 1, "section_path": "第三章 公司能力",
        "page_start": 2, "page_end": 5
    },
    ...
]
```

### 7.4 retrieval_meta 结构 (完整 trace, 存 generation_meta.retrieval)

```python
{
    "retrieval_run_id": "uuid-xxx",
    "mode": "retrieval",
    "generation_mode": "strict_qualification",
    "strategy_name": "MaterialFocusedStrategy",
    "channels": [
        {"channel": "company_info", "query": "公司能力 技术方案", "kb_ids": [1,3],
         "weight": 1.0, "result_count": 5, "fallback": None}
    ],
    "fused_count": 8,
    "retrieved_source_count": 12,
    "prompt_source_count": 6,
    "used_fused_context": True,
    "fallback_to_global": False,
    "fallback_reason": None,
    "warnings": [],
    "latency_ms": 340,
}
```

### 7.5 关键修正

1. **`rag_sources` 记录最终进 prompt 的来源**: 从 `context["rag_materials"]` (Strategy 裁剪后) 反推 `prompt_sources`, 不是 Orchestrator 原始 `retrieved_sources`。避免「sources 记 8 条但进 prompt 只有 4 条」。
2. **`_context_to_legacy_dict` 基于 `context.fused` 分组**: 保证跨通道融合结果真正进 prompt, 不是 `by_channel`。
3. **`generation_mode` 传入 Orchestrator**: strict 通道白名单在 plan 阶段生效。
4. **`override_kb_ids` 兼容旧调用**: `RagService.retrieve_for_section(knowledge_base_ids=...)` 显式传 KB 时优先。

### 7.6 严格模式迁移

`_filter_rag_materials_by_mode` 拆成:
- `_apply_channel_whitelist` (迁入 Orchestrator plan): `strict_qualification → [company_info, certificate]` 等通道白名单在检索前限定
- `_apply_material_safety_filter` (保留双保险): 按禁止词二次过滤异常材料

### 7.7 材料包并行注入

正文阶段保留 `_get_company_context` 读材料包, 与 RAG 并行注入。优先级:
1. 材料包结构化事实 (公司名/证书/人员/业绩/缺失项) 优先
2. `content_matrix.required_materials` 指定材料优先
3. RAG 检索材料作为补充论述和写法参考
4. 不得用 RAG 或模型常识覆盖材料包中的真实字段

### 7.8 兼容 RagService 旧调用方

`GenerationContextService` 各 Strategy (`FullContextStrategy` / `CaseFocusedStrategy` 等) 签名不改, 继续接收 `dict[str, list]`。各 Strategy 的「选择性裁剪」继续生效 (因为 `by_channel` 的 key 就是通道名)。

## 8. 前端接入

### 8.1 大纲详情页 - 知识库关联区域

`OutlineDetailView.vue` 大纲信息区, 与「材料包」并列新增「知识库关联」卡片。

**展示**:
- 已关联 KB 列表 (按 `sort_order`): `kb_name` + `kb_type` 标签 + `rag_channel` 标签 + `document_count` + 启停开关 + 移除按钮
- 空状态: 「未关联知识库, 矩阵生成将仅使用招标条款」
- 「添加知识库」按钮 → 多选弹窗

**多选弹窗**:
- 列表展示所有可见 KB (`visibility` 过滤 + `is_active=True` + `is_deleted=False`)
- 按 `kb_type` 分组 (公司介绍库 / 历史标书库 / 案例库 / 资质库 / 产品库 / 技术方案库)
- 每条显示 `name` + `description` + `document_count` + 当前 `rag_channel`
- 已关联的 KB 标记「已添加」, 不可重复选
- 支持搜索 (按 name 模糊匹配)
- 确认后批量创建 `OutlineKnowledgeBase`

### 8.2 生成矩阵引导

点击「生成矩阵」按钮 (`handleGenerateMatrix`) 时:
```typescript
async function handleGenerateMatrix() {
  const hasKB = matrixStatus.value.kb_binding_count > 0
  if (!hasKB) {
    // 未绑 KB 就弹引导 (材料包单独提醒, 不作为不弹引导的借口)
    const action = await ElMessageBox.confirm(
      '当前大纲未关联知识库。矩阵生成将仅基于招标条款, 可能写出公司无法支撑的章节。\n是否现在关联知识库?',
      '关联知识库',
      { confirmButtonText: '去关联', cancelButtonText: '继续生成', type: 'warning' }
    ).catch(() => 'cancel')
    if (action === '去关联') { openKbBindingDialog(); return }
  }
  await startMatrixGeneration()
}
```

- 不强制阻断, 只是 warning 引导 (避免老项目卡死)
- 用户选「继续生成」走原流程 (`fallback_to_global` 兜底或空元数据)
- 关联后用户需重新点「生成矩阵」 (不自动触发)

### 8.3 章节详情 - 双 Tab 面板

章节详情抽屉新增「参考来源」双 Tab:

**Tab 1「生成参考来源」(只读)**:
- 数据: `GET /api/sections/{sectionId}/generation-records/latest/` → `rag_sources` + `generation_meta.retrieval`
- 展示: 来源列表 (按 `rank` 排序) — `document_title` + `kb_name` 标签 + `channel` 标签 + `score` + `section_path` + `page_start~page_end` + 「跳转」按钮
- 检索 trace (折叠, 调试用): `retrieval_run_id` + 各通道 `query/kb_ids/result_count/fallback` + `retrieved_source_count → prompt_source_count` + `fallback_to_global` + `warnings`
- 空状态: 「本次生成未使用 RAG 参考来源」
- 文案: 面板标题「生成参考来源」, hover 提示「本次 AI 生成时使用的参考来源, 人工编辑后可能不一致」

**Tab 2「手动检索材料」**:
1. 输入检索词, 默认填入当前章节标题 + `write_scope`
2. 选择检索范围: 当前大纲已绑定 KB / 指定通道 / 指定 KB
3. 点击「检索」→ `POST /api/sections/{id}/retrieval/search/`
4. 返回候选 chunk 列表, 用户勾选
5. 点击「加入本章节参考材料」→ `POST /api/sections/{id}/manual-sources/`
6. 已保存的人工选源列表, 支持删除 (`DELETE /api/sections/{id}/manual-sources/{source_id}/`)
7. 文案: 「手动检索结果不会覆盖本次生成参考来源。勾选后的材料可用于下一次重新生成或人工补充正文。」

### 8.4 重新生成三模式

用户勾选 manual sources 后点「重新生成」, 弹窗给选项:
```text
重新生成方式:
○ 使用系统自动检索材料 (auto)
● 优先使用我手动选择的参考材料 (prefer)  ← 默认
○ 仅使用我手动选择的参考材料 (only)
```

后端传 `manual_source_mode`, Orchestrator 按 §4.6 行为执行。

### 8.5 API 新增/调整

```
# 大纲 - 知识库关联
GET    /api/outlines/{outline_id}/knowledge-bases/
POST   /api/outlines/{outline_id}/knowledge-bases/           {kb_ids: []}
DELETE /api/outlines/{outline_id}/knowledge-bases/{binding_id}/
PATCH  /api/outlines/{outline_id}/knowledge-bases/{binding_id}/  {sort_order?, is_active?}

# 章节 - 参考来源
GET    /api/sections/{section_id}/generation-records/latest/   # 返回 rag_sources + generation_meta

# 章节 - 手动检索
POST   /api/sections/{section_id}/retrieval/search/   {query, channels?, knowledge_base_ids?, top_k?}

# 章节 - 人工选源 CRUD
GET    /api/sections/{section_id}/manual-sources/
POST   /api/sections/{section_id}/manual-sources/     {sources: [...]}
DELETE /api/sections/{section_id}/manual-sources/{source_id}/

# 章节 - 重新生成 (扩参)
POST   /api/sections/{section_id}/regenerate/   {manual_source_mode?: "auto"|"prefer"|"only"}
```

### 8.6 不动的东西

- `MatrixProgressDialog.vue` / `MatrixEditDialog.vue` / 章节正文编辑器 / 材料包管理 UI 不动

### 8.7 权限

- 绑定/解绑 KB / 手动检索 / 人工选源 CRUD 复用大纲编辑权限 (`outline.edit` 或项目成员角色)
- 查看参考来源 / 人工选源列表复用大纲查看权限
- 不新增权限码

## 9. 测试策略

### 9.1 单元测试

- `RetrievalOrchestrator`:
  - `resolve_channel`: rag_channel 非空优先 / 否则 KB_TYPE_TO_CHANNEL 映射 / 未知 kb_type 默认
  - `_plan_retrieval`: 大纲绑定 KB / fallback 全局 / override_kb_ids 优先 / strict 通道白名单覆盖
  - `_execute`: 单通道 HYBRID / 跨通道 weighted RRF / 融合去重 (chunk_id 三级回退)
  - `collect_metadata_snapshot`: 零向量调用 / 文档标题限量截断 / missing_materials
  - `manual_source_mode`: AUTO / PREFER / ONLY 三模式
- `RetrievalService`:
  - HYBRID 降级 FULLTEXT (向量失败 / embedding 异常) + warnings + fallback_reason
  - `retrieval_run_id` / `trace_meta` 写入 RetrievalLog
- `content_matrix_context_builder.build_company_context_block`: 空数据返回空串 / 有数据渲染结构化块
- `section_generation_service._extract_prompt_sources`: 从裁剪后 rag_materials 反推

### 9.2 集成测试

- 矩阵生成: 大纲绑定 KB + 材料包 → `content_matrix_generation_v2` variables 含 company_context_block → 矩阵 required_materials 引用真实 usage_key
- 正文生成: 大纲绑定 KB → Orchestrator HYBRID 检索 → record.rag_sources 非空 → generation_meta.retrieval 含 trace
- 手动检索: 用户检索 → 勾选 → SectionManualSource 落库 → 重新生成 prefer 模式 → fused 含 manual + auto
- fallback: 大纲未绑 KB → warnings 记录 → 矩阵仍生成 / 正文走全局库

### 9.3 回归测试

- 现有 RagService 旧调用方 (GenerationContextService 各 Strategy) 不破坏 — `_context_to_legacy_dict` 返回结构兼容
- 矩阵生成旧 scenario `content_matrix_generation` 保留可用 (回滚配置)
- RetrievalService 默认 HYBRID 不破坏现有全文检索调用 (旧调用方传 FULLTEXT 仍生效)

## 10. 部署与配置

### 10.1 新增配置项 (settings.py)

```python
RETRIEVAL_DEFAULT_MODE = "hybrid"          # 可回滚为 fulltext
RETRIEVAL_FALLBACK_TO_GLOBAL = True         # 大纲未绑定时回退全局库
MAX_DOC_TITLES_PER_KB = 10                  # 矩阵模式每库文档标题上限
MAX_DOC_TITLES_TOTAL = 80                   # 矩阵模式文档标题总量上限
CONTENT_MATRIX_SCENARIO_V2 = "content_matrix_generation_v2"
```

### 10.2 迁移顺序

1. `knowledge` 迁移: KnowledgeBase.rag_channel + RetrievalLog 三字段
2. `outline` 迁移: OutlineKnowledgeBase + SectionManualSource 表 + SectionGenerationRecord 两字段 + SectionVersion.generated_from_record_id
3. 部署后端: `docker compose build web worker beat && docker compose up -d web worker beat && docker exec ai-bid-generator-web-1 python manage.py migrate && docker compose restart nginx`
4. 前端构建: `cd frontend && npm run build`
5. 验证登录: `curl -s http://localhost/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'`

### 10.3 prompt 模板

`content_matrix_generation_v2` 场景需新建对应 PromptVersion (含 `{{company_context_block}}` 占位符), 通过 `AiTaskExecutionService` 发布。

## 11. 不在本期范围

- rerank 客户端实现 (现有 model_type 已预留 rerank, 后续单独出方案)
- 图谱检索 / 多查询扩展
- 参考来源的「跳转到文档预览并定位 chunk」(依赖已有文档预览能力, 本期只做按钮占位)
- SectionVersion 完整 rag_source_snapshot (本期只存 generated_from_record_id 关联查询)
