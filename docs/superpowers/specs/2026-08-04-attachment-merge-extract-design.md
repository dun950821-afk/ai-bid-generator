# 附件合并解析 + 单项提取 + scoring/technical 优化设计

日期：2026-08-04
状态：待审阅

## 背景与根因

用户反馈：①测试不方便（每次只能全量 6 场景抽取）；②技术要求/评分提取不全，评分无数据；③另外 4 场景（强制/资格/商务/递交）完善，不动。

以文件 11（-标包1-1.pdf）调查确认根因：

1. **technical 只有 5 条是合理的**：主文档第五章明确写「本章的条款具体详见《第五章 技术规范书（附件）》」——技术规范书正文在**附件文档**里，主文档仅 32 页。用户确认持有附件，需支持合并抽取。
2. **scoring 返回空 `{}`（两次）**：标书有完整评分体系（技术评审表 100%：公司资质 6 分、项目经验 10 分、服务方案 20 分、安全评估经验 27 分、服务保障机制 7 分、应答文件质量 2 分…），但 PDF 解析把评分表拆成 6-7 个碎片 chunk（1562/1563/1522/1523/1565/1566），表头重复、行错位，且这些碎片 `page_start=None` 导致 chunk_context 排序错乱、可能被 30000 字符预算截断排除在上下文之外。模型面对碎片表格返回空对象。
3. **前端无单场景提取**：工具栏只有「开始抽取（全量 6 场景）」「强制重新抽取」。

## 用户已确认的决策

- 附件合并：**解析层多文件合并成一个统一文档**（非抽取时拼上下文）
- 范围：条款抽取 + 大纲生成一起受益
- scoring 修复：合并解析 + 上下文优化 + 提示词 3.2
- 前端：上传流程引导附件 + 解析界面传附件 + 单项提取

## 一、合并解析（后端核心）

### 数据模型（唯一迁移）
- `TenderChunk` 新增 `source_file = FK(TenderFile, null=True, blank=True)`——标注 chunk 来源文件（主文件为 null 或指向主文件，附件 chunk 指向附件）

### API
`POST /api/tender/files/{file_id}/merge-parse/`
- body: `{"file_ids": [file_id, attachment_id, ...]}`（file_id 为主文件，其余为附件）
- 权限：tender.manage
- 校验：file_ids 非空、均存在、与主文件同 project 且同 lot（附件必须与主文件同一标段，前端上传附件时强制选择归属标段）
- 返回 `{"task_id": N, "status": "pending"}`

### Celery 任务 `apps.tender.merge_parse_files`
`parse_queue`，软超时 1200s：

1. **逐个解析**：对每个选中文件执行 `ParseService.parse`（各自生成 markdown 全文 + page_count）
2. **合并全文**：
   - 主文件在前，附件按 file_ids 顺序
   - 每个文件前插入分隔：`# ===== 文件：{original_name} =====`（附件加注「附件」）
   - **页码偏移**：附件文本内页码 + 主文件累计 page_count（如主文件 32 页，附件第 5 页 → P37），正文内的页眉页码正则替换
3. **写入主文件 ParsedDocument**：合并全文上传 MinIO 覆盖 `markdown_uri`，`update_or_create` 新建版本并置 is_active（复用现有版本机制，历史版本保留）；`page_count` 累加
4. **重新分块**：对合并全文 `ChunkService.chunk`，chunk 的 `source_file` 按内容来源标注（分块时按文件分隔标记切分段落归属）
5. **状态**：主文件 → `chunked`；附件保持各自 `parsed`；附件自己的 ParsedDocument 保留（独立查看）
6. 不自动触发条款抽取/大纲（由用户操作）

### 幂等与重跑
- 重复合并解析：重建主文件 ParsedDocument 新版本 + 重分块（与现有「重新解析」语义一致，历史版本保留）
- 合并解析期间：主文件状态置 `chunking`（复用现状态机防并发）

## 二、DocumentTextService 适配

`DocumentTextService.get_document_text(tender_file)` 当前读 `document_text_object_key`。合并解析时同步把合并全文写入该键（与 markdown_uri 同内容），条款抽取零改动读到合并全文。

## 三、上传流程（前端）

### 标书上传完成提示
上传面板（WorkbenchFileUploadPanel / 上传弹窗）：标书上传成功后弹出提示「该标书是否包含技术规范书等附件？如需一并提取，请继续上传附件」，提供「上传附件」入口。

