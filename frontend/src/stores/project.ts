import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { projectApi, type Project, type ProjectListParams } from '@/api/project'

export const useProjectStore = defineStore('project', () => {
  // State
  const projects = ref<Project[]>([])
  const currentProject = ref<Project | null>(null)
  const currentProjectId = ref<number | null>(null)
  const projectPermissions = ref<string[]>([])
  const loading = ref(false)
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(20)

  // Getters
  const hasProjectPermission = computed(() => {
    return (code: string) => projectPermissions.value.includes(code)
  })

  const hasNextPage = computed(() => page.value * pageSize.value < total.value)

  // Actions
  async function fetchProjects(params?: ProjectListParams) {
    loading.value = true
    try {
      const res = await projectApi.list({ page: page.value, page_size: pageSize.value, ...params })
      projects.value = res.data.results
      total.value = res.data.total
      return res.data
    } finally {
      loading.value = false
    }
  }

  async function fetchProject(id: number) {
    loading.value = true
    try {
      const res = await projectApi.get(id)
      currentProject.value = res.data
      currentProjectId.value = id
      return res.data
    } finally {
      loading.value = false
    }
  }

  async function createProject(data: Parameters<typeof projectApi.create>[0]) {
    const res = await projectApi.create(data)
    // 刷新列表
    await fetchProjects()
    return res.data
  }

  async function updateProject(id: number, data: Partial<Project>) {
    const res = await projectApi.update(id, data)
    if (currentProject.value?.id === id) {
      currentProject.value = res.data
    }
    return res.data
  }

  async function deleteProject(id: number) {
    await projectApi.delete(id)
    projects.value = projects.value.filter(p => p.id !== id)
    if (currentProject.value?.id === id) {
      currentProject.value = null
    }
  }

  async function fetchMyPermissions(projectId: number) {
    const res = await projectApi.getMyPermissions(projectId)
    currentProjectId.value = projectId
    projectPermissions.value = res.data.permissions
    return res.data.permissions
  }

  function setProjectPermissions(projectId: number, permissions: string[]) {
    currentProjectId.value = projectId
    projectPermissions.value = permissions
  }

  function clearProject() {
    currentProject.value = null
    currentProjectId.value = null
    projectPermissions.value = []
  }

  function reset() {
    projects.value = []
    currentProject.value = null
    currentProjectId.value = null
    projectPermissions.value = []
    loading.value = false
    total.value = 0
    page.value = 1
  }

  return {
    // State
    projects,
    currentProject,
    currentProjectId,
    projectPermissions,
    loading,
    total,
    page,
    pageSize,
    // Getters
    hasProjectPermission,
    hasNextPage,
    // Actions
    fetchProjects,
    fetchProject,
    createProject,
    updateProject,
    deleteProject,
    fetchMyPermissions,
    setProjectPermissions,
    clearProject,
    reset,
  }
})
