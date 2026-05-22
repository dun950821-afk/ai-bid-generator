# 项目管理完整功能设计文档

> **版本：** 1.0
> **日期：** 2026-05-22
> **状态：** 待评审

---

## 1. 概述

### 1.1 背景

当前系统已完成 Phase 1-3（项目骨架、认证权限、前端基础+MinIO上传），项目模型仅为最小桩。需要实现完整的项目管理功能，支撑投标项目全生命周期管理。

### 1.2 目标

- 项目全生命周期管理：创建 → 上传招标文件 → 解析 → 生成标书 → 导出 → 归档
- 可配置状态机：支持不同类型项目的流程定制
- 自定义项目角色：企业可定义角色并配置权限
- 标段工作流：标段级流程执行与审批

### 1.3 核心设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 项目创建 | 用户自助创建 | 有 `project.create` 权限即可创建，自动成为 owner |
| 流程模板 | 模板库选择 | 系统预设多套模板，项目创建时深拷贝为私有模板 |
| 项目角色 | 角色可自定义 | 企业可定义新角色，配置权限集合 |
| 标段创建 | 混合模式 | 解析时自动识别 + 用户手动添加 |
| 项目列表 | 卡片视图 | 支持看板切换、拖拽流转 |

---

## 2. 数据模型设计

### 2.1 流程模板层

#### WorkflowTemplate（流程模板）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | 主键 |
| name | CharField(255) | 模板名称 |
| description | TextField | 模板描述 |
| scope | CharField(16) | system / project |
| project | FK → Project | 项目级模板时关联（系统级为空） |
| is_active | BooleanField | 是否启用 |
| is_builtin | BooleanField | 是否内置模板（不可删除） |
| created_by | FK → User | 创建人 |
| created_at / updated_at | DateTimeField | 时间戳 |

**约束：**
- `scope="system"` 的模板，`is_builtin=True` 的不可删除
- 系统级模板不允许设置具体 user 作为负责人/审批人

#### WorkflowNodeTemplate（节点模板）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | 主键 |
| workflow_template | FK → WorkflowTemplate | 所属模板 |
| name | CharField(255) | 节点名称 |
| order | IntegerField | 排序序号 |
| default_assignee_type | CharField(16) | role / user |
| default_assignee_role | CharField(64) | 默认角色 code（不存 FK） |
| default_assignee_user | FK → User | 默认负责人（仅项目模板可用） |
| requires_approval | BooleanField | 是否需要审批 |
| approver_type | CharField(16) | role / user |
| approver_role | CharField(64) | 审批角色 code |
| approver_user | FK → User | 审批人（仅项目模板可用） |
| estimated_hours | FloatField | 预估工时 |
| description | TextField | 节点说明 |

**关键设计：**
- `default_assignee_role` 和 `approver_role` 存储 role code（字符串），不存 FK ID
- 原因：系统模板跨项目，无法关联具体项目角色 ID

### 2.2 标段扩展

#### Lot 扩展字段

| 字段 | 类型 | 说明 |
|------|------|------|
| workflow | OneToOne → LotWorkflow | 流程实例 |
| workflow_status | CharField(16) | not_started / in_progress / completed / archived |

**权限策略：** 标段级不引入独立成员表，节点指派复用 ProjectMember 角色。鉴权走现有双层模型（global + project）。

### 2.3 流程实例层

#### LotWorkflow（标段流程实例）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | 主键 |
| lot | OneToOne → Lot | 关联标段 |
| workflow_template | FK → WorkflowTemplate | 使用的模板 |
| status | CharField(16) | not_started / in_progress / completed / archived |
| started_at | DateTimeField | 开始时间 |
| completed_at | DateTimeField | 完成时间 |
| created_at / updated_at | DateTimeField | 时间戳 |

