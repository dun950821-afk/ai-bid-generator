# 智能标书生成系统 - 前端架构设计

## 1. 技术栈选型

### 1.1 核心技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 16 | 全栈框架（App Router） |
| React | 19 | UI 库 |
| TypeScript | 5 | 类型安全 |
| Tailwind CSS | 4 | 样式方案 |
| shadcn/ui | latest | 组件库 |
| Zustand | 4 | 状态管理 |
| React Hook Form | 7 | 表单管理 |
| Zod | 3 | 数据验证 |
| TipTap | 2 | 富文本编辑器 |
| TanStack Query | 5 | 数据请求与缓存 |

### 1.2 开发工具

| 工具 | 用途 |
|------|------|
| ESLint | 代码规范 |
| Prettier | 代码格式化 |
| Husky | Git Hooks |
| lint-staged | 提交前检查 |
| Jest | 单元测试 |
| Playwright | E2E 测试 |

---

## 2. 目录结构设计

```
src/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # 认证相关页面（无侧边栏布局）
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── register/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   │
│   ├── (dashboard)/              # 主应用页面（有侧边栏布局）
│   │   ├── layout.tsx           # 主布局（Header + Sidebar）
│   │   │
│   │   ├── page.tsx             # 首页/仪表盘
│   │   │
│   │   ├── projects/            # 项目管理
│   │   │   ├── page.tsx        # 项目列表
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx    # 项目详情
│   │   │   │   ├── tender/      # 招标文档
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── outline/     # 标书大纲
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── sections/    # 章节管理
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [sectionId]/
│   │   │   │   │       └── page.tsx
│   │   │   │   └── export/      # 导出标书
│   │   │   │       └── page.tsx
│   │   │   └── new/
│   │   │       └── page.tsx    # 新建项目
│   │   │
│   │   ├── knowledge/           # 知识库管理
│   │   │   ├── page.tsx        # 知识库列表
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx    # 知识库详情
│   │   │   │   └── files/
│   │   │   │       └── page.tsx
│   │   │   └── new/
│   │   │       └── page.tsx    # 新建知识库
│   │   │
│   │   ├── settings/            # 系统设置
│   │   │   ├── page.tsx        # 个人设置
│   │   │   ├── users/
│   │   │   │   └── page.tsx    # 用户管理
│   │   │   ├── departments/
│   │   │   │   └── page.tsx    # 部门管理
│   │   │   └── roles/
│   │   │       └── page.tsx    # 角色管理
│   │   │
│   │   └── tasks/               # 任务中心
│   │       └── page.tsx
│   │
│   ├── api/                     # API Routes
│   │   ├── auth/
│   │   ├── projects/
│   │   ├── knowledge/
│   │   └── ...
│   │
│   ├── layout.tsx              # 根布局
│   ├── globals.css             # 全局样式
│   └── not-found.tsx           # 404 页面
│
├── components/                  # 组件库
│   ├── ui/                     # shadcn/ui 基础组件
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   └── ...
│   │
│   ├── business/               # 业务组件
│   │   ├── ProjectCard.tsx     # 项目卡片
│   │   ├── TenderUploader.tsx  # 招标文档上传
│   │   ├── OutlineTree.tsx     # 大纲树形结构
│   │   ├── SectionEditor.tsx   # 章节编辑器
│   │   ├── KnowledgeCard.tsx   # 知识库卡片
│   │   ├── SourcePanel.tsx     # 引用溯源面板
│   │   └── ...
│   │
│   ├── layout/                 # 布局组件
│   │   ├── Header.tsx          # 顶部导航
│   │   ├── Sidebar.tsx         # 侧边栏
│   │   ├── Breadcrumb.tsx      # 面包屑
│   │   └── Footer.tsx
│   │
│   └── common/                 # 通用组件
│       ├── Loading.tsx
│       ├── ErrorBoundary.tsx
│       ├── Empty.tsx
│       └── ...
│
├── lib/                        # 工具库
│   ├── api/                   # API 客户端
│   │   ├── client.ts         # API 客户端封装
│   │   ├── auth.ts           # 认证 API
│   │   ├── projects.ts       # 项目 API
│   │   ├── knowledge.ts      # 知识库 API
│   │   └── types.ts          # API 类型定义
│   │
│   ├── hooks/                 # 自定义 Hooks
│   │   ├── useAuth.ts        # 认证 Hook
│   │   ├── useProjects.ts    # 项目 Hook
│   │   ├── useKnowledge.ts   # 知识库 Hook
│   │   ├── useWebSocket.ts   # WebSocket Hook
│   │   └── ...
│   │
│   ├── utils/                 # 工具函数
│   │   ├── format.ts         # 格式化工具
│   │   ├── validation.ts     # 验证工具
│   │   ├── storage.ts        # 本地存储
│   │   └── constants.ts      # 常量定义
│   │
│   ├── auth.ts                # NextAuth 配置
│   ├── prisma.ts              # Prisma 客户端
│   └── validators.ts          # Zod 验证器
│
├── stores/                     # 状态管理
│   ├── authStore.ts           # 认证状态
│   ├── projectStore.ts        # 项目状态
│   ├── editorStore.ts         # 编辑器状态
│   └── uiStore.ts             # UI 状态
│
├── types/                      # 类型定义
│   ├── api.ts                 # API 类型
│   ├── models.ts              # 数据模型类型
│   ├── components.ts          # 组件类型
│   └── env.d.ts               # 环境变量类型
│
└── styles/                     # 样式文件
    ├── variables.css          # CSS 变量
    └── animations.css         # 动画样式
```

