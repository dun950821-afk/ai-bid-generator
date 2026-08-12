import { http } from './http'

// ============================================================================
// 类型定义
// ============================================================================

export type BlockType =
  | 'FIXED'
  | 'AUTO_FIELD'
  | 'AI_GENERATE'
  | 'AI_RESPONSE'
  | 'DATA_TABLE'
  | 'REPEAT_TABLE'
  | 'REPEAT_BLOCK'
  | 'MATERIAL_SLOT'
  | 'MANUAL'
  | 'PRICE'

export interface TemplateBlock {
  id: number
  block_key: string
  title: string
  block_type: BlockType
  type_display: string
  order: number
  is_separate_package: boolean
  anchor_text: string
  confidence: number | null
  source_config: Record<string, unknown>
  binding_config: Record<string, unknown>
  ai_result: Record<string, unknown>
  confirm_status: string
  confirm_status_display: string
  fill_status: string
  fill_status_display: string
  fill_payload?: Record<string, any>
  repeatCount?: number
  priceValue?: number | null
  created_at: string
  updated_at: string
}

export interface ResponseDocument {
  id: number
  title: string
  kind: string
  status: string
  file_name: string
  file_size: number
  error_message: string
  url: string
  created_at: string
}

export interface ResponseTemplate {
  id: number
  project: number
  lot: number | null
  source_file: number
  source_file_name: string
  parsed_document: number | null
  outline: number | null
  name: string
  source_section: string
  status: string
  status_display: string
  confidence: number | null
  summary_json: Record<string, unknown>
  error_message: string
  blocks: TemplateBlock[]
  documents: ResponseDocument[]
  created_at: string
  updated_at: string
}

// ============================================================================
// API
// ============================================================================

/** 创建响应模板(传招标文件 ID), 自动触发识别任务 */
export function createResponseTemplate(tenderFileId: number, name?: string) {
  return http.post<ResponseTemplate>('/api/response-templates/', {
    tender_file_id: tenderFileId,
    name,
  })
}

/** 查询响应模板列表(按项目/招标文件/标段过滤), 返回分页结构 */
export function listResponseTemplates(params?: {
  project_id?: number | string
  source_file_id?: number | string
  lot_id?: number | string
}) {
  return http.get<{ count: number; results: ResponseTemplate[] }>('/api/response-templates/', {
    params,
  })
}

/** 查询响应模板详情(含块列表) */
export function getResponseTemplate(id: number) {
  return http.get<ResponseTemplate>(`/api/response-templates/${id}/`)
}

/** 更新响应模板(名称等) */
export function updateResponseTemplate(id: number, data: Partial<ResponseTemplate>) {
  return http.patch<ResponseTemplate>(`/api/response-templates/${id}/`, data)
}

/** 确认模板(进入可生成状态) */
export function confirmResponseTemplate(id: number) {
  return http.post<ResponseTemplate>(`/api/response-templates/${id}/confirm/`)
}

/** 触发响应文件生成 */
export function generateResponseTemplate(id: number) {
  return http.post<{ detail: string }>(`/api/response-templates/${id}/generate/`)
}

/** 更新单个块(类型/绑定/确认) */
export function updateTemplateBlock(blockId: number, data: Partial<TemplateBlock>) {
  return http.patch<TemplateBlock>(`/api/response-template-blocks/${blockId}/`, data)
}

/** 重新识别响应模板 */
export function reAnalyzeResponseTemplate(id: number) {
  return http.post<{ detail: string }>(`/api/response-templates/${id}/re-analyze/`)
}

/** 获取解析后的招标文件原文(markdown, 双栏预览用) */
export function getSourceMarkdown(id: number) {
  return http.get<{ content: string; error: string }>(`/api/response-templates/${id}/source-markdown/`)
}
