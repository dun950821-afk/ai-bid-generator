# 智能标书生成系统 - 数据模型设计

## 1. 数据库选型

**主数据库**：PostgreSQL 15+ (Supabase)
**理由**：
- 强大的 JSONB 支持（存储动态字段）
- Row Level Security (RLS) 原生支持
- 丰富的索引类型（B-Tree, GIN, GiST）
- 事务支持完善
- 开源且社区活跃

**辅助存储**：
- Redis：缓存、会话、消息队列
- S3：文件存储
- 向量数据库：RAG 向量存储

---

## 2. 实体关系图 (ER Diagram)

```
┌─────────────────┐
│   departments   │
│─────────────────│
│ PK id           │
│    name         │
│ FK parent_id    │──┐
│    created_at   │  │
└─────────────────┘  │
         ▲           │
         │           │
         └───────────┘
              (自关联)

┌─────────────────┐         ┌─────────────────┐
│     users       │         │      roles      │
│─────────────────│         │─────────────────│
│ PK id           │         │ PK id           │
│    email        │         │    name         │
│    name         │         │    permissions  │
│ FK department_id│──┐      │    created_at   │
│    status       │  │      └─────────────────┘
│    created_at   │  │               │
└─────────────────┘  │               │
         │           │               │
         │           │               │
         └───────────┘               │
              (多对一)                │
                                     │
         ┌───────────────────────────┘
         │ (多对多)
         │
┌─────────────────┐
│  user_roles     │
│─────────────────│
│ FK user_id      │
│ FK role_id      │
│    assigned_at  │
└─────────────────┘

┌─────────────────┐         ┌─────────────────┐
│   projects      │         │    knowledge    │
│─────────────────│         │─────────────────│
│ PK id           │         │ PK id           │
│    name         │         │    name         │
│ FK created_by   │──┐      │    category     │
│    status       │  │      │    tags         │
│    deadline     │  │      │ FK uploaded_by  │──┐
│    created_at   │  │      │ FK department_id│  │
└─────────────────┘  │      │    access_level │  │
         │           │      │    status       │  │
         │           │      └─────────────────┘  │
         │           │               │           │
         │           │               │           │
         │           └───────────────┼───────────┘
         │                   (用户关联)
         │
         │
┌─────────────────┐         ┌─────────────────┐
│ tender_documents│         │ knowledge_files │
│─────────────────│         │─────────────────│
│ PK id           │         │ PK id           │
│ FK project_id   │──┐      │ FK knowledge_id │──┐
│    file_url     │  │      │    file_url     │  │
│    file_type    │  │      │    file_type    │  │
│    status       │  │      │    parsed       │  │
│    created_at   │  │      │    created_at   │  │
└─────────────────┘  │      └─────────────────┘  │
         │           │               │           │
         │           │               │           │
         │           │               │           │
         │           │               │           │
         │           │               │           │
┌─────────────────┐  │      ┌─────────────────┐  │
│tender_analysis  │  │      │ knowledge_chunks│  │
│─────────────────│  │      │─────────────────│  │
│ PK id           │  │      │ PK id           │  │
│ FK document_id  │──┘      │ FK file_id      │──┘
│    project_name │         │    chunk_index  │
│    budget       │         │    content      │
│    deadline     │         │    embedding_id │
│    requirements │         │    metadata     │
│    scoring      │         │    created_at   │
│    created_at   │         └─────────────────┘
└─────────────────┘
         │
         │
┌─────────────────┐
│  bid_outlines   │
│─────────────────│
│ PK id           │
│ FK project_id   │
│    structure    │
│    created_at   │
└─────────────────┘
         │
         │
┌─────────────────┐
│  bid_sections   │
│─────────────────│
│ PK id           │
│ FK outline_id   │
│ FK parent_id    │──┐
│    title        │  │
│    order_index  │  │
│    requirements │  │
│    prompt       │  │
│    status       │  │
└─────────────────┘  │
         ▲           │
         │           │
         └───────────┘
              (树形结构)
         │
         │
┌─────────────────┐         ┌─────────────────┐
│section_contents │         │ content_sources │
│─────────────────│         │─────────────────│
│ PK id           │         │ PK id           │
│ FK section_id   │──┐      │ FK content_id   │──┐
│    content      │  │      │ FK chunk_id     │  │
│    version      │  │      │    source_text  │  │
│ FK created_by   │  │      │    page_number  │  │
│    created_at   │  │      │    relevance    │  │
└─────────────────┘  │      └─────────────────┘  │
         │           │               │           │
         │           │               │           │
         │           │               │           │
         └───────────┼───────────────┘           │
                     │ (一对多)                   │
                     │                           │
                     └───────────────────────────┘
                          (引用溯源)
```

