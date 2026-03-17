# 智能标书生成系统 (AI-Bid) - 设计文档总览

## 📋 项目概述

**项目名称**：智能标书生成系统 (AI-Bid)
**项目目标**：通过 LLM 与企业专属 RAG 知识库，实现招标文件的智能解析与投标文件的自动化生成
**当前阶段**：设计阶段完成，准备进入开发

---

## 📚 设计文档索引

### 1. 可行性分析报告
**文件**：`AI-Bid-FEASIBILITY-ANALYSIS.md`

**内容概要**：
- 技术可行性评估
- 业务可行性分析
- 资源可行性评估
- 技术选型建议
- 实施路径规划
- 风险评估与缓解措施

**关键结论**：
- ✅ 技术可行性：高
- ✅ 业务可行性：高
- ⚠️ 资源可行性：中

---

### 2. 系统架构设计
**文件**：`AI-Bid-SYSTEM-ARCHITECTURE.md`

**内容概要**：
- 整体架构设计（分层架构 + 微服务化）
- 各层级详细设计
- 核心业务流程设计
- 技术选型细节
- 部署架构
- 安全架构
- 性能优化策略
- 扩展性设计

**架构亮点**：
- Next.js 全栈架构，前后端一体化部署
- AI 服务独立部署，支持水平扩展
- PostgreSQL + Redis + S3 + 向量数据库组合
- 完善的 RBAC + RLS 安全体系

---

### 3. 数据模型设计
**文件**：`AI-Bid-DATA-MODEL.md`

**内容概要**：
- 数据库选型（PostgreSQL）
- 实体关系图（ER Diagram）
- 数据表详细设计（用户、项目、知识库、章节等）
- 数据视图设计
- 数据约束与触发器
- Row Level Security (RLS) 策略
- 数据迁移策略
- 性能优化建议

**数据表清单**：
- 用户与权限：departments, users, roles, user_roles
- 知识库：knowledge_base, knowledge_files, knowledge_chunks
- 项目管理：projects, tender_documents, tender_analysis
- 标书生成：bid_outlines, bid_sections, section_contents, content_sources
- 任务与日志：async_tasks, audit_logs

---

### 4. API 规范设计
**文件**：`AI-Bid-API-SPECIFICATION.md`

**内容概要**：
- RESTful API 设计原则
- 统一响应格式
- 认证与授权 API
- 用户管理 API
- 项目管理 API
- 招标文档 API
- 标书大纲 API
- 章节管理 API
- 知识库管理 API
- 导出 API
- 任务管理 API
- WebSocket API
- 错误码定义

**API 统计**：
- 认证 API：5 个
- 用户管理 API：6 个
- 项目管理 API：5 个
- 招标文档 API：4 个
- 章节管理 API：6 个
- 知识库管理 API：9 个
- 其他 API：若干

---

### 5. 前端架构设计
**文件**：`AI-Bid-FRONTEND-ARCHITECTURE.md`

**内容概要**：
- 技术栈选型（Next.js 16 + React 19 + TypeScript）
- 目录结构设计
- 页面路由设计
- 核心页面设计
- 核心组件设计
- 状态管理设计
- API 客户端设计
- 性能优化策略
- 样式设计规范
- 测试策略

**核心页面**：
- 登录/注册页
- 项目列表页
- 项目详情页
- 章节编辑页
- 知识库管理页

**核心组件**：
- ProjectCard：项目卡片
- SectionEditor：章节编辑器（TipTap）
- SourcePanel：引用溯源面板

---

### 6. AI 服务集成设计
**文件**：`AI-Bid-AI-SERVICE-INTEGRATION.md`

**内容概要**：
- AI 服务架构
- 文档解析服务 (DocParser)
- RAG 检索服务 (RAGService)
- LLM 生成服务 (LLMGenerate)
- AI 服务编排层
- 部署配置（Docker Compose）
- 性能优化

**AI 服务清单**：
1. **DocParser**（Python, 端口 5001）
   - PDF/Word/Excel 解析
   - OCR 识别
   - 表格提取

2. **RAGService**（Python, 端口 5002）
   - 文档向量化
   - 语义检索
   - 混合检索

3. **LLMGenerate**（TypeScript, 端口 5003）
   - 流式内容生成
   - 提示词模板管理
   - 多模型支持

---

## 🎯 技术栈总览

### 前端
- **框架**：Next.js 16 (App Router)
- **UI 库**：React 19
- **语言**：TypeScript 5
- **样式**：Tailwind CSS 4
- **组件库**：shadcn/ui
- **富文本编辑器**：TipTap
- **状态管理**：Zustand
- **数据请求**：TanStack Query

### 后端
- **运行时**：Node.js 24 LTS
- **框架**：Next.js API Routes
- **ORM**：Prisma
- **认证**：NextAuth.js
- **消息队列**：BullMQ + Redis

### 数据库
- **主数据库**：PostgreSQL 15+ (Supabase)
- **缓存**：Redis 7
- **对象存储**：S3 兼容存储（MinIO）
- **向量数据库**：Qdrant

