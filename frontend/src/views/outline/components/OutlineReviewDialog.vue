<!-- frontend/src/views/outline/components/OutlineReviewDialog.vue -->
<template>
  <el-dialog v-model="visible" title="目录审核结果" width="640px" :close-on-click-modal="false">
    <div v-if="outline">
      <el-alert
        :title="reviewAlertTitle"
        :type="outline.review_status === 'passed' ? 'success' : 'warning'"
        :closable="false"
        show-icon
        class="review-alert"
      />
      <div v-if="outline.review_suggestions && outline.review_suggestions.length > 0" class="review-suggestions">
        <div class="suggestions-title">修改建议：</div>
        <ol>
          <li v-for="(s, i) in outline.review_suggestions" :key="i">{{ s }}</li>
        </ol>
      </div>

      <!-- refine 进度 -->
      <el-alert
        v-if="refining || refineError"
        :title="refineError || `正在完善目录：${refineStep}（${refineProgress}%）`"
        :type="refineError ? 'error' : 'info'"
        :closable="false"
        show-icon
        class="review-alert"
      >
        <el-progress v-if="!refineError" :percentage="refineProgress" :stroke-width="6" :show-text="false" />
      </el-alert>

      <!-- diff 预览 -->
      <div v-if="refineDiff" class="refine-diff">
        <el-divider content-position="left">目录变更预览</el-divider>
        <div class="diff-section">
          <div class="diff-title added">
            <el-icon><CirclePlus /></el-icon>
            新增一级目录（{{ refineDiff.added.length }}）
          </div>
          <div v-for="n in refineDiff.added" :key="n.title" class="diff-item added">
            <el-tag type="success" size="small">新增</el-tag>
            <span>{{ n.title }}</span>
          </div>
          <el-empty v-if="refineDiff.added.length === 0" description="无新增" :image-size="40" />
        </div>
        <div class="diff-section">
          <div class="diff-title removed">
            <el-icon><Remove /></el-icon>
            将删除一级目录（{{ refineDiff.removed.length }}）
          </div>
          <div v-for="n in refineDiff.removed" :key="n.title" class="diff-item removed">
            <el-tag type="danger" size="small">删除</el-tag>
            <span>{{ n.title }}</span>
          </div>
          <el-empty v-if="refineDiff.removed.length === 0" description="无删除" :image-size="40" />
        </div>
        <el-alert
          v-if="refineDiff.review.passed"
          type="success"
          title="完善后目录审核通过"
          :closable="false"
          show-icon
        />
        <el-alert
          v-else
          type="warning"
          title="完善后目录审核仍未完全通过，可选择性应用"
          :closable="false"
          show-icon
        />
      </div>
    </div>
    <template #footer>
      <template v-if="refineDiff">
        <el-button @click="cancelRefine">取消</el-button>
        <el-button type="primary" :loading="applying" @click="applyRefine">应用变更</el-button>
      </template>
      <template v-else>
        <el-button @click="visible = false">关闭</el-button>
        <el-button
          v-if="outline && outline.review_status !== 'passed'"
          type="warning"
          :loading="ignoring"
          @click="handleIgnoreReview"
        >
          忽略建议通过
        </el-button>
        <el-button
          v-if="outline && outline.review_status !== 'passed'"
          type="primary"
          :loading="refining"
          @click="handleRefineOutline"
        >
          按建议完善
        </el-button>
      </template>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CirclePlus, Remove } from '@element-plus/icons-vue'
import {
  ignoreReview,
  refineOutline,
  applyRefineOutline,
  type OutlineDetail,
} from '@/api/outline'
import { getTask } from '@/api/task'

