# 项目管理完整功能设计文档

> **版本：** 1.1
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
| `/api/projects/{id}/members/batch/` | POST | 批量邀请/移除成员 |
| `/api/projects/{id}/audit-logs/` | GET | 最近操作日志 |

### 4.7 API 规范补充

#### 分页规则

| 参数 | 默认值 | 最大值 | 说明 |
|------|--------|--------|------|
| page | 1 | - | 当前页码 |
| page_size | 20 | 100 | 每页数量 |

**响应格式：**
```json
{
  "total": 100,
  "page": 1,
  "page_size": 20,
  "has_next": true,
  "has_prev": false,
  "results": [...]
}
```

#### 错误码定义

| 错误码 | HTTP 状态码 | 说明 |
|--------|-------------|------|
| 4001 | 404 | 项目不存在 |
| 4002 | 403 | 权限不足 |
| 4003 | 400 | 流程状态冲突（如已完成节点无法启动） |
| 4004 | 400 | 节点审批冲突（审批人不可审批自己负责的节点） |
| 4005 | 400 | 重试次数已达上限 |
| 4006 | 400 | 模板拷贝失败 |
| 4007 | 409 | 并发冲突（节点已被其他操作修改） |

#### 批量操作 API

**批量邀请成员：**
```
POST /api/projects/{id}/members/batch/
Request:
{
  "action": "add",
  "members": [
    {"user_id": 1, "role_id": 3},
    {"user_id": 2, "role_id": 4}
  ]
}
Response:
{
  "success": 2,
  "failed": 0,
  "results": [
    {"user_id": 1, "status": "success"},
    {"user_id": 2, "status": "success"}
  ]
}
```

**批量更新节点状态：**
```
POST /api/lots/{id}/workflow/nodes/batch/
Request:
{
  "action": "complete",
  "node_ids": [1, 2, 3]
}
Response:
{
  "success": 3,
  "failed": 0
}
```

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

### 6.6 流程流转规则

#### 执行模式

| 模式 | 说明 | 配置方式 |
|------|------|----------|
| 串行（默认） | 按 `order` 顺序逐个执行 | 无需配置 |
| 并行 | 同一 `order` 的多个节点并行执行 | 模板节点设置相同 order 值 |

**串行执行规则：**
- 当前节点状态变为 `completed` 后，自动将下一个 `pending` 节点置为 `in_progress`
- 若下一节点 `requires_approval=True`，需先完成审批才能推进

**并行执行规则：**
- 同一 `order` 的节点同时启动
- 所有并行节点完成后，才推进到下一 `order` 的节点

#### 自动推进规则

```python
def auto_advance(lot_workflow, completed_node):
    """节点完成后自动推进流程。"""
    # 检查是否还有并行节点未完成
    same_order_nodes = WorkflowNodeInstance.objects.filter(
        lot_workflow=lot_workflow,
        order=completed_node.order,
        status__in=['pending', 'in_progress']
    )
    if same_order_nodes.exists():
        return  # 并行节点未全部完成，不推进

    # 找到下一 order 的节点
    next_nodes = WorkflowNodeInstance.objects.filter(
        lot_workflow=lot_workflow,
        order__gt=completed_node.order,
        status='pending'
    ).order_by('order')

    if not next_nodes.exists():
        # 所有节点完成，标记流程完成
        lot_workflow.status = 'completed'
        lot_workflow.completed_at = timezone.now()
        lot_workflow.save()
        return

    # 获取下一批节点（支持并行）
    next_order = next_nodes.first().order
    batch_nodes = [n for n in next_nodes if n.order == next_order]

    for node in batch_nodes:
        node.status = 'in_progress'
        node.started_at = timezone.now()
        node.save()
```

#### 回退规则

| 操作 | 权限 | 状态变更 | 说明 |
|------|------|----------|------|
| 回退到某节点 | owner | 目标节点及下游所有已完成节点 → `pending` | 需填写回退原因 |
| 回退原因记录 | - | 记录到审计日志 | `extra.rollback_reason` |

