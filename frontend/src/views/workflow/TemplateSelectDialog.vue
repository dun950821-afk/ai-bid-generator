<!-- frontend/src/views/workflow/TemplateSelectDialog.vue -->
<template>
  <el-dialog
    :model-value="visible"
    title="选择流程模板"
    width="500px"
    @close="handleClose"
  >
    <el-radio-group v-model="selectedTemplateId" class="template-list">
      <el-radio
        v-for="template in templates"
        :key="template.id"
        :label="template.id"
        class="template-item"
      >
        <div class="template-info">
          <span class="template-name">{{ template.name }}</span>
          <span class="template-desc">{{ template.description }}</span>
        </div>
      </el-radio>
    </el-radio-group>
    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleConfirm">
        确定
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { workflowApi, type WorkflowTemplate } from '@/api/workflow'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', templateId: number | null): void
}>()

const templates = ref<WorkflowTemplate[]>([])
const selectedTemplateId = ref<number | null>(null)
const loading = ref(false)

async function loadTemplates() {
  loading.value = true
  try {
    const res = await workflowApi.getSystemTemplates()
    templates.value = res.data.results
    if (templates.value.length > 0) {
      selectedTemplateId.value = templates.value[0].id
    }
  } finally {
    loading.value = false
  }
}

function handleClose() {
  emit('close')
}

function handleConfirm() {
  emit('confirm', selectedTemplateId.value)
}

watch(() => props.visible, (val) => {
  if (val) {
    loadTemplates()
  }
})
</script>

<style scoped>
.template-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.template-item {
  display: flex;
  align-items: flex-start;
  padding: 12px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
}

.template-item:hover {
  border-color: #409eff;
}

.template-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.template-name {
  font-weight: 500;
}

.template-desc {
  font-size: 12px;
  color: #909399;
}
</style>