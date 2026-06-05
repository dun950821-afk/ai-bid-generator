// frontend/src/api/sectionContent.ts
import { http } from './http'

// 类型定义

export interface UploadImageResponse {
  url: string
  filename: string
  size: number
}

export interface UpdateContentPayload {
  content: string
  content_html?: string
}

export interface UpdateContentResponse {
  success: boolean
  content: string
  content_word_count: number
  content_generation_status: string
  version: number
}

// API 函数

/**
 * 上传编辑器图片
 */
export function uploadEditorImage(file: File, sectionId?: number, outlineId?: number) {
  const formData = new FormData()
  formData.append('file', file)
  if (sectionId) {
    formData.append('section_id', String(sectionId))
  }
  if (outlineId) {
    formData.append('outline_id', String(outlineId))
  }

  return http.post<UploadImageResponse>('/api/uploads/editor-image/', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}

/**
 * 更新章节内容
 */
export function updateSectionContent(sectionId: number, payload: UpdateContentPayload) {
  return http.put<UpdateContentResponse>(`/api/sections/${sectionId}/content/`, payload)
}

/**
 * 获取章节内容
 */
export function getSectionContent(sectionId: number) {
  return http.get<{ content: string }>(`/api/sections/${sectionId}/`)
}