**回退实现：**
```python
def rollback_to_node(lot_workflow, target_node_id, reason, operator):
    """回退到指定节点。"""
    target_node = WorkflowNodeInstance.objects.get(pk=target_node_id)

    with transaction.atomic():
        # 锁定所有下游节点
        downstream_nodes = WorkflowNodeInstance.objects.filter(
            lot_workflow=lot_workflow,
            order__gte=target_node.order
        ).select_for_update()

        # 重置状态
        for node in downstream_nodes:
            node.status = 'pending'
            node.started_at = None
            node.completed_at = None
            node.approval_status = 'not_required' if not node.requires_approval else 'pending'
            node.save()

        # 记录审计日志
        audit_service.log_operation(
            actor=operator,
            action='node_rollback',
            target_type='WorkflowNodeInstance',
            target_id=str(target_node_id),
            summary=f"回退流程到节点 {target_node.name}",
            extra={'rollback_reason': reason, 'affected_nodes': [n.id for n in downstream_nodes]},
        )
```

#### 终止规则

| 场景 | 状态变更 | 数据处理 |
|------|----------|----------|
| 手动终止 | 流程 → `failed`，所有未完成节点 → `failed` | 保留已执行数据 |
| 异常终止（超时/错误） | 同上 | 记录失败原因 |
| 重启流程 | 流程 → `in_progress`，第一个 `pending` 节点 → `in_progress` | 从头开始 |

### 6.7 异常处理机制

#### 节点执行失败处理

| 场景 | 处理方式 | 说明 |
|------|----------|------|
| 标记失败 | 节点状态 → `failed`，记录 `failure_reason` | 人工判断是否重试 |
| 重试 | 最多 3 次，重试间隔递增（1min/5min/15min） | 3 次后需人工介入 |
| 人工介入 | owner 决定：跳过/重新执行/终止流程 | 记录操作日志 |

**重试实现：**
```python
def retry_node(node_id, operator):
    """重试失败节点。"""
    node = WorkflowNodeInstance.objects.get(pk=node_id)
    if node.retry_count >= 3:
        raise BusinessException("重试次数已达上限，需人工介入")

    node.retry_count += 1
    node.status = 'in_progress'
    node.failure_reason = ''
    node.save()

    audit_service.log_operation(
        actor=operator,
        action='node_retry',
        summary=f"重试节点 {node.name}（第{node.retry_count}次）",
    )
```

#### WorkflowNodeInstance 扩展字段

| 字段 | 类型 | 说明 |
|------|------|------|
| retry_count | IntegerField | 重试次数（默认 0） |

#### 解析引擎降级方案

| 引擎 | 优先级 | 失败后动作 |
|------|--------|------------|
| MinerU | 1（首选） | 尝试 Marker |
| Marker | 2 | 尝试纯文本提取 |
| 纯文本提取 | 3（兜底） | 标记解析质量为"低" |

**ParsedDocument 扩展字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| parse_quality | CharField(16) | high / medium / low |

```python
def parse_with_fallback(tender_file):
    """带降级的解析流程。"""
    engines = [
        ('mineru', parse_with_mineru),
        ('marker', parse_with_marker),
        ('plain', parse_plain_text),
    ]

    for engine_name, engine_func in engines:
        try:
            result = engine_func(tender_file)
            result.parse_quality = 'high' if engine_name == 'mineru' else 'medium' if engine_name == 'marker' else 'low'
            return result
        except Exception as e:
            logger.warning(f"{engine_name} 解析失败: {e}")
            continue

    raise ParseException("所有解析引擎均失败")
```

#### 事务回滚规则

| 操作 | 回滚条件 | 回滚内容 |
|------|----------|----------|
| 模板深拷贝 | 任何步骤失败 | 删除已创建的模板和所有节点 |
| 流程启动 | 任何步骤失败 | 删除 LotWorkflow 和所有 NodeInstance |
| 节点状态变更 | 状态冲突 | 不变更，返回错误 |

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

### 7.3 权限边界补充

#### 角色权限继承与互斥

| 规则 | 说明 |
|------|------|
| 继承规则 | 自定义角色可选择继承 1 个内置角色的权限集，在此基础上增减 |
| 互斥规则 | 不可配置与 owner 核心权限冲突的规则（如禁止移除 owner 的 `project.update` 权限） |
| 核心权限锁定 | owner 角色的 `project.view, project.update, project.member.manage` 不可移除 |

#### 工作流操作权限细分

| 操作 | 权限要求 | 约束 |
|------|----------|------|
| 启动工作流 | `lot.workflow.operate` | - |
| 开始执行节点 | `lot.workflow.operate` + 是负责人或 owner | - |
| 完成节点 | `lot.workflow.operate` + 是负责人或 owner | - |
| 标记失败 | `lot.workflow.operate` + 是负责人或 owner 或 reviewer | - |
| 跳过节点 | `lot.workflow.operate` + 是 owner | 需填写跳过原因 |
| 回退节点 | `lot.workflow.operate` + 是 owner | 需填写回退原因 |
| 审批通过/驳回 | `lot.workflow.operate` + 是指定审批人 | **不可审批自己负责的节点** |