const props = defineProps<{
  modelValue: boolean
  outline: OutlineDetail | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'changed', patch: Partial<OutlineDetail>): void
  (e: 'applied'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const reviewAlertTitle = computed(() => {
  if (!props.outline) return ''
  if (props.outline.review_status === 'passed') {
    return props.outline.review_overridden
      ? '已忽略建议，人工审核通过'
      : '审核通过：一级目录与技术评分大类一一对应'
  }
  return '审核未通过'
})

// ===== 忽略建议通过 =====
const ignoring = ref(false)

async function handleIgnoreReview() {
  if (!props.outline) return
  try {
    await ElMessageBox.confirm('确认忽略 AI 建议强制通过？后续可重新审核', '确认忽略', { type: 'warning' })
  } catch {
    return
  }
  ignoring.value = true
  try {
    const res = await ignoreReview(props.outline.id)
    emit('changed', { review_status: 'passed', review_overridden: true })
    ElMessage.success(res.data.message)
    visible.value = false
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '操作失败')
  } finally {
    ignoring.value = false
  }
}

// ===== 按建议完善（异步+diff）=====
const refining = ref(false)
const refineProgress = ref(0)
const refineStep = ref('')
const refineError = ref('')
const refineDiff = ref<{ added: any[]; removed: any[]; new_tree: any[]; review: { passed: boolean } } | null>(null)
const applying = ref(false)
let refineTimer: ReturnType<typeof setTimeout> | null = null

function resetRefineState() {
  refineProgress.value = 0
  refineStep.value = ''
  refineError.value = ''
  refineDiff.value = null
  if (refineTimer) {
    clearTimeout(refineTimer)
    refineTimer = null
  }
}

// 每次打开对话框时重置完善流程状态
watch(
  () => props.modelValue,
  (value) => {
    if (value) resetRefineState()
  },
  { immediate: true }
)

async function handleRefineOutline() {
  if (!props.outline) return
  resetRefineState()
  refining.value = true
  try {
    const res = await refineOutline(props.outline.id)
    pollRefineTask(res.data.task_id)
  } catch (e: any) {
    refining.value = false
    refineError.value = e?.response?.data?.detail || e?.message || '提交完善任务失败'
  }
}

function pollRefineTask(taskId: number) {
  const poll = async () => {
    try {
      const res = await getTask(taskId)
      const t = res.data
      refineProgress.value = t.progress
      refineStep.value = t.current_step
      if (t.status === 'success') {
        refining.value = false
        const payload = (t.result_payload || {}) as any
        refineDiff.value = {
          added: payload.added || [],
          removed: payload.removed || [],
          new_tree: payload.new_tree || [],
          review: payload.review || { passed: false },
        }
        ElMessage.success('目录完善完成，请预览变更')
        return
      }
      if (t.status === 'failed') {
        refining.value = false
        refineError.value = t.error_message || '完善失败'
        return
      }
      refineTimer = setTimeout(poll, 2000)
    } catch (e: any) {
      refining.value = false
      refineError.value = e?.message || '查询任务状态失败'
    }
  }
  poll()
}

function cancelRefine() {
  resetRefineState()
  visible.value = false
}

async function applyRefine() {
  if (!props.outline || !refineDiff.value) return
  applying.value = true
  try {
    const res = await applyRefineOutline(props.outline.id, refineDiff.value.new_tree)
    ElMessage.success(`已应用新目录，共 ${res.data.section_count} 个章节`)
    resetRefineState()
    emit('applied')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '应用失败')
  } finally {
    applying.value = false
  }
}

onBeforeUnmount(() => {
  if (refineTimer) {
    clearTimeout(refineTimer)
    refineTimer = null
  }
})
</script>

<style scoped>
.review-alert {
  margin-bottom: 12px;
}
.review-suggestions {
  margin-top: 8px;
}
.suggestions-title {
  font-weight: 600;
  margin-bottom: 8px;
}
.review-suggestions ol {
  margin: 0;
  padding-left: 20px;
  color: var(--el-text-color-regular);
  line-height: 1.8;
}
.refine-diff {
  margin-top: 12px;
}
.diff-section {
  margin-bottom: 16px;
}
.diff-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  margin-bottom: 8px;
  font-size: 14px;
}
.diff-title.added { color: var(--el-color-success); }
.diff-title.removed { color: var(--el-color-danger); }
.diff-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  margin-bottom: 4px;
  border-radius: 6px;
  font-size: 13px;
}
.diff-item.added {
  background: var(--el-color-success-light-9);
}
.diff-item.removed {
  background: var(--el-color-danger-light-9);
  text-decoration: line-through;
  color: var(--el-text-color-secondary);
}
</style>
