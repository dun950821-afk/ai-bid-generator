# AI-Bid 功能与接口对照表

## 一、前端页面

| 页面路径 | 页面名称 | 功能描述 | 调用的API |
|---------|---------|---------|----------|
| `/` | 首页/仪表盘 | 项目列表、知识库列表、快速开始入口 | `GET /api/projects`, `GET /api/knowledge-bases` |
| `/projects/[id]` | 项目详情页 | 四步骤流程引导、章节管理、评分项/风险列表 | 多个API（见下方详细） |
| `/projects/[id]/extract` | 招标提取页 | 智能提取招标文档关键信息 | `POST /api/projects/[id]/extract-tender` |
| `/projects/[id]/extraction-management` | 提取管理页 | 提取结果版本管理、人工修正、版本对比 | `GET/POST /api/projects/[id]/extraction-versions` 等 |
| `/projects/[id]/validation` | 校验报告页 | 多维度内容校验报告展示 | `GET/POST /api/projects/[id]/validation` |
| `/knowledge-bases/[id]` | 知识库详情页 | 文档管理、向量化、语义搜索 | `GET /api/knowledge-bases/[id]`, 文档API |
| `/settings` | 系统设置页 | LLM配置、数据库连接配置 | `GET/PUT /api/settings` |

---

## 二、项目模块 API

### 2.1 项目基础管理

| API路径 | 方法 | 功能描述 | 前端调用位置 |
|---------|-----|---------|-------------|
| `/api/projects` | GET | 获取项目列表（支持分页、状态筛选） | 首页项目列表 |
| `/api/projects` | POST | 创建新项目 | 首页"新建项目"按钮 |
| `/api/projects/[id]` | GET | 获取项目详情 | 项目详情页 |
| `/api/projects/[id]` | PATCH | 更新项目信息 | 项目设置 |
| `/api/projects/[id]` | DELETE | 删除项目 | 项目管理 |
| `/api/projects/[id]/dashboard` | GET | 获取项目仪表盘数据 | 项目概览 |

### 2.2 招标文档提取

| API路径 | 方法 | 功能描述 | 前端调用位置 |
|---------|-----|---------|-------------|
| `/api/projects/[id]/extract` | POST | 提取评分项和废标风险（LLM驱动） | 步骤1"上传招标文档" |
| `/api/projects/[id]/extract-tender` | POST | 流式提取招标文档完整Schema（60+字段） | 招标提取页 |
| `/api/projects/[id]/parse-tender` | POST | 解析招标文档基础结构 | 文档解析 |

### 2.3 提取版本管理

| API路径 | 方法 | 功能描述 | 前端调用位置 |
|---------|-----|---------|-------------|
| `/api/projects/[id]/extraction-versions` | GET | 获取提取版本列表 | 提取管理页 |
| `/api/projects/[id]/extraction-versions` | POST | 创建新版本 | 人工修正后保存 |
| `/api/projects/[id]/extraction-modifications` | GET | 获取修改记录 | 版本对比 |
| `/api/projects/[id]/extraction-modifications` | POST | 记录人工修正 | 提取结果编辑 |
| `/api/projects/[id]/extraction-comparison` | GET | 版本对比分析 | 版本对比功能 |

### 2.4 标书大纲生成

| API路径 | 方法 | 功能描述 | 前端调用位置 |
|---------|-----|---------|-------------|
| `/api/projects/[id]/outline` | GET | 获取当前大纲 | 项目详情页"标书大纲"标签 |
| `/api/projects/[id]/outline` | POST | AI生成标书大纲（基于评分项） | 步骤2"生成标书大纲" |
| `/api/projects/[id]/outline` | PUT | 手动更新大纲结构 | 大纲编辑 |

### 2.5 章节内容生成

| API路径 | 方法 | 功能描述 | 前端调用位置 |
|---------|-----|---------|-------------|
| `/api/projects/[id]/sections/[sectionId]/generate` | POST | 流式生成章节内容（评分驱动Prompt） | 步骤3"AI生成内容" |
| `/api/projects/[id]/sections/[sectionId]/content` | GET | 获取章节内容 | 章节查看 |
| `/api/projects/[id]/sections/[sectionId]/content` | PUT | 更新章节内容 | 章节编辑 |

### 2.6 评分项管理

| API路径 | 方法 | 功能描述 | 前端调用位置 |
|---------|-----|---------|-------------|
| `/api/projects/[id]/scoring-items` | GET | 获取评分项列表 | "评分项"标签 |
| `/api/projects/[id]/scoring-items` | GET | 获取覆盖报告（?coverage=true） | 覆盖率统计卡片 |
| `/api/projects/[id]/scoring-items` | PUT | 更新评分项状态 | 响应状态管理 |

### 2.7 废标风险管理