**审批自我回避规则：**
```python
def can_approve_node(user, node):
    """检查用户是否有权限审批该节点。"""
    if not permission_service.has_permission(user, 'lot.workflow.operate', node.lot_workflow.lot.project):
        return False

    # 检查是否是审批人
    if node.approver_type == 'user':
        return node.approver_user_id == user.id
    elif node.approver_type == 'role':
        # 获取用户在项目的角色
        member = ProjectMember.objects.filter(project=node.lot_workflow.lot.project, user=user).first()
        if not member:
            return False
        return member.project_role.code == node.approver_role

    return False

def check_approval_conflict(user, node):
    """检查审批冲突：审批人不可审批自己负责的节点。"""
    if node.assignee_type == 'user' and node.assignee_user_id == user.id:
        raise BusinessException("不可审批自己负责的节点")
    if node.assignee_type == 'role':
        member = ProjectMember.objects.filter(project=node.lot_workflow.lot.project, user=user).first()
        if member and member.project_role.code == node.assignee_role:
            raise BusinessException("不可审批自己负责角色的节点")
```

#### 模板权限隔离

| 模板类型 | 可见范围 | 编辑权限 |
|----------|----------|----------|
| 系统模板（scope=system） | 全企业所有用户 | 仅全局 `workflow_template.manage` 权限者 |
| 项目模板（scope=project） | 项目成员 | 项目 owner |

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

## 14. 性能优化设计

### 14.1 热点数据缓存策略

| 数据类型 | 缓存 Key | TTL | 失效触发 |
|----------|----------|-----|----------|
| 流程模板 | `workflow_template:{id}` | 1 小时 | 模板更新/删除 |
| 项目进度 | `project_progress:{id}` | 5 分钟 | 节点状态变更 |
| 角色权限 | `project_perms:{project_id}:{user_id}` | 5 分钟 | 角色权限更新/成员变更 |
| 用户项目列表 | `user_projects:{user_id}` | 3 分钟 | 项目创建/归档/成员变更 |

### 14.2 大数据量场景优化

#### 项目列表优化

| 场景 | 优化策略 |
|------|----------|
| 1000+ 项目 | 按创建时间分片查询，禁用全表 count |
| 复杂筛选 | Elasticsearch 全文检索（可选） |
| 进度计算 | 异步计算 + 缓存 |

**分片查询示例：**
```python
def get_projects_with_cursor(user_id, cursor=None, page_size=20):
    """游标分页（避免 OFFSET 性能问题）。"""
    queryset = Project.objects.filter(members__user_id=user_id)

    if cursor:
        queryset = queryset.filter(id__lt=cursor)

    projects = list(queryset.order_by('-id')[:page_size + 1])
    has_next = len(projects) > page_size

    return {
        'results': projects[:page_size],
        'next_cursor': projects[-1].id if has_next else None,
        'has_next': has_next,
    }
```

#### 向量搜索优化

| 场景 | 优化策略 |
|------|----------|
| 10万+ 分块 | 按 `chunk_type` 分索引 |
| 热门查询 | 结果缓存 10 分钟 |
| 高并发 | 连接池 + 预编译语句 |

**分类型索引：**
```sql
CREATE INDEX idx_chunk_qualification ON tender_chunk (embedding) WHERE chunk_type = 'qualification';
CREATE INDEX idx_chunk_scoring ON tender_chunk (embedding) WHERE chunk_type = 'scoring';
CREATE INDEX idx_chunk_tech_req ON tender_chunk (embedding) WHERE chunk_type = 'tech_req';
```

---

## 15. 前端交互细节补充

### 15.1 实时通知机制

| 事件 | 通知对象 | 通知方式 |
|------|----------|----------|
| 节点被指派 | 被指派人 | WebSocket + 站内信 |
| 审批待处理 | 审批人 | WebSocket + 站内信 + 邮件 |
| 审批通过/驳回 | 节点负责人 | WebSocket + 站内信 |
| 流程完成 | 项目 owner | WebSocket + 站内信 + 邮件 |

