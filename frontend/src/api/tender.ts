import axios from 'axios'
import { http } from './http'

// ============================================================================
// 类型定义
// ============================================================================

export interface TenderFile {
  id: number
  project: number
  lot: number | null
  original_name: string
  file_size: number
  file_size_mb: number
  content_type: string
  file_category: string
  file_category_display: string
  object_key: string
  status: string
  status_display: string
  parse_task: number | null
  error_message: string
  created_at: string
  updated_at: string
}

export interface ParsedDocument {
  id: number
  tender_file: number
  tender_file_name: string
  is_active: boolean
  markdown_uri: string
  page_count: number
  parse_engine: string
  parser_version: string
  parse_quality: string
  quality_metrics: Record<string, unknown>
  parse_duration: number | null
  section_tree: Record<string, unknown>
  chunk_count: number
  created_at: string
  updated_at: string
}

export interface TenderChunk {
  id: number
  parsed_document: number
  parent_chunk: number | null
  chunk_level: string
  chunk_level_display: string
  chunk_index: number
  content_hash: string
  chunk_type: string
  chunk_type_display: string
  secondary_types: string[]
  classification_confidence: number | null
  matched_keywords: string[]
  section_title: string
  section_path: string
  clause_no: string
  content: string
  token_count: number
  page_start: number | null
  page_end: number | null
  is_table: boolean
  is_mandatory: boolean
  has_deadline: boolean
  has_amount: boolean
  has_score: boolean
  has_penalty: boolean
  has_timeline: boolean
  embedding_status: string
  created_at: string
}

export interface TenderChunkListItem {
  id: number
  chunk_level: string
  chunk_level_display: string
  chunk_index: number
  chunk_type: string
  chunk_type_display: string
  section_title: string
  section_path: string
  clause_no: string
  token_count: number
  is_mandatory: boolean
  has_deadline: boolean
  has_amount: boolean
  has_score: boolean
  has_penalty: boolean
  has_timeline: boolean
}

export interface PipelineJob {
  id: number
  tender_file: number
  stage: string
  stage_display: string
  status: string
  status_display: string
  version: string
  started_at: string | null
  finished_at: string | null
  error_message: string
  retry_count: number
  created_at: string
}

export interface ChunkStats {
  total_count: number
  type_distribution: Record<string, number>
  level_distribution: Record<string, number>
  mandatory_count: number
  feature_stats: Record<string, number>
}

export interface ParseDebug {
  tender_file_id: number
  parsed_document_id: number
  page_count: number
  parse_engine: string
  parser_version: string
  parse_quality: string
  parse_duration_seconds: number
  quality_metrics: Record<string, unknown>
}

export interface ChunkDebug {
  parsed_document_id: number
  chunk_count: number
  chunk_type_distribution: Record<string, number>
  chunk_level_distribution: Record<string, number>
  mandatory_chunk_count: number
  table_chunk_count: number
  feature_stats: Record<string, number>
  warnings: string[]
}

// ============================================================================
// 上传相关
// ============================================================================

/**
 * 直接上传招标文件（推荐）。
 * 后端接收 multipart/form-data，计算 SHA256，上传 MinIO，触发解析。
 */
export interface DirectUploadPayload {
  project_id: number
  lot_id?: number | null
  file_category?: 'tender_file' | 'attachment' | 'clarification'
}

export interface DirectUploadResponse {
  file_id: number
  status: string
  task_id: number | null
}

export function directUpload(file: File, payload: DirectUploadPayload) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('project_id', String(payload.project_id))
  if (payload.lot_id) {
    formData.append('lot_id', String(payload.lot_id))
  }
  if (payload.file_category) {
    formData.append('file_category', payload.file_category)
  }
  return http.post<DirectUploadResponse>(
    '/api/tender/files/upload',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  )
}

// ============================================================================
// @deprecated 以下 API 为 MinIO presigned 直传模式，不推荐使用。
// 在非 HTTPS 环境下 crypto.subtle 不可用，可能导致上传失败。
// 请使用 directUpload() 替代。
// ============================================================================

/**
 * @deprecated 使用 directUpload() 替代
 */
export interface InitUploadPayload {
  project_id: number
  lot_id?: number | null
  file_name: string
  file_size: number
  content_type?: string
  file_category: 'tender_file' | 'attachment' | 'clarification'
}

/**
 * @deprecated 使用 directUpload() 替代
 */
