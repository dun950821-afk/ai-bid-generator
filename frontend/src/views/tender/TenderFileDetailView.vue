<template>
  <div class="tender-file-detail" v-loading="pageLoading">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-left">
        <el-button link @click="router.back()">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <h2>{{ tenderFile?.original_name || '文件详情' }}</h2>
        <el-tag
          v-if="tenderFile"
          :type="getStatusType(tenderFile.status)"
          size="small"
        >
          {{ tenderFile.status_display }}
        </el-tag>
      </div>
      <div class="header-right">
        <el-button
          v-if="canReparse"
          :loading="reparseLoading"
          :disabled="isProcessing"
          @click="handleReparse"
        >
          重新解析
        </el-button>
      </div>
    </div>

    <!-- 任务进度条 -->
    <TaskProgress
      v-if="currentTaskId"
      :task-id="currentTaskId"
      :poll-interval="2000"
      @completed="handleTaskCompleted"
      @failed="handleTaskFailed"
      @refresh="loadPageData"
      @dismiss="currentTaskId = null"
    />

    <!-- 文件未解析时显示空状态 -->
    <el-empty
      v-if="!pageLoading && !parsedDoc && tenderFile && !isProcessing"
      description="文档尚未解析完成，请稍后刷新页面查看"
    >
      <el-button type="primary" @click="loadPageData">刷新状态</el-button>
    </el-empty>

    <!-- 解析中状态 -->
    <div v-if="tenderFile && isProcessing" class="processing-status">
      <el-card>
        <div class="processing-content">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>文件正在解析中，请稍后刷新查看结果</span>
        </div>
        <el-button type="primary" @click="loadPageData">刷新状态</el-button>
      </el-card>
    </div>

    <!-- Tab 容器（仅在有解析结果时显示） -->
    <el-tabs
      v-if="parsedDoc && !isProcessing"
      v-model="activeTab"
      @tab-change="handleTabChange"
    >
      <el-tab-pane label="条款管理" name="requirements">
        <RequirementTab
          v-if="parsedDoc"
          :tender-file-id="fileId"
          :parsed-document-id="parsedDoc.id"
          :can-manage="canManage"
        />
      </el-tab-pane>

      <el-tab-pane label="解析分块" name="chunks">
        <ChunkTab
          v-if="parsedDoc && activeTab === 'chunks'"
          :parsed-document-id="parsedDoc.id"
        />
      </el-tab-pane>

      <el-tab-pane label="版本历史" name="versions">
        <VersionTab
          v-if="activeTab === 'versions'"
          :tender-file-id="fileId"
          :current-version-id="parsedDoc?.id"
          @activated="handleVersionActivated"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Loading } from '@element-plus/icons-vue'
import { logError } from '@/utils/logger'
import { useAuthStore } from '@/stores/auth'
import {
  getTenderFile,
  getParsedDocumentByFile,
  reparseTenderFile,
  type TenderFile,
  type ParsedDocument,
} from '@/api/tender'
import RequirementTab from '@/components/requirements/RequirementTab.vue'
import ChunkTab from '@/components/tender/ChunkTab.vue'
import VersionTab from '@/components/tender/VersionTab.vue'
import TaskProgress from '@/components/tender/TenderPipelineProgress.vue'
import { getCurrentTask } from '@/api/task'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const fileId = ref(Number(route.params.fileId))
const pageLoading = ref(false)
const reparseLoading = ref(false)

const tenderFile = ref<TenderFile | null>(null)
const parsedDoc = ref<ParsedDocument | null>(null)
const activeTab = ref('requirements')
const currentTaskId = ref<number | null>(null)

// 轮询定时器
let pollTimer: ReturnType<typeof setInterval> | null = null

// 计算属性
const isProcessing = computed(() => {
  if (!tenderFile.value) return false
  return ['parsing', 'chunking', 'processing', 'parse_pending'].includes(tenderFile.value.status)
})

const canReparse = computed(() => {
  if (!tenderFile.value) return false
  return ['parsed', 'chunked', 'ready', 'requirement_extracted', 'parse_failed'].includes(tenderFile.value.status)
})

