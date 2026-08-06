import { http } from './http'
import { normalizeList } from '@/utils/normalize'

// ============================================================================
// 类型定义
// ============================================================================

export interface RequirementExtractPayload {
  extraction_types: string[]
  overwrite: boolean
  model_config_id: number | null
  prompt_version_id: number | null
}

export interface RequirementExtractResult {
  success: boolean
  message: string
  task_id?: number
  data?: {
    total_count: number
    created_count: number
    updated_count: number
    requirement_ids: number[]
    prompt_run_ids: number[]
  }
}

export interface RequirementDetailPoint {
  point_id?: string
  title: string
  requirement?: string
  score?: number | null
  score_text?: string
  mandatory_level?: string
  acceptance_basis?: string
  evidence?: string
  source_page?: number | null
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
  detail_points: RequirementDetailPoint[]
  classification_reason: string
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
  // 标段级去重标记：none=未参与/无重复，kept=保留项，duplicate=已被合并的重复项（默认列表不返回）
  dedup_status?: 'none' | 'kept' | 'duplicate'
  // 该条目合并掉的重复条款数量（kept 且 > 0 时展示"已合并 N 条"）
  merged_count?: number
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

export interface ExtractionRun {
  id: number
  status: string
  extraction_types: string[]
  total_count: number
  success_count: number
  failed_types: string[]
  prompt_versions: Record<string, unknown>
  overwrite: boolean
  is_active: boolean
  created_at: string
  finished_at: string | null
}

export interface ExtractionRunListResponse {
  count: number
  results: ExtractionRun[]
}

export interface RequirementListParams {
  parsed_document_id?: number
  extraction_run_id?: number
  requirement_type?: string
  mandatory_level?: string
  risk_level?: string
  owner_role?: string
  response_strategy?: string
  evidence_needed?: boolean
  review_status?: string
  is_active?: boolean
  include_duplicates?: boolean
}

export interface RequirementListResponse {
  count: number
  results: Requirement[]
  active_run_id?: number | null
}

// ============================================================================
// API 函数
// ============================================================================

/**
 * 执行条款抽取（V2：并行 6 场景）
 * POST /api/requirements/files/{file_id}/extract-v2/
 */
export function extractRequirements(
  fileId: number,
  payload: RequirementExtractPayload
) {
  return http.post<RequirementExtractResult>(
    `/api/requirements/files/${fileId}/extract-v2/`,
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

/**
 * 获取文件的抽取版本列表
 * GET /api/requirements/files/{file_id}/runs/
 */
export function listExtractionRuns(fileId: number) {
  return http.get<ExtractionRunListResponse>(
    `/api/requirements/files/${fileId}/runs/`
  )
}

/**
 * 切换当前抽取版本
 * POST /api/requirements/runs/{run_id}/activate/
 */
export function activateExtractionRun(runId: number) {
  return http.post<ExtractionRun>(`/api/requirements/runs/${runId}/activate/`)
}

// ============================================================================
// 标段级条款去重
// ============================================================================

export interface DedupTaskResult {
  task_id: number
  dedup_run_id: number
}

/** 被合并的重复条目（在完整条款字段基础上带来源文件名） */
export interface RequirementDuplicate extends Requirement {
  source_file_name?: string
}

export interface RequirementDuplicateListResponse {
  count: number
  results: RequirementDuplicate[]
}

/**
 * 触发标段级条款去重（异步任务；409 表示已有去重任务进行中）
 * POST /api/requirements/lots/{lot_id}/dedup/
 */
export function deduplicateLot(lotId: number) {
  return http.post<DedupTaskResult>(`/api/requirements/lots/${lotId}/dedup/`)
}

export interface DedupRun {
  id: number
  status: 'pending' | 'running' | 'success' | 'failed'
  total_count: number
  cluster_count: number
  duplicate_count: number
  async_task_id: number | null
  created_at: string
  finished_at: string | null
}

export interface LatestDedupRunResponse {
  result: DedupRun | null
}

/**
 * 获取标段最近一次去重运行（按钮完成态判定 + 自动去重进度接管）
 * GET /api/requirements/lots/{lot_id}/dedup-runs/latest/
 */
export function getLatestDedupRun(lotId: number) {
  return http.get<LatestDedupRunResponse>(
    `/api/requirements/lots/${lotId}/dedup-runs/latest/`
  )
}

/**
 * 获取某条款已合并的重复条目列表
 * GET /api/requirements/{id}/duplicates/
 */
export function listRequirementDuplicates(id: number) {
  return http.get<RequirementDuplicateListResponse>(
    `/api/requirements/${id}/duplicates/`
  )
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