#### WorkflowNodeInstance（节点实例）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | 主键 |
| lot_workflow | FK → LotWorkflow | 所属流程实例 |
| node_template | FK → WorkflowNodeTemplate | 关联节点模板 |
| name | CharField(255) | 节点名称（快照） |
| requires_approval | BooleanField | 是否需要审批（快照） |
| order | IntegerField | 排序序号（快照） |
| status | CharField(16) | pending / in_progress / completed / failed / skipped |
| assignee_type | CharField(16) | role / user |
| assignee_role | CharField(64) | 项目角色 code |
| assignee_user | FK → User | 负责人 |
| started_at | DateTimeField | 开始时间 |
| completed_at | DateTimeField | 完成时间 |
| failed_at | DateTimeField | 失败时间 |
| failure_reason | TextField | 失败原因 |
| approval_status | CharField(16) | not_required / pending / approved / rejected |
| approved_by | FK → User | 审批人 |
| approved_at | DateTimeField | 审批时间 |
| approval_comment | TextField | 审批意见 |

**快照机制：** 节点实例创建时，从模板拷贝 `name`、`requires_approval`、`order` 等字段。模板后续修改不影响已运行的流程。

### 2.4 自定义项目角色

#### ProjectRole（项目角色）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | 主键 |
| project | FK → Project | 所属项目 |
| name | CharField(128) | 角色名称 |
| code | CharField(64) | 角色编码 |
| permissions | JSONField | 权限码数组 |
| is_builtin | BooleanField | 是否内置角色 |
| is_default | BooleanField | 是否默认角色 |
| created_by | FK → User | 创建人 |
| created_at / updated_at | DateTimeField | 时间戳 |

#### ProjectMember 模型修改

| 字段 | 原设计 | 新设计 |
|------|--------|--------|
| project_role | CharField(choices=ROLE_CHOICES) | FK → ProjectRole |

#### 内置角色初始化

项目创建时自动创建 4 个内置角色：

| code | name | 核心权限 |
|------|------|----------|
| owner | 负责人 | project.view, project.update, project.member.manage, ... |
| editor | 编辑 | project.view, lot.view, section.generate, section.edit |
| reviewer | 评审 | project.view, tender.view, section.view, section.review |
| viewer | 只读 | project.view, tender.view, section.view |

#### Owner Lockout 防护

- `code="owner"` 的角色，后端强制保留核心权限集：`project.view, project.update, project.member.manage`
- 更新角色权限时，自动合并核心权限集
- 前端隐藏核心权限的移除按钮

### 2.5 权限缓存策略

**缓存结构：**
```
cache_key: "project_perms:{project_id}:{user_id}"
cache_value: Set[str]  # 权限码集合
ttl: 300s  # 5 分钟
```

**缓存失效触发点：**
1. ProjectRole.permissions 更新 → 驱逐该角色关联的所有用户缓存
2. ProjectMember.project_role 变更 → 驱逐该用户缓存
3. ProjectMember 删除 → 驱逐该用户缓存

**失效实现：**
```python
def invalidate_project_role_cache(project_id, role_id):
    user_ids = ProjectMember.objects.filter(
        project_id=project_id,
        project_role_id=role_id
    ).values_list('user_id', flat=True)
    cache.delete_many([
        f"project_perms:{project_id}:{uid}" for uid in user_ids
    ])
```

---

## 3. 流程模板管理

### 3.1 模板管理入口

**系统级模板管理：**
- 入口：系统管理 → 流程模板管理
- 权限：`workflow_template.manage`（全局）
- 操作：创建、编辑、启用/禁用、复制
- 约束：内置模板不可删除

**项目级模板管理：**
- 入口：项目详情 → 设置 → 流程模板
- 权限：`project.update`（项目级）
- 操作：仅编辑节点配置
- 约束：不可删除

### 3.2 系统预设模板

#### 模板一：工程类投标（is_builtin=True）

| 序号 | 节点名称 | 默认负责人 | 需审批 | 审批人 |
|------|----------|------------|--------|--------|
| 1 | 上传招标文件 | editor | 否 | - |
| 2 | 解析招标文件 | editor | 否 | - |
| 3 | 确认标段信息 | owner | 是 | owner |
| 4 | 生成投标大纲 | editor | 否 | - |
| 5 | 生成技术标书 | editor | 是 | reviewer |
| 6 | 生成商务标书 | editor | 是 | reviewer |
| 7 | 合并审核 | reviewer | 是 | owner |
| 8 | 导出标书 | owner | 否 | - |