### AI 服务
- **文档解析**：Python + FastAPI + PaddleOCR
- **RAG 检索**：Python + FastAPI + SentenceTransformers
- **LLM**：豆包/DeepSeek/Kimi
- **Embedding**：BAAI/bge-large-zh-v1.5

---

## 📊 开发计划

### Phase 1: MVP 开发（4-6 周）

**目标**：验证核心流程

**功能范围**：
- ✅ 用户注册登录
- ✅ 项目创建与招标文件上传
- ✅ 文档解析（提取关键信息）
- ✅ 标书大纲自动生成
- ✅ 单章节内容生成（带引用溯源）
- ✅ 在线编辑器（基础富文本）
- ✅ 知识库基础管理（上传、分类）

**技术债务**：
- ⚠️ 简化的 RBAC（仅 2-3 种角色）
- ⚠️ 同步处理（无消息队列）
- ⚠️ 基础的 RAG（无混合检索）

### Phase 2: 功能完善（+4-6 周）

**新增功能**：
- ✅ 完整的 RBAC 权限系统
- ✅ 高并发处理（消息队列）
- ✅ 混合检索策略
- ✅ 批量章节生成
- ✅ Word/PDF 导出
- ✅ 版本管理
- ✅ 审核流程

### Phase 3: 高级特性（+4-6 周）

**高级特性**：
- ✅ 智能提示（遗漏检测、优化建议）
- ✅ 协同编辑（多人实时协作）
- ✅ 知识库自动标注
- ✅ 数据分析与报表
- ✅ API 开放平台

---

## 🏗️ 开发环境搭建

### 前置要求
- Node.js 24+
- Python 3.11+
- Docker & Docker Compose
- pnpm

### 快速启动

```bash
# 1. 克隆项目
git clone <repository-url>
cd ai-bid

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入必要的配置

# 4. 启动数据库和服务
docker-compose up -d

# 5. 运行数据库迁移
pnpm prisma migrate dev

# 6. 启动开发服务器
pnpm dev
```

### 环境变量清单

```bash
# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/ai_bid

# Redis
REDIS_URL=redis://localhost:6379

# S3 存储
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=ai-bid

# LLM API
DOUBAO_API_KEY=your_key
DEEPSEEK_API_KEY=your_key
KIMI_API_KEY=your_key

# NextAuth
NEXTAUTH_SECRET=your_secret
NEXTAUTH_URL=http://localhost:5000
```

---

## 📈 性能指标

| 指标 | 目标值 |
|------|--------|
| 文档上传响应 | < 2s |
| 文档解析 | < 30s |
| RAG 检索响应 | < 3s |
| 千字内容生成 | < 15s |
| 并发用户数 | 100+ |
| API 响应时间（P95） | < 500ms |

---

## 🔐 安全要求

### 数据安全
- ✅ HTTPS 强制启用
- ✅ 文件加密存储（AES-256）
- ✅ 敏感数据脱敏
- ✅ 数据库连接加密

### 访问控制
- ✅ JWT 认证
- ✅ RBAC 权限控制
- ✅ Row Level Security
- ✅ API 限流

### 审计与监控
- ✅ 操作审计日志
- ✅ 异常行为检测
- ✅ 访问日志记录
- ✅ 性能监控

---

## 📝 下一步行动

### 立即行动
1. ✅ 评审设计文档
2. ⬜ 确认技术选型
3. ⬜ 搭建开发环境
4. ⬜ 初始化项目仓库

### 第 1-2 周
1. ⬜ 实现数据库 Schema
2. ⬜ 搭建基础架构
3. ⬜ 集成文档解析服务
4. ⬜ 实现用户认证

### 第 3-4 周
1. ⬜ 集成 RAG 知识库
2. ⬜ 实现 LLM 生成服务
3. ⬜ 开发前端基础页面
4. ⬜ 功能集成测试

### 第 5-6 周
1. ⬜ 性能优化
2. ⬜ 安全加固
3. ⬜ 功能完善
4. ⬜ MVP 发布

---

## 👥 团队分工

### MVP 阶段（4-6 周）

| 角色 | 人数 | 主要职责 |
|------|------|----------|
| 全栈工程师 | 2 | 前后端开发、系统集成 |
| AI 工程师 | 1 | RAG 优化、提示词工程 |
| 产品经理 | 1 | 需求细化、原型设计 |
| 测试工程师 | 1 | 功能测试、性能测试 |

---

## 📞 联系方式

**项目负责人**：待定
**技术负责人**：待定
**产品负责人**：待定

---

## 📄 文档版本

| 文档 | 版本 | 最后更新 |
|------|------|----------|
| 可行性分析报告 | v1.0 | 2026-03-17 |
| 系统架构设计 | v1.0 | 2026-03-17 |
| 数据模型设计 | v1.0 | 2026-03-17 |
| API 规范设计 | v1.0 | 2026-03-17 |
| 前端架构设计 | v1.0 | 2026-03-17 |
| AI 服务集成设计 | v1.0 | 2026-03-17 |

---

**最后更新**：2026-03-17  
**文档状态**：✅ 设计阶段完成，准备进入开发
