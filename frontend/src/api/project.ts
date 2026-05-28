import { http } from './http'

export interface Project {
  id: number
  name: string
  description: string
  status: string
  created_by: number
  created_by_name: string
  member_count: number
  lot_count: number
  created_at: string
  updated_at: string
}

export interface ProjectListParams {
  page?: number
  page_size?: number
  status?: string
  keyword?: string
}

export interface ProjectCreateParams {
  name: string
  description?: string
  workflow_template_id?: number
  initial_members?: Array<{ user_id: number; role_code: string }>
}

export interface PaginatedResponse<T> {
  total: number
  page: number
  page_size: number
  has_next: boolean
  has_prev: boolean
  results: T[]
}

export const projectApi = {
  list(params?: ProjectListParams) {
    return http.get<PaginatedResponse<Project>>('/api/projects/', { params })
  },

  get(id: number) {
    return http.get<Project>(`/api/projects/${id}/`)
  },

  create(data: ProjectCreateParams) {
    return http.post<Project>('/api/projects/', data)
  },

  update(id: number, data: Partial<Project>) {
    return http.patch<Project>(`/api/projects/${id}/`, data)
  },

  delete(id: number) {
    return http.delete(`/api/projects/${id}/`)
  },

  getMyPermissions(id: number) {
    return http.get<{ project_id: number; permissions: string[] }>(`/api/projects/${id}/my-permissions`)
  },
}

// 成员相关 API
export interface ProjectMember {
  id: number
  user_id: number
  username: string
  real_name: string
  project_role: number
  role_name: string
  role_code: string
  created_at: string
}

export interface ProjectRole {
  id: number
  name: string
  code: string
  permissions: string[]
  is_builtin: boolean
  member_count: number
}

export const memberApi = {
  list(projectId: number) {
    return http.get<PaginatedResponse<ProjectMember>>(`/api/projects/${projectId}/members/`)
  },

  add(projectId: number, data: { user_id: number; role_id: number }) {
    return http.post<ProjectMember>(`/api/projects/${projectId}/members/`, data)
  },

  update(projectId: number, memberId: number, data: { role_id: number }) {
    return http.patch<ProjectMember>(`/api/projects/${projectId}/members/${memberId}/`, data)
  },

  remove(projectId: number, memberId: number) {
    return http.delete(`/api/projects/${projectId}/members/${memberId}/`)
  },

  batchAdd(projectId: number, members: Array<{ user_id: number; role_id: number }>) {
    return http.post<{ success: number; failed: number; results: any[] }>(
      `/api/projects/${projectId}/members/batch/`,
      { members }
    )
  },
}

export const roleApi = {
  list(projectId: number) {
    return http.get<PaginatedResponse<ProjectRole>>(`/api/projects/${projectId}/roles/`)
  },

  create(projectId: number, data: { name: string; code: string; permissions: string[] }) {
    return http.post<ProjectRole>(`/api/projects/${projectId}/roles/`, data)
  },

  update(projectId: number, roleId: number, data: { permissions: string[] }) {
    return http.patch<ProjectRole>(`/api/projects/${projectId}/roles/${roleId}/`, data)
  },

  delete(projectId: number, roleId: number) {
    return http.delete(`/api/projects/${projectId}/roles/${roleId}/`)
  },
}

// 流程模板相关 API
export interface WorkflowTemplate {
  id: number
  name: string
  description: string
  scope: string
  is_active: boolean
  is_builtin: boolean
  node_count: number
  created_by_name: string
  created_at: string
}

export interface WorkflowNodeTemplate {
  id: number
  name: string
  order: number
  default_assignee_type: string
  default_assignee_role: string
  requires_approval: boolean
  approver_type: string
  approver_role: string
  estimated_hours: number | null
  description: string
}

export interface WorkflowTemplateDetail extends WorkflowTemplate {
  node_templates: WorkflowNodeTemplate[]
}

export const templateApi = {
  listSystem() {
    return http.get<PaginatedResponse<WorkflowTemplate>>('/api/workflow-templates/', {
      params: { scope: 'system', is_active: true, page_size: 100 }
    })
  },

  get(id: number) {
    return http.get<WorkflowTemplateDetail>(`/api/workflow-templates/${id}/`)
  },

  create(data: { name: string; description?: string }) {
    return http.post<WorkflowTemplate>('/api/workflow-templates/', data)
  },

  update(id: number, data: Partial<WorkflowTemplate>) {
    return http.patch<WorkflowTemplate>(`/api/workflow-templates/${id}/`, data)
  },

  delete(id: number) {
    return http.delete(`/api/workflow-templates/${id}/`)
  },

  copy(id: number) {
    return http.post<WorkflowTemplate>(`/api/workflow-templates/${id}/copy/`)
  },

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
}