#### 模板二：服务类采购

| 序号 | 节点名称 | 默认负责人 | 需审批 | 审批人 |
|------|----------|------------|--------|--------|
| 1 | 上传采购文件 | editor | 否 | - |
| 2 | 解析采购文件 | editor | 否 | - |
| 3 | 编写技术方案 | editor | 是 | reviewer |
| 4 | 编写商务报价 | editor | 是 | reviewer |
| 5 | 综合审核 | reviewer | 是 | owner |
| 6 | 导出响应文件 | owner | 否 | - |

#### 模板三：简易流程

| 序号 | 节点名称 | 默认负责人 | 需审批 | 审批人 |
|------|----------|------------|--------|--------|
| 1 | 上传招标文件 | editor | 否 | - |
| 2 | 解析并生成 | editor | 否 | - |
| 3 | 审核确认 | reviewer | 是 | owner |
| 4 | 导出标书 | owner | 否 | - |

### 3.3 模板深拷贝逻辑

项目创建时，选中的系统模板深拷贝为项目私有模板：

```python
def clone_template_to_project(system_template, project, created_by):
    """将系统模板深拷贝为项目私有模板。"""
    project_template = WorkflowTemplate.objects.create(
        name=system_template.name,
        description=system_template.description,
        scope='project',
        project=project,
        is_active=True,
        is_builtin=False,
        created_by=created_by,
    )

    for node in system_template.node_templates.all():
        WorkflowNodeTemplate.objects.create(
            workflow_template=project_template,
            name=node.name,
            order=node.order,
            default_assignee_type=node.default_assignee_type,
            default_assignee_role=node.default_assignee_role,
            # 防御性清空：系统模板的 user 字段不应被拷贝
            default_assignee_user=None if system_template.scope == 'system' else node.default_assignee_user,
            requires_approval=node.requires_approval,
            approver_type=node.approver_type,
            approver_role=node.approver_role,
            approver_user=None if system_template.scope == 'system' else node.approver_user,
            estimated_hours=node.estimated_hours,
            description=node.description,
        )

    return project_template
```

### 3.4 拖拽排序事务安全

```python
from django.db import transaction

@transaction.atomic
def reorder_nodes(template_id, node_orders):
    """批量重排节点顺序。"""
    nodes = WorkflowNodeTemplate.objects.filter(
        workflow_template_id=template_id
    ).select_for_update()

    node_map = {n.id: n for n in nodes}

    for item in node_orders:
        node = node_map.get(item['id'])
        if node:
            node.order = item['order']

    WorkflowNodeTemplate.objects.bulk_update(nodes, ['order'])
```

---

## 4. 项目列表页设计

### 4.1 页面结构

**双视图模式：**

| 模式 | 布局 | 适用场景 |
|------|------|----------|
| 卡片网格 | 响应式网格（3/2/1 列） | 总览浏览、快速定位 |
| 看板视图 | 状态泳道（未开始/进行中/已完成/已归档） | 状态管理、拖拽流转 |

**顶部工具栏：**
- 左侧：搜索框 + 状态筛选
- 中间：视图切换按钮（卡片/看板）
- 右侧：新建项目按钮

### 4.2 项目卡片内容

| 区域 | 内容 |
|------|------|
| 状态指示 | AI 任务呼吸灯（蓝色动态波纹） |
| 头部 | 项目名称 + 状态标签 |
| 进度可视化 | 环形进度条 |
| 基本信息 | 创建人头像+名称、创建时间 |
| 标段统计 | 标段数量 |
| 快捷入口 | 悬浮：拖拽上传、快捷菜单 |
| 操作区 | 点击打开右侧抽屉预览 |

### 4.3 看板视图交互

- 拖拽项目卡片到目标状态泳道
- 松手触发 PATCH 更新状态
- 拖拽过程中卡片半透明，目标泳道高亮
- 失败时卡片回弹原位置

### 4.4 右侧抽屉预览面板

