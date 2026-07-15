// frontend/src/api/knowledge.ts
import { http } from './http'

// ============================================================================
// 类型定义
// ============================================================================

export interface PageResult<T> {
  count: number
  next?: string | null
  previous?: string | null
  results: T[]
}

export interface KnowledgeBase {
  id: number
  name: string
  description: string
  kb_type: string
  kb_type_display: string
  visibility: string
  visibility_display: string
  is_active: boolean
  document_count: number
  chunk_count: number
  created_at: string
  updated_at: string
  created_by: number
  created_by_name: string
}

export interface KnowledgeDocument {
  id: number
  knowledge_base: number
  knowledge_base_name: string
  file_name: string
  file_size: number
  mime_type: string
  status: string
  status_display: string
  parse_status: string
  parse_status_display: string
  chunk_status: string
  chunk_status_display: string
  embedding_status: string
  embedding_status_display: string
  index_status: string
  index_status_display: string
  chunk_count: number
  error_message: string
  created_at: string
  updated_at: string
  created_by: number
  created_by_name: string
}

export interface KnowledgeChunk {
  id: number
  document: number
  document_title: string
  chunk_index: number
  title: string
  section_path: string
  content: string
  chunk_type: string
  chunk_type_display: string
  page_start: number | null
  page_end: number | null
  token_count: number
  created_at: string
}

export interface RetrievalResult {
  query: string
  results: RetrievalChunk[]
  latency_ms: number
  log_id: number
  rag_context?: RagContext
}

export interface RetrievalChunk {
  chunk_id: number
  document_id: number
  document_title: string
  knowledge_base_id: number
  knowledge_base_name: string
  kb_type: string
  score: number
  rank: number
  title: string
  section_path: string
  content: string
  content_preview: string
  full_content_length: number
  page_start: number | null
  page_end: number | null
}

export interface RagContext {
  text: string
  sources: Array<{
    chunk_id: number
    document_title: string
    knowledge_base_name: string
    section_path: string
    page_start: number | null
    page_end: number | null
  }>
  token_count: number
  chunk_count: number
}

// ============================================================================
// 知识库 API
// ============================================================================

export function listKnowledgeBases(params?: { kb_type?: string; is_active?: boolean }) {
  return http.get<PageResult<KnowledgeBase>>('/api/knowledge/bases/', { params })
}

export function createKnowledgeBase(data: {
  name: string
  description?: string
  kb_type: string
  visibility?: string
}) {
  return http.post<KnowledgeBase>('/api/knowledge/bases/', data)
}

export function getKnowledgeBase(id: number) {
  return http.get<KnowledgeBase>(`/api/knowledge/bases/${id}/`)
}

export function updateKnowledgeBase(id: number, data: Partial<KnowledgeBase>) {
  return http.patch<KnowledgeBase>(`/api/knowledge/bases/${id}/`, data)
}

export function deleteKnowledgeBase(id: number) {
  return http.delete(`/api/knowledge/bases/${id}/`)
}

// ============================================================================
// 文档 API
// ============================================================================

export function listDocuments(
  kbId: number,
  params?: { status?: string; page?: number; page_size?: number }
) {
  return http.get<PageResult<KnowledgeDocument>>(`/api/knowledge/bases/${kbId}/documents/`, { params })
}

/**
 * 直接上传知识库文档（推荐）。
 * 后端接收 multipart/form-data，计算 SHA256，上传 MinIO，触发处理。
 */
export function directUploadDocument(
  kbId: number,
  file: File,
  onProgress?: (percent: number) => void
) {
  const formData = new FormData()
  formData.append('file', file)

  // 动态超时计算
  const fileSizeMB = file.size / 1024 / 1024
  const timeout = Math.min(
    Math.max(fileSizeMB * 15 * 1000 + 30 * 1000, 60 * 1000),  // 最少60秒，每MB预留15秒
    20 * 60 * 1000  // 最大20分钟
  )

  return http.post<{ document_id: number; status: string; task_id: number }>(
    `/api/knowledge/bases/${kbId}/documents/upload/`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout,
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100)
          onProgress(percent)
        }
      },
    }
  )
}

export function getDocument(id: number) {
  return http.get<KnowledgeDocument>(`/api/knowledge/documents/${id}/`)
}

export function deleteDocument(id: number) {
  return http.delete(`/api/knowledge/documents/${id}/`)
}

export function reprocessDocument(id: number) {
  return http.post<{ document_id: number; status: string; task_id: number }>(
    `/api/knowledge/documents/${id}/reprocess/`
  )
}

export function rebuildKnowledgeBaseIndex(kbId: number) {
  return http.post<{ knowledge_base_id: number; message: string }>(
    `/api/knowledge/bases/${kbId}/rebuild-index/`
  )
}

// ============================================================================
// @deprecated 以下 API 为 MinIO presigned 直传模式，不推荐使用。
// 请使用 directUploadDocument() 替代。
// ============================================================================

/**
 * @deprecated 使用 directUploadDocument() 替代
 */
export interface InitUploadPayload {
  file_name: string
  file_size: number
  file_hash: string
  mime_type?: string
}

/**
 * @deprecated 使用 directUploadDocument() 替代
 */
export interface InitUploadResponse {
  document_id: number
  upload_url: string
  upload_fields: Record<string, string>
  object_key: string
  expires_in: number
}

/**
 * @deprecated 使用 directUploadDocument() 替代
 */
export function initUpload(kbId: number, payload: InitUploadPayload) {
  return http.post<InitUploadResponse>(`/api/knowledge/bases/${kbId}/documents/`, payload)
}

/**
 * @deprecated 使用 directUploadDocument() 替代
 */
export function completeUpload(id: number) {
  return http.post<{ document_id: number; status: string; task_id: number }>(
    `/api/knowledge/documents/${id}/complete-upload/`
  )
}

// ============================================================================
// 分块 API
// ============================================================================

export function listChunks(docId: number) {
  return http.get<PageResult<KnowledgeChunk>>(`/api/knowledge/documents/${docId}/chunks/`)
}

export function listChunksByKnowledgeBase(
  kbId: number,
  params?: { page?: number; page_size?: number; document_id?: number; keyword?: string }
) {
  return http.get<PageResult<KnowledgeChunk>>(`/api/knowledge/bases/${kbId}/chunks/`, { params })
}

export function getChunk(id: number) {
  return http.get<KnowledgeChunk>(`/api/knowledge/chunks/${id}/`)
}

// ============================================================================
// 检索测试 API
// ============================================================================

export interface RetrievalTestPayload {
  query: string
  knowledge_base_ids: number[]
  top_k?: number
  filters?: Record<string, unknown>
  retrieval_mode?: RetrievalMode
}

export type RetrievalMode =
  | 'postgres_fulltext'
  | 'keyword'
  | 'vector'
  | 'hybrid'
  | 'hybrid_rerank'

export const RETRIEVAL_MODE_OPTIONS: Array<{ value: RetrievalMode; label: string; desc: string }> = [
  { value: 'hybrid', label: '混合检索', desc: '向量 + 全文（RRF 融合），默认推荐' },
  { value: 'vector', label: '向量检索', desc: '语义相似度，需 embedding 已生成' },
  { value: 'postgres_fulltext', label: '全文检索', desc: 'PostgreSQL GIN 索引' },
  { value: 'keyword', label: '关键词匹配', desc: 'LIKE 兜底' },
]

export function testRetrieval(payload: RetrievalTestPayload) {
  return http.post<RetrievalResult>('/api/knowledge/retrieval/test/', payload)
}