---

## 3. 数据表详细设计

### 3.1 用户与权限模块

#### 3.1.1 部门表 (departments)

```sql
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  parent_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_department_name UNIQUE (name, parent_id)
);

-- 索引
CREATE INDEX idx_departments_parent ON departments(parent_id);
CREATE INDEX idx_departments_name ON departments(name);

-- 注释
COMMENT ON TABLE departments IS '部门组织架构表';
COMMENT ON COLUMN departments.parent_id IS '上级部门ID，NULL表示顶级部门';
```

#### 3.1.2 用户表 (users)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  avatar_url TEXT,
  phone VARCHAR(20),
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- 索引
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_created ON users(created_at DESC);

-- 注释
COMMENT ON TABLE users IS '用户基本信息表';
COMMENT ON COLUMN users.status IS '用户状态：active-激活, inactive-未激活, suspended-已停用';
```

#### 3.1.3 角色表 (roles)

```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]',
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 预置系统角色
INSERT INTO roles (name, display_name, description, permissions, is_system) VALUES
('admin', '超级管理员', '系统最高权限', '["*"]', TRUE),
('manager', '部门主管', '管理部门项目和人员', '["project:read:department", "project:write:department", "user:read:department", "knowledge:read:department"]', TRUE),
('writer', '标书专员', '负责标书编写', '["project:read:own", "project:write:own", "knowledge:read:public"]', TRUE),
('knowledge_admin', '知识库管理员', '管理企业知识库', '["knowledge:*", "project:read:own"]', TRUE);

-- 索引
CREATE INDEX idx_roles_name ON roles(name);

-- 注释
COMMENT ON TABLE roles IS '角色定义表';
COMMENT ON COLUMN roles.permissions IS '权限列表，JSON数组格式';
COMMENT ON COLUMN roles.is_system IS '是否系统内置角色，内置角色不可删除';
```

#### 3.1.4 用户角色关联表 (user_roles)

```sql
CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  PRIMARY KEY (user_id, role_id)
);

-- 索引
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