| Tab | 内容 |
|------|------|
| 概览 | 项目描述、整体进度、标段列表缩略 |
| 成员 | 成员列表 + 角色分配 + 邀请 |
| 操作日志 | 最近 20 条审计日志 |

### 4.5 新建项目弹窗

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 项目名称 | Input | 是 | 最大 255 字符 |
| 项目描述 | Textarea | 否 | 最大 1000 字符 |
| 流程模板 | Select | 是 | 选择系统级模板（将深拷贝为项目私有） |
| 成员邀请 | UserSelect | 否 | 可选初始成员，默认分配 viewer |

**创建后逻辑：**
1. 创建 Project 记录
2. 将选中的系统模板深拷贝为项目私有模板
3. 自动创建 4 个内置 ProjectRole
4. 创建者自动成为 owner
5. 邀请的成员分配 viewer 角色
6. 跳转到项目详情页

### 4.6 API 设计（防 N+1）

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/projects/` | GET | 项目列表（annotate 预聚合） |
| `/api/projects/` | POST | 创建项目（含模板深拷贝） |
| `/api/projects/{id}/` | GET | 项目详情 |
| `/api/projects/{id}/` | PATCH | 更新项目 |
| `/api/projects/{id}/` | DELETE | 归档项目 |
| `/api/projects/{id}/members/` | GET | 成员列表 |
| `/api/projects/{id}/audit-logs/` | GET | 最近操作日志 |

**N+1 防护示例：**
```python
from django.db.models import Count, Q, Avg

queryset = Project.objects.filter(
    members__user=request.user
).annotate(
    lot_count=Count('lots', distinct=True),
    progress_pct=Avg(
        'lots__workflow__nodes__status',
        filter=Q(lots__workflow__nodes__status='completed')
    ) * 100
).prefetch_related('created_by')
```

---

## 5. 项目详情页设计

### 5.1 页面结构

**单页 Tab 切换：**

| Tab | 内容 |
|------|------|
| 概览 | 项目基本信息 + 进度概览 |
| 文件 | 招标文件上传、解析、管理 |
| 成员 | 成员管理、角色分配 |
| 标段 | 标段列表、工作流进度 |
| 生成记录 | 标书生成历史 |
| 导出历史 | 导出记录 |

### 5.2 概览 Tab

| 区块 | 内容 |
|------|------|
| 基本信息 | 项目名称、描述、创建人、创建时间、流程模板 |
| 整体进度 | 环形进度图 + 各标段完成状态 |
| 标段卡片 | 每个标段缩略卡片 |
| 最近活动 | 最近 10 条操作日志 |

### 5.3 成员 Tab

**成员列表：**

| 列 | 内容 |
|------|------|
| 用户 | 头像 + 用户名 + 真实姓名 |
| 角色 | 下拉选择 ProjectRole |
| 加入时间 | 加入日期 |
| 操作 | 移除成员（owner 不可移除自己） |

**角色管理面板：**
- 显示项目所有角色
- 支持新增自定义角色
- 编辑角色权限（owner 核心权限锁定）

### 5.4 标段 Tab

**标段列表：**

| 列 | 内容 |
|------|------|
| 标段名称 | 名称 + 编号 |
| 工作流状态 | not_started / in_progress / completed / archived |
| 当前节点 | 当前执行到哪个节点 + 负责人 |
| 进度条 | 节点完成百分比 |
| 操作 | 查看详情、启动流程、归档 |

**创建标段：**
- 表单：标段名称、标段编号、选择流程模板（默认项目私有模板）
- 创建后自动初始化 LotWorkflow + WorkflowNodeInstance

---

## 6. 标段工作流详情页设计

### 6.1 页面结构

**布局：左侧节点时间线 + 右侧节点详情面板**

### 6.2 节点时间线

**节点状态图标：**

| 状态 | 图标样式 |
|------|----------|
| pending | 灰色空心圆点 |
| in_progress | 蓝色实心圆点 + 脉冲动画 |
| completed | 绿色实心圆点 + 对勾 |
| failed | 红色实心圆点 + 感叹号 |
| skipped | 灰色虚线圆点 |

### 6.3 节点操作按钮

| 状态 | 可用操作 |
|------|----------|
| pending | 开始执行（指定负责人） |
| in_progress | 完成节点、标记失败、重新指派 |
| completed | 无（或查看结果详情） |
| failed | 重新执行、跳过节点 |
| skipped | 恢复执行 |

**审批类节点：**

| 审批状态 | 可用操作 |
|------|----------|
| pending | 提交审批、审批通过/驳回 |
| approved | 无 |
| rejected | 重新提交、修改后重新提交 |

### 6.4 API 设计

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/lots/{id}/workflow/` | GET | 标段工作流详情 |
| `/api/lots/{id}/workflow/start/` | POST | 启动工作流 |
| `/api/lots/{id}/workflow/nodes/{nid}/` | GET | 节点详情 |
| `/api/lots/{id}/workflow/nodes/{nid}/start/` | POST | 开始执行节点 |
| `/api/lots/{id}/workflow/nodes/{nid}/complete/` | POST | 完成节点 |
| `/api/lots/{id}/workflow/nodes/{nid}/fail/` | POST | 标记失败 |
| `/api/lots/{id}/workflow/nodes/{nid}/skip/` | POST | 跳过节点 |
| `/api/lots/{id}/workflow/nodes/{nid}/reassign/` | POST | 重新指派 |
| `/api/lots/{id}/workflow/nodes/{nid}/approve/` | POST | 审批通过 |
| `/api/lots/{id}/workflow/nodes/{nid}/reject/` | POST | 审批驳回 |

