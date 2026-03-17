# 智能标书生成系统 - API 规范设计

## 1. API 设计原则

### 1.1 RESTful 规范

- **资源命名**：使用复数名词，如 `/users`, `/projects`
- **HTTP 方法**：
  - `GET` - 查询资源
  - `POST` - 创建资源
  - `PUT` - 完整更新资源
  - `PATCH` - 部分更新资源
  - `DELETE` - 删除资源
- **状态码**：
  - `200` - 成功
  - `201` - 创建成功
  - `204` - 删除成功（无返回内容）
  - `400` - 请求参数错误
  - `401` - 未认证
  - `403` - 无权限
  - `404` - 资源不存在
  - `422` - 验证失败
  - `500` - 服务器错误

### 1.2 统一响应格式

#### 成功响应

```typescript
interface SuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    hasMore?: boolean;
  };
}
```

#### 错误响应

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}
```

### 1.3 认证方式

**方案**：JWT Bearer Token

```
Authorization: Bearer <token>
```

### 1.4 API 版本控制

**方案**：URL 路径版本（未来扩展）

```
/api/v1/projects
/api/v2/projects
```

---

## 2. 认证与授权 API

### 2.1 用户注册

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "Password123!",
  "name": "张三",
  "department_id": "uuid"
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "张三"
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### 2.2 用户登录

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "Password123!"
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "张三",
      "role": "writer"
    },
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "refresh_token_here"
  }
}
```

### 2.3 刷新令牌

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "refresh_token_here"
}
```

### 2.4 登出

```http
POST /api/auth/logout
Authorization: Bearer <token>
```

### 2.5 获取当前用户信息

```http
GET /api/auth/me
Authorization: Bearer <token>
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "张三",
    "role": "writer",
    "department": {
      "id": "uuid",
      "name": "技术部"
    },
    "permissions": ["project:read:own", "project:write:own"]
  }
}
```

---

## 3. 用户管理 API

### 3.1 获取用户列表

```http
GET /api/users?page=1&limit=20&search=张&department_id=uuid
Authorization: Bearer <token>
```

**响应**：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "email": "user1@example.com",
      "name": "张三",
      "status": "active",
      "department": {
        "id": "uuid",
        "name": "技术部"
      },
      "roles": ["writer"],
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "meta": {
    "total": 50,
    "page": 1,
    "limit": 20,
    "hasMore": true
  }
}
```

### 3.2 获取用户详情

```http
GET /api/users/{id}
Authorization: Bearer <token>
```

### 3.3 创建用户

```http
POST /api/users
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "newuser@example.com",
  "password": "Password123!",
  "name": "李四",
  "department_id": "uuid",
  "role_ids": ["uuid"]
}
```

### 3.4 更新用户

```http
PUT /api/users/{id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "李四",
  "department_id": "uuid",
  "status": "active"
}
```

### 3.5 删除用户

```http
DELETE /api/users/{id}
Authorization: Bearer <token>
```

### 3.6 分配角色

```http
POST /api/users/{id}/roles
Authorization: Bearer <token>
Content-Type: application/json

{
  "role_ids": ["uuid1", "uuid2"]
}
```

---

## 4. 项目管理 API

### 4.1 获取项目列表

```http
GET /api/projects?page=1&limit=20&status=draft&search=项目
Authorization: Bearer <token>
```

