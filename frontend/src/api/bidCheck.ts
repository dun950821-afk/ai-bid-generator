// frontend/src/api/bidCheck.ts
// 废标检查 API（借鉴 OpenBidKit rejectionCheckTask）

import { http } from './http'
import type { AsyncTask } from './task'

// ============================================================================
// 类型定义
// ============================================================================

export interface BidCheckFinding {
  id: number
  task: number
  type: 'invalidBid' | 'rejectionItem'
  type_display: string
  severity: 'high' | 'medium' | 'low'
  severity_display: string
  title: string
  summary: string
  requirement: string
  bid_evidence: string
  risk_reason: string
  suggestion: string
  resolved: boolean
  resolved_at: string | null
  created_at: string
}

export interface BidCheckTask {
  id: number
  outline: number
  bid_document: number
  status: string
  status_display: string
  custom_check_items: string
  findings_summary: Record<string, number>
  findings_count: number
  error_message: string
  created_at: string
  updated_at: string
  finished_at: string | null
}

export interface StartCheckResponse {
  task_id: number
  status: string
  progress: number
  current_step: string
  message: string
}

export interface FindingsQuery {
  severity?: 'high' | 'medium' | 'low'
  type?: 'invalidBid' | 'rejectionItem'
}

// ============================================================================
// API 函数
// ============================================================================

/** 启动废标检查 */
export function startBidCheck(data: {
  outline: number
  bid_document: number
  custom_check_items?: string
}) {
  return http.post<StartCheckResponse>('/api/bid-check/tasks/start/', data)
}

/** 查询废标检查任务状态 */
export function getBidCheckTask(taskId: number) {
  return http.get<BidCheckTask>(`/api/bid-check/tasks/${taskId}/`)
}

/** 列出废标检查任务 */
export function listBidCheckTasks(params: { outline_id?: number; bid_document_id?: number }) {
  return http.get<{ results: BidCheckTask[]; count: number }>('/api/bid-check/tasks/', { params })
}

/** 查看任务发现项 */
export function getBidCheckFindings(taskId: number, params?: FindingsQuery) {
  return http.get<{ results: BidCheckFinding[]; count: number }>(
    `/api/bid-check/tasks/${taskId}/findings/`,
    { params },
  )
}

/** 标记发现项已处理 */
export function resolveFinding(findingId: number) {
  return http.patch<BidCheckFinding>(`/api/bid-check/findings/${findingId}/resolve/`)
}

/** 取消标记已处理 */
export function unresolveFinding(findingId: number) {
  return http.patch<BidCheckFinding>(`/api/bid-check/findings/${findingId}/unresolve/`)
}

/** 查询异步任务状态（轮询） */
export function getAsyncTask(taskId: number) {
  return http.get<AsyncTask>(`/api/tasks/${taskId}`)
}
