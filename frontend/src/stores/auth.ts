import { defineStore } from 'pinia'

export interface UserInfo {
  id: number
  username: string
  real_name?: string
  email?: string
  must_change_password?: boolean
}

export interface MenuItem {
  key: string
  title: string
  route: string
  icon?: string
  children?: MenuItem[]
}

export interface MenuGroup {
  group: string | null
  groupTitle: string
  items: MenuItem[]
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: '' as string,
    user: null as UserInfo | null,
    globalPermissions: [] as string[],
    menuTree: [] as MenuGroup[],
    mustChangePassword: false,
    initialized: false,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.accessToken && state.user),
    hasGlobalPermission: (state) => (code: string) => state.globalPermissions.includes(code),
  },
  actions: {
    setSession(payload: {
      access: string
      user: UserInfo
      global_permissions: string[]
      menu_tree: MenuGroup[]
      must_change_password: boolean
    }) {
      this.accessToken = payload.access
      this.user = payload.user
      this.globalPermissions = payload.global_permissions || []
      this.menuTree = payload.menu_tree || []
      this.mustChangePassword = payload.must_change_password
      this.initialized = true
    },
    setAccessToken(access: string) {
      this.accessToken = access
    },
    clearSession() {
      this.accessToken = ''
      this.user = null
      this.globalPermissions = []
      this.menuTree = []
      this.mustChangePassword = false
      this.initialized = true
    },
  },
  persist: {
    key: 'auth',
    storage: localStorage,
    pick: ['accessToken', 'user', 'globalPermissions', 'menuTree', 'mustChangePassword'],
  },
})
