<!-- frontend/src/views/outline/components/WorkflowGuidePanel.vue -->
<template>
  <!-- 悬浮引导按钮（收起状态） -->
  <transition name="fade">
    <div v-if="collapsed" class="guide-fab" @click="expand">
      <el-badge :value="pendingCount" :hidden="pendingCount === 0" type="warning">
        <el-icon :size="20"><Guide /></el-icon>
      </el-badge>
      <span class="fab-text">操作指引</span>
    </div>
  </transition>

  <!-- 展开面板（覆盖层） -->
  <transition name="slide">
    <div v-if="!collapsed" class="guide-overlay" @click.self="collapse">
      <div class="guide-panel">
        <div class="guide-header">
          <div class="guide-title">
            <el-icon class="guide-icon"><Guide /></el-icon>
            <span class="guide-title-text">操作流程指引</span>
            <span class="guide-current">
              第 {{ currentStep }} 步 · {{ steps[currentStep - 1].title }}
            </span>
          </div>
          <div class="guide-ops">
            <el-button link size="small" @click="collapse">收起</el-button>
            <el-button link size="small" type="info" @click="emit('hide')">不再显示</el-button>
          </div>
        </div>

        <div class="guide-steps">
          <div
            v-for="step in steps"
            :key="step.key"
            class="guide-step"
            :class="{ 'is-done': step.done, 'is-current': step.key === currentStep }"
          >
            <div class="step-badge">
              <el-icon v-if="step.done"><Check /></el-icon>
              <span v-else>{{ step.key }}</span>
            </div>
            <div class="step-body">
              <div class="step-title">
                {{ step.title }}
                <el-tag v-if="step.done" type="success" size="small" effect="plain">已完成</el-tag>
                <el-tag v-else-if="step.key === currentStep" type="primary" size="small" effect="plain">进行中</el-tag>
              </div>
              <div class="step-desc">{{ step.desc }}</div>
              <div class="step-status">{{ step.statusText }}</div>
              <div class="step-actions">
                <template v-if="step.key === 1">
                  <!-- 先校验目录，再准备材料（与详情页顶部共用同一按钮组件） -->
                  <ReviewStatusButton
                    :review-status="props.reviewStatus ?? null"
                    :loading="reviewLoading"
                    @click="emit('review')"
                  />
                  <el-button
                    size="small"
                    :type="step.done ? 'success' : (step.key === currentStep ? 'primary' : 'default')"
                    @click="runStepAction(step.key)"
                  >
                    {{ step.done ? '准备已完成' : step.actionText }}
                  </el-button>
                </template>
                <template v-else-if="step.key === 4">
                  <el-button size="small" :disabled="!wordExists" @click="emit('open-check')">废标检查</el-button>
                  <el-button size="small" @click="emit('open-audit')">一致性审计</el-button>
                  <el-button size="small" type="primary" :disabled="!wordExists" @click="emit('download')">下载 Word</el-button>
                </template>
                <el-button
                  v-else
                  size="small"
                  :type="step.key === currentStep ? 'primary' : 'default'"
                  @click="runStepAction(step.key)"
                >
                  {{ step.actionText }}
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Check, Guide } from '@element-plus/icons-vue'
import ReviewStatusButton from '@/components/outline/ReviewStatusButton.vue'

const props = defineProps<{
  prepDoneCount: number
  contentDone: number
  contentTotal: number
  wordExists: boolean
  reviewStatus?: string | null
  reviewLoading?: boolean
  forceExpand?: boolean
}>()

const emit = defineEmits<{
  (e: 'hide'): void
  (e: 'open-prep'): void
  (e: 'review'): void
  (e: 'batch-generate'): void
  (e: 'build-word'): void
  (e: 'open-check'): void
  (e: 'open-audit'): void
  (e: 'download'): void
}>()

interface GuideStep {
  key: number
  title: string
  desc: string
  done: boolean
  statusText: string
  actionText: string
}

// 步骤 1-3 的主操作按钮与事件的映射（步骤 4 在模板中单独处理）
function runStepAction(key: number) {
  if (key === 1) emit('open-prep')
  else if (key === 2) emit('batch-generate')
  else if (key === 3) emit('build-word')
}

