// frontend/src/stores/workflow.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { workflowApi, type WorkflowInstance, type WorkflowNodeInstance } from '@/api/workflow'
import { ElMessage } from 'element-plus'

export const useWorkflowStore = defineStore('workflow', () => {
  // 领域数据
  const workflowInstance = ref<WorkflowInstance | null>(null)
  const workflowNodes = ref<WorkflowNodeInstance[]>([])

  // UI 状态
  const selectedNodeId = ref<number | null>(null)
  const isLoading = ref(false)
  const lastRevision = ref(0)

  // 轮询控制
  let pollingTimer: ReturnType<typeof setTimeout> | null = null
  let polling = false
  let currentLotId: number | null = null

  // 计算属性
  const selectedNode = computed(() =>
    workflowNodes.value.find(n => n.id === selectedNodeId.value)
  )

  const isRunning = computed(() =>
    workflowInstance.value?.status === 'in_progress'
  )

  const isCompleted = computed(() =>
    workflowInstance.value?.status === 'completed'
  )

  // 获取工作流详情
  async function fetchWorkflow(lotId: number) {
    isLoading.value = true
    try {
      const res = await workflowApi.getWorkflow(lotId)
      workflowInstance.value = res.data
      workflowNodes.value = res.data.nodes || []
      lastRevision.value = 0
      return res.data
    } finally {
      isLoading.value = false
    }
  }

  // 获取轻量状态
  async function fetchStatus(lotId: number) {
    const res = await workflowApi.getStatus(lotId)

    // 检查 revision 是否变化
    if (res.data.revision !== lastRevision.value) {
      lastRevision.value = res.data.revision

      // 更新节点状态
      for (const nodeStatus of res.data.nodes) {
        const node = workflowNodes.value.find(n => n.id === nodeStatus.id)
        if (node) {
          node.status = nodeStatus.status
          node.progress = nodeStatus.progress
        }
      }

      // 更新工作流状态
      if (workflowInstance.value) {
        workflowInstance.value.status = res.data.status
        workflowInstance.value.progress_percentage = res.data.progress
      }
    }

    return res.data
  }

  // 开始轮询
  function startPolling(lotId: number) {
    stopPolling()
    currentLotId = lotId

    const poll = async () => {
      if (polling || !currentLotId) return
      polling = true

      try {
        const status = await fetchStatus(currentLotId)

        // 继续轮询条件
        if (status.status === 'in_progress') {
          pollingTimer = setTimeout(poll, 3000)
        } else if (status.status === 'completed' || status.status === 'failed') {
          stopPolling()
          // 刷新完整数据
          await fetchWorkflow(currentLotId)
        }
      } catch (err) {
        console.error('Polling error:', err)
        // 出错后继续轮询
        pollingTimer = setTimeout(poll, 5000)
      } finally {
        polling = false
      }
    }

    poll()
  }

  // 停止轮询
  function stopPolling() {
    if (pollingTimer) {
      clearTimeout(pollingTimer)
      pollingTimer = null
    }
    polling = false
    currentLotId = null
  }

  // 选择节点
  function selectNode(id: number | null) {
    selectedNodeId.value = id
  }

  // 重试节点
  async function retryNode(nodeId: number, reason: string) {
    const res = await workflowApi.retryNode(nodeId, reason)
    const node = workflowNodes.value.find(n => n.id === nodeId)
    if (node) {
      node.status = res.data.status
    }
    ElMessage.success('节点已重试')
    return res.data
  }

  // 审批通过
  async function approveNode(nodeId: number, comment: string) {
    const res = await workflowApi.approveNode(nodeId, comment)
    const node = workflowNodes.value.find(n => n.id === nodeId)
    if (node) {
      node.status = res.data.status
      node.approval_status = res.data.approval_status
    }
    ElMessage.success('审批通过')
    return res.data
  }

  // 审批驳回
  async function rejectNode(nodeId: number, comment: string) {
    const res = await workflowApi.rejectNode(nodeId, comment)
    const node = workflowNodes.value.find(n => n.id === nodeId)
    if (node) {
      node.status = res.data.status
      node.approval_status = res.data.approval_status
    }
    ElMessage.success('已驳回')
    return res.data
  }

  // 重置
  function reset() {
    stopPolling()
    workflowInstance.value = null
    workflowNodes.value = []
    selectedNodeId.value = null
    isLoading.value = false
    lastRevision.value = 0
  }

  return {
    // 状态
    workflowInstance,
    workflowNodes,
    selectedNodeId,
    isLoading,
    lastRevision,
    // 计算属性
    selectedNode,
    isRunning,
    isCompleted,
    // 方法
    fetchWorkflow,
    fetchStatus,
    startPolling,
    stopPolling,
    selectNode,
    retryNode,
    approveNode,
    rejectNode,
    reset,
  }
})