**WebSocket 事件格式：**
```json
{
  "event": "node_assigned",
  "data": {
    "project_id": 1,
    "lot_id": 1,
    "node_id": 5,
    "node_name": "生成技术标书",
    "assigned_by": "张三"
  }
}
```

### 15.2 大文件解析进度展示

| 阶段 | 进度显示 | 时间预估 |
|------|----------|----------|
| 上传中 | 进度条 0-30% | 根据网速预估 |
| Markdown 提取 | 进度条 30-60% | 根据文件大小预估 |
| LLM 分块 | 进度条 60-90% | 根据页数预估 |
| 向量嵌入 | 进度条 90-100% | 根据分块数预估 |

**进度查询 API：**
```
GET /api/tender/files/{id}/parse-progress/
Response:
{
  "stage": "llm_chunking",
  "progress": 75,
  "estimated_remaining_seconds": 120,
  "current_step": "正在分析第 15/20 页"
}
```

### 15.3 拖拽排序边界限制

| 限制 | 说明 |
|------|------|
| 禁止跨模板拖拽 | 节点只能在同一模板内排序 |
| 并行组内排序 | 同一 `order` 的节点可互换，不可拖出组外 |
| 审批依赖检查 | 拖拽后检查审批人设置是否有效 |

---

## 16. 非功能需求

### 16.1 可测试性

#### 端到端测试用例模板

```python
class ProjectWorkflowE2ETest(TestCase):
    """项目创建 → 模板拷贝 → 标段创建 → 流程启动 端到端测试。"""

    def test_full_workflow(self):
        # 1. 创建项目
        project = self.create_project()

        # 2. 验证模板拷贝
        self.assertEqual(project.workflow_templates.count(), 1)

        # 3. 验证内置角色创建
        self.assertEqual(project.roles.count(), 4)

        # 4. 创建标段
        lot = self.create_lot(project)

        # 5. 验证工作流初始化
        self.assertIsNotNone(lot.workflow)

        # 6. 启动工作流
        self.start_workflow(lot)

        # 7. 验证节点状态
        self.assertEqual(lot.workflow.nodes.first().status, 'in_progress')
```

#### Mock 数据规范

```python
# backend/apps/tender/tests/mock_data.py

MOCK_PARSED_DOCUMENT = {
    "full_markdown": "# 第一章 投标人须知\n\n## 1.1 总则\n...",
    "page_count": 50,
    "parse_engine": "mineru",
    "parse_quality": "high",
}

MOCK_TENDER_CHUNK = {
    "chunk_type": "qualification",
    "hierarchy_meta": {"level_1": "第一章", "level_2": "1.2"},
    "content": "投标人须具备建筑工程施工总承包壹级资质...",
    "chunk_index": 0,
    "page_number": 5,
}
```

### 16.2 可监控性

#### 核心监控指标

| 指标 | 类型 | 说明 |
|------|------|------|
| workflow_start_total | Counter | 流程启动总数 |
| workflow_complete_total | Counter | 流程完成总数 |
| workflow_failed_total | Counter | 流程失败总数 |
| node_execution_duration | Histogram | 节点执行耗时分布 |
| parse_engine_duration | Histogram | 解析引擎耗时分布 |
| permission_cache_hit_rate | Gauge | 权限缓存命中率 |
| vector_search_latency | Histogram | 向量搜索延迟 |

#### 告警规则

| 规则 | 阈值 | 级别 | 通知方式 |
|------|------|------|----------|
| 解析超时率 | > 10% | Warning | 站内信 |
| 流程失败数 | > 5 个/小时 | Warning | 站内信 + 邮件 |
| 权限缓存命中率 | < 80% | Warning | 站内信 |
| 向量搜索延迟 | P99 > 2s | Critical | 站内信 + 邮件 + 短信 |

### 16.3 合规性

#### 数据归档规则

| 数据类型 | 保留期限 | 归档策略 | 脱敏规则 |
|----------|----------|----------|----------|
| 项目信息 | 项目归档后 3 年 | 冷存储 | 名称/描述保留，关联数据备份 |
| 审计日志 | 6 个月 | 冷存储 | 不可篡改，只读 |
| 解析文档 | 项目归档后 1 年 | 删除 MinIO 原文件 | - |
| 向量数据 | 项目归档后 1 年 | 删除 | - |

#### 审计日志合规

| 要求 | 实现 |
|------|------|
| 保留期限 | 6 个月（可配置） |
| 不可篡改 | 只读表权限 + 定期备份 |
| 可追溯 | 操作人、时间、IP、操作详情完整记录 |

