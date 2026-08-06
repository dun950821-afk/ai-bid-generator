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

export interface AuditLogListResult {
  count: number
  next: string | null
  previous: string | null
  results: OperationLog[]
}

export interface LogListParams {
  actor_id?: number
  action?: string
  target_type?: string
  search?: string
  start_date?: string
  end_date?: string
  page?: number
  page_size?: number
}

export interface AuditMeta {
  actions: string[]
  target_types: string[]
}

export interface AuditActionCount {
  action: string
  count: number
}

export interface AuditStats {
  total: number
  today: number
  by_action: AuditActionCount[]
}

export function listAuditLogs(params?: LogListParams) {
  return http.get<AuditLogListResult>('/api/audit/logs/', { params })
}

export function getAuditLogDetail(id: number) {
  return http.get<OperationLogDetail>(`/api/audit/logs/${id}/`)
}

/** 动态操作类型 / 对象类型选项（供筛选下拉） */
export function getAuditMeta() {
  return http.get<AuditMeta>('/api/audit/actions/')
}

/** 日志统计（支持与列表相同的筛选参数） */
export function getAuditStats(params?: LogListParams) {
  return http.get<AuditStats>('/api/audit/stats/', { params })
}

/** 导出 CSV（blob 下载，携带当前筛选条件） */
export async function exportAuditLogs(params?: LogListParams) {
  const res = await http.get<Blob>('/api/audit/logs/export/', {
    params,
    responseType: 'blob',
    timeout: 60000,
  })
  const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `audit_logs_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
