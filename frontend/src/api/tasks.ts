import { http } from './http'

export function getTask(taskId: number) {
  return http.get(`/api/tasks/${taskId}`)
}
