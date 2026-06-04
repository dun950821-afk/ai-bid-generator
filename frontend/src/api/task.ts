import { http } from './http'

// ============================================================================
// 类型定义
// ============================================================================

export interface AsyncTask {
  id: number
  task_type: string
  celery_task_id: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'retrying'
  progress: number
  current_step: string
  total_steps: number
  related_object_type: string
  related_object_id: string
  result_payload: Record<string, unknown>
  error_message: string
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export interface CurrentTaskParams {
  related_object_type: string
  related_object_id: string | number
  task_type?: string
}

// ============================================================================
// API 函数
// ============================================================================

/**
 * 获取任务详情
 * GET /api/tasks/{task_id}
 */
export function getTask(taskId: number) {
  return http.get<AsyncTask>(`/api/tasks/${taskId}`)
}

/**
 * 获取当前执行中的任务
 * GET /api/tasks/current/?related_object_type=&related_object_id=&task_type=
 */
export function getCurrentTask(params: CurrentTaskParams) {
  return http.get<AsyncTask | null>('/api/tasks/current/', { params })
}
