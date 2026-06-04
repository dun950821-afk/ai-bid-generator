// frontend/src/api/workflow.ts
import { http } from './http'

// 类型定义
export interface WorkflowNodeTemplate {
  id: number
  name: string
  order: number
  visual_type: string
  default_assignee_type: string
  default_assignee_role: string
  requires_approval: boolean
  approver_type?: string
  approver_role?: string
  estimated_hours?: number
  description?: string
}

export interface WorkflowTemplate {
  id: number
  name: string
  description: string
  scope: string
  is_builtin: boolean
  is_active: boolean
  node_count: number
  created_by_name: string
  created_at: string
  nodes?: WorkflowNodeTemplate[]
}

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
    return http.get<{ count: number; results: WorkflowTemplate[] }>('/api/workflows/templates/system/')
  },

  getTemplates(params?: { scope?: string; is_active?: boolean }) {
    return http.get<{ count: number; results: WorkflowTemplate[] }>('/api/workflow-templates/', { params })
  },

  getTemplate(id: number) {
    return http.get<WorkflowTemplate>(`/api/workflow-templates/${id}/`)
  },

  createTemplate(data: { name: string; description?: string; scope?: string }) {
    return http.post<WorkflowTemplate>('/api/workflow-templates/', data)
  },

  updateTemplate(id: number, data: Partial<WorkflowTemplate>) {
    return http.patch<WorkflowTemplate>(`/api/workflow-templates/${id}/`, data)
  },

  deleteTemplate(id: number) {
    return http.delete(`/api/workflow-templates/${id}/`)
  },

  copyTemplate(id: number) {
    return http.post<WorkflowTemplate>(`/api/workflow-templates/${id}/copy/`)
  },

  // 节点
  addNode(templateId: number, data: Partial<WorkflowNodeTemplate>) {
    return http.post<WorkflowNodeTemplate>(`/api/workflow-templates/${templateId}/nodes/`, data)
  },

  updateNode(templateId: number, nodeId: number, data: Partial<WorkflowNodeTemplate>) {
    return http.patch<WorkflowNodeTemplate>(`/api/workflow-templates/${templateId}/nodes/${nodeId}/`, data)
  },

  deleteNode(templateId: number, nodeId: number) {
    return http.delete(`/api/workflow-templates/${templateId}/nodes/${nodeId}/`)
  },

  reorderNodes(templateId: number, nodes: Array<{ id: number; order: number }>) {
    return http.post<{ updated: number }>(`/api/workflow-templates/${templateId}/nodes/reorder/`, { nodes })
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

  getNode(nodeId: number) {
    return http.get<WorkflowNodeInstance>(`/api/workflows/nodes/${nodeId}/`)
  },

  retryNode(nodeId: number, reason: string) {
    return http.post<{ id: number; status: string }>(
      `/api/workflows/nodes/${nodeId}/retry/`,
      { reason }
    )
  },

  completeNode(nodeId: number) {
    return http.post<{ id: number; status: string }>(
      `/api/workflows/nodes/${nodeId}/complete/`
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

  getNodeArtifacts(nodeId: number) {
    return http.get<{ results: unknown[]; count: number }>(
      `/api/workflows/nodes/${nodeId}/artifacts/`
    )
  },
}