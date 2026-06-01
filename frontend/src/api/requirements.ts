import { http } from './http'
import { normalizeList } from '@/utils/normalize'

// ============================================================================
// 类型定义
// ============================================================================

export interface RagOptions {
  enabled: boolean
  knowledge_base_ids: number[]
  query: string
  top_k: number
  max_context_tokens: number
}

export interface RequirementExtractPayload {
  mode: 'rule' | 'llm' | 'hybrid'
  force: boolean
  model_config_id: number | null
  prompt_version_id: number | null
  rag_options: RagOptions
}

export interface RequirementExtractResult {
  success: boolean
  message: string
  data?: {
    total_count: number
    created_count: number
    updated_count: number
    requirement_ids: number[]
    prompt_run_ids: number[]
  }
}

export interface Requirement {
  id: number
  requirement_key: string
  requirement_no: string
  sort_order: number
  requirement_type: string
  requirement_type_display: string
  title: string
  content: string
  summary: string
  mandatory_level: string
  mandatory_level_display: string
  risk_level: string
  risk_level_display: string
  response_strategy: string
  response_strategy_display: string
  owner_role: string
  owner_role_display: string
  response_needed: boolean
  evidence_needed: boolean
  score_info: Record<string, unknown>
  deadline_info: Record<string, unknown>
  amount_info: Record<string, unknown>
  evidence_types: string[]
  review_status: string
  review_status_display: string
  source_page_start: number | null
  source_page_end: number | null
  source_section_path: string
  extraction_method: string
  confidence: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface RequirementDetail extends Requirement {
  tender_file_id: number
  parsed_document_id: number | null
  source_chunk_id: number | null
  prompt_version_id: number | null
  source_prompt_run_id: number | null
  raw_extracted: Record<string, unknown>
  metadata: Record<string, unknown>
}

export interface RequirementUpdatePayload {
  requirement_no?: string
  title?: string
  content?: string
  summary?: string
  requirement_type?: string
  mandatory_level?: string
  risk_level?: string
  response_strategy?: string
  owner_role?: string
  response_needed?: boolean
  evidence_needed?: boolean
  amount_info?: Record<string, unknown>
  deadline_info?: Record<string, unknown>
  score_info?: Record<string, unknown>
  evidence_types?: string[]
  review_status?: string
  is_active?: boolean
}

export interface RequirementListParams {
  parsed_document_id?: number
  requirement_type?: string
  mandatory_level?: string
  risk_level?: string
  owner_role?: string
  response_strategy?: string
  evidence_needed?: boolean
  review_status?: string
  is_active?: boolean
}

export interface RequirementListResponse {
  count: number
  results: Requirement[]
}

// ============================================================================
// API 函数
// ============================================================================

/**
 * 执行条款抽取
 * POST /api/requirements/files/{file_id}/extract/
 */
export function extractRequirements(
  fileId: number,
  payload: RequirementExtractPayload
) {
  return http.post<RequirementExtractResult>(
    `/api/requirements/files/${fileId}/extract/`,
    payload
  )
}

/**
 * 获取条款列表
 * GET /api/requirements/files/{file_id}/
 */
export function listRequirements(
  fileId: number,
  params?: RequirementListParams
) {
  return http.get<RequirementListResponse>(
    `/api/requirements/files/${fileId}/`,
    { params }
  )
}

/**
 * 获取条款详情
 * GET /api/requirements/{id}/
 */
export function getRequirement(id: number) {
  return http.get<RequirementDetail>(`/api/requirements/${id}/`)
}

/**
 * 更新条款
 * PATCH /api/requirements/{id}/
 */
export function updateRequirement(
  id: number,
  payload: RequirementUpdatePayload
) {
  return http.patch<Requirement>(
    `/api/requirements/${id}/`,
    payload
  )
}

/**
 * 删除条款
 * DELETE /api/requirements/{id}/
 */
export function deleteRequirement(id: number) {
  return http.delete(`/api/requirements/${id}/`)
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 安全获取条款列表
 */
export function getSafeRequirementList(response: unknown): Requirement[] {
  return normalizeList<Requirement>(response as RequirementListResponse)
}