| API路径 | 方法 | 功能描述 | 前端调用位置 |
|---------|-----|---------|-------------|
| `/api/projects/[id]/risks` | GET | 获取废标风险列表 | "废标风险"标签 |
| `/api/projects/[id]/risks` | POST | 创建废标风险 | 风险添加 |
| `/api/projects/[id]/disqualification-risks` | GET | 获取详细风险分析 | 废标风险管理入口 |

### 2.8 内容校验

| API路径 | 方法 | 功能描述 | 前端调用位置 |
|---------|-----|---------|-------------|
| `/api/projects/[id]/validation` | GET | 获取校验报告 | 校验报告页 |
| `/api/projects/[id]/validation` | GET | 获取最新结果（?latest=true） | 步骤4"校验导出" |
| `/api/projects/[id]/validation` | POST | 执行多维度校验（5种类型） | "执行校验"按钮 |
| `/api/projects/[id]/validation` | DELETE | 清除校验历史 | 历史管理 |
| `/api/projects/[id]/validate` | POST | 快速校验（旧接口） | 兼容使用 |

### 2.9 映射矩阵

| API路径 | 方法 | 功能描述 | 前端调用位置 |
|---------|-----|---------|-------------|
| `/api/projects/[id]/mapping-matrix` | GET | 获取映射矩阵 | 高级功能"映射矩阵" |
| `/api/projects/[id]/mapping-matrix` | POST | 创建/更新映射矩阵（支持行业模板） | 映射矩阵创建 |
| `/api/projects/[id]/mapping-matrix` | PUT | 更新映射项 | 映射项编辑 |

### 2.10 导出功能

| API路径 | 方法 | 功能描述 | 前端调用位置 |
|---------|-----|---------|-------------|
| `/api/projects/[id]/export` | POST | 导出标书（支持MD/HTML/DOCX格式） | 步骤4"导出MD/HTML"按钮 |

---

## 三、知识库模块 API

### 3.1 知识库管理

| API路径 | 方法 | 功能描述 | 前端调用位置 |
|---------|-----|---------|-------------|
| `/api/knowledge-bases` | GET | 获取知识库列表 | 首页知识库列表 |
| `/api/knowledge-bases` | POST | 创建知识库 | 首页"新建知识库" |
| `/api/knowledge-bases/[id]` | GET | 获取知识库详情 | 知识库详情页 |
| `/api/knowledge-bases/[id]` | PATCH | 更新知识库 | 知识库设置 |
| `/api/knowledge-bases/[id]` | DELETE | 删除知识库 | 知识库删除 |

### 3.2 文档管理

| API路径 | 方法 | 功能描述 | 前端调用位置 |
|---------|-----|---------|-------------|
| `/api/knowledge-bases/[id]/documents` | GET | 获取文档列表 | 知识库文档列表 |
| `/api/knowledge-bases/[id]/documents` | POST | 上传文档 | 文档上传 |
| `/api/knowledge-bases/[id]/documents/[docId]` | GET | 获取文档详情 | 文档查看 |
| `/api/knowledge-bases/[id]/documents/[docId]` | DELETE | 删除文档 | 文档删除 |
| `/api/knowledge-bases/[id]/documents/[docId]/download` | GET | 下载文档 | 文档下载 |
| `/api/knowledge-bases/[id]/documents/[docId]/reprocess` | POST | 重新处理文档 | 文档重处理 |
| `/api/knowledge-bases/[id]/documents/[docId]/tags` | GET/POST | 文档标签管理 | 文档标签 |

### 3.3 向量化与搜索

| API路径 | 方法 | 功能描述 | 前端调用位置 |
|---------|-----|---------|-------------|
| `/api/knowledge-bases/[id]/vectorize` | POST | 执行向量化 | 向量化按钮 |
| `/api/knowledge-bases/[id]/search` | POST | 语义搜索（混合检索） | 知识库搜索 |
| `/api/knowledge-bases/[id]/search` | GET | 获取相关上下文（用于LLM） | 章节生成时引用 |
| `/api/knowledge-bases/[id]/stats` | GET | 获取知识库统计 | 统计卡片 |

### 3.4 标签管理

| API路径 | 方法 | 功能描述 | 前端调用位置 |
|---------|-----|---------|-------------|
| `/api/knowledge-bases/[id]/tags` | GET | 获取标签列表 | 标签筛选 |
| `/api/knowledge-bases/[id]/tags` | POST | 创建标签 | 标签创建 |
| `/api/knowledge-bases/[id]/tags/[tagId]` | DELETE | 删除标签 | 标签删除 |

---

## 四、系统设置 API

| API路径 | 方法 | 功能描述 | 前端调用位置 |
|---------|-----|---------|-------------|
| `/api/settings` | GET | 获取系统设置 | 设置页面 |
| `/api/settings` | PUT | 更新系统设置 | 保存设置 |
| `/api/settings/test-connection` | POST | 测试数据库连接 | 连接测试 |

