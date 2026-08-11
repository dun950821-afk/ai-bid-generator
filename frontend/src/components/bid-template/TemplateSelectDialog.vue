<!-- frontend/src/components/bid-template/TemplateSelectDialog.vue -->
<template>
  <el-dialog
    :model-value="modelValue"
    title="选择 Word 模板"
    width="560px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @open="loadTemplates"
  >
    <div v-loading="loading">
      <div class="template-options">
        <div
          class="template-option"
          :class="{ active: selectedId === null }"
          @click="selectedId = null"
        >
          <el-radio :model-value="selectedId" :value="null" @change="selectedId = null">
            <span class="option-name">默认格式（不使用模板）</span>
          </el-radio>
          <div class="option-desc">系统标准排版，快速生成草稿</div>
        </div>

        <div
          v-for="template in templates"
          :key="template.id"
          class="template-option"
          :class="{ active: selectedId === template.id }"
          @click="selectedId = template.id"
        >
          <el-radio :model-value="selectedId" :value="template.id" @change="selectedId = template.id">
            <span class="option-name">{{ template.name }}</span>
          </el-radio>
          <div class="option-desc">
            <el-tag size="small">{{ template.scope_type_display }}</el-tag>
            <el-tag size="small" type="success">V{{ template.published_version_no }}</el-tag>
            <span v-if="template.description" class="desc-text">{{ template.description }}</span>
          </div>
        </div>
      </div>

      <el-empty
        v-if="!loading && templates.length === 0"
        description="暂无已发布模板，可在「模板中心」创建"
        :image-size="60"
      />
    </div>

    <template #footer>
      <el-checkbox v-model="openAfterGenerate" class="open-after">
        生成后打开 OnlyOffice 并自动刷新目录
      </el-checkbox>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="generating" @click="handleConfirm">
        生成
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { listTemplates, type BidWordTemplate } from '@/api/bidTemplate'

const props = defineProps<{
  modelValue: boolean
  generating?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm', templateId: number | null, openEditor: boolean): void
}>()

const loading = ref(false)
const templates = ref<BidWordTemplate[]>([])
const selectedId = ref<number | null>(null)
const openAfterGenerate = ref(true)

async function loadTemplates() {
  loading.value = true
  try {
    const res = await listTemplates({ has_published: '1' })
    const data = res.data
    templates.value = Array.isArray(data) ? data : data.results
  } catch (err) {
    ElMessage.error('加载模板列表失败')
  } finally {
    loading.value = false
  }
}

function handleConfirm() {
  emit('confirm', selectedId.value, openAfterGenerate.value)
}
</script>

<style scoped>
.open-after {
  margin-right: auto;
}

.template-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.template-option {
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 10px 12px;
  cursor: pointer;
}

.template-option:hover {
  border-color: #409eff;
}

.template-option.active {
  border-color: #409eff;
  background: #ecf5ff;
}

.option-name {
  font-weight: 600;
  font-size: 14px;
}

.option-desc {
  margin-top: 4px;
  margin-left: 24px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #909399;
  font-size: 12px;
}

.desc-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
