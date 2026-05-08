# AI智能标书生成系统

## 项目概览
基于 Next.js 16 + React 19 + TypeScript 5 的智能标书生成系统，集成了多个知识库引擎（百炼/IMA/扣子），支持标书解析、智能生成和全流程管理。

## 技术栈
- **Framework**: Next.js 16 (App Router, Turbopack)
- **UI**: React 19, shadcn/ui (Radix UI), Tailwind CSS 4
- **Language**: TypeScript 5
- **Database**: Supabase (PostgreSQL)
- **Package Manager**: pnpm

## 构建与开发命令
```bash
pnpm install          # 安装依赖
pnpm dev              # 开发服务器 (端口 5000, HMR)
pnpm build            # 生产构建
pnpm lint             # ESLint 检查
pnpm ts-check         # TypeScript 类型检查
```

## 目录结构
```
src/
├── app/
│   ├── api/                    # API 路由
│   │   ├── bailian/            # 百炼知识库 API
│   │   ├── coze-knowledge/     # 扣子知识库 API
│   │   ├── ima/                # IMA 知识库 API
│   │   ├── knowledge-provider/ # 知识库引擎切换
│   │   ├── projects/           # 项目管理 API
│   │   └── settings/           # 设置 API
│   ├── page.tsx                # 首页
│   └── settings/               # 设置页
├── components/
│   ├── knowledge-base/         # 知识库组件
│   └── ui/                     # shadcn/ui 组件
└── lib/
    ├── bailian/                # 百炼 SDK 封装
    │   ├── bailian-modules.ts  # SDK 懒加载（动态 import 避免 moment 问题）
    │   ├── client.ts           # 百炼客户端
    │   ├── document.ts         # 文档管理
    │   ├── knowledge-base.ts   # 知识库管理
    │   └── retrieval.ts        # 检索服务
    └── services/
        ├── ima-service.ts      # IMA API 服务
        ├── retrieval/          # 检索引擎
        │   ├── coze-provider.ts    # 扣子知识库适配器
        │   ├── full-retrieval.ts   # 全量检索服务
        │   ├── provider.ts        # Provider 注册
        │   └── index.ts           # 导出
        └── storage/
            └── supabase-client.ts  # Supabase 客户端
```

## 关键架构决策

### 百炼 SDK 懒加载
`@alicloud/bailian20231229` → `@darabonba/typescript` → `moment` 的静态依赖链在 Turbopack + pnpm 严格隔离下无法解析。解决方案：
- 创建 `bailian-modules.ts` 统一管理动态 `import()`
- 所有百炼相关文件通过 `loadBailianModules()` 获取 SDK 模块
- `BailianClient.getRawClient()` 改为同步方法（需在 `request()` 内调用）

### 知识库引擎切换
支持三种知识库引擎：bailian / ima / coze，通过 `/api/knowledge-provider` 切换。

### IMA 文件预览
使用 `/openapi/wiki/v1/get_media_info` API 获取带签名的临时访问链接。

## 代码风格
- 使用 shadcn/ui 主题变量，禁止硬编码颜色
- 函数参数必须标注类型，禁止隐式 any
- pnpm 作为唯一包管理器

## 数据库表
- `coze_documents` - 扣子知识库文档跟踪（id, title, content, url, source_type, dataset_name, doc_id, status, chunk_count）
