/**
 * 系统公告 API
 * 用户端：登录后拉取待弹窗公告 + 确认（不再提示/关闭）
 * 管理端：系统设置页维护（发布/下线/编辑/删除）
 */

import { http } from '@/api/http'

export interface AnnouncementItem {
  id: number
  title: string
  content: string
  published_at: string | null
  updated_at: string
}

export interface AnnouncementActiveResult {
  results: AnnouncementItem[]
  total: number
}

export interface AnnouncementManageItem extends AnnouncementItem {
  is_active: boolean
  created_by: number | null
  created_by_name: string
  offline_at: string | null
  created_at: string
  ack_count: number
  dismiss_count: number
}

export interface AnnouncementManageResult {
  results: AnnouncementManageItem[]
}

export interface AnnouncementPayload {
  title: string
  content: string
  publish?: boolean
}

// ---------- 用户端 ----------

/** 当前用户待弹窗的公告列表（登录后调用） */
export function getActiveAnnouncements() {
  return http.get<AnnouncementActiveResult>('/api/notifications/announcements/active/')
}

/** 确认公告：action=dismiss 不再提示（永久） / action=seen 仅本次关闭 */
export function ackAnnouncement(id: number, action: 'dismiss' | 'seen') {
  return http.post<{ ok: boolean; action: string; dismissed: boolean }>(
    `/api/notifications/announcements/${id}/ack/`,
    { action },
  )
}

// ---------- 管理端 ----------

export function listAnnouncements() {
  return http.get<AnnouncementManageResult>('/api/notifications/announcements/manage/')
}

export function createAnnouncement(payload: AnnouncementPayload) {
  return http.post<AnnouncementManageItem>('/api/notifications/announcements/manage/', payload)
}

export function updateAnnouncement(id: number, payload: Partial<AnnouncementPayload>) {
  return http.patch<AnnouncementManageItem>(`/api/notifications/announcements/manage/${id}/`, payload)
}

export function publishAnnouncement(id: number) {
  return http.post<AnnouncementManageItem>(`/api/notifications/announcements/manage/${id}/publish/`)
}

export function offlineAnnouncement(id: number) {
  return http.post<AnnouncementManageItem>(`/api/notifications/announcements/manage/${id}/offline/`)
}

export function deleteAnnouncement(id: number) {
  return http.delete<{ ok: boolean }>(`/api/notifications/announcements/manage/${id}/`)
}
