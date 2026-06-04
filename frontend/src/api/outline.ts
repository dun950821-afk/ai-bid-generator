// frontend/src/api/outline.ts
import { http } from './http'

// ============================================================================
// 类型定义
// ============================================================================

export interface Outline {
  id: number
  project: number
  lot: number
  lot_name: string
  project_name: string
  name: string
  source: string
  source_display: string
  status: string
  status_display: string
  is_current: boolean
  section_count: number
  created_by_name: string
  created_at: string
  updated_at: string
}

export interface OutlineDetail extends Outline {
  sections: SectionTreeItem[]
}

export interface Section {
  id: number
  outline: number
  parent: number | null
  title: string
  level: number
  sort_order: number
  content: string
  word_count: number
  status: string
  status_display: string
  generation_status: string
  generation_status_display: string
  user_prompt: string
  created_at: string
  updated_at: string
}

export interface SectionTreeItem {
  id: number
  parent: number | null
  title: string
  level: number
  sort_order: number
  status: string
  status_display: string
  generation_status: string
  generation_status_display: string
  word_count: number
  children_count: number
  content_matrix_status?: string
  children?: SectionTreeItem[]
}

export interface SectionVersion {
  id: number
  version_no: number
  source: string
  source_display: string
  word_count: number
  content?: string
  created_by_name: string
  created_at: string
}

export interface PresetTemplate {
  id: number
  name: string
  description: string
  category: string
  is_active: boolean
  sections: {
    id: number
    title: string
    level: number
    sort_order: number
  }[]
}

export interface GenerationStatus {
  task_id: number
  status: string
  progress: number
  current_step: string
  total: number
  completed: number
  failed: number
  running: number
  sections: {
    id: number
    title: string
    status: string
  }[]
}

export interface AnalysisResult {
  keywords: string[]
  knowledge_types: string[]
  requirement_types: string[]
  background: string
  suggested_prompt: string
}

// ============================================================================
// 预设模板 API
// ============================================================================

export function listPresetTemplates() {
  return http.get<PresetTemplate[]>('/api/preset-templates/')
}

export function getPresetTemplate(id: number) {
  return http.get<PresetTemplate>(`/api/preset-templates/${id}/`)
}

// ============================================================================
// 大纲 API
// ============================================================================

export interface OutlineListParams {
  project_id?: number
  lot_id?: number
  is_current?: boolean
}

export function listOutlines(params?: OutlineListParams) {
  return http.get<Outline[]>('/api/outlines/', { params })
}

export function getOutline(id: number) {
  return http.get<OutlineDetail>(`/api/outlines/${id}/`)
}

export function createOutline(data: { lot: number; name: string }) {
  return http.post<Outline>('/api/outlines/', data)
}

export function updateOutline(id: number, data: Partial<Outline>) {
  return http.patch<Outline>(`/api/outlines/${id}/`, data)
}

export function deleteOutline(id: number) {
  return http.delete(`/api/outlines/${id}/`)
}

export function createOutlineFromPreset(data: {
  lot_id: number
  template_id: number
  name?: string
}) {
  return http.post<OutlineDetail>('/api/outlines/from_preset/', data)
}

export function createOutlineFromAi(data: {
  tender_file_id: number
  sections_data: { title: string; level: number }[]
  name?: string
}) {
  return http.post<OutlineDetail>('/api/outlines/from_ai/', data)
}

// 从招标文件生成大纲（异步任务）
export function generateOutlineFromTender(data: {
  tender_file_id: number
  name?: string
}) {
  return http.post<{ task_id: number; status: string; message: string }>(
    '/api/outlines/generate_from_tender/',
    data
  )
}

export function getOutlineSections(outlineId: number) {
  return http.get<SectionTreeItem[]>(`/api/outlines/${outlineId}/sections/`)
}

export function reorderSections(outlineId: number, sections: { id: number; sort_order: number }[]) {
  return http.post(`/api/outlines/${outlineId}/reorder_sections/`, { sections })
}

export function generateAllSections(outlineId: number) {
  return http.post<{ task_id: number; status: string; message: string }>(
    `/api/outlines/${outlineId}/generate_all/`
  )
}

export function getGenerationStatus(outlineId: number) {
  return http.get<GenerationStatus>(`/api/outlines/${outlineId}/generation_status/`)
}

export function setOutlineCurrent(id: number) {
  return http.post(`/api/outlines/${id}/set_current/`)
}

// ============================================================================
// 章节 API
// ============================================================================