---

## 3. 页面路由设计

### 3.1 路由映射表

| 路由路径 | 页面 | 说明 |
|----------|------|------|
| `/login` | 登录页 | 用户登录 |
| `/register` | 注册页 | 用户注册 |
| `/` | 首页 | 仪表盘/概览 |
| `/projects` | 项目列表 | 查看所有项目 |
| `/projects/new` | 新建项目 | 创建新项目 |
| `/projects/[id]` | 项目详情 | 项目概览 |
| `/projects/[id]/tender` | 招标文档 | 上传与解析 |
| `/projects/[id]/outline` | 标书大纲 | 大纲管理 |
| `/projects/[id]/sections` | 章节列表 | 章节管理 |
| `/projects/[id]/sections/[sectionId]` | 章节编辑 | 内容编辑 |
| `/projects/[id]/export` | 导出标书 | 导出设置 |
| `/knowledge` | 知识库列表 | 查看知识库 |
| `/knowledge/new` | 新建知识库 | 创建知识库 |
| `/knowledge/[id]` | 知识库详情 | 文件管理 |
| `/settings` | 个人设置 | 用户设置 |
| `/settings/users` | 用户管理 | 管理员功能 |
| `/settings/departments` | 部门管理 | 管理员功能 |
| `/settings/roles` | 角色管理 | 管理员功能 |
| `/tasks` | 任务中心 | 异步任务 |

### 3.2 路由守卫

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('token');
  const pathname = request.nextUrl.pathname;
  
  // 公开路由
  const publicPaths = ['/login', '/register'];
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path));
  
  if (!token && !isPublicPath) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  if (token && isPublicPath) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

---

## 4. 核心页面设计

### 4.1 登录页 (`/login`)

```tsx
// src/app/(auth)/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, LoginFormData } from '@/lib/validators';
import { Button, Input, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [error, setError] = useState('');
  
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema)
  });
  
  const onSubmit = async (data: LoginFormData) => {
    try {
      await login(data.email, data.password);
      router.push('/');
    } catch (err) {
      setError('用户名或密码错误');
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-2xl font-bold mb-6">登录</h1>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="邮箱"
            type="email"
            {...register('email')}
            error={errors.email?.message}
          />
          
          <Input
            label="密码"
            type="password"
            {...register('password')}
            error={errors.password?.message}
          />
          
          {error && <p className="text-red-500 text-sm">{error}</p>}
          
          <Button type="submit" loading={isSubmitting} className="w-full">
            登录
          </Button>
        </form>
      </Card>
    </div>
  );
}
```

### 4.2 项目列表页 (`/projects`)

```tsx
// src/app/(dashboard)/projects/page.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { Button, Input, Card } from '@/components/ui';
import { ProjectCard } from '@/components/business/ProjectCard';
import { getProjects } from '@/lib/api/projects';

export default function ProjectsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  
  const { data, isLoading } = useQuery({
    queryKey: ['projects', search, status],
    queryFn: () => getProjects({ search, status })
  });
  
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">项目管理</h1>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          新建项目
        </Button>
      </div>
      
      <div className="flex gap-4 mb-6">
        <Input
          placeholder="搜索项目..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="draft">草稿</option>
          <option value="generating">生成中</option>
          <option value="review">审核中</option>
          <option value="final">已定稿</option>
        </select>
      </div>
      
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="h-48 animate-pulse bg-gray-200" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.data.map(project => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
```

### 4.3 项目详情页 (`/projects/[id]`)

