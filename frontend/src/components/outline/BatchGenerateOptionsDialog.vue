<!-- frontend/src/components/outline/BatchGenerateOptionsDialog.vue -->
<template>
  <el-dialog
    v-model="visible"
    title="批量生成正文"
    width="500px"
    :close-on-click-modal="false"
  >
    <div class="options-content">
      <el-alert
        type="info"
        :closable="false"
        show-icon
      >
        <template #title>
          <div class="alert-title">
            共 <strong>{{ precheckResult?.total_sections || 0 }}</strong> 个章节，
            其中 <strong>{{ precheckResult?.matrix_ready_sections || 0 }}</strong> 个有矩阵
          </div>
        </template>
      </el-alert>

      <div class="stats-row" v-if="precheckResult">
        <div class="stat-item">
          <span class="stat-label">未生成:</span>
          <span class="stat-value">{{ precheckResult.eligible_sections }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">已生成:</span>
          <span class="stat-value">{{ precheckResult.already_generated }}</span>
        </div>
      </div>

      <el-divider />

      <el-form label-width="100px">
        <el-form-item label="生成范围">
          <el-radio-group v-model="generateScope">
            <el-radio value="un-generated">
              只生成未生成的
              <span class="radio-hint">({{ precheckResult?.eligible_sections || 0 }} 个)</span>
            </el-radio>
            <el-radio value="all">
              全部重新生成
              <span class="radio-hint">({{ precheckResult?.matrix_ready_sections || 0 }} 个)</span>
            </el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="失败处理">
          <el-checkbox v-model="skipOnFailure">
            失败时跳过继续
          </el-checkbox>
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleStart" :loading="starting">
        开始生成
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  batchGeneratePrecheck,
  createBatchGenerateTask,
  type BatchGenerationPrecheck,
} from '@/api/outline'

const props = defineProps<{
  outlineId: number
}>()

const visible = defineModel<boolean>('visible')
const starting = ref(false)
const precheckResult = ref<BatchGenerationPrecheck | null>(null)
const generateScope = ref<'un-generated' | 'all'>('un-generated')
const skipOnFailure = ref(true)

const emit = defineEmits<{
  started: [taskId: number]
}>()

// 加载预检查数据（组件由 v-if 挂载，挂载时 visible 已是 true，需 immediate 才会触发）
watch(visible, async (newVal) => {
  if (newVal && props.outlineId) {
    try {
      const res = await batchGeneratePrecheck(props.outlineId)
      precheckResult.value = res.data

      // 如果没有已生成的，默认选择全部重新生成没意义，还是选未生成
      if (res.data.already_generated === 0) {
        generateScope.value = 'un-generated'
      }
    } catch (err) {
      console.error('预检查失败:', err)
      ElMessage.error('获取章节状态失败')
    }
  }
}, { immediate: true })

async function handleStart() {
  if (!precheckResult.value) return

  // 检查是否有可生成的章节
  const targetCount = generateScope.value === 'all'
    ? precheckResult.value.matrix_ready_sections
    : precheckResult.value.eligible_sections

  if (targetCount === 0) {
    ElMessage.warning('没有可生成的章节')
    return
  }

  starting.value = true
  try {
    const res = await createBatchGenerateTask(props.outlineId, {
      include_success: generateScope.value === 'all',
      skip_on_failure: skipOnFailure.value,
    })

    ElMessage.success('批量生成任务已启动')
    visible.value = false
    emit('started', res.data.task_id)
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: string } } }
    ElMessage.error(error.response?.data?.error || '启动失败')
  } finally {
    starting.value = false
  }
}
</script>

<style scoped>
.options-content {
  padding: 10px 0;
}

.alert-title {
  font-size: 14px;
}

.alert-title strong {
  color: var(--el-color-primary);
  font-size: 16px;
}

.stats-row {
  display: flex;
  gap: 24px;
  margin-top: 16px;
  padding: 12px 16px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-label {
  color: var(--el-text-color-secondary);
}

.stat-value {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.radio-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

:deep(.el-radio) {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
</style>