-- 注释
COMMENT ON TABLE user_roles IS '用户-角色关联表';
```

### 3.2 知识库模块

#### 3.2.1 知识库主表 (knowledge_base)

```sql
CREATE TABLE knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL CHECK (category IN ('qualification', 'technical', 'history', 'template', 'other')),
  tags TEXT[] DEFAULT '{}',
  uploaded_by UUID NOT NULL REFERENCES users(id),
  department_id UUID REFERENCES departments(id),
  access_level VARCHAR(20) DEFAULT 'department' CHECK (access_level IN ('public', 'department', 'private')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  file_count INT DEFAULT 0,
  chunk_count INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_knowledge_category ON knowledge_base(category);
CREATE INDEX idx_knowledge_uploaded_by ON knowledge_base(uploaded_by);
CREATE INDEX idx_knowledge_department ON knowledge_base(department_id);
CREATE INDEX idx_knowledge_status ON knowledge_base(status);
CREATE INDEX idx_knowledge_tags ON knowledge_base USING GIN(tags);
CREATE INDEX idx_knowledge_created ON knowledge_base(created_at DESC);

-- 注释
COMMENT ON TABLE knowledge_base IS '知识库主表';
COMMENT ON COLUMN knowledge_base.category IS '知识分类：qualification-资质证书, technical-技术方案, history-历史标书, template-模板, other-其他';
COMMENT ON COLUMN knowledge_base.access_level IS '访问权限：public-公开, department-部门可见, private-仅自己可见';
```

#### 3.2.2 知识库文件表 (knowledge_files)

```sql
CREATE TABLE knowledge_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(20) NOT NULL,
  file_size BIGINT NOT NULL,
  parsed BOOLEAN DEFAULT FALSE,
  parse_status VARCHAR(20) CHECK (parse_status IN ('pending', 'processing', 'completed', 'failed')),
  parse_error TEXT,
  chunk_count INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_knowledge_files_knowledge ON knowledge_files(knowledge_id);
CREATE INDEX idx_knowledge_files_parsed ON knowledge_files(parsed);
CREATE INDEX idx_knowledge_files_type ON knowledge_files(file_type);

-- 注释
COMMENT ON TABLE knowledge_files IS '知识库文件表';
COMMENT ON COLUMN knowledge_files.metadata IS '文件元数据，如：作者、创建时间、页数等';
```

#### 3.2.3 知识库文档分块表 (knowledge_chunks)

```sql
CREATE TABLE knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES knowledge_files(id) ON DELETE CASCADE,
  knowledge_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding_id TEXT, -- 向量数据库中的ID
  page_number INT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_chunk UNIQUE (file_id, chunk_index)
);

-- 索引
CREATE INDEX idx_knowledge_chunks_file ON knowledge_chunks(file_id);
CREATE INDEX idx_knowledge_chunks_knowledge ON knowledge_chunks(knowledge_id);
CREATE INDEX idx_knowledge_chunks_embedding ON knowledge_chunks(embedding_id);

-- 全文搜索索引
CREATE INDEX idx_knowledge_chunks_content ON knowledge_chunks USING GIN(to_tsvector('chinese', content));

-- 注释
COMMENT ON TABLE knowledge_chunks IS '知识库文档分块表';
COMMENT ON COLUMN knowledge_chunks.embedding_id IS '向量数据库中的向量ID';
COMMENT ON COLUMN knowledge_chunks.metadata IS '分块元数据，如：标题、位置、标签等';
```

### 3.3 项目管理模块

#### 3.3.1 项目表 (projects)

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  department_id UUID REFERENCES departments(id),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'parsing', 'generating', 'review', 'final', 'archived')),
  deadline TIMESTAMP WITH TIME ZONE,
  budget DECIMAL(15, 2),
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_projects_created_by ON projects(created_by);
CREATE INDEX idx_projects_department ON projects(department_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_deadline ON projects(deadline);
CREATE INDEX idx_projects_created ON projects(created_at DESC);
CREATE INDEX idx_projects_tags ON projects USING GIN(tags);

-- 注释
COMMENT ON TABLE projects IS '投标项目表';
COMMENT ON COLUMN projects.status IS '项目状态：draft-草稿, parsing-解析中, generating-生成中, review-审核中, final-已定稿, archived-已归档';
```

#### 3.3.2 招标文档表 (tender_documents)

```sql
CREATE TABLE tender_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(20) NOT NULL,
  file_size BIGINT NOT NULL,
  status VARCHAR(20) DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'parsing', 'parsed', 'failed')),
  parse_task_id VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_tender_documents_project ON tender_documents(project_id);
CREATE INDEX idx_tender_documents_status ON tender_documents(status);

-- 注释
COMMENT ON TABLE tender_documents IS '招标文件表';
```

#### 3.3.3 招标文档解析结果表 (tender_analysis)

