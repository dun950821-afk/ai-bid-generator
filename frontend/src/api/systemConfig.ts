/**
 * 系统配置 API
 */

import { http } from '@/api/http'

export interface SystemSettings {
  // RAG 设置
  retrieval_mode: 'keyword' | 'semantic' | 'hybrid'
  top_k: number
  max_context_tokens: number
  enable_vector_search: boolean
  enable_rerank: boolean
  embedding_model_config_id: number | null
  rerank_model_config_id: number | null
  chat_model_config_id: number | null
  // 上传策略
  upload_mode: 'backend_proxy' | 'presigned_direct'
  max_upload_size_mb: number
  // 安全与审计
  enable_audit_log: boolean
  enable_prompt_log: boolean
  enable_rag_log: boolean
  mask_secrets: boolean
  login_fail_lock_count: number
}

export interface StorageConfig {
  id: number
  name: string
  is_default: boolean
  provider: 'minio' | 's3' | 'oss'
  endpoint: string
  public_endpoint: string
  bucket: string
  region: string
  secure: boolean
  proxy_enabled: boolean
  presign_expire_seconds: number
  max_upload_size_mb: number
  has_access_key: boolean
  access_key_masked: string
  has_secret_key: boolean
  secret_key_masked: string
  cors_config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ModelProvider {
  id: number
  key: string
  name: string
  provider_type: string
  base_url: string
  is_active: boolean
}

export interface ModelConfig {
  id: number
  provider: number
  provider_name: string
  model_name: string
  model_type: 'chat' | 'embedding' | 'rerank'
  display_name: string
  temperature: number
  max_tokens: number
  is_default: boolean
  is_active: boolean
}

export interface SystemConfigOverview {
  rag_settings: SystemSettings
  storage_default: StorageConfig | null
  models: {
    chat: ModelConfig | null
    embedding: ModelConfig | null
    rerank: ModelConfig | null
  }
}

export interface CreateStorageConfigParams {
  name: string
  is_default?: boolean
  provider?: 'minio' | 's3' | 'oss'
  endpoint: string
  public_endpoint?: string
  access_key: string
  secret_key: string
  bucket: string
  region?: string
  secure?: boolean
  proxy_enabled?: boolean
  presign_expire_seconds?: number
  max_upload_size_mb?: number
}

export interface UpdateStorageConfigParams {
  name?: string
  is_default?: boolean
  provider?: 'minio' | 's3' | 'oss'
  endpoint?: string
  public_endpoint?: string
  access_key?: string
  secret_key?: string
  bucket?: string
  region?: string
  secure?: boolean
  proxy_enabled?: boolean
  presign_expire_seconds?: number
  max_upload_size_mb?: number
}

// 获取系统配置概览
export function getSystemConfigOverview() {
  return http.get<SystemConfigOverview>('/api/system-config/overview/')
}

// 获取系统设置
export function getSystemSettings() {
  return http.get<SystemSettings>('/api/system-config/settings/')
}

// 更新系统设置
export function updateSystemSettings(data: Partial<SystemSettings>) {
  return http.patch<SystemSettings>('/api/system-config/settings/', data)
}

// 获取存储配置列表
export function listStorageConfigs() {
  return http.get<StorageConfig[]>('/api/system-config/storage-configs/')
}

// 创建存储配置
export function createStorageConfig(data: CreateStorageConfigParams) {
  return http.post<StorageConfig>('/api/system-config/storage-configs/', data)
}

// 获取存储配置详情
export function getStorageConfig(id: number) {
  return http.get<StorageConfig>(`/api/system-config/storage-configs/${id}/`)
}

// 更新存储配置
export function updateStorageConfig(id: number, data: UpdateStorageConfigParams) {
  return http.patch<StorageConfig>(`/api/system-config/storage-configs/${id}/`, data)
}

// 删除存储配置
export function deleteStorageConfig(id: number) {
  return http.delete(`/api/system-config/storage-configs/${id}/`)
}

// 设置默认存储配置
export function setDefaultStorageConfig(id: number) {
  return http.post<StorageConfig>(`/api/system-config/storage-configs/${id}/set-default/`)
}

// 测试存储配置连接
export function testStorageConfig(id: number) {
  return http.post<{ success: boolean; message: string; bucket_exists: boolean }>(
    `/api/system-config/storage-configs/${id}/test/`
  )
}

// 生成 CORS 配置
export function generateCorsConfig(id: number, allowedOrigins: string[]) {
  return http.post<{
    message: string
    cors_config: Record<string, unknown>
    apply_command: string
  }>(`/api/system-config/storage-configs/${id}/cors/generate/`, { allowed_origins: allowedOrigins })
}

// 获取模型供应商列表
export function listModelProviders() {
  return http.get<ModelProvider[]>('/api/generation/model-providers/')
}

// 获取模型配置列表
export function listModelConfigs() {
  return http.get<ModelConfig[]>('/api/generation/model-configs/')
}
