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

// MinIO POST policy 直传：相比 PUT 预签名，POST policy 把
// content-length-range 写进 SigV4 签名，MinIO 在接收阶段直接掐断
// 超额请求；前端必须 multipart 一次性把 fields + file 提交上去。
// 跨域到 MinIO 不带 cookie，也不复用 http 实例的拦截器与 baseURL。
export function postToPresignedForm(
  uploadUrl: string,
  fields: Record<string, string>,
  file: File,
  onProgress?: (percent: number) => void,
) {
  const form = new FormData()
  // 顺序敏感：policy / signature / key 等字段必须在 file 之前，
  // 否则 S3/MinIO 不会读到 policy 就开始读 body。
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