const canManage = computed(() => {
  if (!tenderFile.value) return false
  return auth.hasGlobalPermission('tender.manage')
})

// 加载页面数据
async function loadPageData() {
  pageLoading.value = true
  try {
    // 加载文件信息
    const fileRes = await getTenderFile(fileId.value)
    tenderFile.value = fileRes.data

    // 如果文件已解析，加载解析文档
    if (tenderFile.value && !isProcessing.value) {
      try {
        const docRes = await getParsedDocumentByFile(fileId.value)
        // 空值保护：检查返回数据是否有效
        if (docRes.data && docRes.data.id) {
          parsedDoc.value = docRes.data
        } else {
          parsedDoc.value = null
        }
      } catch (err: any) {
        // 404 表示尚未解析，不报错
        if (err.response?.status !== 404) {
          logError('加载解析文档失败:', err)
        }
        parsedDoc.value = null
      }
      // 解析完成，停止轮询
      stopPolling()
    } else {
      parsedDoc.value = null
      // 处理中，启动轮询
      if (tenderFile.value && isProcessing.value) {
        startPolling()
      }
    }

    // 检查是否有进行中的任务
    checkCurrentTask()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || err.response?.data?.detail || '加载失败')
    router.back()
  } finally {
    pageLoading.value = false
  }
}

// 检查是否有进行中的任务
async function checkCurrentTask() {
  try {
    const res = await getCurrentTask({
      related_object_type: 'TenderFile',
      related_object_id: fileId.value,
    })
    currentTaskId.value = res.data?.id || null
  } catch (err) {
    logError('检查当前任务失败:', err)
  }
}

// 任务完成回调
function handleTaskCompleted(result: Record<string, unknown>) {
  if (result.task_type === 'requirement_extraction') {
    ElMessage.success(`条款抽取完成，共 ${result.total_count || 0} 条`)
  } else {
    ElMessage.success('任务完成')
  }
  loadPageData()
}

// 任务失败回调
function handleTaskFailed(error: string) {
  ElMessage.error(`任务失败: ${error}`)
}

// Tab 切换（按需加载）
function handleTabChange(_tabName: string) {
  // Tab 组件内部会自行处理数据加载
}

// 重新解析
async function handleReparse() {
  try {
    await ElMessageBox.confirm(
      '重新解析将生成新的解析版本，并设为当前版本。历史解析版本会保留。是否继续？',
      '确认重新解析',
      { type: 'warning' }
    )
    reparseLoading.value = true
    await reparseTenderFile(fileId.value)
    ElMessage.success('已提交重新解析任务')
    // 立即更新状态防止重复点击
    if (tenderFile.value) {
      tenderFile.value.status = 'parsing'
    }
    // 刷新页面数据
    loadPageData()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '操作失败')
    }
  } finally {
    reparseLoading.value = false
  }
}

// 版本激活后刷新
function handleVersionActivated() {
  // 重新加载 parsedDoc
  loadPageData()
}

// 状态样式
function getStatusType(status: string): string {
  const map: Record<string, string> = {
    uploading: 'info',
    parse_pending: 'warning',
    parsing: 'warning',
    parsed: 'success',
    chunked: 'success',
    requirement_extracted: 'success',
    parse_failed: 'danger',
  }
  return map[status] || 'info'
}

// 监听路由变化
watch(
  () => route.params.fileId,
  (newId) => {
    if (newId) {
      fileId.value = Number(newId)
      activeTab.value = 'requirements'
      loadPageData()
    }
  }
)

// 开始轮询
function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    if (isProcessing.value) {
      loadPageData()
    } else {
      stopPolling()
    }
  }, 3000)
}

// 停止轮询
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(() => {
  loadPageData()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped>
.tender-file-detail {
  padding: 20px;
  min-width: 0;
  overflow-x: hidden;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h2 {
  margin: 0;
  font-size: 20px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.processing-status {
  margin-top: 20px;
}

.processing-content {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.processing-content .el-icon {
  font-size: 20px;
}

/* 确保 1366px 无横向滚动 */
.el-tabs {
  min-width: 0;
}

.el-tabs :deep(.el-tabs__content) {
  min-width: 0;
  overflow-x: hidden;
}
</style>