---

## 五、通用 API

| API路径 | 方法 | 功能描述 | 前端调用位置 |
|---------|-----|---------|-------------|
| `/api/upload` | POST | 通用文件上传 | 文件上传组件 |
| `/api/search` | GET | 全局搜索 | 全局搜索框 |

---

## 六、核心流程与功能对应

### 流程步骤1：上传招标文档

| 操作 | 调用API | 响应数据 |
|-----|--------|---------|
| 上传文件 | `POST /api/upload` | 文件URL |
| 提取评分项/风险 | `POST /api/projects/[id]/extract` | scoringItems[], risks[] |

### 流程步骤2：生成标书大纲

| 操作 | 调用API | 响应数据 |
|-----|--------|---------|
| 生成大纲 | `POST /api/projects/[id]/outline` | sections[], coverageScore |

### 流程步骤3：AI生成内容

| 操作 | 调用API | 响应数据 |
|-----|--------|---------|
| 单章节生成 | `POST /api/projects/[id]/sections/[sectionId]/generate` | 流式内容 |
| 获取知识库上下文 | `GET /api/knowledge-bases/[id]/search?query=...` | 相关素材 |

### 流程步骤4：校验导出

| 操作 | 调用API | 响应数据 |
|-----|--------|---------|
| 执行校验 | `POST /api/projects/[id]/validation` | 校验报告 |
| 导出MD | `POST /api/projects/[id]/export` | Markdown内容 |
| 导出HTML | `POST /api/projects/[id]/export` | HTML内容 |

---

## 七、数据库表结构

| 表名 | 用途 | 主要字段 |
|-----|-----|---------|
| `projects` | 项目表 | id, name, status, metadata, knowledge_base_id |
| `scoring_items` | 评分项表 | id, project_id, item_name, item_type, max_score, scoring_rules |
| `disqualification_risks` | 废标风险表 | id, project_id, risk_type, severity, response_status |
| `bid_sections` | 标书章节表 | id, project_id, title, content, status |
| `mapping_matrices` | 映射矩阵表 | id, project_id, mapping_items, industry |
| `validation_results` | 校验结果表 | id, project_id, validation_type, score, issues |
| `extraction_versions` | 提取版本表 | id, project_id, extraction_data, is_current |
| `knowledge_bases` | 知识库表 | id, name, type, chunk_count |
| `knowledge_documents` | 知识库文档表 | id, knowledge_base_id, name, vector_status |
| `document_chunks` | 文档分块表 | id, document_id, content, embedding |
| `system_settings` | 系统设置表 | key, value |

---

## 八、功能完整性检查

| 功能模块 | 前端页面 | 后端API | 数据库表 | 状态 |
|---------|---------|--------|---------|-----|
| 项目管理 | ✅ 首页+详情页 | ✅ 完整CRUD | ✅ projects | ✅ 完整 |
| 招标文档提取 | ✅ 详情页+提取页 | ✅ extract/extract-tender | ✅ scoring_items/risks | ✅ 完整 |
| 大纲生成 | ✅ 详情页 | ✅ outline API | ✅ metadata.outline | ✅ 完整 |
| 章节内容生成 | ✅ 详情页 | ✅ sections/generate | ✅ bid_sections | ✅ 完整 |
| 评分项覆盖报告 | ✅ 详情页+校验页 | ✅ scoring-items?coverage | ✅ scoring_items | ✅ 完整 |
| 废标风险管理 | ✅ 详情页 | ✅ risks/disqualification-risks | ✅ disqualification_risks | ✅ 完整 |
| 内容校验 | ✅ 校验报告页 | ✅ validation API | ✅ validation_results | ✅ 完整 |
| 映射矩阵 | ✅ 高级功能入口 | ✅ mapping-matrix API | ✅ mapping_matrices | ✅ 完整 |
| 提取版本管理 | ✅ 提取管理页 | ✅ extraction-versions | ✅ extraction_versions | ✅ 完整 |
| 导出功能 | ✅ 详情页 | ✅ export API | - | ✅ 完整 |
| 知识库管理 | ✅ 知识库详情页 | ✅ 完整CRUD | ✅ knowledge_bases | ✅ 完整 |
| 文档管理 | ✅ 知识库详情页 | ✅ documents API | ✅ knowledge_documents | ✅ 完整 |
| 向量化 | ✅ 知识库详情页 | ✅ vectorize API | ✅ document_chunks | ✅ 完整 |
| 语义搜索 | ✅ 知识库详情页 | ✅ search API | ✅ document_chunks | ✅ 完整 |
| 系统设置 | ✅ 设置页 | ✅ settings API | ✅ system_settings | ✅ 完整 |
