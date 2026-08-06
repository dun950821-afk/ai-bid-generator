import { http } from './http'

export interface LoginPayload {
  username: string
  password: string
  /** L3 软触发后才需要带；未触发时缺省即可，后端忽略空字段。 */
  captcha_token?: string
  captcha_answer?: string
}

export interface CaptchaResponse {
  captcha_token: string
  /** 形如 "3 + 4 = ?" */
  question: string
}

export function login(payload: LoginPayload) {
  return http.post('/api/auth/login', payload)
}

export function fetchCaptcha() {
  return http.get<CaptchaResponse>('/api/auth/captcha')
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

/** 本人资料修改（PATCH /api/auth/me，字段全可选） */
export function updateMe(payload: {
  real_name?: string
  email?: string
  phone?: string
  department?: string
}) {
  return http.patch('/api/auth/me', payload)
}