```sql
CREATE TABLE tender_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES tender_documents(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- 基本信息
  project_name VARCHAR(200),
  project_number VARCHAR(100),
  purchaser VARCHAR(200),
  purchaser_contact VARCHAR(100),
  
  -- 财务信息
  budget DECIMAL(15, 2),
  budget_cap DECIMAL(15, 2),
  deposit_amount DECIMAL(15, 2),
  
  -- 时间信息
  bid_deadline TIMESTAMP WITH TIME ZONE,
  open_bid_time TIMESTAMP WITH TIME ZONE,
  valid_days INT,
  
  -- 技术要求
  technical_requirements JSONB DEFAULT '{}',
  qualification_requirements JSONB DEFAULT '{}',
  
  -- 评分标准
  scoring_criteria JSONB DEFAULT '{}',
  
  -- 废标条款
  disqualification_rules JSONB DEFAULT '[]',
  
  -- 文档结构
  document_structure JSONB DEFAULT '{}',
  
  -- 其他信息
  special_requirements TEXT,
  
  -- 解析状态
  parse_status VARCHAR(20) DEFAULT 'pending',
  parse_error TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_tender_analysis_document ON tender_analysis(document_id);
CREATE INDEX idx_tender_analysis_project ON tender_analysis(project_id);

-- 注释
COMMENT ON TABLE tender_analysis IS '招标文件解析结果表';
COMMENT ON COLUMN tender_analysis.technical_requirements IS '技术要求，JSON格式：{"key": "value"}';
COMMENT ON COLUMN tender_analysis.scoring_criteria IS '评分标准，JSON格式：{"商务": {"分值": 30, "细则": []}}';
```

### 3.4 标书生成模块

#### 3.4.1 标书大纲表 (bid_outlines)

```sql
CREATE TABLE bid_outlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  structure JSONB NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_bid_outlines_project ON bid_outlines(project_id);

-- 注释
COMMENT ON TABLE bid_outlines IS '标书大纲表';
COMMENT ON COLUMN bid_outlines.structure IS '大纲结构，JSON格式：{"sections": [{"id": "xxx", "title": "xxx", "children": []}]}';
```

#### 3.4.2 标书章节表 (bid_sections)

```sql
CREATE TABLE bid_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outline_id UUID NOT NULL REFERENCES bid_outlines(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES bid_sections(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  title VARCHAR(200) NOT NULL,
  order_index INT NOT NULL,
  level INT DEFAULT 1,
  
  -- 章节要求
  requirements TEXT,
  word_count_requirement INT,
  prompt_template TEXT,
  
  -- 生成状态
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'generated', 'reviewed', 'finalized')),
  
  -- 元数据
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_section_order UNIQUE (outline_id, order_index)
);

-- 索引
CREATE INDEX idx_bid_sections_outline ON bid_sections(outline_id);
CREATE INDEX idx_bid_sections_parent ON bid_sections(parent_id);
CREATE INDEX idx_bid_sections_project ON bid_sections(project_id);
CREATE INDEX idx_bid_sections_status ON bid_sections(status);

-- 注释
COMMENT ON TABLE bid_sections IS '标书章节表';
COMMENT ON COLUMN bid_sections.level IS '章节层级：1-一级标题, 2-二级标题, ...';
COMMENT ON COLUMN bid_sections.status IS '章节状态：pending-待生成, generating-生成中, generated-已生成, reviewed-已审核, finalized-已定稿';
```

#### 3.4.3 章节内容表 (section_contents)

```sql
CREATE TABLE section_contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES bid_sections(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  word_count INT DEFAULT 0,
  version INT DEFAULT 1,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_section_version UNIQUE (section_id, version)
);

-- 索引
CREATE INDEX idx_section_contents_section ON section_contents(section_id);
CREATE INDEX idx_section_contents_created ON section_contents(created_at DESC);

-- 注释
COMMENT ON TABLE section_contents IS '章节内容表，支持版本控制';
```

#### 3.4.4 内容引用来源表 (content_sources)

```sql
CREATE TABLE content_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES section_contents(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES knowledge_chunks(id),
  
  source_text TEXT NOT NULL,
  page_number INT,
  relevance_score DECIMAL(3, 2),
  
  -- 引用位置
  start_offset INT,
  end_offset INT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_content_sources_content ON content_sources(content_id);
CREATE INDEX idx_content_sources_chunk ON content_sources(chunk_id);

-- 注释
COMMENT ON TABLE content_sources IS '内容引用来源表，用于引用溯源';
COMMENT ON COLUMN content_sources.relevance_score IS '相关性得分，范围 0.00-1.00';
```

