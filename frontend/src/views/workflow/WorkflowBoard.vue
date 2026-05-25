<!-- frontend/src/views/workflow/WorkflowBoard.vue -->
<template>
  <div class="workflow-board">
    <WorkflowHeader
      :lot-name="lotName"
      :workflow-status="workflowStore.workflowInstance?.status || 'not_started'"
      :progress="workflowStore.workflowInstance?.progress_percentage || 0"
      @start="handleStartWorkflow"
    />

    <div class="board-content" v-loading="workflowStore.isLoading">
      <!-- 未初始化状态 -->
      <div v-if="!workflowStore.workflowInstance" class="empty-state">
        <el-empty description="尚未初始化工作流">
          <el-button type="primary" @click="showTemplateDialog = true">
            初始化工作流
          </el-button>
        </el-empty>
      </div>

      <!-- 工作流画布 -->
      <WorkflowCanvas
        v-else
        :nodes="workflowStore.workflowNodes"
        :selected-node-id="workflowStore.selectedNodeId"
        @select="handleSelectNode"
      />
    </div>

    <!-- 节点详情抽屉 -->
    <NodeDetailDrawer
      :node="workflowStore.selectedNode"
      @close="handleCloseDrawer"
    />

    <!-- 模板选择弹窗 -->
    <TemplateSelectDialog
      :visible="showTemplateDialog"
      @close="showTemplateDialog = false"
      @confirm="handleInitWorkflow"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useWorkflowStore } from '@/stores/workflow'
import { workflowApi } from '@/api/workflow'
import { http } from '@/api/http'
import WorkflowHeader from './WorkflowHeader.vue'
import WorkflowCanvas from './WorkflowCanvas.vue'
import NodeDetailDrawer from './NodeDetailDrawer.vue'
import TemplateSelectDialog from './TemplateSelectDialog.vue'

const route = useRoute()
const workflowStore = useWorkflowStore()

const lotId = computed(() => Number(route.params.id))
const lotName = ref('')
const showTemplateDialog = ref(false)

// 加载标段信息
async function loadLotInfo() {
  try {
    const res = await http.get<{ name: string }>(`/api/lots/${lotId.value}/`)
    lotName.value = res.data.name
  } catch (err) {
    console.error('Failed to load lot info:', err)
  }
}

// 加载工作流
async function loadWorkflow() {
  try {
    await workflowStore.fetchWorkflow(lotId.value)
    // 如果正在运行，开始轮询
    if (workflowStore.isRunning) {
      workflowStore.startPolling(lotId.value)
    }
  } catch (err: any) {
    // 404 表示尚未初始化
    if (err.response?.status !== 404) {
      ElMessage.error('加载工作流失败')
    }
  }
}

// 初始化工作流
async function handleInitWorkflow(templateId: number | null) {
  showTemplateDialog.value = false
  try {
    await workflowApi.initializeWorkflow(lotId.value, templateId)
    await loadWorkflow()
    ElMessage.success('工作流初始化成功')
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '初始化失败')
  }
}

// 启动工作流
async function handleStartWorkflow() {
  try {
    await workflowApi.startWorkflow(lotId.value)
    await loadWorkflow()
    workflowStore.startPolling(lotId.value)
    ElMessage.success('工作流已启动')
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '启动失败')
  }
}

// 选择节点
function handleSelectNode(nodeId: number) {
  workflowStore.selectNode(nodeId)
}

// 关闭抽屉
function handleCloseDrawer() {
  workflowStore.selectNode(null)
}

onMounted(async () => {
  await loadLotInfo()
  await loadWorkflow()
})

onBeforeUnmount(() => {
  workflowStore.stopPolling()
  workflowStore.reset()
})
</script>

<style scoped>
.workflow-board {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f7fa;
}

.board-content {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
</style>