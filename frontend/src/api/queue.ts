/**
 * 队列管理 API
 */

import { http } from '@/api/http'

export type TaskKind = 'generation' | 'async'

export interface QueueTaskItem {
  id: number
  kind: TaskKind
  task_type: string
  task_type_display: string
  status: string
  status_display: string
  title: string
  progress: number
  related: {
    outline_id: number | null
    outline_name: string
    tender_file_id: number | null
    tender_file_name: string
    section_id: number | null
  }
  created_by: {
    id: number | null
    username: string
    real_name: string
  }
  created_at: string | null
  updated_at: string | null
  started_at: string | null
  finished_at: string | null
  duration_seconds: number | null
  error_message: string
  celery_task_id: string
  celery_state: 'active' | 'reserved' | null
  force_stopped: boolean
  force_stopped_at: string | null
}

export interface TaskQueueListResponse {
  items: QueueTaskItem[]
  total: number
  page: number
  page_size: number
  summary: {
    running: number
    pending: number
    failed_24h: number
  }
}

export interface TaskTypeOption {
  value: string
  label: string
  kind: TaskKind
}

/** 近 30 天实际出现过的任务类型（筛选用） */
export function listTaskTypes() {
  return http.get<{ items: TaskTypeOption[] }>('/api/task-queue/tasks/types/')
}

export interface ForceStoppedItem {
  id: number
  kind: TaskKind
  task_type: string
  task_type_display: string
  title: string
  status: string
  force_stopped_at: string
  created_by_username: string
  created_by_real_name: string
}

export interface TaskQueueConfigItem {
  key: string
  label: string
  default: number
  min: number
  max: number
  needs_restart: boolean
  unit: string
  description: string
  value: number
}

export function listTasks(params: {
  status?: string
  kind?: string
  task_type?: string
  page?: number
  page_size?: number
}) {
  return http.get<TaskQueueListResponse>('/api/task-queue/tasks/', { params })
}

export function forceStopGenerationTask(taskId: number, reason?: string) {
  return http.post<{ success: boolean; status: string; revoked: boolean }>(
    `/api/task-queue/tasks/generation/${taskId}/force-stop/`,
    { reason: reason || '' }
  )
}

export interface BatchForceStopResult {
  id: number | null
  kind: string
  success: boolean
  message: string
}

export interface BatchForceStopResponse {
  items: BatchForceStopResult[]
  success_count: number
  failed_count: number
}

export function batchForceStopTasks(items: Array<{ kind: TaskKind; id: number }>, reason?: string) {
  return http.post<BatchForceStopResponse>('/api/task-queue/tasks/batch-force-stop/', {
    items,
    reason: reason || '',
  })
}

export function forceStopAsyncTask(taskId: number, reason?: string) {
  return http.post<{ success: boolean; status: string; revoked: boolean }>(
    `/api/task-queue/tasks/async/${taskId}/force-stop/`,
    { reason: reason || '' }
  )
}

export function getRecentForceStopped(minutes = 30) {
  return http.get<{ items: ForceStoppedItem[] }>('/api/task-queue/force-stopped/recent/', {
    params: { minutes },
  })
}

export function getTaskQueueConfigs() {
  return http.get<{ items: TaskQueueConfigItem[] }>('/api/task-queue/config/')
}

export function saveTaskQueueConfigs(values: Record<string, number>) {
  return http.patch<{ message: string; errors?: Record<string, string> }>('/api/task-queue/config/', {
    values,
  })
}
