// frontend/src/api/settings.ts
import { http } from '@/api/http'

export type HealthStatus = 'ok' | 'warning' | 'error' | 'mock'

export interface HealthItem {
  status: HealthStatus
  label: string
  sublabel?: string
  impact_hint: string
  score: number
  score_max: number
  last_probe_at?: string | null
  last_probe_ok?: boolean | null
  provider_type?: string | null
  is_default?: boolean
  is_mock?: boolean
  retrieval_mode?: string
  audit_log_enabled?: boolean
}

export interface MockWarning {
  show: boolean
  level: 'chat' | 'embedding'
  message: string
  model_config_id?: number | null
  provider_id?: number | null
}

export interface HealthStatusResponse {
  chat_model: HealthItem
  embedding_model: HealthItem
  rag_search: HealthItem
  file_storage: HealthItem
  security_audit: HealthItem
  mock_warning: MockWarning | null
  total_score: number
  total_max: number
  pending_count: number
}

export interface TestConnectionRequest {
  provider_type: string
  base_url: string
  api_key: string
  model_name: string
  test_kind: 'chat' | 'embedding'
}

export interface TestConnectionResponse {
  ok: boolean
  latency_ms: number
  detail: string
  error_code: string | null
  models_sample: string[] | null
}

export interface WizardChatStep {
  provider_type: string
  base_url: string
  api_key: string
  model_name: string
}

export interface WizardEmbeddingStep {
  provider_type: string
  base_url: string
  api_key: string
  model_name: string
}

export interface WizardRagStep {
  retrieval_mode: string
  top_k: number
  embedding_config_id?: number
}

export interface WizardStorageStep {
  endpoint: string
  public_endpoint: string
  access_key: string
  secret_key: string
  bucket: string
  upload_mode: 'backend_proxy' | 'presigned_direct'
}

export interface SetupWizardPayload {
  steps: {
    chat_model: WizardChatStep | null
    embedding_model: WizardEmbeddingStep | null
    rag_search: WizardRagStep | null
    file_storage: WizardStorageStep | null
  }
}

/** 获取系统配置健康状态。 */
export async function getHealthStatus(): Promise<HealthStatusResponse> {
  const res = await http.get<HealthStatusResponse>('/api/settings/health/')
  return res.data
}

/** 一键诊断：对所有已配置项做真实探针。 */
export async function diagnoseAll(): Promise<HealthStatusResponse> {
  const res = await http.post<HealthStatusResponse>('/api/settings/health/diagnose/')
  return res.data
}

/** 测试连接：对单个 provider 做真实探针。 */
export async function testConnection(payload: TestConnectionRequest): Promise<TestConnectionResponse> {
  const res = await http.post<TestConnectionResponse>('/api/settings/test-connection/', payload)
  return res.data
}

/** 提交配置向导。 */
export async function submitWizard(payload: SetupWizardPayload): Promise<HealthStatusResponse> {
  const res = await http.post<HealthStatusResponse>('/api/settings/setup-wizard/', payload)
  return res.data
}