---

## 17. 附录

### 17.1 数据模型 ER 图

```
┌─────────────────┐     ┌─────────────────┐
│    Project      │────<│    Lot          │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │                       │ 1:1
         │                       ▼
         │              ┌─────────────────┐
         │              │  LotWorkflow    │
         │              └────────┬────────┘
         │                       │ 1:N
         │                       ▼
         │              ┌─────────────────┐
         │              │WorkflowNodeInst.│
         │              └─────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐     ┌─────────────────┐
│  ProjectRole    │────<│ ProjectMember   │
└─────────────────┘     └─────────────────┘
         │
         │ FK
         ▼
┌─────────────────┐     ┌─────────────────┐
│WorkflowTemplate │────<│WorkflowNodeTemp.│
└─────────────────┘     └─────────────────┘
```

### 17.2 核心流程时序图

**标段工作流启动 → 执行 → 审批 → 完成：**

```
User          Frontend         API           WorkflowService       AsyncTask
  │               │             │                  │                   │
  │──启动流程────>│             │                  │                   │
  │               │──POST──────>│                  │                   │
  │               │             │──创建LotWorkflow─>│                   │
  │               │             │──创建NodeInstance>│                   │
  │               │             │<──返回───────────│                   │
  │               │<──响应──────│                  │                   │
  │               │             │                  │                   │
  │──执行节点────>│             │                  │                   │
  │               │──POST──────>│                  │                   │
  │               │             │──更新节点状态───>│                   │
  │               │             │<──返回───────────│                   │
  │               │<──响应──────│                  │                   │
  │               │             │                  │                   │
  │──提交审批────>│             │                  │                   │
  │               │──POST──────>│                  │                   │
  │               │             │──更新审批状态───>│                   │
  │               │             │──发送通知───────>│                   │
  │               │<──响应──────│                  │                   │
  │               │             │                  │                   │
  │<──通知───────────────────────WebSocket─────────│                   │
  │               │             │                  │                   │
  │──审批通过────>│             │                  │                   │
  │               │──POST──────>│                  │                   │
  │               │             │──审批通过───────>│                   │
  │               │             │──自动推进下一节点│                   │
  │               │             │<──返回───────────│                   │
  │               │<──响应──────│                  │                   │
```

### 17.3 术语与字段映射表

| 前端显示 | 后端字段 | 数据库值 |
|----------|----------|----------|
| 进行中 | status | `in_progress` |
| 待处理 | status | `pending` |
| 已完成 | status | `completed` |
| 已失败 | status | `failed` |
| 已跳过 | status | `skipped` |
| 待审批 | approval_status | `pending` |
| 已通过 | approval_status | `approved` |
| 已驳回 | approval_status | `rejected` |
| 负责人 | project_role.code | `owner` |
| 编辑 | project_role.code | `editor` |
| 评审 | project_role.code | `reviewer` |
| 只读 | project_role.code | `viewer` |

### 17.4 名词解释

| 术语 | 说明 |
|------|------|
| WorkflowTemplate | 流程模板，定义流程结构和节点配置 |
| WorkflowNodeTemplate | 节点模板，定义单个节点的属性 |
| LotWorkflow | 标段流程实例，运行时数据 |
| WorkflowNodeInstance | 节点实例，含快照字段 |
| ProjectRole | 项目角色，支持自定义权限 |
| TenderChunk | 语义分块，用于 RAG 检索 |
| Owner Lockout | 项目负责人权限锁定，防止误操作导致无法管理项目 |

### 17.5 参考文档

- Phase 1 实现计划：`docs/superpowers/plans/2026-05-21-phase1-skeleton-and-models.md`
- Phase 2 实现计划：`docs/superpowers/plans/2026-05-21-phase2-auth-and-permissions.md`
- Phase 3 实现计划：`docs/superpowers/plans/2026-05-21-phase3-frontend-and-upload.md`
- Phase 3 Code Review 修复：`docs/superpowers/plans/2026-05-22-phase3-codereview-fixes.md`

---

## 18. 修订历史

| 版本 | 日期 | 修订内容 |
|------|------|----------|
| 1.0 | 2026-05-22 | 初始版本 |
| 1.1 | 2026-05-22 | 补充流程流转规则、权限边界、异常处理、API规范、性能优化、非功能需求、ER图、时序图 |
