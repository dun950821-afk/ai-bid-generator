// frontend/src/api/prompt.ts
import { http } from './http'

// 类型定义
export interface PromptVersion {
  id: number
  version: string
  status: 'draft' | 'published' | 'archived'
  status_display: string
  system_prompt: string
  user_prompt: string
  output_schema: Record<string, unknown>
  variable_schema: Record<string, unknown>
  changelog: string
  created_by_name: string
  created_at: string
}

export interface PromptTemplate {
  id: number
  key: string
  name: string
  scenario: string
  scenario_display: string
  description: string
  scope: string
  scope_display: string
  is_active: boolean
  published_version: PromptVersion | null
  version_count: number
  created_at: string
  updated_at: string
  versions?: PromptVersion[]
}

export interface PromptTemplateCreateParams {
  key: string
  name: string
  scenario: string
  description?: string
}

export interface PromptVersionCreateParams {
  version: string
  system_prompt?: string
  user_prompt: string
  output_schema?: Record<string, unknown>
  variable_schema?: Record<string, unknown>
  changelog?: string
}

// API
export const promptApi = {
  // 模板
  listTemplates(params?: { scenario?: string; scope?: string; is_active?: boolean }) {
    return http.get<{ count: number; results: PromptTemplate[] }>('/api/generation/prompt-templates/', { params })
  },

  getTemplate(id: number) {
    return http.get<PromptTemplate>(`/api/generation/prompt-templates/${id}/`)
  },

  createTemplate(data: PromptTemplateCreateParams) {
    return http.post<PromptTemplate>('/api/generation/prompt-templates/', data)
  },

  updateTemplate(id: number, data: Partial<PromptTemplateCreateParams & { is_active: boolean }>) {
    return http.patch<PromptTemplate>(`/api/generation/prompt-templates/${id}/`, data)
  },

  // 停用模板（不是删除）
  deactivateTemplate(id: number) {
    return http.delete(`/api/generation/prompt-templates/${id}/`)
  },

  // 版本 - 不分页，直接返回数组
  listVersions(templateId: number) {
    return http.get<PromptVersion[]>(
      `/api/generation/prompt-templates/${templateId}/versions/`
    )
  },

  getVersion(templateId: number, versionId: number) {
    return http.get<PromptVersion>(`/api/generation/prompt-templates/${templateId}/versions/${versionId}/`)
  },

  createVersion(templateId: number, data: PromptVersionCreateParams) {
    return http.post<PromptVersion>(`/api/generation/prompt-templates/${templateId}/versions/`, data)
  },

  updateVersion(templateId: number, versionId: number, data: Partial<PromptVersionCreateParams>) {
    return http.patch<PromptVersion>(`/api/generation/prompt-templates/${templateId}/versions/${versionId}/`, data)
  },

  deleteVersion(templateId: number, versionId: number) {
    return http.delete(`/api/generation/prompt-templates/${templateId}/versions/${versionId}/`)
  },

  publishVersion(templateId: number, versionId: number) {
    return http.post<PromptVersion>(`/api/generation/prompt-templates/${templateId}/versions/${versionId}/publish/`)
  },

  copyVersion(templateId: number, versionId: number) {
    return http.post<PromptVersion>(`/api/generation/prompt-templates/${templateId}/versions/${versionId}/copy/`)
  },
}

// 场景选项（用于下拉框）
export const SCENARIO_OPTIONS = [
  { value: 'outline_generation', label: '大纲生成' },
  { value: 'outline_extraction', label: '大纲提取' },
  { value: 'section_writing', label: '章节撰写' },
  { value: 'section_needs_analysis', label: '章节需求分析' },
  { value: 'requirement_analysis', label: '条款分析' },
  { value: 'requirement_response', label: '条款响应' },
  { value: 'requirement_extraction', label: '条款抽取' },
  { value: 'requirement_extraction_scoring', label: '评分项抽取' },
  { value: 'requirement_extraction_mandatory', label: '强制条款抽取' },
  { value: 'requirement_extraction_qualification', label: '资格要求抽取' },
  { value: 'requirement_extraction_commercial', label: '商务条款抽取' },
  { value: 'requirement_extraction_technical', label: '技术要求抽取' },
  { value: 'requirement_extraction_submission', label: '递交要求抽取' },
  { value: 'scoring_analysis', label: '评分点分析' },
  { value: 'deviation_analysis', label: '偏离分析' },
  { value: 'evidence_matching', label: '资料匹配' },
  { value: 'content_polishing', label: '内容润色' },
  { value: 'consistency_check', label: '一致性检查' },
  { value: 'tender_qa', label: '招标问答' },
]

// ============================================================================
// 轻量级版本接口（用于选择器）
// ============================================================================

export interface PromptVersionLite {
  id: number
  version: string
  status: string
  status_display: string
  template_id: number
  template_name?: string
  changelog: string
  created_at: string
}

export const promptVersionApi = {
  /**
   * 按场景获取提示词版本列表
   * GET /api/generation/prompt-versions/?scenario=&status=
   */
  listByScenario(params: { scenario: string; status?: string }) {
    return http.get<PromptVersionLite[]>('/api/generation/prompt-versions/', { params })
  },
}
