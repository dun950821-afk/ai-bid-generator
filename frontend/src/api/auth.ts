import { http } from './http'

export interface LoginPayload {
  username: string
  password: string
}

export function login(payload: LoginPayload) {
  return http.post('/api/auth/login', payload)
}

export function refresh() {
  return http.post('/api/auth/refresh')
}

export function logout() {
  return http.post('/api/auth/logout')
}

export function me() {
  return http.get('/api/auth/me')
}

export function changePassword(payload: { old_password: string; new_password: string }) {
  return http.post('/api/auth/change-password', payload)
}
