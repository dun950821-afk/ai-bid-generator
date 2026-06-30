// frontend/src/api/globalFact.ts
// 全局事实变量 API（借鉴 OpenBidKit globalFactsTask）

import { http } from './http'
import type { AsyncTask } from './task'

// ============================================================================
// 类型定义
// ============================================================================

export interface GlobalFact {
  id: number
  key: string
  title: string
  content: string
  source: 'tender' | 'knowledge' | 'original_plan' | 'manual'
  sort_order: number
}

export interface GlobalFactListResponse {
  results: GlobalFact[]
  count: number
}

export interface ExtractTaskResponse {
  task_id: number
  status: string
  progress: number
  current_step: string
  message: string
}

// ============================================================================
// API 函数
// ============================================================================

/**
 * 列出大纲下所有全局事实变量
 * GET /api/outlines/{outlineId}/global_facts/
 */
export function listGlobalFacts(outlineId: number) {
  return http.get<GlobalFactListResponse>(`/api/outlines/${outlineId}/global_facts/`)
}

/**
 * 触发全局事实变量提取（异步五轮流程）
 * POST /api/outlines/{outlineId}/global-facts/extract/
 */
export function extractGlobalFacts(outlineId: number) {
  return http.post<ExtractTaskResponse>(`/api/outlines/${outlineId}/global-facts/extract/`)
}

/**
 * 人工修正单条全局事实变量
 * PATCH /api/outlines/{outlineId}/global-facts/{factId}/
 */
export function updateGlobalFact(
  outlineId: number,
  factId: number,
  data: Partial<Pick<GlobalFact, 'title' | 'content' | 'sort_order'>>,
) {
  return http.patch<GlobalFact>(`/api/outlines/${outlineId}/global-facts/${factId}/`, data)
}

/**
 * 单条全局事实变量重新提取
 * POST /api/outlines/{outlineId}/global-facts/{factId}/regenerate/
 */
export function regenerateGlobalFact(outlineId: number, factId: number) {
  return http.post<GlobalFact>(`/api/outlines/${outlineId}/global-facts/${factId}/regenerate/`)
}

/**
 * 查询异步任务状态（用于轮询提取进度）
 * 复用 tasks 接口
 */
export function getExtractTask(taskId: number) {
  return http.get<AsyncTask>(`/api/tasks/${taskId}`)
}
