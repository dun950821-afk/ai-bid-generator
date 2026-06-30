// frontend/src/api/consistencyAudit.ts
// 一致性审计 API（借鉴 OpenBidKit auditing 阶段）

import { http } from './http'
import type { AsyncTask } from './task'

export interface ConsistencyConflict {
  fact_title: string
  evidence: string
  reason: string
  severity: 'high' | 'medium' | 'low'
  resolved: boolean
  audited_at?: string
  repaired_at?: string
  repaired_diff?: {
    before: string
    after: string
    note?: string
  } | null
}

export interface SectionConflicts {
  section_id: number
  section_title: string
  section_number: string
  conflicts: ConsistencyConflict[]
  conflict_count: number
  unresolved_count: number
  resolved_count: number
}

export interface ConsistencyAuditResult {
  task_status: string
  task_id: number | null
  progress: number
  total_conflicts: number
  total_unresolved: number
  total_resolved: number
  by_severity: { high: number; medium: number; low: number }
  conflicts: SectionConflicts[]
}

export interface RepairedDetail {
  section_id: number
  section_title: string
  repaired_count: number
}

export interface BatchRepairResultPayload {
  outline_id: number
  total: number
  fixed: number
  repaired_details?: RepairedDetail[]
  total_repaired?: number
}

export interface TaskSubmitResponse {
  task_id: number
  status: string
  message: string
}

export interface RepairSectionResponse {
  section_id: number
  fixed_count: number
  new_content?: string
  message?: string
}

export function startConsistencyAudit(outlineId: number) {
  return http.post<TaskSubmitResponse>(`/api/outlines/${outlineId}/consistency-audit/`)
}

export function getConsistencyAuditResult(outlineId: number) {
  return http.get<ConsistencyAuditResult>(`/api/outlines/${outlineId}/consistency-audit/result/`)
}

export function startConsistencyRepair(outlineId: number) {
  return http.post<TaskSubmitResponse>(`/api/outlines/${outlineId}/consistency-repair/`)
}

export function repairSectionConsistency(sectionId: number) {
  return http.post<RepairSectionResponse>(`/api/sections/${sectionId}/consistency-repair/`)
}

export function getAsyncTask(taskId: number) {
  return http.get<AsyncTask>(`/api/tasks/${taskId}`)
}
