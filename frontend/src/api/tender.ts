import axios from 'axios'
import { http } from './http'

export interface InitUploadPayload {
  project_id: number
  lot_id?: number | null
  file_name: string
  file_size: number
  content_type: string
  file_category: 'tender_file' | 'attachment' | 'clarification'
}

export function initUpload(payload: InitUploadPayload) {
  return http.post('/api/tender/files/init-upload', payload)
}

export function completeUpload(fileId: number) {
  return http.post(`/api/tender/files/${fileId}/complete-upload`)
}

export function listTenderFiles(projectId: number) {
  return http.get('/api/tender/files', { params: { project_id: projectId } })
}

// 预签名 URL 直传 MinIO：不能带 Authorization/X-CSRF-Token，也不能套 baseURL，
// 所以走裸 axios.put，不复用 http 实例的拦截器。
export function putToPresignedUrl(uploadUrl: string, file: File, onProgress?: (percent: number) => void) {
  return axios.put(uploadUrl, file, {
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    onUploadProgress(event) {
      if (!event.total) return
      onProgress?.(Math.round((event.loaded / event.total) * 100))
    },
  })
}
