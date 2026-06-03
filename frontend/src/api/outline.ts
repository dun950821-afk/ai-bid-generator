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
}

export interface SectionVersion {
  id: number
  version_no: number
  source: string
  source_display: string
  word_count: number
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
