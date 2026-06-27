# AI Bid Generator - 功能全面审查与优化调研报告

## 一、系统架构概览

### 1.1 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Django 4.2 + DRF + Celery + PostgreSQL |
| 前端 | Vue 3 + TypeScript + Element Plus + Pinia |
| 存储 | MinIO (S3 兼容) |
| 消息队列 | Redis |
| 文档编辑 | ONLYOFFICE Document Server |
| 部署 | Docker Compose |

### 1.2 模块清单

| 模块 | 后端 | 前端 | 状态 |
|------|------|------|------|
| 用户认证 | `accounts` | `login/`, `auth/` | ✅ 完整 |
| 项目管理 | `projects` | `projects/` | ✅ 完整 |
| 招标文件 | `tender` | `tender/` | ✅ 完整 |
| 大纲/章节 | `outline` | `outline/` | ✅ 完整 |
| AI 生成 | `generation` | `playground/` | ✅ 完整 |
| 知识库 | `knowledge` | `knowledge/` | ✅ 完整 |
| 工作流 | `workflows` | `workflow/` | ⚠️ 基础完成 |
| 企业资料 | `enterprise` | `enterprise/` | ✅ 新增 |
| 需求条款 | `requirements` | - | ✅ 后端完成 |
| 审计日志 | `audit` | `admin/AuditLogView` | ✅ 完整 |
| 系统配置 | `system_config` | `admin/SystemSettingsView` | ✅ 完整 |
| 标书导出 | `exporting`, `quotation`, `scoring` | - | ⚠️ 存根模块 |
| 通知 | `notifications` | - | ⚠️ 存根模块 |

---

## 二、核心功能审查

### 2.1 用户与权限 (`accounts`)

**已实现功能**:
- ✅ 用户登录/登出
- ✅ JWT Token 刷新
- ✅ 强制修改密码
- ✅ 全局权限检查
- ✅ 项目级权限检查
- ✅ 角色管理
- ✅ 菜单权限控制

**待优化**:
- 🔴 缺少用户注册功能（内部系统可接受）
- 🟡 缺少登录失败次数限制/锁定
- 🟡 缺少双因素认证 (2FA)
- 🟡 缺少密码强度策略配置

### 2.2 项目管理 (`projects`)

**已实现功能**:
- ✅ 项目 CRUD
- ✅ 标段管理
- ✅ 项目成员管理
- ✅ 项目角色管理
- ✅ 项目归档

**待优化**:
- 🟡 项目模板功能未实现
- 🟡 项目复制/克隆功能
- 🟡 项目统计数据 API（工时、文档数量）
- 🟢 项目标签/分类功能

### 2.3 招标文件管理 (`tender`)

**已实现功能**:
- ✅ 文件上传（直传 + 后端代理）
- ✅ 文件解析（多引擎支持）
- ✅ 文档分块
- ✅ 解析版本管理
- ✅ 分块统计/调试

**待优化**:
- 🟡 PDF 解析质量优化（表格提取）
- 🟡 OCR 支持（扫描件）
- 🟢 文件对比功能
- 🟢 批量文件上传

### 2.4 大纲与章节 (`outline`)

**已实现功能**:
- ✅ 预设模板创建大纲
- ✅ AI 生成大纲
- ✅ 章节树管理（增删改排序）
- ✅ 内容责任矩阵
- ✅ 章节内容生成（单章节/批量）
- ✅ 版本历史与回滚
- ✅ 生成质量校验
- ✅ Word 导出

**待优化**:
- 🟡 章节内容编辑器体验优化
- 🔴 批量生成进度通知不完善
- 🟡 生成失败重试策略优化
- 🟢 章节模板库
- 🟢 章节内容对比功能

### 2.5 AI 生成引擎 (`generation`)

**已实现功能**:
- ✅ 提示词模板管理
- ✅ 提示词版本管理
- ✅ 多模型支持（DeepSeek, Bailian, Mock）
- ✅ 模型配置管理
- ✅ RAG 检索集成
- ✅ JSON Schema 校验
- ✅ PromptRun 审计记录

