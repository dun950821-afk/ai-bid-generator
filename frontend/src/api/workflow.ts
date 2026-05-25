// frontend/src/api/workflow.ts
import { http } from './http'

// 类型定义
export interface WorkflowNodeInstance {
  id: number
  name: string
  order: number
  status: string
  visual_type: string
  progress: number
  assignee_type?: string
  assignee_role?: string
  requires_approval: boolean
  approval_status?: string
  started_at?: string
  completed_at?: string
  failed_at?: string
  failure_reason?: string
}

export interface WorkflowInstance {
  id: number
  lot: number
  workflow_template: number
  status: string
  progress_percentage: number
  started_at?: string
  completed_at?: string
  nodes: WorkflowNodeInstance[]
}

export interface WorkflowStatus {
  instance_id: number
  revision: number
  status: string
  progress: number
  current_node_id: number | null
  updated_at: string
  nodes: Array<{
    id: number
    status: string
    progress: number
    updated_at: string
  }>
}

export interface WorkflowTemplate {
  id: number
  name: string
  description: string
  scope: string
  is_builtin: boolean
  is_active: boolean
  nodes: Array<{
    id: number
    name: string
    order: number
    visual_type: string
  }>
}

export interface AuditLog {
  id: number
  action: string
  previous_status: string
  new_status: string
  operator_name: string | null
  reason: string
  error_message: string
  created_at: string
}

// API
export const workflowApi = {
  // 模板
  getSystemTemplates() {
    return http.get<{ results: WorkflowTemplate[] }>('/api/workflows/templates/system/')
  },

  // 工作流实例
  getWorkflow(lotId: number) {
    return http.get<WorkflowInstance>(`/api/workflows/instances/${lotId}/`)
  },

  getStatus(lotId: number) {
    return http.get<WorkflowStatus>(`/api/workflows/instances/${lotId}/status/`)
  },

  initializeWorkflow(lotId: number, templateId: number | null) {
    return http.post<{ id: number; status: string }>(
      `/api/workflows/instances/${lotId}/initialize/`,
      { template_id: templateId }
    )
  },

  startWorkflow(lotId: number) {
    return http.post<{ id: number; status: string }>(
      `/api/workflows/instances/${lotId}/start/`
    )
  },

  // 节点
  getNode(nodeId: number) {
    return http.get<WorkflowNodeInstance>(`/api/workflows/nodes/${nodeId}/`)
  },

  retryNode(nodeId: number, reason: string) {
    return http.post<{ id: number; status: string }>(
      `/api/workflows/nodes/${nodeId}/retry/`,
      { reason }
    )
  },

  approveNode(nodeId: number, comment: string) {
    return http.post<{ id: number; status: string; approval_status: string }>(
      `/api/workflows/nodes/${nodeId}/approve/`,
      { comment }
    )
  },

  rejectNode(nodeId: number, comment: string) {
    return http.post<{ id: number; status: string; approval_status: string }>(
      `/api/workflows/nodes/${nodeId}/reject/`,
      { comment }
    )
  },

  // 日志
  getNodeLogs(nodeId: number, page = 1, pageSize = 50) {
    return http.get<{
      results: AuditLog[]
      count: number
      page: number
      page_size: number
    }>(`/api/workflows/nodes/${nodeId}/logs/`, {
      params: { page, page_size: pageSize }
    })
  },

  // 产物
  getNodeArtifacts(nodeId: number) {
    return http.get<{ results: unknown[]; count: number }>(
      `/api/workflows/nodes/${nodeId}/artifacts/`
    )
  },
}
