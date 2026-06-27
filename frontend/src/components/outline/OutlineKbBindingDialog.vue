<!-- frontend/src/components/outline/OutlineKbBindingDialog.vue -->
<template>
  <el-dialog v-model="visible" title="关联知识库" width="700px" @open="loadAvailableKbs">
    <div class="kb-binding-content">
      <el-input v-model="searchQuery" placeholder="搜索知识库名称" clearable class="search-input" />

      <div v-for="group in groupedKbs" :key="group.kbType" class="kb-group">
        <div class="group-title">{{ group.label }}（{{ group.kbs.length }}）</div>
        <el-checkbox-group v-model="selectedKbIds">
          <div v-for="kb in group.kbs" :key="kb.id" class="kb-item">
            <el-checkbox :label="kb.id" :disabled="isAlreadyBound(kb.id)">
              <span class="kb-name">{{ kb.name }}</span>
              <span class="kb-meta">（{{ kb.document_count }} 文档）</span>
              <el-tag v-if="kb.rag_channel" size="small" type="info" class="channel-tag">
                {{ kb.rag_channel }}
              </el-tag>
              <el-tag v-if="isAlreadyBound(kb.id)" size="small" type="success">已添加</el-tag>
            </el-checkbox>
          </div>
        </el-checkbox-group>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleBind">
        关联选中（{{ selectedKbIds.length }}）
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  listAvailableKbs, bindOutlineKbs,
  type KnowledgeBaseOption,
} from '@/api/outlineKb'

const props = defineProps<{ outlineId: number; boundKbIds: number[] }>()
const emit = defineEmits<{ bound: [] }>()

const visible = defineModel<boolean>('visible')

const searchQuery = ref('')
const availableKbs = ref<KnowledgeBaseOption[]>([])
const selectedKbIds = ref<number[]>([])
const submitting = ref(false)

const KB_TYPE_LABELS: Record<string, string> = {
  company_profile: '公司介绍库',
  case_library: '项目案例库',
  qualification: '资质证书库',
  product: '产品资料库',
  bid_history: '历史标书库',
  technical_solution: '技术方案库',
}

const filteredKbs = computed(() => {
  if (!searchQuery.value) return availableKbs.value
  return availableKbs.value.filter((kb) => kb.name.includes(searchQuery.value))
})

const groupedKbs = computed(() => {
  const groups: Record<string, KnowledgeBaseOption[]> = {}
  for (const kb of filteredKbs.value) {
    if (!groups[kb.kb_type]) groups[kb.kb_type] = []
    groups[kb.kb_type].push(kb)
  }
  return Object.entries(groups).map(([kbType, kbs]) => ({
    kbType,
    kbs,
    label: KB_TYPE_LABELS[kbType] || kbType,
  }))
})

function isAlreadyBound(kbId: number) {
  return props.boundKbIds.includes(kbId)
}

async function loadAvailableKbs() {
  try {
    const res = await listAvailableKbs()
    availableKbs.value = (res.data as unknown as KnowledgeBaseOption[]) || []
  } catch {
    ElMessage.error('加载知识库列表失败')
  }
}

async function handleBind() {
  if (selectedKbIds.value.length === 0) {
    ElMessage.warning('请至少选择一个知识库')
    return
  }
  submitting.value = true
  try {
    await bindOutlineKbs(props.outlineId, selectedKbIds.value)
    ElMessage.success(`已关联 ${selectedKbIds.value.length} 个知识库`)
    selectedKbIds.value = []
    visible.value = false
    emit('bound')
  } catch {
    ElMessage.error('关联失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.kb-binding-content {
  max-height: 60vh;
  overflow-y: auto;
}
.search-input {
  margin-bottom: 16px;
}
.kb-group {
  margin-bottom: 16px;
}
.group-title {
  font-weight: 600;
  margin-bottom: 8px;
  color: #303133;
}
.kb-item {
  margin-bottom: 8px;
}
.kb-name {
  font-weight: 500;
}
.kb-meta {
  color: #909399;
  font-size: 13px;
  margin-left: 4px;
}
.channel-tag {
  margin-left: 8px;
}
</style>