export function getSection(id: number) {
  return http.get<Section>(`/api/sections/${id}/`)
}

export function createSection(data: { outline: number; parent?: number; title: string }) {
  return http.post<Section>('/api/sections/', data)
}

export function updateSection(id: number, data: Partial<Section>) {
  return http.patch<Section>(`/api/sections/${id}/`, data)
}

export function deleteSection(id: number) {
  return http.delete(`/api/sections/${id}/`)
}

export function moveSection(id: number, data: { new_parent_id: number | null; new_sort_order: number }) {
  return http.post<Section>(`/api/sections/${id}/move/`, data)
}

export function analyzeSection(id: number) {
  return http.post<AnalysisResult>(`/api/sections/${id}/analyze/`)
}

export function generateSection(id: number, data: {
  user_prompt?: string
  analysis_result?: AnalysisResult
  force?: boolean
}) {
  return http.post<{ task_id: number; status: string; message: string }>(
    `/api/sections/${id}/generate/`,
    data
  )
}

export function getSectionVersions(id: number) {
  return http.get<SectionVersion[]>(`/api/sections/${id}/versions/`)
}

export function rollbackSection(id: number, version_no: number) {
  return http.post(`/api/sections/${id}/rollback/`, { version_no })
}

// ============================================================================
// 矩阵相关类型
// ============================================================================

export interface ContentMatrix {
  section_role: string
  write_scope: string
  exclude_scope: string
  reference_sections: Array<{ id: number; section_number: string; title: string }>
  no_duplicate_sections: Array<{ id: number; section_number: string; title: string }>
  dependency_sections: Array<{ id: number; section_number: string; title: string }>
  expression_form: string
  writing_depth: string
  related_requirements: number[]
  generation_priority: number
  ai_reasoning_summary: string
  manual_notes: string
}

export interface SectionMatrix {
  section_id: number
  content_matrix: ContentMatrix | null
  content_matrix_status: string
  content_matrix_version: number
  content_matrix_updated_at: string | null
  content_matrix_error: string
}

export interface MatrixStatus {
  total: number
  pending: number
  generating: number
  generated: number
  edited: number
  failed: number
  is_generating: boolean
  current_task_id: number | null
}

export interface GenerationTask {
  id: number
  task_type: string
  status: string
  total_count: number
  success_count: number
  failed_count: number
  skipped_count: number
  current_section_id: number | null
  current_section_title: string | null
  error_message: string
  created_at: string
  updated_at: string
  finished_at: string | null
  params: Record<string, any>
  result: Record<string, any>
}

// ============================================================================
// 矩阵相关 API
// ============================================================================

// 获取大纲矩阵整体状态
export function getMatrixStatus(outlineId: number) {
  return http.get<MatrixStatus>(`/api/outlines/${outlineId}/matrix_status/`)
}

// 批量生成矩阵
export function generateMatrix(outlineId: number, data: {
  force?: boolean
  section_ids?: number[]
}) {
  return http.post<{ task_id: number; status: string; target_count: number }>(
    `/api/outlines/${outlineId}/generate_matrix/`,
    data
  )
}

// 重试失败的矩阵
export function retryMatrixFailed(outlineId: number) {
  return http.post<{ task_id: number; retry_count: number }>(
    `/api/outlines/${outlineId}/retry_matrix_failed/`
  )
}

// 获取章节矩阵
export function getSectionMatrix(sectionId: number) {
  return http.get<SectionMatrix>(`/api/sections/${sectionId}/matrix/`)
}

// 更新章节矩阵（乐观锁）
export function updateSectionMatrix(sectionId: number, data: {
  content_matrix_version: number
  content_matrix: Partial<ContentMatrix>
}) {
  return http.put<{
    success: boolean
    content_matrix_version: number
    content_matrix_status: string
  }>(`/api/sections/${sectionId}/matrix/`, data)
}

// 生成单章节矩阵
export function generateSectionMatrix(sectionId: number, force: boolean = false) {
  return http.post<{ task_id: number; status: string }>(
    `/api/sections/${sectionId}/generate_matrix/`,
    { force }
  )
}

// 获取生成任务状态
export function getGenerationTask(taskId: number) {
  return http.get<GenerationTask>(`/api/generation-tasks/${taskId}/`)
}

// 取消生成任务
export function cancelGenerationTask(taskId: number) {
  return http.post<{ success: boolean; status: string; message: string }>(
    `/api/generation-tasks/${taskId}/cancel/`
  )
}