```tsx
// src/app/(dashboard)/projects/[id]/page.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { Tabs, Card, Badge, Progress } from '@/components/ui';
import { getProject } from '@/lib/api/projects';

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const { data: project, isLoading } = useQuery({
    queryKey: ['project', params.id],
    queryFn: () => getProject(params.id)
  });
  
  if (isLoading) return <div>Loading...</div>;
  
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{project?.data.name}</h1>
        <div className="flex items-center gap-4 mt-2">
          <Badge>{project?.data.status}</Badge>
          <span className="text-gray-500">
            截止日期：{project?.data.deadline}
          </span>
        </div>
      </div>
      
      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Trigger value="overview">概览</Tabs.Trigger>
          <Tabs.Trigger value="tender">招标文档</Tabs.Trigger>
          <Tabs.Trigger value="outline">标书大纲</Tabs.Trigger>
          <Tabs.Trigger value="sections">章节内容</Tabs.Trigger>
        </Tabs.List>
        
        <Tabs.Content value="overview">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">项目进度</h2>
            <Progress value={project?.data.progress || 0} className="mb-4" />
            <p className="text-gray-600">
              已完成 {project?.data.completed_sections} / {project?.data.total_sections} 个章节
            </p>
          </Card>
        </Tabs.Content>
        
        {/* 其他 Tab 内容 */}
      </Tabs>
    </div>
  );
}
```

### 4.4 章节编辑页 (`/projects/[id]/sections/[sectionId]`)

```tsx
// src/app/(dashboard)/projects/[id]/sections/[sectionId]/page.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button, Card } from '@/components/ui';
import { SectionEditor } from '@/components/business/SectionEditor';
import { SourcePanel } from '@/components/business/SourcePanel';
import { getSection, generateSection } from '@/lib/api/projects';

export default function SectionEditPage({ params }: { params: { id: string; sectionId: string } }) {
  const [content, setContent] = useState('');
  const [sources, setSources] = useState([]);
  
  const { data: section, isLoading } = useQuery({
    queryKey: ['section', params.sectionId],
    queryFn: () => getSection(params.sectionId)
  });
  
  const generateMutation = useMutation({
    mutationFn: () => generateSection(params.sectionId),
    onSuccess: (stream) => {
      // 处理 SSE 流式响应
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      
      const read = async () => {
        const { done, value } = await reader.read();
        if (done) return;
        
        const chunk = decoder.decode(value);
        const data = JSON.parse(chunk.replace('data: ', ''));
        
        if (data.content) {
          setContent(prev => prev + data.content);
        }
        
        if (data.sources) {
          setSources(data.sources);
        }
        
        if (!data.done) {
          read();
        }
      };
      
      read();
    }
  });
  
  return (
    <div className="flex h-screen">
      {/* 左侧：编辑器 */}
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h1 className="text-xl font-semibold">{section?.data.title}</h1>
          <div className="flex gap-2">
            <Button
              onClick={() => generateMutation.mutate()}
              loading={generateMutation.isPending}
            >
              AI 生成
            </Button>
            <Button variant="outline">保存</Button>
          </div>
        </div>
        
        <div className="flex-1 p-4 overflow-auto">
          <SectionEditor
            content={content}
            onChange={setContent}
          />
        </div>
      </div>
      
      {/* 右侧：引用溯源面板 */}
      <div className="w-80 border-l bg-gray-50 p-4 overflow-auto">
        <h2 className="font-semibold mb-4">引用来源</h2>
        <SourcePanel sources={sources} />
      </div>
    </div>
  );
}
```

---

## 5. 核心组件设计

### 5.1 项目卡片组件 (ProjectCard)

```tsx
// src/components/business/ProjectCard.tsx
import Link from 'next/link';
import { Card, Badge, Progress } from '@/components/ui';
import { Project } from '@/types/models';
import { formatDistanceToNow } from '@/lib/utils/format';

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="p-4 hover:shadow-lg transition-shadow cursor-pointer">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-semibold truncate flex-1">{project.name}</h3>
          <Badge variant={getStatusVariant(project.status)}>
            {getStatusText(project.status)}
          </Badge>
        </div>
        
        <p className="text-sm text-gray-500 mb-4 line-clamp-2">
          {project.description}
        </p>
        
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">进度</span>
            <span>{project.progress}%</span>
          </div>
          <Progress value={project.progress} />
        </div>
        
        <div className="flex justify-between items-center mt-4 text-sm text-gray-500">
          <span>{project.creator.name}</span>
          <span>{formatDistanceToNow(project.created_at)}</span>
        </div>
      </Card>
    </Link>
  );
}

function getStatusVariant(status: string) {
  const variants = {
    draft: 'default',
    generating: 'info',
    review: 'warning',
    final: 'success'
  };
  return variants[status] || 'default';
}

function getStatusText(status: string) {
  const texts = {
    draft: '草稿',
    generating: '生成中',
    review: '审核中',
    final: '已定稿'
  };
  return texts[status] || status;
}
```