### 6.5 并发控制

所有状态扭转操作使用 `select_for_update()` 行锁：

```python
with transaction.atomic():
    node = WorkflowNodeInstance.objects.select_for_update().get(pk=node_id)
    # 状态检查 + 更新...
```

---

## 7. 权限码设计

### 7.1 新增权限码

| 权限码 | 名称 | 作用域 | 说明 |
|--------|------|--------|------|
| project.create | 创建项目 | global | 允许创建新项目 |
| project.view | 查看项目 | project | 查看项目详情 |
| project.update | 更新项目 | project | 编辑项目信息 |
| project.delete | 删除项目 | project | 归档/删除项目 |
| project.member.manage | 管理成员 | project | 邀请/移除成员、分配角色 |
| project.role.manage | 管理角色 | project | 创建/编辑自定义角色 |
| workflow_template.view | 查看流程模板 | global | 查看系统级模板 |
| workflow_template.manage | 管理流程模板 | global | 创建/编辑/删除系统级模板 |
| lot.create | 创建标段 | project | 在项目下创建新标段 |
| lot.view | 查看标段 | project | 查看标段详情和工作流 |
| lot.update | 更新标段 | project | 编辑标段信息 |
| lot.workflow.operate | 操作工作流 | project | 启动/执行/完成节点 |

### 7.2 鉴权服务

```python
def has_permission(user, code, project=None):
    """统一鉴权入口。"""
    scope_map = _get_scope_map()
    scope = scope_map.get(code)

    if scope is None:
        return False

    if scope == Permission.SCOPE_GLOBAL:
        return has_global_permission(user, code)

    if scope == Permission.SCOPE_PROJECT:
        if project is None:
            return False
        return has_project_permission(user, project, code)

    return False
```

---

## 8. 审计日志设计

### 8.1 操作类型

| 模块 | 操作类型 | 说明 |
|------|----------|------|
| 项目 | project_create, project_update, project_archive | 项目生命周期 |
| 成员 | member_add, member_role_change, member_remove | 成员管理 |
| 角色 | role_create, role_update | 角色管理 |
| 标段 | lot_create, lot_archive | 标段管理 |
| 工作流 | workflow_start, node_start, node_complete, node_approve, node_reject | 工作流操作 |
| 模板 | template_create, template_update, template_clone | 模板管理 |

