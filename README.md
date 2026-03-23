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
- **数据库**: PostgreSQL (推荐 Supabase)
- **AI模型**: 支持多种LLM (通义千问、DeepSeek等)

---

## 部署指南

### 环境要求

- Node.js 18+
- pnpm 9+
- PostgreSQL 14+ (推荐使用 Supabase)

### 方式一：本地开发部署

#### 1. 克隆项目

```bash
git clone https://github.com/dun950821-afk/ai-bid-generator.git
cd ai-bid-generator
```

#### 2. 安装依赖

```bash
pnpm install
```

#### 3. 配置环境变量

创建 `.env.local` 文件：

```env
# 数据库配置（Supabase）
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# LLM配置
LLM_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=your_llm_api_key

# 可选：阿里云百炼知识库
BAILIAN_API_KEY=your_bailian_api_key
BAILIAN_ENDPOINT=your_bailian_endpoint
```

#### 4. 初始化数据库

在 Supabase 控制台的 SQL Editor 中执行：

```bash
# 或使用 psql 连接数据库后执行
psql -h your_db_host -U your_db_user -d your_db_name -f database/init.sql
```

#### 5. 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:5000 查看应用。

#### 6. 构建生产版本

```bash
pnpm build
pnpm start
```

---

### 方式二：Docker 部署

#### 1. 构建镜像

```bash
docker build -t ai-bid-generator .
```

#### 2. 运行容器

```bash
docker run -d \
  --name ai-bid \
  -p 5000:5000 \
  -e NEXT_PUBLIC_SUPABASE_URL=your_supabase_url \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key \
  -e SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key \
  -e LLM_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1 \
  -e LLM_API_KEY=your_llm_api_key \
  ai-bid-generator
```

#### 3. 使用 Docker Compose（推荐）

创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  ai-bid:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - LLM_API_URL=${LLM_API_URL}
      - LLM_API_KEY=${LLM_API_KEY}
    restart: unless-stopped
```

运行：

```bash
docker-compose up -d
```

---

### 方式三：Vercel 部署

#### 1. Fork 本项目到你的 GitHub

#### 2. 在 Vercel 导入项目

1. 访问 [Vercel](https://vercel.com)
2. 点击 "Import Project"
3. 选择你 Fork 的仓库
4. 配置环境变量（同上）

#### 3. 部署

Vercel 会自动检测 Next.js 项目并部署。

---

### 方式四：自有服务器部署

#### 1. 准备服务器

推荐配置：
- CPU: 2核+
- 内存: 4GB+
- 存储: 20GB+

#### 2. 安装 Node.js

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 pnpm
npm install -g pnpm
```

#### 3. 安装 PM2（进程管理）

```bash
npm install -g pm2
```

#### 4. 部署应用

```bash
# 克隆代码
git clone https://github.com/dun950821-afk/ai-bid-generator.git
cd ai-bid-generator

# 安装依赖
pnpm install

# 构建
pnpm build

# 使用 PM2 启动
pm2 start pnpm --name "ai-bid" -- start

# 设置开机自启
pm2 startup
pm2 save
```

#### 5. 配置 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # SSE 支持
        proxy_buffering off;
        proxy_read_timeout 86400;
    }
}
```

---

## 数据库配置

### 使用 Supabase（推荐）

1. 访问 [Supabase](https://supabase.com) 创建项目
2. 进入项目设置 → API 获取连接信息
3. 在 SQL Editor 中执行 `database/init.sql`
4. 配置环境变量

### 使用自建 PostgreSQL

1. 创建数据库：

```sql
CREATE DATABASE ai_bid;
```

2. 执行初始化脚本：

```bash
psql -h localhost -U postgres -d ai_bid -f database/init.sql
```

---

## LLM 配置

### 支持的模型

本项目支持 OpenAI 兼容 API，推荐以下模型：

| 提供商 | 模型推荐 | API地址 |
|--------|----------|---------|
| 阿里云通义千问 | qwen-long, qwen-max | https://dashscope.aliyuncs.com/compatible-mode/v1 |
| DeepSeek | deepseek-chat | https://api.deepseek.com/v1 |
| 智谱AI | glm-4 | https://open.bigmodel.cn/api/paas/v4 |
| OpenAI | gpt-4o | https://api.openai.com/v1 |

### 配置方式

在系统设置页面配置，或通过环境变量：

```env
LLM_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=sk-xxx
```

---

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

database/
└── init.sql                      # 数据库初始化脚本
```

---

## 使用流程

1. **创建项目**：填写项目基本信息
2. **上传招标文档**：系统自动解析评分标准和废标条款
3. **生成大纲**：AI根据评分项自动生成投标文件结构
4. **章节映射**：将评分项与章节关联
5. **生成内容**：选择知识库，一键生成章节内容
6. **校验覆盖**：检查评分项是否被完整响应
7. **导出文档**：导出为所需格式

---

## 开发规范

- **包管理器**：必须使用 pnpm
- **UI组件**：优先使用 shadcn/ui 组件
- **样式**：使用 Tailwind CSS，遵循主题变量规范
- **类型安全**：使用 TypeScript，避免 any 类型
- **代码风格**：遵循 ESLint 和 Prettier 规范

---

## 常见问题

### Q: 数据库连接失败？

检查以下配置：
1. Supabase URL 和 Key 是否正确
2. 数据库表是否已初始化
3. 网络是否可访问数据库

### Q: AI生成失败？

检查以下配置：
1. LLM API URL 和 Key 是否正确
2. API 余额是否充足
3. 模型名称是否正确

### Q: 文件上传失败？

1. 检查 Supabase Storage 配置
2. 检查文件大小限制
3. 检查网络连接

---

## 许可证

MIT License
