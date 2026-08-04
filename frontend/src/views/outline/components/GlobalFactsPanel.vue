<!-- frontend/src/views/outline/components/GlobalFactsPanel.vue -->
<!-- 全局事实变量面板（借鉴 OpenBidKit globalFactsTask） -->
<template>
  <div class="global-facts-panel">
    <!-- 顶部操作栏 -->
    <div class="panel-header">
      <div class="header-info">
        <span class="title">全局事实变量</span>
        <el-tag size="small" type="info">{{ facts.length }} 项</el-tag>
        <el-tooltip content="从招标文件/知识库/原方案提取会影响全文一致性的事实（项目名、工期、人员、设备、质保等），正文生成时强制引用" placement="top">
          <el-icon class="help-icon"><QuestionFilled /></el-icon>
        </el-tooltip>
      </div>
      <div class="header-actions">
        <el-button
          type="primary"
          :loading="extracting"
          @click="handleExtract"
        >
          {{ facts.length > 0 ? '重新提取' : '提取全局事实' }}
        </el-button>
      </div>
    </div>

    <!-- 提取进度 -->
    <el-alert
      v-if="extracting || extractError"
      :title="extractError || `正在提取：${currentStep}（${progress}%）`"
      :type="extractError ? 'error' : 'info'"
      :closable="false"
      show-icon
      class="progress-alert"
    >
      <el-progress
        v-if="!extractError"
        :percentage="progress"
        :stroke-width="6"
        :show-text="false"
      />
    </el-alert>

    <!-- 事实变量列表 -->
    <div v-loading="loading" class="facts-list">
      <el-empty v-if="!loading && facts.length === 0 && !extracting" description="暂无全局事实变量，请先提取" />

      <el-card
        v-for="fact in facts"
        :key="fact.id"
        shadow="never"
        class="fact-card"
      >
        <template #header>
          <div class="fact-header">
            <div class="fact-title">
              <el-input
                v-if="editingId === fact.id"
                v-model="editForm.title"
                size="small"
                style="width: 240px"
                placeholder="标题"
              />
              <span v-else class="title-text">{{ fact.title }}</span>
              <el-tag size="small" :type="sourceTagType(fact.source)" class="source-tag">
                {{ sourceLabel(fact.source) }}
              </el-tag>
              <span class="fact-key">{{ fact.key }}</span>
            </div>
            <div class="fact-actions">
              <template v-if="editingId === fact.id">
                <el-button size="small" type="primary" :loading="saving" @click="saveEdit(fact)">保存</el-button>
                <el-button size="small" @click="cancelEdit">取消</el-button>
              </template>
              <template v-else>
                <el-button size="small" link @click="startEdit(fact)">编辑</el-button>
                <el-button size="small" link :loading="regeneratingId === fact.id" @click="regenerate(fact)">重新提取</el-button>
              </template>
            </div>
          </div>
        </template>

        <el-input
          v-if="editingId === fact.id"
          v-model="editForm.content"
          type="textarea"
          :rows="3"
          placeholder="事实内容"
        />
        <div v-else class="fact-content">{{ fact.content }}</div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import {
  listGlobalFacts,
  extractGlobalFacts,
  updateGlobalFact,
  regenerateGlobalFact,
  getExtractTask,
  type GlobalFact,
} from '@/api/globalFact'

const props = defineProps<{ outlineId: number }>()

const emit = defineEmits<{
  /** 提取任务成功后通知父组件（用于刷新生成准备检查清单等状态） */
  extracted: []
}>()

const loading = ref(false)
const extracting = ref(false)
const saving = ref(false)
const extractError = ref('')
const currentStep = ref('')
const progress = ref(0)
const facts = ref<GlobalFact[]>([])
const editingId = ref<number | null>(null)
const regeneratingId = ref<number | null>(null)
const editForm = ref({ title: '', content: '' })

let pollTimer: ReturnType<typeof setTimeout> | null = null

async function loadFacts() {
  loading.value = true
  try {
    const res = await listGlobalFacts(props.outlineId)
    facts.value = res.data.results
  } catch (e: any) {
    ElMessage.error(e?.message || '加载全局事实失败')
  } finally {
    loading.value = false
  }
}

async function handleExtract() {
  if (facts.value.length > 0) {
    try {
      await ElMessageBox.confirm('重新提取将覆盖现有事实变量，是否继续？', '确认', { type: 'warning' })
    } catch {
      return
    }
  }
  extracting.value = true
  extractError.value = ''
  progress.value = 0
  currentStep.value = '提交中'
  try {
    const res = await extractGlobalFacts(props.outlineId)
    pollTask(res.data.task_id)
  } catch (e: any) {
    extracting.value = false
    extractError.value = e?.message || '提交提取任务失败'
  }
}

function pollTask(taskId: number) {
  const poll = async () => {
    try {
      const res = await getExtractTask(taskId)
      const task = res.data
      progress.value = task.progress
      currentStep.value = task.current_step
      if (task.status === 'success') {
        extracting.value = false
        ElMessage.success(`提取完成，共 ${task.result_payload?.fact_count || 0} 项`)
        await loadFacts()
        emit('extracted')
        return
      }
      if (task.status === 'failed') {
        extracting.value = false
        extractError.value = task.error_message || '提取失败'
        return
      }
      pollTimer = setTimeout(poll, 2000)
    } catch (e: any) {
      extracting.value = false
      extractError.value = e?.message || '查询任务状态失败'
    }
  }
  poll()
}

function startEdit(fact: GlobalFact) {
  editingId.value = fact.id
  editForm.value = { title: fact.title, content: fact.content }
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit(fact: GlobalFact) {
  saving.value = true
  try {
    const res = await updateGlobalFact(props.outlineId, fact.id, editForm.value)
    const idx = facts.value.findIndex(f => f.id === fact.id)
    if (idx >= 0) facts.value[idx] = res.data
    editingId.value = null
    ElMessage.success('已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function regenerate(fact: GlobalFact) {
  regeneratingId.value = fact.id
  try {
    const res = await regenerateGlobalFact(props.outlineId, fact.id)
    const idx = facts.value.findIndex(f => f.id === fact.id)
    if (idx >= 0) facts.value[idx] = res.data
    ElMessage.success('已重新提取')
  } catch (e: any) {
    ElMessage.error(e?.message || '重新提取失败')
  } finally {
    regeneratingId.value = null
  }
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    tender: '招标文件',
    knowledge: '知识库',
    original_plan: '原方案',
    manual: '人工',
  }
  return map[source] || source
}

function sourceTagType(source: string): 'primary' | 'success' | 'warning' | 'info' {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'info'> = {
    tender: 'primary',
    knowledge: 'success',
    original_plan: 'warning',
    manual: 'info',
  }
  return map[source] || 'info'
}

onMounted(loadFacts)
onUnmounted(() => {
  if (pollTimer) clearTimeout(pollTimer)
})
</script>

<style scoped>
.global-facts-panel {
  padding: 12px 0;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.header-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-info .title {
  font-weight: 600;
  font-size: 15px;
}
.help-icon {
  color: var(--el-text-color-secondary);
  cursor: help;
}
.progress-alert {
  margin-bottom: 12px;
}
.facts-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.fact-card {
  border: 1px solid var(--el-border-color-lighter);
}
.fact-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.fact-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.title-text {
  font-weight: 600;
}
.source-tag {
  margin-left: 4px;
}
.fact-key {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-family: monospace;
}
.fact-content {
  white-space: pre-wrap;
  color: var(--el-text-color-primary);
  line-height: 1.6;
}
.fact-actions {
  display: flex;
  gap: 4px;
}
</style>