**响应**：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "智慧城市建设项目",
      "status": "draft",
      "deadline": "2024-03-01T00:00:00Z",
      "created_at": "2024-01-01T00:00:00Z",
      "creator": {
        "id": "uuid",
        "name": "张三"
      },
      "department": {
        "id": "uuid",
        "name": "技术部"
      },
      "progress": 35.5,
      "total_sections": 20,
      "completed_sections": 7
    }
  ],
  "meta": {
    "total": 15,
    "page": 1,
    "limit": 20,
    "hasMore": false
  }
}
```

### 4.2 获取项目详情

```http
GET /api/projects/{id}
Authorization: Bearer <token>
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "智慧城市建设项目",
    "description": "项目描述",
    "status": "draft",
    "deadline": "2024-03-01T00:00:00Z",
    "budget": 5000000,
    "tags": ["智慧城市", "物联网"],
    "created_at": "2024-01-01T00:00:00Z",
    "creator": {
      "id": "uuid",
      "name": "张三",
      "email": "user@example.com"
    },
    "department": {
      "id": "uuid",
      "name": "技术部"
    },
    "tender_document": {
      "id": "uuid",
      "filename": "招标文件.pdf",
      "file_url": "https://...",
      "status": "parsed"
    },
    "tender_analysis": {
      "project_name": "智慧城市建设项目",
      "budget": 5000000,
      "deadline": "2024-03-01T00:00:00Z",
      "deposit_amount": 100000
    },
    "outline": {
      "id": "uuid",
      "structure": {...}
    }
  }
}
```

### 4.3 创建项目

```http
POST /api/projects
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "智慧城市建设项目",
  "description": "项目描述",
  "deadline": "2024-03-01T00:00:00Z",
  "budget": 5000000,
  "tags": ["智慧城市", "物联网"]
}
```

### 4.4 更新项目

```http
PUT /api/projects/{id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "更新后的项目名称",
  "description": "更新后的描述",
  "status": "review"
}
```

### 4.5 删除项目

```http
DELETE /api/projects/{id}
Authorization: Bearer <token>
```

---

## 5. 招标文档 API

### 5.1 上传招标文档

```http
POST /api/projects/{id}/tender-document
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <file>
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "filename": "招标文件.pdf",
    "file_url": "https://...",
    "file_size": 2048576,
    "status": "uploaded"
  }
}
```

### 5.2 解析招标文档

```http
POST /api/projects/{id}/parse
Authorization: Bearer <token>
```

**响应**：
```json
{
  "success": true,
  "data": {
    "task_id": "parse_xxx",
    "status": "processing"
  }
}
```

### 5.3 获取解析状态

```http
GET /api/projects/{id}/parse/status?task_id=parse_xxx
Authorization: Bearer <token>
```

**响应**：
```json
{
  "success": true,
  "data": {
    "task_id": "parse_xxx",
    "status": "completed",
    "progress": 100,
    "result": {
      "project_name": "智慧城市建设项目",
      "budget": 5000000,
      "deadline": "2024-03-01T00:00:00Z"
    }
  }
}
```

### 5.4 获取解析结果

```http
GET /api/projects/{id}/tender-analysis
Authorization: Bearer <token>
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "project_name": "智慧城市建设项目",
    "project_number": "2024-001",
    "purchaser": "某市政府",
    "budget": 5000000,
    "budget_cap": 5500000,
    "deposit_amount": 100000,
    "bid_deadline": "2024-03-01T17:00:00Z",
    "valid_days": 90,
    "technical_requirements": {
      "性能要求": "系统响应时间不超过2秒",
      "安全要求": "符合等保三级标准"
    },
    "qualification_requirements": {
      "资质要求": [
        "ISO9001认证",
        "CMMI3级以上"
      ]
    },
    "scoring_criteria": {
      "商务部分": {
        "分值": 30,
        "细则": [
          {"项目": "报价合理性", "分值": 15},
          {"项目": "企业资质", "分值": 15}
        ]
      },
      "技术部分": {
        "分值": 50,
        "细则": [
          {"项目": "技术方案", "分值": 30},
          {"项目": "实施方案", "分值": 20}
        ]
      }
    },
    "disqualification_rules": [
      "投标文件逾期送达",
      "投标报价超过预算上限"
    ]
  }
}
```

---

## 6. 标书大纲 API

### 6.1 生成大纲

```http
POST /api/projects/{id}/outline/generate
Authorization: Bearer <token>
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "project_id": "uuid",
    "structure": {
      "sections": [
        {
          "id": "uuid",
          "title": "投标函",
          "order_index": 1,
          "level": 1,
          "requirements": "按照招标文件格式填写",
          "children": []
        },
        {
          "id": "uuid",
          "title": "技术方案",
          "order_index": 2,
          "level": 1,
          "requirements": "详细阐述技术实现方案",
          "children": [
            {
              "id": "uuid",
              "title": "总体架构设计",
              "order_index": 1,
              "level": 2,
              "requirements": "提供系统架构图和说明",
              "children": []
            }
          ]
        }
      ]
    }
  }
}
```

### 6.2 获取大纲

```http
GET /api/projects/{id}/outline
Authorization: Bearer <token>
```

### 6.3 更新大纲结构

```http
PUT /api/projects/{id}/outline
Authorization: Bearer <token>
Content-Type: application/json

{
  "structure": {
    "sections": [...]
  }
}
```

---

## 7. 章节管理 API

### 7.1 获取章节列表

```http
GET /api/projects/{id}/sections
Authorization: Bearer <token>
```

### 7.2 获取章节详情

```http
GET /api/sections/{id}
Authorization: Bearer <token>
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "总体架构设计",
    "order_index": 1,
    "level": 2,
    "requirements": "提供系统架构图和说明",
    "word_count_requirement": 1000,
    "prompt_template": "请根据招标要求编写...",
    "status": "generated",
    "content": {
      "id": "uuid",
      "content": "章节内容...",
      "word_count": 1200,
      "version": 1,
      "sources": [
        {
          "id": "uuid",
          "source_text": "引用的原文内容",
          "knowledge_name": "技术方案模板库",
          "page_number": 5,
          "relevance_score": 0.95
        }
      ]
    }
  }
}
```

### 7.3 更新章节要求

```http
PUT /api/sections/{id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "requirements": "更新后的要求",
  "prompt_template": "自定义提示词",
  "word_count_requirement": 1500
}
```

### 7.4 生成章节内容（流式）

```http
POST /api/sections/{id}/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "force_regenerate": false
}
```

**响应** (SSE 流式)：
```
data: {"content": "本系统采用微服务架构设计", "done": false}