const COLLAPSED_KEY = 'outline_workflow_guide_collapsed'
// 默认收起（有内容时）或展开（首次使用）
const collapsed = ref(localStorage.getItem(COLLAPSED_KEY) === '1' || props.contentTotal > 0)

// 待完成步骤数（用于悬浮按钮徽标）
const pendingCount = computed(() => {
  return steps.value.filter(s => !s.done).length
})

// 监听 forceExpand 属性，外部触发时直接展开
watch(() => props.forceExpand, (val) => {
  if (val) {
    collapsed.value = false
    localStorage.setItem(COLLAPSED_KEY, '0')
  }
}, { immediate: true })

function expand() {
  collapsed.value = false
  localStorage.setItem(COLLAPSED_KEY, '0')
}

function collapse() {
  collapsed.value = true
  localStorage.setItem(COLLAPSED_KEY, '1')
}

const steps = computed<GuideStep[]>(() => {
  const prepDone = props.prepDoneCount >= 4
  const contentDone = props.contentTotal > 0 && props.contentDone >= props.contentTotal
  const wordDone = props.wordExists
  return [
    {
      key: 1,
      title: '生成准备',
      desc: '完善材料包、知识库、全局事实与内容矩阵',
      done: prepDone,
      statusText: prepDone ? '4 项准备已全部完成' : `已完成 ${props.prepDoneCount}/4 项准备`,
      actionText: prepDone ? '查看准备清单' : '去完成准备',
    },
    {
      key: 2,
      title: '生成章节内容',
      desc: '批量生成全部章节，或在右侧选择单个章节生成',
      done: contentDone,
      statusText:
        props.contentTotal === 0
          ? '暂无待生成章节'
          : `已生成 ${props.contentDone}/${props.contentTotal} 个章节`,
      actionText: contentDone ? '重新批量生成' : '批量生成',
    },
    {
      key: 3,
      title: '生成 Word 文档',
      desc: '将已生成的章节内容合成为 Word 草稿',
      done: wordDone,
      statusText: wordDone ? 'Word 草稿已生成' : '尚未生成 Word 草稿',
      actionText: wordDone ? '重新生成 Word' : '生成 Word',
    },
    {
      key: 4,
      title: '检查与导出',
      desc: '废标检查、一致性审计，确认无误后下载交付',
      done: false,
      statusText: wordDone ? '可以开始检查与导出' : '生成 Word 草稿后可用',
      actionText: '',
    },
  ]
})

const currentStep = computed(() => steps.value.find((s) => !s.done)?.key ?? 4)
</script>

<style scoped>
/* 悬浮引导按钮 */
.guide-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: var(--el-color-primary);
  color: #fff;
  border-radius: 24px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.3);
  transition: all 0.2s ease;
}

.guide-fab:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(64, 158, 255, 0.4);
}

.fab-text {
  font-size: 13px;
  font-weight: 500;
}

/* 覆盖层 */
.guide-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 99;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 60px;
}

/* 引导面板 */
.guide-panel {
  width: 90%;
  max-width: 900px;
  background: var(--el-bg-color);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.guide-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);
}

.guide-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.guide-icon {
  color: var(--el-color-primary);
  font-size: 18px;
}

.guide-title-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  flex-shrink: 0;
}

.guide-current {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.guide-ops {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.guide-steps {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  padding: 16px 20px 20px;
}

.guide-step {
  display: flex;
  gap: 10px;
  padding: 14px;
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  transition: all 0.2s ease;
}

.guide-step.is-current {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.15);
}

.guide-step.is-done {
  border-color: var(--el-color-success-light-5);
  background: var(--el-color-success-light-9);
}

.step-badge {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
}

.guide-step.is-current .step-badge {
  background: var(--el-color-primary);
  color: #fff;
}

.guide-step.is-done .step-badge {
  background: var(--el-color-success);
  color: #fff;
}

.step-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.step-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.step-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.step-status {
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.step-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.step-actions .el-button + .el-button {
  margin-left: 0;
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.25s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

@media (max-width: 1200px) {
  .guide-steps {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
