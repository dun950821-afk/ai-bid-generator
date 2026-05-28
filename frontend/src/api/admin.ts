// frontend/src/api/admin.ts
import { http } from './http'

// 用户管理
export interface User {
  id: number
  username: string
  real_name: string
  email: string
  phone: string
  department: string
  is_active: boolean
  roles: Array<{ id: number; code: string; name: string }>
  last_login: string | null
  created_at: string
}

export interface UserCreateParams {
  username: string
  real_name?: string
  email?: string
  phone?: string
  department?: string
  password?: string
  role_ids?: number[]
}

export interface UserUpdateParams {
  real_name?: string
  email?: string
  phone?: string
  department?: string
  is_active?: boolean
  role_ids?: number[]
}

export const userApi = {
  list(params?: { search?: string; page?: number; page_size?: number }) {
    return http.get<{ count: number; results: User[]; next: string | null; previous: string | null }>('/api/users/', { params })
  },

  get(id: number) {
    return http.get<User>(`/api/users/${id}/`)
  },

  create(data: UserCreateParams) {
    return http.post<User>('/api/users/', data)
  },

  update(id: number, data: UserUpdateParams) {
    return http.patch<User>(`/api/users/${id}/`, data)
  },

  delete(id: number) {
    return http.delete(`/api/users/${id}/`)
  },

  resetPassword(id: number) {
    return http.post<{ temporary_password: string }>(`/api/users/${id}/reset-password`)
  },

  enable(id: number) {
    return http.post(`/api/users/${id}/enable`)
  },
}

// 角色管理
export interface Role {
  id: number
  code: string
  name: string
  description: string
  is_system: boolean
  permissions: string[]
  user_count: number
  created_at: string
}

export interface RoleCreateParams {
  code: string
  name: string
  description?: string
  permission_codes?: string[]
}

export interface RoleUpdateParams {
  name?: string
  description?: string
  permission_codes?: string[]
}

export const roleApi = {
  list() {
    return http.get<{ count: number; results: Role[] }>('/api/roles/')
  },

  get(id: number) {
    return http.get<Role>(`/api/roles/${id}/`)
  },

  create(data: RoleCreateParams) {
    return http.post<Role>('/api/roles/', data)
  },

  update(id: number, data: RoleUpdateParams) {
    return http.patch<Role>(`/api/roles/${id}/`, data)
  },

  delete(id: number) {
    return http.delete(`/api/roles/${id}/`)
  },
}

// 权限
export interface Permission {
  id: number
  code: string
  name: string
  module: string
  scope: string
  description: string
  is_active: boolean
}

export interface PermissionModule {
  module: string
  name: string
  permissions: Permission[]
}

export const permissionApi = {
  list() {
    return http.get<Permission[]>('/api/permissions/')
  },

  tree() {
    return http.get<PermissionModule[]>('/api/permissions/tree/')
  },
}
