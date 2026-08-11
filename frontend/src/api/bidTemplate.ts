// frontend/src/api/bidTemplate.ts
import { http } from './http'
import type { OnlyofficeConfig } from './bidDocument'

// 类型定义

export interface BidWordTemplate {
  id: number
  name: string
  code: string
  description: string
  scope_type: 'system' | 'enterprise' | 'project'
  scope_type_display: string
  enterprise: number | null
  project: number | null
  status: 'draft' | 'active' | 'disabled' | 'archived'
  status_display: string
  published_version: number | null
  published_version_no: number | null
  is_default: boolean
  usage_count: number
  has_draft_file: boolean
  draft_revision: number
  draft_saved_at: string | null
  version_count: number
  style_mapping: Record<string, string>
  cover_url: string
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface BidWordTemplateVersion {
  id: number
  template: number
  version_no: number
  file_name: string
  file_size: number
  file_hash: string
  validation_status: string
  validation_status_display: string
  validation_result: {
    valid?: boolean
    errors?: Array<{ code: string; message: string }>
    warnings?: Array<{ code: string; message?: string }>
    variables?: string[]
    note?: string
  }
  published_at: string | null
  created_at: string
}

export interface CreateTemplatePayload {
  name: string
  description?: string
  scope_type: 'system' | 'enterprise' | 'project'
  enterprise?: number | null
  project?: number | null
  file?: File
}

export interface PublishResponse {
  version: BidWordTemplateVersion
  validation: BidWordTemplateVersion['validation_result']
}

// API 函数

export function listTemplates(params?: {
  search?: string
  scope_type?: string
  has_published?: string
}) {
  return http.get<BidWordTemplate[] | { results: BidWordTemplate[] }>(
    '/api/bid-word-templates/',
    { params },
  )
}

export function getTemplate(id: number) {
  return http.get<BidWordTemplate>(`/api/bid-word-templates/${id}/`)
}

export function createTemplate(payload: CreateTemplatePayload) {
  const form = new FormData()
  form.append('name', payload.name)
  if (payload.description) form.append('description', payload.description)
  form.append('scope_type', payload.scope_type)
  if (payload.enterprise) form.append('enterprise', String(payload.enterprise))
  if (payload.project) form.append('project', String(payload.project))
  if (payload.file) form.append('file', payload.file)
  return http.post<BidWordTemplate>('/api/bid-word-templates/', form)
}

export function updateTemplate(id: number, payload: Partial<CreateTemplatePayload>) {
  return http.patch<BidWordTemplate>(`/api/bid-word-templates/${id}/`, payload)
}

export function deleteTemplate(id: number) {
  return http.delete(`/api/bid-word-templates/${id}/`)
}

export function uploadTemplateFile(id: number, file: File) {
  const form = new FormData()
  form.append('file', file)
  return http.post<BidWordTemplate>(`/api/bid-word-templates/${id}/upload/`, form)
}

export function publishTemplate(id: number) {
  return http.post<PublishResponse>(`/api/bid-word-templates/${id}/publish/`)
}

export function listTemplateVersions(id: number) {
  return http.get<BidWordTemplateVersion[]>(`/api/bid-word-templates/${id}/versions/`)
}

export function getTemplateEditorConfig(id: number) {
  return http.get<OnlyofficeConfig>(`/api/bid-word-templates/${id}/editor_config/`)
}

// ---- 模板变量（Phase 2）----

export interface TemplateVariable {
  key: string
  name: string
  category: string
  category_name: string
  data_type: string
  source: string
  required: boolean
  example: string
  description: string
  control_type: 'var' | 'slot' | 'image' | 'material'
  control_tag: string
}

export interface TemplateVariableGroup {
  category: string
  category_name: string
  variables: TemplateVariable[]
}

export function listTemplateVariables() {
  return http.get<{ groups: TemplateVariableGroup[] }>('/api/bid-word-template-variables/')
}

export interface TemplateScanResult {
  controls: Array<{ tag: string; type: string; key: string; part: string }>
  raw_variables: string[]
  body_slot_count: number
}

export function scanTemplateVariables(id: number) {
  return http.get<TemplateScanResult>(`/api/bid-word-templates/${id}/variables/`)
}

export function validateTemplate(id: number) {
  return http.post<{
    valid: boolean
    errors: Array<{ code: string; message: string }>
    warnings: Array<{ code: string; message?: string }>
    variables: string[]
    styles: Array<{
      logical: string
      resolved: string
      mapped: boolean
      exists: boolean
    }>
  }>(`/api/bid-word-templates/${id}/validate/`)
}

// ---- Phase 5：版本管理 / 默认模板 / 样式 / 预览 ----

export function rollbackTemplate(id: number, versionId: number) {
  return http.post<{ message: string; template: BidWordTemplate }>(
    `/api/bid-word-templates/${id}/rollback/`,
    { version_id: versionId },
  )
}

export function setDefaultTemplate(id: number) {
  return http.post<BidWordTemplate>(`/api/bid-word-templates/${id}/set_default/`)
}

export function initDefaultTemplate() {
  return http.post<BidWordTemplate>('/api/bid-word-templates/init_default/')
}

export function getTemplateStyles(id: number) {
  return http.get<{ styles: string[]; style_mapping: Record<string, string> }>(
    `/api/bid-word-templates/${id}/styles/`,
  )
}

/** 预览产物下载 URL（image/pdf），需带 Bearer，前端用 blob 下载 */
export function downloadTemplatePreview(
  id: number,
  type: 'image' | 'pdf',
  versionId?: number,
) {
  return http.get(`/api/bid-word-templates/${id}/preview/`, {
    params: { type, ...(versionId ? { version_id: versionId } : {}) },
    responseType: 'blob',
    timeout: 120000,
  })
}

/**
 * 带 Bearer token 下载模板文件（blob 方式，原因同 downloadBidDocument）。
 */
export function downloadTemplate(id: number, versionId?: number) {
  return http.get(`/api/bid-word-templates/${id}/download/`, {
    params: versionId ? { version_id: versionId } : undefined,
    responseType: 'blob',
    timeout: 120000,
  })
}