data: {"content": "，整体架构分为三层：", "done": false}

data: {"content": "表现层、业务层和数据层。", "done": false, "sources": [{"id": "uuid", "source_text": "..."}]}

data: {"content": "", "done": true, "usage": {"total_tokens": 150}}
```

### 7.5 批量生成章节

```http
POST /api/projects/{id}/sections/generate-batch
Authorization: Bearer <token>
Content-Type: application/json

{
  "section_ids": ["uuid1", "uuid2", "uuid3"]
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "task_id": "batch_generate_xxx",
    "status": "processing",
    "total": 3,
    "processed": 0
  }
}
```

### 7.6 保存章节内容

```http
PUT /api/sections/{id}/content
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "用户编辑后的内容",
  "sources": [...]
}
```

---

## 8. 知识库管理 API

### 8.1 获取知识库列表

```http
GET /api/knowledge?page=1&limit=20&category=technical&search=技术
Authorization: Bearer <token>
```

**响应**：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "技术方案模板库",
      "description": "包含各类技术方案模板",
      "category": "technical",
      "tags": ["技术", "模板", "方案"],
      "access_level": "department",
      "file_count": 15,
      "chunk_count": 320,
      "status": "active",
      "created_at": "2024-01-01T00:00:00Z",
      "uploader": {
        "id": "uuid",
        "name": "张三"
      }
    }
  ],
  "meta": {
    "total": 25,
    "page": 1,
    "limit": 20,
    "hasMore": true
  }
}
```

### 8.2 获取知识库详情

```http
GET /api/knowledge/{id}
Authorization: Bearer <token>
```

### 8.3 创建知识库

```http
POST /api/knowledge
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "技术方案模板库",
  "description": "包含各类技术方案模板",
  "category": "technical",
  "tags": ["技术", "模板"],
  "access_level": "department"
}
```

### 8.4 更新知识库

```http
PUT /api/knowledge/{id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "更新后的名称",
  "description": "更新后的描述",
  "tags": ["新标签"]
}
```

### 8.5 删除知识库

```http
DELETE /api/knowledge/{id}
Authorization: Bearer <token>
```

### 8.6 上传文件到知识库

```http
POST /api/knowledge/{id}/files
Authorization: Bearer <token>
Content-Type: multipart/form-data

files: <file1>
files: <file2>
```

**响应**：
```json
{
  "success": true,
  "data": {
    "uploaded": [
      {
        "id": "uuid",
        "filename": "技术方案.docx",
        "file_size": 1024000,
        "status": "uploaded"
      }
    ],
    "failed": []
  }
}
```

### 8.7 解析知识库文件

```http
POST /api/knowledge/{id}/files/{fileId}/parse
Authorization: Bearer <token>
```

### 8.8 获取知识库文件列表

```http
GET /api/knowledge/{id}/files
Authorization: Bearer <token>
```

### 8.9 搜索知识库

```http
POST /api/knowledge/search
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": "系统架构设计",
  "top_k": 10,
  "filters": {
    "category": "technical"
  }
}
```

**响应**：
```json
{
  "success": true,
  "data": [
    {
      "chunk_id": "uuid",
      "knowledge_id": "uuid",
      "knowledge_name": "技术方案模板库",
      "file_id": "uuid",
      "filename": "系统架构设计指南.pdf",
      "content": "系统架构设计应遵循...",
      "page_number": 5,
      "score": 0.95,
      "metadata": {
        "title": "系统架构设计",
        "tags": ["架构", "设计"]
      }
    }
  ]
}
```

---

## 9. 导出 API

### 9.1 导出标书

```http
POST /api/projects/{id}/export
Authorization: Bearer <token>
Content-Type: application/json

{
  "format": "word",
  "include_toc": true,
  "include_sources": false
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "task_id": "export_xxx",
    "status": "processing"
  }
}
```

### 9.2 获取导出状态

```http
GET /api/projects/{id}/export/status?task_id=export_xxx
Authorization: Bearer <token>
```

**响应**：
```json
{
  "success": true,
  "data": {
    "task_id": "export_xxx",
    "status": "completed",
    "progress": 100,
    "result": {
      "download_url": "https://...",
      "filename": "智慧城市建设项目_投标文件_20240301.docx",
      "file_size": 2048576,
      "expires_at": "2024-03-02T00:00:00Z"
    }
  }
}
```

---

## 10. 文件上传 API

### 10.1 获取预签名上传URL