**待优化**:
- 🔴 **模型调用失败无重试机制**
- 🔴 **Token 用量统计未持久化到数据库**
- 🟡 缺少模型负载均衡
- 🟡 缺少模型调用成本统计
- 🟡 Playground 体验优化
- 🟢 模型 A/B 测试功能

### 2.6 知识库 (`knowledge`)

**已实现功能**:
- ✅ 知识库 CRUD
- ✅ 文档上传/解析
- ✅ 文档分块
- ✅ 向量检索（pgvector）
- ✅ 全文检索
- ✅ 检索日志

**待优化**:
- 🟡 文档增量更新
- 🟡 多知识库联合检索
- 🟡 检索结果重排序
- 🟢 知识图谱可视化
- 🟢 自动标签提取

### 2.7 工作流 (`workflows`)

**已实现功能**:
- ✅ 工作流模板管理
- ✅ 节点模板管理
- ✅ 流程实例化
- ✅ 节点状态管理
- ✅ 审批流程
- ✅ 审计日志

**待优化**:
- 🔴 **节点产物关联不完善**
- 🔴 **工作流可视化编辑器未实现**
- 🟡 并行节点支持
- 🟡 条件分支节点
- 🟡 定时触发器
- 🟢 工作流模板市场

### 2.8 企业资料中心 (`enterprise`)

**已实现功能**:
- ✅ 公司主体管理
- ✅ 企业材料库
- ✅ 材料包管理
- ✅ 敏感材料权限控制
- ✅ 材料过期提醒

**待优化**:
- 🟡 OCR 自动识别材料信息
- 🟡 材料智能分类
- 🟢 材料使用统计
- 🟢 材料版本管理

---

## 三、数据模型审查

### 3.1 模型统计

| 模块 | 模型数量 | 主要模型 |
|------|---------|---------|
| accounts | 1 | User |
| projects | 4 | Project, Lot, ProjectMember, ProjectRole |
| tender | 5 | TenderFile, ParsedDocument, TenderChunk, PipelineJob |
| outline | 7 | Outline, Section, SectionVersion, GenerationTask, BidDocument |
| generation | 5 | PromptTemplate, PromptVersion, ModelProvider, ModelConfig, PromptRun |
| knowledge | 4 | KnowledgeBase, KnowledgeDocument, KnowledgeChunk, RetrievalLog |
| workflows | 5 | WorkflowTemplate, WorkflowNodeTemplate, LotWorkflow, WorkflowNodeInstance |
| enterprise | 3 | CompanyProfile, CompanyMaterial, BidMaterialPackage |
| requirements | 2 | TenderRequirement, ExtractionRun |

### 3.2 关键关系

```
Project 1---N Lot 1---N Outline 1---N Section
                |           |
                |           +---N SectionVersion
                |
                +---N TenderFile ---1 ParsedDocument
                                   |
                                   +---N TenderChunk
                                   +---N TenderRequirement

Outline 1---1 BidMaterialPackage
         |
         +---N BidDocument

PromptRun (AI调用记录) 关联:
  - PromptTemplate, PromptVersion
  - ModelConfig
  - Section (通过 generation_records)
  - TenderFile, ParsedDocument, Project
```

---

## 四、性能与安全审查

### 4.1 性能问题

| 问题 | 位置 | 严重程度 | 建议 |
|------|------|---------|------|
| N+1 查询 | 多处 list API | 🟡 中 | 已部分修复，持续优化 |
| 大文件上传 | tender upload | 🟡 中 | 分片上传支持 |
| 批量生成串行 | outline tasks | 🟡 中 | 可选并行模式已实现 |
| 知识库检索 | knowledge retrieval | 🟢 低 | 已有索引优化 |

### 4.2 安全问题

| 问题 | 状态 | 说明 |
|------|------|------|
| 敏感材料下载 | ✅ 已修复 | 权限检查 + 预签名URL短过期 |
| SQL 注入 | ✅ 安全 | 使用 ORM |
| XSS | ✅ 安全 | 前端框架自动转义 |
| CSRF | ✅ 安全 | Token 验证 |
| 敏感信息日志 | ⚠️ 注意 | PromptRun 存储完整提示词 |

---

## 五、下一步优化方向

### P0 - 关键问题（立即处理）

