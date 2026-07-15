// frontend/src/api/dashboard.ts
import { http } from './http'

export interface DashboardKpi {
  projects: number
  lots: number
  tender_files: number
  outlines: number
  bid_documents: number
  knowledge_bases: number
  knowledge_documents: number
  knowledge_chunks: number
  tasks_total: number
  tasks_pending: number
  users: number
  ai_runs_total: number
  retrieval_total: number
}

export interface DashboardToday {
  new_projects: number
  new_tender_files: number
  new_outlines: number
  new_kb_documents: number
  new_kb_chunks: number
  ai_runs: number
  ai_succeeded: number
  ai_failed: number
  ai_tokens: number
  retrievals: number
  retrieval_avg_latency_ms: number
}

export interface AiTrendItem {
  date: string
  runs: number
  tokens: number
}

export interface NameValueItem {
  name: string
  value: number
}

export interface KbDocItem {
  name: string
  documents: number
  chunks: number
}

export interface RecentActivity {
  id: number
  actor: string
  action: string
  summary: string
  target_type: string
  target_id: string
  created_at: string
}

export interface SystemHealth {
  ai_total: number
  ai_succeeded: number
  ai_failed: number
  ai_success_rate: number
  avg_retrieval_latency_ms: number
  total_tokens: number
}

export interface BidFunnel {
  funnel: NameValueItem[]
  bid_status_distribution: NameValueItem[]
  section_generation_distribution: NameValueItem[]
}

export interface ProjectTokenItem {
  project_id: number | null
  name: string
  tokens: number
  runs: number
}

export interface DashboardOverview {
  refreshed_at: string
  kpi: DashboardKpi
  today: DashboardToday
  ai_trend_14d: AiTrendItem[]
  ai_scenario_distribution: NameValueItem[]
  retrieval_mode_distribution: NameValueItem[]
  kb_doc_distribution: KbDocItem[]
  recent_activities: RecentActivity[]
  system_health: SystemHealth
  bid_funnel: BidFunnel
  project_token_ranking: ProjectTokenItem[]
}

export function getDashboardOverview() {
  return http.get<DashboardOverview>('/api/dashboard/overview/')
}