```http
POST /api/upload/presigned-url
Authorization: Bearer <token>
Content-Type: application/json

{
  "filename": "招标文件.pdf",
  "file_type": "application/pdf",
  "bucket": "tenders",
  "metadata": {
    "project_id": "uuid"
  }
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "upload_url": "https://s3.amazonaws.com/...",
    "file_key": "tenders/project_xxx/file_yyy.pdf",
    "expires_in": 3600
  }
}
```

### 10.2 确认文件上传完成

```http
POST /api/upload/confirm
Authorization: Bearer <token>
Content-Type: application/json

{
  "file_key": "tenders/project_xxx/file_yyy.pdf"
}
```

---

## 11. 任务管理 API

### 11.1 获取任务状态

```http
GET /api/tasks/{task_id}
Authorization: Bearer <token>
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "task_type": "parse_document",
    "task_key": "parse_xxx",
    "status": "completed",
    "progress": 100,
    "output_data": {...},
    "started_at": "2024-01-01T00:00:00Z",
    "completed_at": "2024-01-01T00:05:00Z"
  }
}
```

### 11.2 取消任务

```http
POST /api/tasks/{task_id}/cancel
Authorization: Bearer <token>
```

---

## 12. 统计分析 API

### 12.1 获取项目统计

```http
GET /api/statistics/projects
Authorization: Bearer <token>
```

**响应**：
```json
{
  "success": true,
  "data": {
    "total": 50,
    "by_status": {
      "draft": 10,
      "parsing": 5,
      "generating": 15,
      "review": 10,
      "final": 10
    },
    "by_month": [
      {"month": "2024-01", "count": 15},
      {"month": "2024-02", "count": 20}
    ]
  }
}
```

### 12.2 获取知识库统计

```http
GET /api/statistics/knowledge
Authorization: Bearer <token>
```

---

## 13. 错误码定义

### 13.1 通用错误码

| 错误码 | 说明 |
|--------|------|
| `INVALID_REQUEST` | 请求参数错误 |
| `UNAUTHORIZED` | 未认证 |
| `FORBIDDEN` | 无权限 |
| `NOT_FOUND` | 资源不存在 |
| `VALIDATION_ERROR` | 数据验证失败 |
| `INTERNAL_ERROR` | 服务器内部错误 |

### 13.2 业务错误码

| 错误码 | 说明 |
|--------|------|
| `USER_EXISTS` | 用户已存在 |
| `INVALID_CREDENTIALS` | 用户名或密码错误 |
| `PROJECT_NOT_FOUND` | 项目不存在 |
| `DOCUMENT_PARSE_FAILED` | 文档解析失败 |
| `GENERATION_FAILED` | 内容生成失败 |
| `INSUFFICIENT_PERMISSIONS` | 权限不足 |
| `KNOWLEDGE_NOT_FOUND` | 知识库不存在 |
| `SECTION_NOT_FOUND` | 章节不存在 |

---

## 14. WebSocket API

### 14.1 连接地址

```
wss://domain.com/ws?token=<jwt_token>
```

### 14.2 事件类型

#### 客户端发送事件

```json
// 加入项目房间
{
  "event": "join-project",
  "data": {
    "project_id": "uuid"
  }
}

// 章节内容更新
{
  "event": "section-update",
  "data": {
    "project_id": "uuid",
    "section_id": "uuid",
    "content": "更新后的内容"
  }
}
```

#### 服务端推送事件

```json
// 任务状态更新
{
  "event": "task-update",
  "data": {
    "task_id": "uuid",
    "status": "completed",
    "progress": 100
  }
}

// 章节内容同步
{
  "event": "section-sync",
  "data": {
    "section_id": "uuid",
    "user_id": "uuid",
    "content": "内容"
  }
}
```

---

## 15. API 限流策略

### 15.1 限流规则

| API 类型 | 限流规则 |
|----------|----------|
| 认证 API | 10 次/分钟 |
| 普通查询 API | 100 次/分钟 |
| 文件上传 API | 10 次/分钟 |
| AI 生成 API | 20 次/分钟 |

### 15.2 限流响应

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "请求过于频繁，请稍后再试",
    "details": {
      "retry_after": 60
    }
  }
}
```

---

## 16. API 文档生成

使用 Swagger/OpenAPI 自动生成文档：

```typescript
// swagger.ts
export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: '智能标书生成系统 API',
    version: '1.0.0',
    description: 'AI-Bid 系统后端 API 文档'
  },
  servers: [
    { url: '/api' }
  ],
  paths: {
    '/projects': {
      get: {
        summary: '获取项目列表',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } }
        ],
        responses: {
          '200': {
            description: '成功',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProjectListResponse' }
              }
            }
          }
        }
      }
    }
  }
};
```

---

**文档版本**：v1.0  
**最后更新**：2026-03-17  
**负责人**：API 设计团队
