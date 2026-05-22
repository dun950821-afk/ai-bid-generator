<template>
  <el-card v-if="task" class="task-card" shadow="never">
    <div class="task-header">
      <strong>{{ title }}</strong>
      <el-tag :type="tagType">{{ task.status }}</el-tag>
    </div>
    <el-progress :percentage="task.progress || 0" />
    <p class="step">{{ task.current_step || '等待中' }}</p>
    <el-alert v-if="task.error_message" :title="task.error_message" type="error" show-icon :closable="false" />
  </el-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getTask } from '@/api/tasks'

const props = defineProps<{
  taskId: number | null
  title?: string
}>()

const emit = defineEmits<{
  success: [task: any]
  failed: [task: any]
}>()

const task = ref<any>(null)
let timer: number | undefined

const title = computed(() => props.title || '任务进度')
const tagType = computed(() => {
  if (!task.value) return 'info'
  if (task.value.status === 'success') return 'success'
  if (task.value.status === 'failed') return 'danger'
  return 'warning'
})

async function poll() {
  if (!props.taskId) return
  const res = await getTask(props.taskId)
  task.value = res.data

  if (res.data.status === 'success') {
    clear()
    emit('success', res.data)
  } else if (res.data.status === 'failed') {
    clear()
    emit('failed', res.data)
  }
}

function clear() {
  if (timer) {
    window.clearInterval(timer)
    timer = undefined
  }
}

watch(
  () => props.taskId,
  async (id) => {
    clear()
    task.value = null
    if (!id) return
    await poll()
    timer = window.setInterval(poll, 2000)
  },
  { immediate: true },
)

onBeforeUnmount(clear)
</script>

<style scoped>
.task-card {
  margin-top: 18px;
  border-radius: 16px;
}
.task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.step {
  color: var(--app-text-secondary);
  margin-bottom: 0;
}
</style>