### 8.2 API 设计

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/projects/{id}/audit-logs/` | GET | 项目级审计日志（分页） |

**查询参数：** action, actor_id, start_date, end_date, page, page_size

---

## 9. 前端状态管理设计

### 9.1 Pinia Store 结构

| Store | 文件 | 职责 |
|-------|------|------|
| projectStore | `stores/project.ts` | 项目列表、当前项目 |
| memberStore | `stores/member.ts` | 成员管理、角色列表 |
| workflowStore | `stores/workflow.ts` | 工作流节点操作 |

### 9.2 Store Reset 机制

防止跨路由数据污染：

```typescript
// 离开详情页时清理
onBeforeRouteLeave((to, from, next) => {
  workflowStore.reset()
  memberStore.reset()
  next()
})
```

### 9.3 节点排序保障

```typescript
const sortedNodes = computed(() =>
  [...nodes.value].sort((a, b) => a.order - b.order)
)
```

---

## 10. 招标文件解析引擎

### 10.1 解析流水线架构

```
TenderFile → ParsedDocument → TenderChunk
(原始文件)    (Markdown)        (语义分块)
    ↓              ↓                ↓
 上传直传    MinerU/Marker      LLM 分块
 MinIO       提取 Markdown      + pgvector
```

### 10.2 数据模型

#### ParsedDocument（解析文档层）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | 主键 |
| tender_file | OneToOne → TenderFile | 关联原始文件 |
| full_markdown | TextField | 完整 Markdown |
| page_count | IntegerField | 页数 |
| layout_tree | JSONField | TOC 树结构 |
| parse_engine | CharField(50) | 解析引擎 |
| parse_duration | FloatField | 解析耗时 |

#### TenderChunk（语义分块层）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | 主键 |
| parsed_doc | FK → ParsedDocument | 关联解析文档 |
| chunk_type | CharField(50) | 块类型 |
| hierarchy_meta | JSONField | 层级元数据 |
| content | TextField | 文本内容 |
| embedding | VectorField(1536) | pgvector 向量 |
| chunk_index | IntegerField | 块序号 |
| page_number | IntegerField | 原文页码 |

**索引：**
```python
indexes = [
    models.Index(fields=["parsed_doc", "chunk_index"]),
    models.Index(fields=["parsed_doc", "chunk_type"]),
    models.Index(fields=["chunk_type"]),
]
```

### 10.3 块类型定义

| chunk_type | 中文名称 | 说明 |
|------------|----------|------|
| qualification | 资格要求 | 投标人资格条件 |
| scoring | 评分标准 | 评标办法、评分细则 |
| tech_req | 技术要求 | 技术规格、参数要求 |
| commercial | 商务条款 | 投标报价、付款方式 |
| legal | 法律条款 | 合同条款、违约责任 |
| clarification | 澄清补遗 | 招标澄清、补充通知 |
| normal | 普通文本 | 其他非关键内容 |

### 10.4 向量搜索

```python
from pgvector.django import CosineDistance

def search_chunks(query_vector, chunk_types=None, top_k=10):
    queryset = TenderChunk.objects.annotate(
        distance=CosineDistance('embedding', query_vector)
    )
    if chunk_types:
        queryset = queryset.filter(chunk_type__in=chunk_types)
    return queryset.order_by('distance')[:top_k]
```

### 10.5 超时监控

```python
@app.task(name="apps.tender.check_stale_parsing")
def check_stale_parsing():
    """检查卡住的解析任务。"""
    stale_threshold = timezone.now() - timedelta(hours=1)
    stale_files = TenderFile.objects.filter(
        status__in=['parsing', 'chunking'],
        updated_at__lt=stale_threshold
    )
    for tf in stale_files:
        tf.status = TenderFile.STATUS_FAILED
        tf.error_message = "解析任务超时"
        tf.save()
        # 发送通知