export interface InitUploadResponse {
  file_id: number
  upload_url: string
  upload_fields: Record<string, string>
  object_key: string
  expires_in: number
}

/**
 * @deprecated 使用 directUpload() 替代
 */
export function initUpload(payload: InitUploadPayload) {
  return http.post<InitUploadResponse>('/api/tender/files/init-upload', payload)
}

/**
 * @deprecated 使用 directUpload() 替代
 */
export function completeUpload(fileId: number) {
  return http.post<{ file_id: number; status: string; task_id: number | null }>(
    `/api/tender/files/${fileId}/complete-upload`
  )
}

/**
 * @deprecated 使用 directUpload() 替代
 */
export function postToPresignedForm(
  uploadUrl: string,
  fields: Record<string, string>,
  file: File,
  onProgress?: (percent: number) => void,
) {
  const form = new FormData()
  Object.entries(fields).forEach(([k, v]) => form.append(k, v))
  form.append('file', file)
  return axios.post(uploadUrl, form, {
    withCredentials: false,
    onUploadProgress(event) {
      if (!event.total) return
      onProgress?.(Math.round((event.loaded / event.total) * 100))
    },
  })
}

export function retryParse(fileId: number) {
  return http.post<{ task_id: number; status: string }>(
    `/api/tender/files/${fileId}/retry-parse`
  )
}

// ============================================================================
// 文件管理
// ============================================================================

export interface FileListParams {
  project_id: number
  lot_id?: number
  file_category?: string
  status?: string
}

export function listTenderFiles(params: FileListParams) {
  return http.get<TenderFile[]>('/api/tender/files', { params })
}

export function getTenderFile(fileId: number) {
  return http.get<TenderFile>(`/api/tender/files/${fileId}`)
}

export function deleteTenderFile(fileId: number) {
  return http.delete(`/api/tender/files/${fileId}`)
}

// ============================================================================
// 解析文档
// ============================================================================

export function getParsedDocument(parsedDocId: number) {
  return http.get<ParsedDocument>(`/api/tender/parsed-documents/${parsedDocId}`)
}

export function getParsedDocumentByFile(fileId: number) {
  return http.get<ParsedDocument>(`/api/tender/files/${fileId}/parsed-document`)
}

// ============================================================================
// 分块管理
// ============================================================================

export interface ChunkListParams {
  chunk_type?: string
  chunk_level?: string
  is_mandatory?: string
  search?: string
  with_content?: string
}

export function listChunks(parsedDocId: number, params?: ChunkListParams) {
  return http.get<TenderChunk[] | TenderChunkListItem[]>(
    `/api/tender/parsed-documents/${parsedDocId}/chunks`,
    { params }
  )
}

export function getChunk(chunkId: number) {
  return http.get<TenderChunk>(`/api/tender/chunks/${chunkId}`)
}

export function getChunkStats(parsedDocId: number) {
  return http.get<ChunkStats>(`/api/tender/parsed-documents/${parsedDocId}/chunks/stats`)
}

// ============================================================================
// 流水线任务
// ============================================================================

export function listPipelineJobs(fileId: number) {
  return http.get<PipelineJob[]>(`/api/tender/files/${fileId}/pipeline-jobs`)
}

// ============================================================================
// 调试输出
// ============================================================================

export function getParseDebug(parsedDocId: number) {
  return http.get<ParseDebug>(`/api/tender/parsed-documents/${parsedDocId}/debug/parse`)
}

export function getChunkDebug(parsedDocId: number) {
  return http.get<ChunkDebug>(`/api/tender/parsed-documents/${parsedDocId}/debug/chunk`)
}

// ============================================================================
// 重新解析
// ============================================================================

export interface ReparseResponse {
  message: string
  file_id: number
  status: string
  task_id: number
}

export interface ParseVersion {
  id: number
  parser_version: string
  parse_engine: string
  parse_quality: string
  page_count: number
  chunk_count: number
  is_active: boolean
  created_at: string
}

export interface ParseVersionsResponse {
  results: ParseVersion[]
}

export function reparseTenderFile(fileId: number) {
  return http.post<ReparseResponse>(`/api/tender/files/${fileId}/reparse`)
}

export function getParseVersions(fileId: number) {
  return http.get<ParseVersionsResponse>(`/api/tender/files/${fileId}/parse-versions`)
}

export function activateParseVersion(fileId: number, versionId: number) {
  return http.post<{ message: string }>(
    `/api/tender/files/${fileId}/parse-versions/${versionId}/activate`
  )
}