1. **AI 调用失败重试机制**
   - 位置: `generation/services/llm_service.py`
   - 问题: 网络超时、限流等临时错误无重试
   - 方案: 指数退避重试 + 最大重试次数配置

2. **Token 用量统计持久化**
   - 新增模型: `TokenUsageLog`
   - 统计维度: 用户、项目、模板、模型
   - 用途: 成本核算、配额管理

3. **批量生成进度实时推送**
   - 当前: 前端轮询
   - 方案: WebSocket / SSE 实时推送

### P1 - 功能完善（短期）

4. **工作流可视化编辑器**
   - 前端: Vue Flow / React Flow 风格
   - 功能: 拖拽节点、连线、条件配置

5. **文档编辑器增强**
   - ONLYOFFICE 集成优化
   - Markdown 编辑器备选
   - 协同编辑支持

6. **知识库检索优化**
   - 混合检索（向量 + 全文）
   - 重排序模型
   - 检索结果缓存

7. **企业材料 OCR 识别**
   - 营业执照自动识别
   - 身份证信息提取
   - 证书有效期识别

### P2 - 体验优化（中期）

8. **项目仪表盘**
   - 项目统计数据可视化
   - 工时统计
   - 文档数量/质量统计

9. **模板调优仪表盘**
   - 成功率趋势
   - Token 消耗趋势
   - 延迟分布
   - 错误类型分析

10. **移动端适配**
    - 响应式布局优化
    - 移动端专用视图

### P3 - 战略功能（长期）

11. **AI 模型微调支持**
    - 训练数据管理
    - 微调任务管理
    - 模型版本管理

12. **多语言支持**
    - i18n 基础设施
    - 英文翻译

13. **开放 API**
    - API Key 管理
    - API 文档 (OpenAPI)
    - SDK 封装

---

## 六、技术债务

### 6.1 代码质量

| 类型 | 数量 | 建议 |
|------|------|------|
| TODO 注释 | 1 | 已大部分处理 |
| 测试覆盖率 | 77个测试文件 | 持续补充 |
| 重复代码 | 前端多处相似逻辑 | 提取组件 |
| 类型定义 | 部分使用 any | 已部分修复 |

### 6.2 架构债务

| 问题 | 影响 | 建议 |
|------|------|------|
| 存根模块 | exporting, quotation, scoring, notifications | 清理或实现 |
| 循环导入风险 | 模块间依赖 | 依赖注入重构 |
| 配置分散 | 环境变量、数据库配置混合 | 统一配置中心 |

---

## 七、资源统计

### 7.1 代码量

```
后端 Python:     ~11,500 行（模型 + 服务）
前端 TypeScript: 估算 ~15,000 行
测试用例:        77 个测试文件
```

### 7.2 API 端点

```
估计 API 端点数量: ~80 个
- accounts:     ~10
- projects:     ~15
- tender:       ~15
- outline:      ~25
- generation:   ~10
- knowledge:    ~10
- workflows:    ~10
- enterprise:   ~10
```

---

## 八、优先级排序

| 优先级 | 功能 | 预计工时 | 价值 |
|--------|------|---------|------|
| P0-1 | AI 调用重试机制 | 2 天 | 稳定性 |
| P0-2 | Token 统计持久化 | 2 天 | 成本控制 |
| P0-3 | 批量生成进度推送 | 3 天 | 用户体验 |
| P1-1 | 工作流可视化编辑 | 5 天 | 核心功能 |
| P1-2 | 知识库检索优化 | 3 天 | 生成质量 |
| P1-3 | OCR 识别 | 3 天 | 效率提升 |
| P2-1 | 模板调优仪表盘 | 4 天 | 运营能力 |
| P2-2 | 项目仪表盘 | 3 天 | 用户体验 |

---

## 九、结论

系统核心功能已基本完成，主要优化方向：

1. **稳定性**: AI 调用重试、错误处理、监控告警
2. **可观测性**: 日志审计、Token 统计、模板调优仪表盘
3. **用户体验**: 进度推送、工作流可视化、编辑器增强
4. **智能化**: OCR 识别、知识库检索优化

建议按 P0 → P1 → P2 顺序逐步推进。