### 3.5 任务与日志模块

#### 3.5.1 异步任务表 (async_tasks)

```sql
CREATE TABLE async_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type VARCHAR(50) NOT NULL,
  task_key VARCHAR(100) UNIQUE,
  
  -- 关联资源
  resource_type VARCHAR(50),
  resource_id UUID,
  
  -- 任务状态
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  
  -- 任务数据
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  
  -- 执行信息
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- 重试信息
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  
  -- 用户信息
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_async_tasks_type ON async_tasks(task_type);
CREATE INDEX idx_async_tasks_status ON async_tasks(status);
CREATE INDEX idx_async_tasks_resource ON async_tasks(resource_type, resource_id);
CREATE INDEX idx_async_tasks_key ON async_tasks(task_key);
CREATE INDEX idx_async_tasks_created ON async_tasks(created_at DESC);

-- 注释
COMMENT ON TABLE async_tasks IS '异步任务表，用于追踪长时间运行的任务';
COMMENT ON COLUMN async_tasks.task_type IS '任务类型：parse_document, generate_section, export_bid等';
COMMENT ON COLUMN async_tasks.task_key IS '任务唯一标识，用于幂等性检查';
```

#### 3.5.2 操作审计日志表 (audit_logs)

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  
  -- 操作信息
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  
  -- 请求信息
  method VARCHAR(10),
  path TEXT,
  ip_address INET,
  user_agent TEXT,
  
  -- 变更数据
  old_value JSONB,
  new_value JSONB,
  
  -- 执行结果
  status VARCHAR(20) CHECK (status IN ('success', 'failure')),
  error_message TEXT,
  
  -- 性能指标
  duration_ms INT,
  response_size INT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- 注释
COMMENT ON TABLE audit_logs IS '操作审计日志表';
COMMENT ON COLUMN audit_logs.action IS '操作类型，如：user.login, project.create, section.generate等';
```

---

## 4. 数据视图设计

### 4.1 项目概览视图

```sql
CREATE VIEW project_overview AS
SELECT 
  p.id,
  p.name,
  p.status,
  p.deadline,
  p.created_at,
  u.name AS creator_name,
  d.name AS department_name,
  td.filename AS tender_document,
  ta.project_name AS tender_project_name,
  ta.budget AS tender_budget,
  bo.id AS outline_id,
  COUNT(bs.id) AS total_sections,
  COUNT(CASE WHEN bs.status = 'finalized' THEN 1 END) AS completed_sections,
  ROUND(COUNT(CASE WHEN bs.status = 'finalized' THEN 1 END)::NUMERIC / NULLIF(COUNT(bs.id), 0) * 100, 2) AS progress
FROM projects p
LEFT JOIN users u ON p.created_by = u.id
LEFT JOIN departments d ON p.department_id = d.id
LEFT JOIN tender_documents td ON p.id = td.project_id
LEFT JOIN tender_analysis ta ON td.id = ta.document_id
LEFT JOIN bid_outlines bo ON p.id = bo.project_id
LEFT JOIN bid_sections bs ON bo.id = bs.outline_id
GROUP BY p.id, u.name, d.name, td.filename, ta.project_name, ta.budget, bo.id;
```

### 4.2 知识库统计视图

```sql
CREATE VIEW knowledge_statistics AS
SELECT 
  kb.id,
  kb.name,
  kb.category,
  kb.status,
  u.name AS uploader_name,
  d.name AS department_name,
  COUNT(kf.id) AS file_count,
  SUM(kf.file_size) AS total_size,
  SUM(kf.chunk_count) AS chunk_count,
  kb.created_at
FROM knowledge_base kb
LEFT JOIN users u ON kb.uploaded_by = u.id
LEFT JOIN departments d ON kb.department_id = d.id
LEFT JOIN knowledge_files kf ON kb.id = kf.knowledge_id
GROUP BY kb.id, u.name, d.name;
```

---

## 5. 数据约束与触发器

### 5.1 自动更新 updated_at

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 应用到所有需要的表
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ... 其他表类似
```

