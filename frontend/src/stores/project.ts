import { defineStore } from 'pinia'

export const useProjectStore = defineStore('project', {
  state: () => ({
    currentProjectId: null as number | null,
    projectPermissions: [] as string[],
  }),
  getters: {
    hasProjectPermission: (state) => (code: string) => state.projectPermissions.includes(code),
  },
  actions: {
    setProjectPermissions(projectId: number, permissions: string[]) {
      this.currentProjectId = projectId
      this.projectPermissions = permissions
    },
    clearProject() {
      this.currentProjectId = null
      this.projectPermissions = []
    },
  },
})
