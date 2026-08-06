/**
 * 站内通知 API
 */

import { http } from '@/api/http'

export interface NotificationItem {
  id: number
  kind: string
  title: string
  message: string
  task_type: string
  related_object_type: string
  related_object_id: string
  is_read: boolean
  created_at: string
}

export interface NotificationListResult {
  results: NotificationItem[]
  unread_count: number
  total: number
}

export function listNotifications(params?: { limit?: number; unread_only?: boolean }) {
  return http.get<NotificationListResult>('/api/notifications/', { params })
}

export function getUnreadCount() {
  return http.get<{ unread_count: number }>('/api/notifications/unread-count/')
}

export function markAllRead() {
  return http.post<{ updated: number }>('/api/notifications/read-all/')
}

export function markRead(id: number) {
  return http.post<{ ok: boolean }>(`/api/notifications/${id}/read/`)
}