### 5.2 级联更新统计字段

```sql
CREATE OR REPLACE FUNCTION update_knowledge_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE knowledge_base kb
  SET 
    file_count = (SELECT COUNT(*) FROM knowledge_files WHERE knowledge_id = kb.id),
    chunk_count = (SELECT COALESCE(SUM(chunk_count), 0) FROM knowledge_files WHERE knowledge_id = kb.id)
  WHERE id = COALESCE(NEW.knowledge_id, OLD.knowledge_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_knowledge_stats
AFTER INSERT OR UPDATE OR DELETE ON knowledge_files
  FOR EACH ROW EXECUTE FUNCTION update_knowledge_stats();
```

### 5.3 审计日志自动记录

```sql
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    old_value,
    new_value
  ) VALUES (
    current_user_id(), -- 自定义函数获取当前用户
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 应用到关键表
CREATE TRIGGER projects_audit
AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER sections_audit
AFTER INSERT OR UPDATE OR DELETE ON bid_sections
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();
```

---

## 6. Row Level Security (RLS) 策略

### 6.1 启用 RLS

```sql
-- 启用所有关键表的 RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_sections ENABLE ROW LEVEL SECURITY;
```

### 6.2 项目访问策略

```sql
CREATE POLICY projects_isolation ON projects
  USING (
    -- 超级管理员可看所有
    current_user_role() = 'admin' OR
    -- 部门主管可看本部门
    (current_user_role() = 'manager' AND department_id = current_user_department()) OR
    -- 普通用户只看自己的
    created_by = current_user_id()
  );

CREATE POLICY projects_modification ON projects
  USING (
    current_user_role() = 'admin' OR
    created_by = current_user_id()
  )
  WITH CHECK (
    current_user_role() = 'admin' OR
    created_by = current_user_id()
  );
```

### 6.3 知识库访问策略

```sql
CREATE POLICY knowledge_isolation ON knowledge_base
  USING (
    -- 公开知识库所有人可见
    access_level = 'public' OR
    -- 部门知识库本部门可见
    (access_level = 'department' AND department_id = current_user_department()) OR
    -- 私有知识库仅创建者可见
    (access_level = 'private' AND uploaded_by = current_user_id()) OR
    -- 管理员可见所有
    current_user_role() = 'admin' OR
    current_user_role() = 'knowledge_admin'
  );
```

---

## 7. 数据迁移策略

### 7.1 初始化脚本

```sql
-- 001_initial_schema.sql
-- 创建所有表结构

-- 002_seed_data.sql
-- 插入初始数据（角色、系统配置等）

-- 003_enable_rls.sql
-- 启用 RLS 策略
```

### 7.2 迁移版本控制

使用 Prisma Migrate 进行版本控制：

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// 执行迁移
// npx prisma migrate dev --name init
// npx prisma migrate deploy
```

---

## 8. 性能优化建议

### 8.1 索引策略

- **高频查询字段**：添加 B-Tree 索引
- **JSONB 字段**：添加 GIN 索引
- **全文搜索**：添加全文搜索索引
- **组合索引**：根据查询模式创建

### 8.2 分区策略

对于数据量大的表（如审计日志），按时间分区：

```sql
CREATE TABLE audit_logs_2024_q1 PARTITION OF audit_logs
  FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');

CREATE TABLE audit_logs_2024_q2 PARTITION OF audit_logs
  FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');
```

### 8.3 归档策略

定期归档历史数据：

```sql
-- 归档 6 个月前的审计日志
INSERT INTO audit_logs_archive
SELECT * FROM audit_logs
WHERE created_at < NOW() - INTERVAL '6 months';

DELETE FROM audit_logs
WHERE created_at < NOW() - INTERVAL '6 months';
```

---

**文档版本**：v1.0  
**最后更新**：2026-03-17  
**负责人**：数据架构团队