```

---

## 11. 提示词管理设计

### 11.1 设计理念

- 提示词在前端可视化管理，支持版本控制
- 后端仅存储和执行，不硬编码
- 支持变量插值，运行时动态替换

### 11.2 数据模型

#### PromptTemplate（提示词模板）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | 主键 |
| code | CharField(64) | 模板编码（唯一） |
| name | CharField(128) | 模板名称 |
| category | CharField(32) | 分类：parse/outline/generate/review |
| description | TextField | 模板描述 |
| template | TextField | 提示词内容 |
| variables | JSONField | 变量定义列表 |
| version | IntegerField | 版本号 |
| is_active | BooleanField | 是否启用 |
| created_by | FK → User | 创建人 |

#### PromptVersion（版本历史）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | PK | 主键 |
| prompt_template | FK → PromptTemplate | 关联模板 |
| version | IntegerField | 版本号 |
| template | TextField | 该版本内容 |
| change_note | CharField(255) | 变更说明 |
| created_by | FK → User | 创建人 |

### 11.3 变量插值语法

**变量格式：** `{{variable_name}}`

**变量定义示例：**
```json
{
  "variables": [
    {"name": "file_name", "type": "string", "required": true},
    {"name": "document_content", "type": "text", "required": true}
  ]
}
```

### 11.4 内置模板

| code | name | category |
|------|------|----------|
| parse_chunk | 语义分块解析 | parse |
| parse_extract | 关键信息提取 | parse |
| outline_generate | 大纲生成 | outline |
| section_generate | 章节内容生成 | generate |
| section_review | 章节内容审核 | review |

### 11.5 API 设计

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/prompts/` | GET/POST | 模板列表/创建 |
| `/api/prompts/{id}/` | GET/PATCH | 模板详情/更新 |
| `/api/prompts/{id}/render/` | POST | 渲染模板 |
| `/api/prompts/{id}/versions/` | GET | 版本历史 |
| `/api/prompts/{id}/rollback/` | POST | 回滚版本 |

---

## 12. 实施计划

### 12.1 阶段划分

| 阶段 | 内容 | 工期 | 依赖 |
|------|------|------|------|
| Phase 4.1 | 项目基础 + 自定义角色 | 3 天 | 无 |
| Phase 4.2 | 流程模板 + 状态机 | 3 天 | 4.1 |
| Phase 4.3 | 标段 + 工作流执行 | 4 天 | 4.2 |
| Phase 4.4 | 项目列表/详情前端 | 4 天 | 4.3 |
| Phase 4.5 | 招标文件解析引擎 | 5 天 | 4.4 |
| Phase 4.6 | 提示词管理 | 3 天 | 4.5 |

**总计：约 22 个工作日**

### 12.2 新增数据表

- `projects_project_role`
- `workflow_template`
- `workflow_node_template`
- `lot_workflow`
- `workflow_node_instance`
- `tender_parsed_document`
- `tender_chunk`
- `common_prompt_template`
- `common_prompt_version`

### 12.3 新增技术依赖

| 依赖 | 用途 |
|------|------|
| pgvector | PostgreSQL 向量扩展 |
| django-pgvector | Django pgvector 集成 |
| openai | OpenAI Embedding |
| dnd-kit | 前端拖拽库 |
| @monaco-editor/react | 提示词编辑器 |

### 12.4 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 角色权限缓存失效穿透 | 批量失效 + 缓存预热 |
| 工作流并发冲突 | select_for_update 行锁 |
| 模板深拷贝性能 | 事务内批量插入 |
| 向量搜索延迟 | 索引优化 + 缓存热门查询 |
| LLM 分块超时 | 超时监控 + 自动重试 |

---

## 13. 附录

### 13.1 名词解释

| 术语 | 说明 |
|------|------|
| WorkflowTemplate | 流程模板，定义流程结构和节点配置 |
| WorkflowNodeTemplate | 节点模板，定义单个节点的属性 |
| LotWorkflow | 标段流程实例，运行时数据 |
| WorkflowNodeInstance | 节点实例，含快照字段 |
| ProjectRole | 项目角色，支持自定义权限 |
| TenderChunk | 语义分块，用于 RAG 检索 |

### 13.2 参考文档

- Phase 1 实现计划：`docs/superpowers/plans/2026-05-21-phase1-skeleton-and-models.md`
- Phase 2 实现计划：`docs/superpowers/plans/2026-05-21-phase2-auth-and-permissions.md`
- Phase 3 实现计划：`docs/superpowers/plans/2026-05-21-phase3-frontend-and-upload.md`
