# AI-Bid 智能标书生成系统

AI智能标书生成系统，基于评分驱动的自动化流程，快速生成高质量投标文件。

## 功能特性

### 核心功能

- **项目管理**：创建、编辑、删除投标项目
- **知识库管理**：上传招标文档，自动解析提取评分标准
- **大纲生成**：AI自动生成投标文件大纲结构
- **章节映射**：将评分项与章节关联，确保响应完整
- **AI内容生成**：基于知识库智能生成章节内容
- **评分覆盖校验**：检查评分项是否被完整响应
- **文档导出**：支持导出为 Markdown、HTML、Word 格式

### 技术亮点

- **流式生成**：AI内容采用SSE流式输出，实时展示生成进度
- **深度检索**：多轮检索策略，精准获取相关参考资料
- **引用溯源**：内容标注引用来源，便于审核验证
- **章节锁定**：编辑时自动锁定，防止多人冲突

## 技术栈

- **框架**: Next.js 16 (App Router)
- **UI组件**: shadcn/ui (基于 Radix UI)
- **样式**: Tailwind CSS 4
- **语言**: TypeScript 5
- **文档生成**: docx、marked
- **数据库**: Supabase (PostgreSQL)
- **AI模型**: 支持多种LLM (通义千问等)

## 快速开始

### 环境要求

- Node.js 18+
- pnpm 9+

### 安装依赖

```bash
pnpm install
```

### 配置环境变量

创建 `.env.local` 文件，配置以下环境变量：

```env
# LLM配置
LLM_API_URL=your_llm_api_url
LLM_API_KEY=your_llm_api_key

# Supabase配置
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:5000 查看应用。

### 构建生产版本

```bash
pnpm build
pnpm start
```

## 项目结构

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # API路由
│   │   └── projects/[id]/        # 项目相关API
│   │       ├── outline/          # 大纲生成
│   │       ├── sections/         # 章节管理
│   │       ├── export/           # 文档导出
│   │       └── ...
│   ├── projects/[id]/            # 项目页面
│   └── ...
├── components/                   # React组件
│   ├── ui/                       # shadcn/ui基础组件
│   └── ai-generation/            # AI生成相关组件
├── lib/                          # 工具库
│   ├── services/                 # 业务服务
│   │   ├── retrieval/            # 检索服务
│   │   ├── tender-parser/        # 招标文档解析
│   │   └── ...
│   ├── llm/                      # LLM调用
│   └── prompts/                  # AI提示词
├── storage/                      # 存储服务
│   └── database/                 # 数据库
└── hooks/                        # React Hooks
```

## 使用流程

1. **创建项目**：填写项目基本信息
2. **上传招标文档**：系统自动解析评分标准和废标条款
3. **生成大纲**：AI根据评分项自动生成投标文件结构
4. **章节映射**：将评分项与章节关联
5. **生成内容**：选择知识库，一键生成章节内容
6. **校验覆盖**：检查评分项是否被完整响应
7. **导出文档**：导出为所需格式

## 核心API

### 大纲生成
```
POST /api/projects/[id]/outline
```

### 章节内容生成（流式）
```
POST /api/projects/[id]/sections/[sectionId]/generate/stream
```

### 文档导出
```
GET /api/projects/[id]/export?format=docx|markdown|html
```

## 开发规范

- **包管理器**：必须使用 pnpm
- **UI组件**：优先使用 shadcn/ui 组件
- **样式**：使用 Tailwind CSS，遵循主题变量规范
- **类型安全**：使用 TypeScript，避免 any 类型
- **代码风格**：遵循 ESLint 和 Prettier 规范

## 许可证

MIT License
