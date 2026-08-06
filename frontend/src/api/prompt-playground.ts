// frontend/src/api/prompt-playground.ts
/** Prompt Playground API。 */

import { http } from './http'

// ============================================================================
// 类型定义
// ============================================================================

export interface RagOptions {
  enabled: boolean
  knowledge_base_ids?: number[]
  query?: string
  top_k?: number
  max_context_tokens?: number
  filters?: Record<string, unknown>
}

export interface PlaygroundRenderRequest {
  prompt_version_id: number
  variables?: Record<string, unknown>
  rag_options?: RagOptions
  /** 调试覆盖：非空时跳过版本模板，直接用该文本渲染（不落库） */
  system_prompt?: string
  user_prompt?: string
}

export interface PlaygroundRenderResponse {
  system_prompt: string
  user_prompt: string
  missing_variables: string[]
  token_estimate: number
  rag: {
    enabled: boolean
    sources: Array<{
      chunk_id: number
      document_title: string
      knowledge_base_name: string
      section_path?: string
      page_start?: number
      page_end?: number
    }>
    token_count: number
    retrieval_log_id?: number
  }
}

export interface PlaygroundRunRequest {
  prompt_version_id: number
  model_config_id?: number
  variables?: Record<string, unknown>
  rag_options?: RagOptions
  /** 调试覆盖：非空时跳过版本模板，直接用该文本渲染（不落库） */
  system_prompt?: string
  user_prompt?: string
  /** 是否保存运行记录；纯调试默认不落库 */
  save_run?: boolean
}

export interface PlaygroundRunResponse {
  run_id: number | null
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'schema_failed'
  rendered_prompt: {
    system_prompt: string
    user_prompt: string
  }
  output: {
    raw_text: string
    parsed_json: Record<string, unknown>
    schema_valid: boolean
    schema_errors: string[]
  }
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    latency_ms: number
  }
  rag: {
    enabled: boolean
    retrieval_log_id: number | null
    sources: Array<Record<string, unknown>>
  }
  error_message: string
}

export interface PromptRun {
  id: number
  template_name: string
  version_number: string
  model_name: string
  scenario: string
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'schema_failed'
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  latency_ms: number
  created_at: string
  created_by_name: string
}

export interface PromptRunDetail extends PromptRun {
  template_key: string
  model_provider: string
  input_variables: Record<string, unknown>
  rendered_system_prompt: string
  rendered_user_prompt: string
  output_text: string
  output_json: Record<string, unknown>
  error_message: string
  schema_valid: boolean
  schema_errors: string[]
  rag_info: {
    enabled: boolean
    retrieval_log_id?: number
    sources?: Array<Record<string, unknown>>
    context_preview?: string
  }
}

// ============================================================================
// API
// ============================================================================

export interface PlaygroundParseDocumentResponse {
  text: string
  page_count: number
  parse_engine: string
  parse_quality: string
  quality_metrics: Record<string, unknown>
  filename: string
  error_message: string
}

export const playgroundApi = {
  /**
   * 渲染提示词预览（不执行 LLM 调用）
   */
  render(data: PlaygroundRenderRequest) {
    return http.post<PlaygroundRenderResponse>('/api/generation/playground/render/', data)
  },

  /**
   * 执行提示词运行
   * DeepSeek 单次生成 30-70s+，全局 axios 30s 超时会先报错（后端仍在执行），单独放宽
   */
  run(data: PlaygroundRunRequest) {
    return http.post<PlaygroundRunResponse>('/api/generation/playground/run/', data, { timeout: 180000 })
  },

  /**
   * 解析文档为 Markdown（纯解析不落库）
   * doc 经 ONLYOFFICE 转换最坏约 4 分钟，timeout 放宽到 180s
   */
  parseDocument(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return http.post<PlaygroundParseDocumentResponse>(
      '/api/generation/playground/parse-document/',
      formData,
      { timeout: 180000 },
    )
  },
}

export const promptRunApi = {
  /**
   * 运行记录列表
   */
  list(params?: {
    template_id?: number
    status?: string
    scenario?: string
    limit?: number
    offset?: number
  }) {
    return http.get<PromptRun[]>('/api/generation/prompt-runs/', { params })
  },

  /**
   * 运行记录详情
   */
  get(id: number) {
    return http.get<PromptRunDetail>(`/api/generation/prompt-runs/${id}/`)
  },
}
