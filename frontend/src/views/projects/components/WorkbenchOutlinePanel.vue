<template>
  <div class="workbench-outline-panel">
    <!-- 现有大纲列表 -->
    <div class="section">
      <h4>本标段大纲</h4>
      <div v-if="outlines.length" class="outline-list">
        <div v-for="outline in outlines" :key="outline.id" class="outline-item">
          <div class="outline-info">
            <span class="outline-name">{{ outline.name }}</span>
            <el-tag v-if="outline.is_current" type="success" size="small">当前版本</el-tag>
            <el-tag :type="getOutlineStatusType(outline.status)" size="small">
              {{ getOutlineStatusLabel(outline.status) }}
            </el-tag>
          </div>
          <el-button type="primary" size="small" @click="goEdit(outline.id)">编辑</el-button>
        </div>
      </div>
      <el-empty v-else description="暂无大纲" :image-size="60" />
    </div>

    <!-- 新建大纲（内联） -->
    <div class="section">
      <h4>新建大纲</h4>
      <el-radio-group v-model="createMode" class="create-mode">
        <el-radio value="manual">手动创建</el-radio>
        <el-radio value="preset">预设模板</el-radio>
        <el-radio value="ai">AI 解析</el-radio>
      </el-radio-group>

      <el-form label-width="100px" class="create-form">
        <el-form-item label="大纲名称">
          <el-input v-model="createForm.name" placeholder="请输入大纲名称" style="width: 100%" />
        </el-form-item>
        <el-form-item v-if="createMode === 'preset'" label="预设模板">
          <el-select v-model="createForm.templateId" placeholder="请选择" style="width: 100%" :loading="loadingTemplates">
            <el-option v-for="tpl in presetTemplates" :key="tpl.id" :label="tpl.name" :value="tpl.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="createMode === 'ai'" label="招标文件">
          <el-select v-model="createForm.tenderFileId" placeholder="请选择已解析的招标文件" style="width: 100%">
            <el-option
              v-for="f in readyFiles"
              :key="f.id"
              :label="f.name"
              :value="f.id"
            />
          </el-select>
          <div v-if="!readyFiles.length" class="ai-tip">暂无已解析文件，请先在「招标文件」步骤上传并解析</div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="creating" @click="handleCreate">创建</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { http } from '@/api/http'
import type { WorkbenchStatus } from '@/api/workbench'

const props = defineProps<{
  lotId: number
  projectId: number
  status: WorkbenchStatus | null
}>()

const router = useRouter()
const createMode = ref<'manual' | 'preset' | 'ai'>('manual')
const createForm = ref({ name: '', templateId: null as number | null, tenderFileId: null as number | null })
const creating = ref(false)
const presetTemplates = ref<Array<{ id: number; name: string }>>([])
const loadingTemplates = ref(false)

const outlines = computed(() => props.status?.steps.outline_generation.outlines ?? [])
const readyFiles = computed(() =>
  (props.status?.steps.tender_file.files ?? []).filter((f) => f.display_status === 'ready')
)

async function loadPresetTemplates() {
  loadingTemplates.value = true
  try {
    const res = await http.get<{ results: Array<{ id: number; name: string }> }>(
      '/api/preset-templates/',
      { params: { page_size: 100 } }
    )
    presetTemplates.value = res.data?.results || []
  } catch {
    presetTemplates.value = []
  } finally {
    loadingTemplates.value = false
  }
}

async function handleCreate() {
  if (!createForm.value.name) {
    ElMessage.warning('请输入大纲名称')
    return
  }
  if (createMode.value === 'preset' && !createForm.value.templateId) {
    ElMessage.warning('请选择预设模板')
    return
  }
  if (createMode.value === 'ai' && !createForm.value.tenderFileId) {
    ElMessage.warning('请选择招标文件')
    return
  }

  creating.value = true
  try {
    if (createMode.value === 'manual') {
      const res = await http.post('/api/outlines/', {
        lot: props.lotId,
        name: createForm.value.name,
      })
      ElMessage.success('大纲创建成功')
      router.push(`/outlines/${res.data.id}`)
    } else if (createMode.value === 'preset') {
      const res = await http.post('/api/outlines/from_preset/', {
        lot_id: props.lotId,
        template_id: createForm.value.templateId,
        name: createForm.value.name,
      })
      ElMessage.success('大纲创建成功')
      router.push(`/outlines/${res.data.id}`)
    } else {
      await http.post('/api/outlines/generate_from_tender/', {
        tender_file_id: createForm.value.tenderFileId,
      })
      ElMessage.success('AI 生成任务已提交，请稍候...')
    }
    createForm.value = { name: '', templateId: null, tenderFileId: null }
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || err.response?.data?.detail || '创建失败')
  } finally {
    creating.value = false
  }
}

function goEdit(outlineId: number) {
  router.push(`/outlines/${outlineId}`)
}

function getOutlineStatusType(status: string): string {
  const map: Record<string, string> = { draft: 'info', active: 'success', archived: 'info' }
  return map[status] || 'info'
}

function getOutlineStatusLabel(status: string): string {
  const map: Record<string, string> = { draft: '草稿', active: '活跃', archived: '已归档' }
  return map[status] || status
}

watch(createMode, (mode) => {
  if (mode === 'preset' && presetTemplates.value.length === 0) {
    loadPresetTemplates()
  }
})
</script>

<style scoped>
.workbench-outline-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.outline-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  margin-bottom: 8px;
}

.outline-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.outline-name {
  font-size: 14px;
}

.create-mode {
  margin-bottom: 12px;
}

.ai-tip {
  font-size: 12px;
  color: var(--el-color-warning);
  margin-top: 4px;
}
</style>
