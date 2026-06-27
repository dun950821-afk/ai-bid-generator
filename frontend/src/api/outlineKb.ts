// frontend/src/api/outlineKb.ts
import { http } from './http'

export interface OutlineKbBinding {
  id: number
  outline: number
  knowledge_base: number
  kb_name: string
  kb_type: string
  rag_channel: string
  document_count: number
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface KnowledgeBaseOption {
  id: number
  name: string
  description: string
  kb_type: string
  rag_channel: string
  document_count: number
}

export function listOutlineKbBindings(outlineId: number) {
  return http.get<OutlineKbBinding[]>(`/api/outlines/${outlineId}/knowledge-bases/`)
}

export function bindOutlineKbs(outlineId: number, kbIds: number[]) {
  return http.post(`/api/outlines/${outlineId}/knowledge-bases/`, { kb_ids: kbIds })
}

export function unbindOutlineKb(outlineId: number, bindingId: number) {
  return http.delete(`/api/outlines/${outlineId}/knowledge-bases/${bindingId}/`)
}

export function patchOutlineKb(
  outlineId: number,
  bindingId: number,
  data: { sort_order?: number; is_active?: boolean }
) {
  return http.patch(`/api/outlines/${outlineId}/knowledge-bases/${bindingId}/`, data)
}

export function listAvailableKbs() {
  return http.get<KnowledgeBaseOption[]>('/api/knowledge/bases/?page_size=100')
}

export function searchSectionRetrieval(
  sectionId: number,
  data: {
    query?: string
    channels?: string[]
    knowledge_base_ids?: number[]
    top_k?: number
  }
) {
  return http.post<{
    retrieval_run_id: string
    results: Array<Record<string, unknown>>
    warnings: string[]
  }>(`/api/sections/${sectionId}/retrieval/search/`, data)
}

export function listSectionManualSources(sectionId: number) {
  return http.get(`/api/sections/${sectionId}/manual-sources/`)
}

export function saveSectionManualSources(
  sectionId: number,
  sources: Array<Record<string, unknown>>
) {
  return http.post(`/api/sections/${sectionId}/manual-sources/`, { sources })
}

export function deleteSectionManualSource(sectionId: number, sourceId: number) {
  return http.delete(`/api/sections/${sectionId}/manual-sources/${sourceId}/`)
}

export function getSectionLatestRecord(sectionId: number) {
  return http.get<{
    id: number
    status: string
    rag_sources: Array<Record<string, unknown>>
    generation_meta: Record<string, unknown>
    finished_at: string | null
    created_at: string
  }>(`/api/sections/${sectionId}/generation-records/latest/`)
}
