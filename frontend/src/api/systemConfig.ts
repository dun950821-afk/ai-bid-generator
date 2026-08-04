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
  api_key_env: string
  is_active: boolean
  has_api_key?: boolean
  api_key_masked?: string
  config_defaults?: Record<string, unknown>
  created_at?: string
  updated_at?: string
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
  context_length?: number
  top_p: number
  timeout_seconds: number
  retry_count: number
  enable_thinking: boolean
  reasoning_effort: string
  is_default: boolean
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export interface EmbeddingConfig {
  id: number
  name: string
  provider: 'bailian' | 'openai'
  api_mode: 'openai_compatible' | 'dashscope_native'
  model_name: string
  dimension: number
  base_url: string
  batch_size: number
  max_tokens_per_text: number
  timeout_seconds: number
  is_active: boolean
  is_default: boolean
  has_api_key: boolean
  api_key_masked: string
  api_key_env: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface RagSettings {
  retrieval_mode: 'postgres_fulltext' | 'vector' | 'hybrid'
  embedding_config: number | null
  top_k: number
  max_context_tokens: number
  enable_vector_search: boolean
  enable_rerank: boolean
  embedding_config_detail?: EmbeddingConfig | null
  has_embedding_config?: boolean
}

export interface CreateEmbeddingConfigParams {
  name: string
  provider?: 'bailian' | 'openai'
  api_mode?: 'openai_compatible' | 'dashscope_native'
  model_name?: string
  dimension?: number
  base_url?: string
  api_key: string
  api_key_env?: string
  batch_size?: number
  max_tokens_per_text?: number
  timeout_seconds?: number
  is_active?: boolean
  is_default?: boolean
  metadata?: Record<string, unknown>
}

export interface UpdateEmbeddingConfigParams {
  name?: string
  provider?: 'bailian' | 'openai'
  api_mode?: 'openai_compatible' | 'dashscope_native'
  model_name?: string
  dimension?: number
  base_url?: string
  api_key?: string
  api_key_env?: string
  batch_size?: number
  max_tokens_per_text?: number
  timeout_seconds?: number
  is_active?: boolean
  is_default?: boolean
  metadata?: Record<string, unknown>
}

export interface EmbeddingTestResult {
  success: boolean
  message: string
  dimension?: number
  vector_count?: number
  token_count?: number
  latency_ms?: number
}

export interface SystemConfigOverview {
  rag_settings: SystemSettings
  storage_default: StorageConfig | null
  embedding_default: EmbeddingConfig | null
  rag_config: RagSettings
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
  return http.get<{ count: number; results: ModelProvider[] }>('/api/generation/model-providers/')
}

// 创建模型供应商
export function createModelProvider(data: {
  key: string
  name: string
  provider_type: string
  base_url?: string
  api_key?: string
  api_key_env?: string
  is_active?: boolean
}) {
  return http.post<ModelProvider>('/api/generation/model-providers/', data)
}

// 获取模型供应商详情
export function getModelProvider(id: number) {
  return http.get<ModelProvider>(`/api/generation/model-providers/${id}/`)
}

// 更新模型供应商
export function updateModelProvider(id: number, data: Partial<{
  key: string
  name: string
  provider_type: string
  base_url: string
  api_key: string
  api_key_env: string
  is_active: boolean
}>) {
  return http.patch<ModelProvider>(`/api/generation/model-providers/${id}/`, data)
}

// 删除模型供应商
export function deleteModelProvider(id: number) {
  return http.delete(`/api/generation/model-providers/${id}/`)
}

// 获取模型配置列表
export function listModelConfigs() {
  return http.get<{ count: number; results: ModelConfig[] }>('/api/generation/model-configs/')
}

// 创建模型配置
export function createModelConfig(data: {
  provider: number
  model_name: string
  model_type?: 'chat' | 'embedding' | 'rerank'
  display_name?: string
  temperature?: number
  max_tokens?: number
  context_length?: number
  top_p?: number
  timeout_seconds?: number
  retry_count?: number
  enable_thinking?: boolean
  reasoning_effort?: string
  is_default?: boolean
  is_active?: boolean
}) {
  return http.post<ModelConfig>('/api/generation/model-configs/', data)
}

// 获取模型配置详情
export function getModelConfig(id: number) {
  return http.get<ModelConfig>(`/api/generation/model-configs/${id}/`)
}

// 更新模型配置
export function updateModelConfig(id: number, data: Partial<{
  provider: number
  model_name: string
  model_type: 'chat' | 'embedding' | 'rerank'
  display_name: string
  temperature: number
  max_tokens: number
  context_length?: number
  top_p: number
  timeout_seconds: number
  retry_count: number
  enable_thinking: boolean
  reasoning_effort: string
  is_default: boolean
  is_active: boolean
}>) {
  return http.patch<ModelConfig>(`/api/generation/model-configs/${id}/`, data)
}

// 删除模型配置
export function deleteModelConfig(id: number) {
  return http.delete(`/api/generation/model-configs/${id}/`)
}

// 设置默认模型配置
export function setDefaultModelConfig(id: number) {
  return http.post<ModelConfig>(`/api/generation/model-configs/${id}/set-default/`)
}

// 测试模型连接
export interface ModelTestResult {
  success: boolean
  message: string
  model_name?: string
  provider_type?: string
  latency_ms?: number
  prompt_tokens?: number
  completion_tokens?: number
  response_preview?: string
  error_type?: string
}

export function testModelConnection(id: number) {
  return http.post<ModelTestResult>(`/api/generation/model-configs/${id}/test-connection/`)
}

// ========== Embedding 配置 API ==========

// 获取 Embedding 配置列表
export function listEmbeddingConfigs() {
  return http.get<EmbeddingConfig[]>('/api/system-config/embedding-configs/')
}

// 创建 Embedding 配置
export function createEmbeddingConfig(data: CreateEmbeddingConfigParams) {
  return http.post<EmbeddingConfig>('/api/system-config/embedding-configs/', data)
}

// 获取 Embedding 配置详情
export function getEmbeddingConfig(id: number) {
  return http.get<EmbeddingConfig>(`/api/system-config/embedding-configs/${id}/`)
}

// 更新 Embedding 配置
export function updateEmbeddingConfig(id: number, data: UpdateEmbeddingConfigParams) {
  return http.patch<EmbeddingConfig>(`/api/system-config/embedding-configs/${id}/`, data)
}

// 删除 Embedding 配置
export function deleteEmbeddingConfig(id: number) {
  return http.delete(`/api/system-config/embedding-configs/${id}/`)
}

// 设置默认 Embedding 配置
export function setDefaultEmbeddingConfig(id: number) {
  return http.post<EmbeddingConfig>(`/api/system-config/embedding-configs/${id}/set-default/`)
}

// 测试 Embedding 配置
export function testEmbeddingConfig(id: number, texts: string[]) {
  return http.post<EmbeddingTestResult>(`/api/system-config/embedding-configs/${id}/test/`, { texts })
}

// ========== RAG 设置 API ==========

// 获取 RAG 设置
export function getRagSettings() {
  return http.get<RagSettings>('/api/system-config/rag-settings/')
}

// 更新 RAG 设置
export function updateRagSettings(data: Partial<RagSettings>) {
  return http.patch<RagSettings>('/api/system-config/rag-settings/', data)
}
