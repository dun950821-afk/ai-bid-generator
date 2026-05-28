/**
 * 操作审计 API
 */

import { http } from '@/api/http'

export interface OperationLog {
  id: number
  actor_id: number | null
  actor_name: string | null
  action: string
  target_type: string
  target_id: string
  summary: string
  ip: string | null
  created_at: string
}

export interface OperationLogDetail extends OperationLog {
  extra: Record<string, unknown>
  user_agent: string
}

export interface LogListParams {
  actor_id?: number
  action?: string
  target_type?: string
  search?: string
  start_date?: string
  end_date?: string
}

export function listAuditLogs(params?: LogListParams) {
  return http.get<OperationLog[]>('/api/audit/logs/', { params })
}

export function getAuditLogDetail(id: number) {
  return http.get<OperationLogDetail>(`/api/audit/logs/${id}/`)
}
