# AI-Bid 智能标书生成系统 - 技术架构文档

> 版本：v1.0  
> 最后更新：2026-03-21  
> 文档类型：技术架构说明文档

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术架构](#2-技术架构)
3. [功能模块](#3-功能模块)
4. [API接口](#4-api接口)
5. [数据模型](#5-数据模型)
6. [核心服务](#6-核心服务)
7. [部署架构](#7-部署架构)
8. [安全设计](#8-安全设计)
9. [开发规范](#9-开发规范)

---

## 1. 项目概述

### 1.1 项目简介

AI-Bid 是一个基于 AI 的智能标书生成系统，旨在帮助用户从招标文档中自动提取关键信息，生成标书大纲和章节内容。系统集成了阿里云百炼平台的知识库能力，支持基于企业知识库的智能内容生成。

### 1.2 核心能力

| 能力 | 描述 |
|------|------|
| **智能提取** | 从招标文档中自动提取项目信息、评分项、废标风险等关键内容 |
| **大纲生成** | 基于提取结果智能生成标书章节大纲 |
| **内容生成** | 结合知识库检索，AI 生成各章节内容，支持引用溯源 |
| **知识库管理** | 支持企业知识库的创建、文档上传、向量化存储 |
| **内容校验** | 多维度校验标书内容的合规性、完整性、一致性 |

### 1.3 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| **前端框架** | Next.js (App Router) | 16.1.1 |
| **UI 组件** | shadcn/ui (Radix UI) | Latest |
| **样式方案** | Tailwind CSS | 4.x |
| **状态管理** | React Hook Form + Zod | 7.x / 4.x |
| **后端运行时** | Node.js | 24.x |
| **数据库** | PostgreSQL (Supabase) | 15.x |
| **向量存储** | pgvector | 0.5.x |
| **AI 平台** | 阿里云百炼 | - |
| **对象存储** | AWS S3 兼容 | - |
| **包管理器** | pnpm | 9.x |

---

## 2. 技术架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              前端层 (Next.js)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  项目管理   │  │  招标提取   │  │  内容生成   │  │  知识库管理  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  大纲编辑   │  │  章节编辑   │  │  内容校验   │  │  系统设置    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API层 (Next.js API Routes)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  /api/projects/[id]/*          /api/bailian/*              /api/settings    │
│  ├── extract                   ├── knowledge-bases         └── route.ts     │
│  ├── outline                   ├── documents                               │
│  ├── sections                  ├── upload                                  │
│  ├── validation                └── search                                  │
│  └── export                                                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
┌───────────────────────┐ ┌───────────────────┐ ┌───────────────────────┐
│    数据库层 (Supabase)  │ │   百炼平台 (Bailian) │ │   对象存储 (S3)        │
├───────────────────────┤ ├───────────────────┤ ├───────────────────────┤
│ • projects            │ │ • 知识库管理       │ │ • 文档存储            │
│ • scoring_items       │ │ • 文档解析         │ │ • 临时文件            │
│ • disqualification_   │ │ • 向量检索         │ │ • 导出文件            │
│   risks               │ │ • 重排序           │ │                       │
│ • bid_sections        │ │ • LLM 生成         │ │                       │
│ • validation_results  │ │                   │ │                       │
│ • knowledge_bases     │ │                   │ │                       │
│ • document_chunks     │ │                   │ │                       │
└───────────────────────┘ └───────────────────┘ └───────────────────────┘
```

### 2.2 技术选型理由

| 技术 | 选型理由 |
|------|----------|
| **Next.js 16** | App Router 提供更好的服务端渲染支持，API Routes 实现前后端一体化 |
| **shadcn/ui** | 基于 Radix UI 的无样式组件库，可定制性强，与 Tailwind 完美集成 |
| **Supabase** | 开源的 Firebase 替代方案，提供 PostgreSQL + pgvector 向量存储 |
| **阿里云百炼** | 提供完整的知识库管理、文档解析、向量检索、LLM 生成能力 |
| **pgvector** | PostgreSQL 扩展，支持向量相似度搜索，与关系数据无缝集成 |

### 2.3 数据流向

```
┌──────────────────────────────────────────────────────────────────────┐
│                        标书生成流程                                    │
└──────────────────────────────────────────────────────────────────────┘

1. 文档上传与提取
   ┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │ 上传文档 │───▶│ 百炼解析    │───▶│ LLM 提取    │───▶│ 结构化存储  │
   └─────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                        │
                        ▼
                  提取内容：
                  • 项目基本信息
                  • 评分项（技术/商务/价格）
                  • 废标风险因素
                  • 时间节点
                  • 技术需求

2. 大纲生成
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │ 评分项分析  │───▶│ LLM 规划    │───▶│ 大纲生成    │───▶│ 用户编辑    │
   └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘

3. 内容生成
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │ 选择知识库  │───▶│ 深度查询    │───▶│ 向量检索    │───▶│ 重排序      │
   └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                                               │
                        ┌──────────────────────────────────────┘
                        ▼
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │ 上下文增强  │───▶│ LLM 生成    │───▶│ 引用溯源    │
   └─────────────┘    └─────────────┘    └─────────────┘

4. 内容校验
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │ 合规校验    │───▶│ 评分覆盖    │───▶│ 逻辑一致性  │
   └─────────────┘    └─────────────┘    └─────────────┘
                        │
                        ▼
                  ┌─────────────┐    ┌─────────────┐
                  │ 废标风险    │───▶│ 引用校验    │
                  └─────────────┘    └─────────────┘
```

---

## 3. 功能模块

### 3.1 功能架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AI-Bid 功能架构                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         项目管理模块                                   │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  • 项目创建/编辑/删除        • 项目列表与状态管理                      │   │
│  │  • 文档上传与管理            • 项目进度跟踪                            │   │
│  │  • 知识库关联                • 项目导出                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         招标提取模块                                   │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  • 文档解析                  • 项目基本信息提取                        │   │
│  │  • 评分项提取                • 废标风险识别                            │   │
│  │  • 时间节点提取              • 技术需求提取                            │   │
│  │  • 分段重提取                • 提取结果管理                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         大纲生成模块                                   │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  • 智能大纲生成              • 章节结构编辑                            │   │
│  │  • 评分项映射                • 编写要点生成                            │   │
│  │  • 大纲版本管理              • 章节排序调整                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         内容生成模块                                   │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  • 知识库选择                • 深度查询规划                            │   │
│  │  • 向量检索                  • RRF 融合排序                           │   │
│  │  • 流式内容生成              • 引用溯源                                │   │
│  │  • 批量章节生成              • 内容编辑                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         知识库管理模块                                 │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  • 知识库创建                • 文档上传                                │   │
│  │  • 文档解析                  • 向量索引                                │   │
│  │  • 标签管理                  • 语义检索                                │   │
│  │  • 文档预览                  • 批量操作                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         内容校验模块                                   │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  • 合规校验                  • 评分覆盖校验                            │   │
│  │  • 逻辑一致性校验            • 废标风险响应校验                        │   │
│  │  • 引用校验                  • 校验报告生成                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         系统设置模块                                   │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  • LLM 配置                  • 百炼 API 配置                          │   │
│  │  • 数据库配置                • 系统参数管理                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 功能详细说明

#### 3.2.1 项目管理模块

| 功能 | 描述 | 页面 |
|------|------|------|
| 项目创建 | 创建新的标书项目，填写项目名称、编号、描述 | 首页 |
| 项目列表 | 展示所有项目，支持按状态筛选、搜索 | 首页 |
| 项目详情 | 查看项目完整信息，包括提取结果、大纲、章节 | `/projects/[id]` |
| 文档上传 | 上传招标文档（支持 PDF、Word、图片等格式） | `/projects/[id]` |
| 项目导出 | 导出标书为 Markdown 或 HTML 格式 | `/projects/[id]` |
| 知识库关联 | 为项目关联知识库，用于内容生成 | `/projects/[id]` |

#### 3.2.2 招标提取模块

| 功能 | 描述 | 提取字段 |
|------|------|----------|
| 项目基本信息 | 提取项目名称、编号、采购单位、预算等 | 15+ 字段 |
| 时间节点 | 提取投标截止、开标时间、答疑时间等 | 10+ 字段 |
| 评分标准 | 提取技术/商务/价格评分项及细则 | 动态数量 |
| 废标风险 | 识别否决条款、资格要求等风险点 | 动态数量 |
| 技术需求 | 提取核心技术参数和功能需求 | 动态数量 |
| 商务要求 | 提取资质、保证金、付款方式等 | 动态数量 |

**提取流程**：
1. 文档上传至百炼平台
2. 百炼解析文档结构
3. LLM 按分段结构化提取
4. 结果存储到数据库

#### 3.2.3 大纲生成模块

| 功能 | 描述 |
|------|------|
| 智能生成 | 基于评分项和风险因素自动生成章节大纲 |
| 章节映射 | 每个章节关联相关评分项 |
| 编写要点 | 自动生成章节编写指导 |
| 结构编辑 | 支持拖拽调整章节顺序、添加/删除章节 |
| 版本管理 | 保存大纲历史版本 |

**大纲结构**：
```json
{
  "sections": [
    {
      "id": "section-1",
      "title": "技术方案",
      "level": 1,
      "scoringItemIds": ["item-1", "item-2"],
      "contentGuide": {
        "mainPoints": ["要点1", "要点2"],
        "materialSuggestions": ["建议素材"],
        "searchKeywords": ["关键词"]
      },
      "children": [...]
    }
  ]
}
```

#### 3.2.4 内容生成模块

| 功能 | 描述 |
|------|------|
| 知识库选择 | 选择用于检索的企业知识库和文档 |
| 深度查询 | 自动生成 15-25 个检索查询 |
| 混合检索 | 向量检索 + 关键词检索结合 |
| RRF 融合 | Reciprocal Rank Fusion 结果融合 |
| 流式生成 | SSE 流式输出，实时显示生成内容 |
| 引用溯源 | 自动标注内容引用来源 |

**生成流程**：
```
章节信息 → 查询规划 → 全量检索 → RRF融合 → 上下文增强 → LLM生成 → 引用提取
```

**引用格式**：
- `[S{评分项序号}-{片段序号}]` - 来自评分项相关文档
- `[G{序号}]` - 来自通用知识库
- `[R{序号}]` - 来自风险相关文档

#### 3.2.5 知识库管理模块

| 功能 | 描述 |
|------|------|
| 知识库创建 | 创建企业知识库，配置向量化参数 |
| 文档上传 | 支持 PDF、Word、TXT、MD 等格式 |
| 自动解析 | 百炼平台自动解析文档结构 |
| 向量索引 | 自动生成向量索引，支持语义检索 |
| 标签管理 | 为文档添加标签，支持按标签筛选 |
| 语义检索 | 输入查询，返回相关文档片段 |

#### 3.2.6 内容校验模块

| 校验类型 | 描述 | 检查项 |
|----------|------|--------|
| 合规校验 | 检查内容是否符合招标要求 | 格式、字数、必填项 |
| 评分覆盖 | 检查是否覆盖所有评分项 | 响应完整性、响应质量 |
| 逻辑一致性 | 检查内容逻辑是否自洽 | 数据一致性、表述一致性 |
| 废标风险 | 检查是否响应所有风险点 | 响应状态、响应内容 |
| 引用校验 | 检查引用是否有效 | 引用格式、来源有效性 |

---

## 4. API接口

### 4.1 API 接口总览

| 模块 | 接口数量 | 路径前缀 |
|------|----------|----------|
| 项目管理 | 15+ | `/api/projects/[id]/*` |
| 百炼集成 | 20+ | `/api/bailian/*` |
| 系统设置 | 3 | `/api/settings/*` |
| 其他 | 4 | `/api/upload/*`, `/api/search/*` |

### 4.2 项目管理 API

#### 4.2.1 项目基础操作

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/projects` | 获取项目列表 |
| POST | `/api/projects` | 创建项目 |
| GET | `/api/projects/[id]` | 获取项目详情 |
| PATCH | `/api/projects/[id]` | 更新项目信息 |
| DELETE | `/api/projects/[id]` | 删除项目 |

#### 4.2.2 招标提取 API

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/projects/[id]/extract-tender` | 执行招标文档提取 |
| GET | `/api/projects/[id]/extract-tender` | 获取提取结果 |
| POST | `/api/projects/[id]/extract-segment` | 分段重新提取 |
| POST | `/api/projects/[id]/extract-streaming` | 流式提取（SSE） |
| GET | `/api/projects/[id]/extraction-result` | 获取提取结果 |
| POST | `/api/projects/[id]/extraction-task` | 创建提取任务 |
| GET | `/api/projects/[id]/extraction-task` | 获取任务状态 |

#### 4.2.3 大纲生成 API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/projects/[id]/outline` | 获取大纲 |
| POST | `/api/projects/[id]/outline` | 生成大纲 |
| PUT | `/api/projects/[id]/outline` | 更新大纲 |

#### 4.2.4 章节内容 API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/projects/[id]/sections/[sectionId]` | 获取章节详情 |
| PUT | `/api/projects/[id]/sections/[sectionId]` | 更新章节内容 |
| POST | `/api/projects/[id]/sections/[sectionId]/generate` | 生成章节内容 |
| POST | `/api/projects/[id]/sections/[sectionId]/generate/stream` | 流式生成（SSE） |
| POST | `/api/projects/[id]/sections/[sectionId]/lock` | 锁定/解锁章节 |
| GET | `/api/projects/[id]/sections/[sectionId]/citations` | 获取章节引用 |
| POST | `/api/projects/[id]/sections/batch-generate` | 批量生成章节 |

#### 4.2.5 校验与导出 API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/projects/[id]/validation` | 获取校验历史 |
| POST | `/api/projects/[id]/validation` | 执行内容校验 |
| DELETE | `/api/projects/[id]/validation` | 清除校验历史 |
| POST | `/api/projects/[id]/export` | 导出标书 |

### 4.3 百炼集成 API

#### 4.3.1 知识库管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/bailian/knowledge-bases` | 获取知识库列表 |
| POST | `/api/bailian/knowledge-bases` | 创建知识库 |
| GET | `/api/bailian/knowledge-bases/[id]` | 获取知识库详情 |
| DELETE | `/api/bailian/knowledge-bases/[id]` | 删除知识库 |
| GET | `/api/bailian/knowledge-bases/[id]/stats` | 获取知识库统计 |
| GET | `/api/bailian/knowledge-bases/[id]/tags` | 获取知识库标签 |

#### 4.3.2 文档管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/bailian/knowledge-bases/[id]/documents` | 获取文档列表 |
| POST | `/api/bailian/knowledge-bases/[id]/documents/upload` | 上传文档 |
| GET | `/api/bailian/knowledge-bases/[id]/documents/[docId]` | 获取文档详情 |
| DELETE | `/api/bailian/knowledge-bases/[id]/documents/[docId]` | 删除文档 |
| POST | `/api/bailian/knowledge-bases/[id]/documents/[docId]/reprocess` | 重新处理文档 |
| GET | `/api/bailian/knowledge-bases/[id]/documents/[docId]/chunks` | 获取文档分块 |

#### 4.3.3 检索与搜索

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/bailian/knowledge-bases/[id]/search` | 知识库检索 |
| GET | `/api/search` | 全局搜索 |

#### 4.3.4 文件操作

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/bailian/upload` | 上传文件到百炼 |
| GET | `/api/bailian/files/[fileId]/download` | 获取文件下载链接 |
| GET | `/api/bailian/files/[fileId]/tags` | 获取文件标签 |
| PUT | `/api/bailian/files/[fileId]/tags` | 更新文件标签 |
| GET | `/api/bailian/documents/[documentId]/preview` | 预览文档 |

### 4.4 系统设置 API

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/settings` | 获取系统设置 |
| PUT | `/api/settings` | 更新系统设置 |
| POST | `/api/settings/test-connection` | 测试数据库连接 |
| POST | `/api/settings/switch-database` | 切换数据库 |

---

## 5. 数据模型

### 5.1 数据库 ER 图

```
┌───────────────────┐       ┌───────────────────┐
│     projects      │       │   knowledge_bases │
├───────────────────┤       ├───────────────────┤
│ id (PK)           │       │ id (PK)           │
│ name              │       │ name              │
│ description       │       │ description       │
│ project_number    │       │ type              │
│ knowledge_base_id │──────▶│ document_count    │
│ status            │       │ chunk_count       │
│ metadata (JSONB)  │       │ is_active         │
│ created_at        │       │ created_at        │
│ updated_at        │       └───────────────────┘
└───────────────────┘
        │
        │ 1:N
        ▼
┌───────────────────┐       ┌───────────────────┐
│   scoring_items   │       │ disqualification_ │
├───────────────────┤       │      risks        │
│ id (PK)           │       ├───────────────────┤
│ project_id (FK)   │───────│ id (PK)           │
│ item_name         │       │ project_id (FK)   │
│ item_type         │       │ risk_type         │
│ max_score         │       │ risk_description  │
│ scoring_rules     │       │ severity          │
│ response_status   │       │ response_status   │
└───────────────────┘       └───────────────────┘
        │
        │                   ┌───────────────────┐
        │                   │   bid_sections    │
        │                   ├───────────────────┤
        └──────────────────▶│ id (PK)           │
                            │ project_id (FK)   │
                            │ title             │
                            │ content           │
                            │ status            │
                            │ chapter_number    │
                            │ word_count        │
                            │ metadata (JSONB)  │
                            └───────────────────┘
                                    │
                                    │ 1:N
                                    ▼
                            ┌───────────────────┐
                            │ content_citations │
                            ├───────────────────┤
                            │ id (PK)           │
                            │ section_id (FK)   │
                            │ document_id       │
                            │ cited_text        │
                            │ source_text       │
                            │ relevance_score   │
                            └───────────────────┘
```

### 5.2 核心数据表

#### 5.2.1 项目表 (projects)

| 字段 | 类型 | 描述 |
|------|------|------|
| id | VARCHAR(36) | 主键，UUID |
| name | VARCHAR(200) | 项目名称 |
| description | TEXT | 项目描述 |
| project_number | VARCHAR(100) | 项目编号 |
| knowledge_base_id | VARCHAR(36) | 关联知识库 ID |
| status | VARCHAR(20) | 项目状态 |
| metadata | JSONB | 扩展元数据 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

**metadata 字段结构**：
```json
{
  "uploadedDocument": {
    "name": "招标文件.pdf",
    "url": "https://...",
    "extracted": true,
    "uploadedAt": "2026-03-21T10:00:00Z"
  },
  "outline": {
    "sections": [...]
  },
  "tenderExtraction": {...}
}
```

#### 5.2.2 评分项表 (scoring_items)

| 字段 | 类型 | 描述 |
|------|------|------|
| id | VARCHAR(36) | 主键 |
| project_id | VARCHAR(36) | 项目 ID |
| item_name | VARCHAR(200) | 评分项名称 |
| item_type | VARCHAR(20) | 类型：technical/business/price |
| max_score | DECIMAL(5,2) | 最高分值 |
| weight | DECIMAL(5,2) | 权重 |
| scoring_rules | JSONB | 评分细则 |
| response_status | VARCHAR(20) | 响应状态 |
| chapter_id | VARCHAR(36) | 关联章节 |

#### 5.2.3 废标风险表 (disqualification_risks)

| 字段 | 类型 | 描述 |
|------|------|------|
| id | VARCHAR(36) | 主键 |
| project_id | VARCHAR(36) | 项目 ID |
| risk_type | VARCHAR(50) | 风险类型 |
| risk_description | TEXT | 风险描述 |
| severity | VARCHAR(20) | 严重程度：critical/high/medium/low |
| response_status | VARCHAR(20) | 响应状态 |
| source_text | TEXT | 原文内容 |

#### 5.2.4 章节表 (bid_sections)

| 字段 | 类型 | 描述 |
|------|------|------|
| id | VARCHAR(36) | 主键 |
| project_id | VARCHAR(36) | 项目 ID |
| title | VARCHAR(500) | 章节标题 |
| content | TEXT | 章节内容 |
| status | VARCHAR(20) | 状态：pending/draft/generating/generated/approved |
| chapter_number | VARCHAR(20) | 章节编号 |
| word_count | INTEGER | 字数 |
| metadata | JSONB | 元数据 |

#### 5.2.5 校验结果表 (validation_results)

| 字段 | 类型 | 描述 |
|------|------|------|
| id | VARCHAR(36) | 主键 |
| project_id | VARCHAR(36) | 项目 ID |
| validation_type | VARCHAR(50) | 校验类型 |
| passed | BOOLEAN | 是否通过 |
| score | DECIMAL(5,2) | 得分 |
| issues | JSONB | 问题列表 |
| details | JSONB | 详情 |

#### 5.2.6 系统设置表 (system_settings)

| 字段 | 类型 | 描述 |
|------|------|------|
| id | VARCHAR(36) | 主键 |
| key | VARCHAR(100) | 配置键（唯一） |
| value | TEXT | 配置值 |
| category | VARCHAR(50) | 分类：llm/embedding/storage/general |
| description | TEXT | 描述 |

### 5.3 向量存储

#### document_chunks 表

| 字段 | 类型 | 描述 |
|------|------|------|
| id | VARCHAR(36) | 主键 |
| document_id | VARCHAR(36) | 文档 ID |
| knowledge_base_id | VARCHAR(36) | 知识库 ID |
| content | TEXT | 分块内容 |
| chunk_index | INTEGER | 分块索引 |
| embedding | vector(1024) | 向量嵌入 |
| page_number | INTEGER | 页码 |
| metadata | JSONB | 元数据 |

---

## 6. 核心服务

### 6.1 服务架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              服务层架构                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         BailianService                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │ KnowledgeBase│  │  Document   │  │ Retrieval   │  │   Client    │ │   │
│  │  │   Manager    │  │  Manager    │  │  Manager    │  │             │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         RetrievalService                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │DeepQueryGen │  │FullRetrieval│  │ContextEnhan │  │PromptBuilder│ │   │
│  │  │             │  │   Service   │  │   cement    │  │             │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        ValidationService                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │ Compliance  │  │ScoreCoverage│  │LogicConsist │  │DisqualRisk  │ │   │
│  │  │  Validator  │  │  Validator  │  │  Validator  │  │  Validator  │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        SupabaseClient                                │   │
│  │  • 数据库连接管理          • 配置动态加载                            │   │
│  │  • 连接池管理              • 缓存机制                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 百炼服务 (BailianService)

提供与阿里云百炼平台的集成能力：

```typescript
// 服务接口
interface BailianService {
  // 知识库管理
  createKnowledgeBase(options: CreateKBOptions): Promise<KBResponse>;
  listKnowledgeBases(): Promise<KBListResponse>;
  deleteKnowledgeBase(id: string): Promise<void>;
  
  // 文档管理
  uploadDocument(options: UploadOptions): Promise<DocResponse>;
  listDocuments(kbId: string): Promise<DocListResponse>;
  deleteDocument(kbId: string, docId: string): Promise<void>;
  
  // 检索
  retrieve(options: RetrieveOptions): Promise<RetrieveResponse>;
}
```

**配置参数**：
```typescript
interface BailianSettings {
  accessKeyId: string;
  accessKeySecret: string;
  workspaceId: string;
  endpoint: string;
  regionId: string;
  defaultEmbeddingModel: string;
  defaultRerankModel: string;
  defaultChunkSize: number;
  defaultOverlapSize: number;
  defaultRerankMinScore: number;
}
```

### 6.3 检索服务 (RetrievalService)

提供智能检索和内容生成能力：

```typescript
// 深度查询生成器
class DeepQueryGenerator {
  generateQueryPlan(
    section: Section,
    scoringItems: ScoringItem[],
    risks: Risk[],
    writingNotes: string[]
  ): QueryPlan;
}

// 全量检索服务
class FullRetrievalService {
  executeFullRetrieval(
    queryPlan: QueryPlan,
    knowledgeBaseIds: string[]
  ): Promise<FullRetrievalResult>;
}

// 上下文增强服务
class ContextEnhancementService {
  enhanceContext(
    chunks: EnhancedChunk[],
    queryPlan: QueryPlan
  ): Promise<EnhancedContext>;
}

// Prompt 构建器
class StructuredPromptBuilder {
  buildPrompt(
    section: Section,
    scoringItems: ScoringItem[],
    risks: Risk[],
    writingNotes: string[],
    context: EnhancedContext,
    customInstructions: string
  ): StructuredPrompt;
}
```

**检索配置**：
```typescript
const DEFAULT_RETRIEVAL_CONFIG = {
  // 检索参数
  denseSimilarityTopK: 100,
  sparseSimilarityTopK: 100,
  
  // 重排序参数
  enableReranking: true,
  rerankMinScore: 0.15,
  rerankTopN: 50,
  
  // 最终结果数
  finalTopK: 30,
};
```

### 6.4 校验服务 (ValidationService)

提供多维度内容校验：

```typescript
class ContentValidationService {
  // 执行完整校验
  validate(
    projectId: string,
    content: Record<string, any>,
    scoringItems: ScoringItem[],
    risks: Risk[]
  ): Promise<ValidationReport>;
  
  // 单项校验
  validateCompliance(content: any, risks: Risk[]): ValidationResult;
  validateScoreCoverage(content: any, items: ScoringItem[]): ValidationResult;
  validateLogicConsistency(content: any): ValidationResult;
  validateDisqualificationRisks(content: any, risks: Risk[]): ValidationResult;
  validateCitations(content: any): ValidationResult;
}
```

**校验报告结构**：
```typescript
interface ValidationReport {
  projectId: string;
  overallScore: number;
  overallPassed: boolean;
  results: ValidationResult[];
  totalIssues: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  suggestions: string[];
}
```

---

## 7. 部署架构

### 7.1 部署架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              生产环境部署架构                                │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │   CDN/WAF       │
                              │  (CloudFlare)   │
                              └────────┬────────┘
                                       │
                              ┌────────▼────────┐
                              │   Load Balancer │
                              │   (Nginx/ALB)   │
                              └────────┬────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
           ┌────────▼────────┐ ┌───────▼───────┐ ┌───────▼───────┐
           │   Next.js App   │ │  Next.js App  │ │  Next.js App  │
           │   (Instance 1)  │ │ (Instance 2)  │ │ (Instance 3)  │
           └────────┬────────┘ └───────┬───────┘ └───────┬───────┘
                    │                  │                  │
                    └──────────────────┼──────────────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           │                           │                           │
  ┌────────▼────────┐        ┌────────▼────────┐        ┌────────▼────────┐
  │   Supabase      │        │   阿里云百炼     │        │   对象存储       │
  │   (PostgreSQL)  │        │   (Bailian)     │        │   (S3/OSS)      │
  │                 │        │                 │        │                 │
  │  • pgvector     │        │  • 知识库       │        │  • 文档存储     │
  │  • 连接池       │        │  • LLM          │        │  • 临时文件     │
  └─────────────────┘        └─────────────────┘        └─────────────────┘
```

### 7.2 环境变量配置

| 变量名 | 描述 | 示例值 |
|--------|------|--------|
| `COZE_SUPABASE_URL` | Supabase 项目 URL | `https://xxx.supabase.co` |
| `COZE_SUPABASE_ANON_KEY` | Supabase 匿名密钥 | `eyJhbGciOiJ...` |
| `COZE_SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务角色密钥 | `eyJhbGciOiJ...` |
| `LLM_API_URL` | LLM API 地址 | `https://api.example.com` |
| `LLM_API_KEY` | LLM API 密钥 | `sk-xxx` |
| `DEPLOY_RUN_PORT` | 服务端口 | `5000` |
| `COZE_PROJECT_ENV` | 环境标识 | `DEV` / `PROD` |

### 7.3 启动命令

```bash
# 开发环境
coze dev

# 构建
coze build

# 生产环境
coze start
```

---

## 8. 安全设计

### 8.1 认证与授权

- **API Key 管理**：系统配置中的敏感信息加密存储
- **数据库访问**：使用 Service Role Key 绕过 RLS（仅服务端）
- **会话管理**：无状态 API，不存储用户会话

### 8.2 数据安全

- **敏感数据加密**：API Key 等敏感配置加密存储
- **传输加密**：HTTPS 强制加密
- **输入验证**：使用 Zod 进行请求参数验证

### 8.3 安全配置

```typescript
// API Key 验证
const apiKey = configMap.get('api_key') || process.env.LLM_API_KEY;

// 请求验证
const formSchema = z.object({
  name: z.string().min(1),
  documentUrl: z.string().url(),
});
```

---

## 9. 开发规范

### 9.1 目录结构

```
src/
├── app/                          # Next.js App Router
│   ├── (routes)/                # 页面路由
│   │   ├── projects/[id]/       # 项目详情页
│   │   ├── knowledge-bases/     # 知识库页面
│   │   └── settings/            # 设置页面
│   ├── api/                     # API 路由
│   │   ├── projects/[id]/       # 项目相关 API
│   │   ├── bailian/             # 百炼集成 API
│   │   └── settings/            # 设置 API
│   ├── layout.tsx               # 根布局
│   ├── page.tsx                 # 首页
│   └── globals.css              # 全局样式
│
├── components/                   # React 组件
│   ├── ui/                      # shadcn/ui 基础组件
│   └── [feature]/               # 业务组件
│
├── lib/                          # 工具库
│   ├── bailian/                 # 百炼服务
│   ├── services/                # 业务服务
│   │   ├── retrieval/           # 检索服务
│   │   └── validation-service.ts
│   └── utils.ts                 # 工具函数
│
├── storage/                      # 存储层
│   └── database/                # 数据库
│       └── supabase-client.ts   # Supabase 客户端
│
└── types/                        # 类型定义
```

### 9.2 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件文件 | PascalCase | `KnowledgeBaseCard.tsx` |
| API 路由 | kebab-case | `extract-tender/route.ts` |
| 工具函数 | camelCase | `formatFileSize()` |
| 类型定义 | PascalCase | `interface ProjectItem` |
| 常量 | UPPER_SNAKE_CASE | `DEFAULT_RETRIEVAL_CONFIG` |

### 9.3 代码风格

- **TypeScript**：严格类型检查
- **ESLint**：Next.js 推荐配置
- **导入别名**：使用 `@/` 路径别名
- **组件优先**：优先使用 shadcn/ui 组件

### 9.4 Git 提交规范

```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式
refactor: 重构
test: 测试
chore: 构建/工具
```

---

## 附录

### A. 页面路由清单

| 路由 | 页面文件 | 功能 |
|------|----------|------|
| `/` | `src/app/page.tsx` | 首页，项目列表 |
| `/projects/[id]` | `src/app/projects/[id]/page.tsx` | 项目详情页 |
| `/projects/[id]/extract` | `src/app/projects/[id]/extract/page.tsx` | 招标提取页 |
| `/projects/[id]/extraction-management` | `src/app/projects/[id]/extraction-management/page.tsx` | 提取管理页 |
| `/projects/[id]/sections/[sectionId]` | `src/app/projects/[id]/sections/[sectionId]/page.tsx` | 章节详情页 |
| `/projects/[id]/validation` | `src/app/projects/[id]/validation/page.tsx` | 校验报告页 |
| `/knowledge-bases/[id]` | `src/app/knowledge-bases/[id]/page.tsx` | 知识库详情页 |
| `/settings` | `src/app/settings/page.tsx` | 系统设置页 |

### B. API 接口清单

共 **52** 个 API 接口，详见 [第4章 API接口](#4-api接口)

### C. 数据库表清单

| 表名 | 描述 |
|------|------|
| `projects` | 项目表 |
| `scoring_items` | 评分项表 |
| `disqualification_risks` | 废标风险表 |
| `bid_sections` | 章节表 |
| `content_citations` | 内容引用表 |
| `validation_results` | 校验结果表 |
| `knowledge_bases` | 知识库表 |
| `knowledge_documents` | 知识文档表 |
| `document_chunks` | 文档分块表 |
| `knowledge_tags` | 知识标签表 |
| `document_tags` | 文档标签关联表 |
| `system_settings` | 系统设置表 |
| `upload_sessions` | 上传会话表 |
| `llm_file_cache` | LLM 文件缓存表 |
| `background_tasks` | 后台任务表 |
| `evaluation_criteria` | 评估标准表 |
| `evaluation_items` | 评估项目表 |
| `tender_extraction_results` | 招标提取结果表 |
| `extraction_versions` | 提取版本表 |
| `extraction_modifications` | 提取修改记录表 |

---

**文档版本历史**

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| v1.0 | 2026-03-21 | 初始版本，完整技术架构文档 |