### 5.2 章节编辑器组件 (SectionEditor)

```tsx
// src/components/business/SectionEditor.tsx
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Button } from '@/components/ui';
import { Bold, Italic, List, Image as ImageIcon, Table as TableIcon } from 'lucide-react';

interface SectionEditorProps {
  content: string;
  onChange: (content: string) => void;
}

export function SectionEditor({ content, onChange }: SectionEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Table,
      TableRow,
      TableCell,
      TableHeader
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    }
  });
  
  if (!editor) return null;
  
  return (
    <div className="border rounded-lg">
      {/* 工具栏 */}
      <div className="flex gap-2 p-2 border-b bg-gray-50">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="w-4 h-4" />
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="w-4 h-4" />
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="w-4 h-4" />
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const url = prompt('输入图片URL');
            if (url) editor.chain().focus().setImage({ src: url }).run();
          }}
        >
          <ImageIcon className="w-4 h-4" />
        </Button>
        
        <Button
          size="sm"
          variant="ghost"
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3 }).run()}
        >
          <TableIcon className="w-4 h-4" />
        </Button>
      </div>
      
      {/* 编辑区域 */}
      <EditorContent
        editor={editor}
        className="prose max-w-none p-4 min-h-[500px]"
      />
    </div>
  );
}
```

### 5.3 引用溯源面板组件 (SourcePanel)

```tsx
// src/components/business/SourcePanel.tsx
import { Card } from '@/components/ui';
import { Source } from '@/types/models';

interface SourcePanelProps {
  sources: Source[];
}

export function SourcePanel({ sources }: SourcePanelProps) {
  if (sources.length === 0) {
    return (
      <p className="text-gray-400 text-sm">暂无引用来源</p>
    );
  }
  
  return (
    <div className="space-y-3">
      {sources.map((source, index) => (
        <Card key={source.id} className="p-3 text-sm">
          <div className="flex items-start gap-2">
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">
              [{index + 1}]
            </span>
            <div className="flex-1">
              <p className="text-gray-700 line-clamp-3">
                {source.source_text}
              </p>
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                <span>{source.knowledge_name}</span>
                {source.page_number && (
                  <>
                    <span>·</span>
                    <span>第 {source.page_number} 页</span>
                  </>
                )}
                <span>·</span>
                <span>相关度: {(source.relevance_score * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
```

---

## 6. 状态管理设计

### 6.1 认证状态 (authStore)

```typescript
// src/stores/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  department?: { id: string; name: string };
  permissions: string[];
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      
      login: async (email, password) => {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        
        const { data } = await response.json();
        
        set({
          user: data.user,
          token: data.token,
          isAuthenticated: true
        });
      },
      
      logout: () => {
        set({ user: null, token: null, isAuthenticated: false });
      },
      
      updateUser: (userData) => {
        set(state => ({
          user: state.user ? { ...state.user, ...userData } : null
        }));
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token })
    }
  )
);
```

### 6.2 编辑器状态 (editorStore)

```typescript
// src/stores/editorStore.ts
import { create } from 'zustand';

interface EditorState {
  content: string;
  sources: Source[];
  isGenerating: boolean;
  setContent: (content: string) => void;
  setSources: (sources: Source[]) => void;
  setIsGenerating: (isGenerating: boolean) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  content: '',
  sources: [],
  isGenerating: false,
  
  setContent: (content) => set({ content }),
  setSources: (sources) => set({ sources }),
  setIsGenerating: (isGenerating) => set({ isGenerating })
}));
```

---

## 7. API 客户端设计

### 7.1 基础客户端

```typescript
// src/lib/api/client.ts
import { useAuthStore } from '@/stores/authStore';

class APIClient {
  private baseURL = '/api';
  
  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = useAuthStore.getState().token;
    
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '请求失败');
    }
    
    return response.json();
  }
  
  get<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'GET' });
  }
  
  post<T>(endpoint: string, data?: any) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
  
  put<T>(endpoint: string, data?: any) {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }
  
  delete<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
  
  // 流式请求
  async stream(
    endpoint: string,
    data?: any,
    onChunk?: (chunk: any) => void
  ): Promise<void> {
    const token = useAuthStore.getState().token;
    
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
      },
      body: JSON.stringify(data)
    });
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    if (!reader) return;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.replace('data: ', ''));
          onChunk?.(data);
        }
      }
    }
  }
}

export const apiClient = new APIClient();
```