### 附件上传
- 上传时可选 `file_category=attachment`（现有字段，直接启用）
- 附件默认关联主文件同 lot（同项目下自动选主文件所在标段）

## 四、文件详情页（前端 TenderFileDetailView）

- **lot 文件组**：展示同 lot 全部文件（主文件 + 附件 + 澄清），附件显示解析状态（已解析/未解析/合并中）
- **上传附件**按钮：文件选择器 → 上传为 attachment + 同 lot
- **合并解析**按钮：勾选附件 → `merge-parse` API → 进度条展示（复用 AsyncTask 轮询机制）
- 合并解析完成后提示「可重新执行条款抽取/大纲生成」

## 五、单场景提取（前端，后端已支持）

### RequirementExtractToolbar
- 「开始抽取」改为场景复选框区：6 场景（评分项/技术要求/强制条款/资格要求/商务条款/投标递交）默认全选
- 按钮：「提取所选场景」（原「强制重新抽取」保留，作用为 overwrite 语义）
- payload：`{extraction_types: [...], overwrite, model_config_id, prompt_version_id}`（后端已支持数组）

### RequirementTab
- 分类侧栏每项尾部加「单提」快捷按钮（仅提取当前分类对应场景）
- 任务完成回调不变（failed_types 已有展示）

## 六、scoring 上下文优化（后端 extraction/context.py）

`ExtractionContextBuilder.build(tender_file, model_config_id)` 增加 `extraction_type` 参数：

1. **scoring 场景**：`build_chunk_context` 优先完整收录 `chunk_type=scoring` 的 chunks（评分表碎片必在上下文内，不截断），预算剩余再按序补其他类型
2. **排序兜底**：`page_start=None` 的 chunk 按 id 升序（当前 None 排前导致乱序）
3. 其他场景：行为不变（预算/排序逻辑保持现状）

## 七、提示词 3.2（仅 scoring/technical）

- **scoring 3.2**：在 system_prompt 增加「评分标准常以表格形式存在，解析后可能断裂为多个片段（表头与行分离、顺序错乱、重复出现），必须合并重建完整评分体系，不得因表格断裂返回空结果」；输出结构不变（groups[]）
- **technical 3.2**：增加「招标文件可能包含多个文件（主文件 + 技术规范书附件），文档内容为多文件合并，需完整提取所有文件中的技术要求」；输出结构不变
- 流程：创建 3.2 draft → Playground 验证 → 发布 → 其他 4 场景不动

## 八、前端展示

- 条款「来源」列：多文件时显示来源文件名（chunk source_file 关联）
- 抽取失败场景展示：TaskProgress 已有 failed_types 错误展示，保留
- 大纲生成：合并解析后重新生成大纲即自动包含附件内容（`generate_outline_task` 读主文件 markdown_uri，零改动）

## 九、测试

1. **合并解析**：多文件拼接顺序、页码偏移、source_file 标注、重复合并幂等（版本递增）、失败回滚
2. **scoring 上下文**：scoring 场景优先收录评分表 chunks、None 页码排序兜底、其他场景行为不变（回归）
3. **单场景提取 API**：extraction_types 单场景/多场景子集请求、去重
4. **提示词 3.2 渲染**：渲染器输出包含新说明段落
5. **DocumentTextService**：合并后全文可读
6. 全量回归：requirements 100 + tender + outline 相关

## 十、不改什么

- 4 场景（强制/资格/商务/递交）提示词与上下文逻辑
- 3.1 输出结构（groups/items schema）
- TenderFile 状态机、AsyncTask 机制、流水线 PipelineJob
- 解析器本身（PDF 表格碎片在抽取层解决，不动解析层）

## 十一、实施顺序

1. **Step A**：TenderChunk.source_file 迁移 + 合并解析任务/API + DocumentTextService 适配 + 测试
2. **Step B**：scoring 上下文优先收录 + 排序兜底 + 测试
3. **Step C**：前端单场景提取（工具栏复选框 + 侧栏单提）+ 文件详情页附件上传/合并解析 UI
4. **Step D**：上传流程附件引导提示
5. **Step E**：提示词 3.2（scoring/technical）draft → Playground → 发布
6. **Step F**：部署验证（文件 11 传附件 → 合并解析 → 单场景提取 → 大纲重新生成）+ commit push