### 7.2 项目 API

```typescript
// src/lib/api/projects.ts
import { apiClient } from './client';
import { Project, PaginatedResult } from '@/types/models';

export const getProjects = (params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}) => {
  const query = new URLSearchParams();
  if (params?.page) query.append('page', params.page.toString());
  if (params?.limit) query.append('limit', params.limit.toString());
  if (params?.search) query.append('search', params.search);
  if (params?.status) query.append('status', params.status);
  
  return apiClient.get<{ success: true; data: Project[]; meta: any }>(
    `/projects?${query.toString()}`
  );
};

export const getProject = (id: string) => {
  return apiClient.get<{ success: true; data: Project }>(`/projects/${id}`);
};

export const createProject = (data: {
  name: string;
  description?: string;
  deadline?: string;
  budget?: number;
  tags?: string[];
}) => {
  return apiClient.post<{ success: true; data: Project }>('/projects', data);
};

export const uploadTenderDocument = (projectId: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  
  return fetch(`/api/projects/${projectId}/tender-document`, {
    method: 'POST',
    body: formData
  }).then(r => r.json());
};

export const generateSection = async (sectionId: string) => {
  const response = await fetch(`/api/sections/${sectionId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  
  return response.body;
};
```

---

## 8. 性能优化策略

### 8.1 代码分割

```typescript
// 动态导入大型组件
import dynamic from 'next/dynamic';

const SectionEditor = dynamic(
  () => import('@/components/business/SectionEditor'),
  {
    loading: () => <div>Loading editor...</div>,
    ssr: false // 编辑器不需要 SSR
  }
);
```

### 8.2 图片优化

```tsx
import Image from 'next/image';

<Image
  src="/project-cover.jpg"
  alt="Project Cover"
  width={400}
  height={300}
  loading="lazy"
/>
```

### 8.3 列表虚拟化

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualList({ items }: { items: Project[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200
  });
  
  return (
    <div ref={parentRef} className="h-screen overflow-auto">
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(virtualRow => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: virtualRow.size,
              transform: `translateY(${virtualRow.start}px)`
            }}
          >
            <ProjectCard project={items[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 9. 样式设计规范

### 9.1 颜色系统

```css
/* src/styles/variables.css */
:root {
  /* 主色调 */
  --primary: 220 100% 50%;
  --primary-foreground: 0 0% 100%;
  
  /* 次要色调 */
  --secondary: 210 40% 96%;
  --secondary-foreground: 222 47% 11%;
  
  /* 状态色 */
  --success: 142 76% 36%;
  --warning: 38 92% 50%;
  --error: 0 84% 60%;
  --info: 199 89% 48%;
  
  /* 灰度色 */
  --gray-50: 210 40% 98%;
  --gray-100: 214 32% 91%;
  --gray-200: 213 27% 84%;
  --gray-300: 215 20% 65%;
  --gray-400: 215 16% 47%;
  --gray-500: 215 24% 16%;
}
```

### 9.2 间距系统

```css
:root {
  --spacing-xs: 0.25rem;  /* 4px */
  --spacing-sm: 0.5rem;   /* 8px */
  --spacing-md: 1rem;     /* 16px */
  --spacing-lg: 1.5rem;   /* 24px */
  --spacing-xl: 2rem;     /* 32px */
  --spacing-2xl: 3rem;    /* 48px */
}
```

---

## 10. 测试策略

### 10.1 单元测试

```typescript
// __tests__/components/ProjectCard.test.tsx
import { render, screen } from '@testing-library/react';
import { ProjectCard } from '@/components/business/ProjectCard';

describe('ProjectCard', () => {
  it('renders project name correctly', () => {
    const project = {
      id: '1',
      name: 'Test Project',
      status: 'draft',
      progress: 50
    };
    
    render(<ProjectCard project={project} />);
    expect(screen.getByText('Test Project')).toBeInTheDocument();
  });
});
```

### 10.2 E2E 测试

```typescript
// e2e/login.spec.ts
import { test, expect } from '@playwright/test';

test('user can login', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');
  
  await expect(page).toHaveURL('/');
});
```

---

**文档版本**：v1.0  
**最后更新**：2026-03-17  
**负责人**：前端团队
