<template>
  <div class="panel">
    <div class="panel-topline" style="--step-color: #13C2C2" />

    <div class="panel-header">
      <div class="panel-title">
        <el-icon :size="20" color="#13C2C2"><Connection /></el-icon>
        <span>大纲生成</span>
      </div>
      <div class="panel-desc">{{ outlines.length }} 个大纲</div>
    </div>

    <!-- 生成进度（有进行中任务时） -->
    <div v-if="generatingTasks.length" class="gen-progress">
      <div class="gen-progress-head">
        <el-icon class="is-loading" color="#13C2C2"><Loading /></el-icon>
        <span>AI 正在生成大纲</span>
        <span class="gen-percent">{{ generatingTasks[0].progress }}%</span>
      </div>
      <el-progress
        :percentage="generatingTasks[0].progress"
        :stroke-width="8"
        :show-text="false"
        color="#13C2C2"
      />
    </div>

    <!-- 大纲卡片列表 -->
    <div v-if="outlines.length" class="outline-cards">
      <div
        v-for="outline in outlines"
        :key="outline.id"
        class="outline-card"
        :class="{ 'is-current': outline.is_current }"
      >
        <div class="outline-info">
          <div class="outline-name">
            <span>{{ outline.name }}</span>
            <el-tag v-if="outline.is_current" type="success" size="small" effect="light">当前版本</el-tag>
          </div>
          <el-tag :type="getStatusType(outline.status)" size="small" effect="plain">
            {{ getStatusLabel(outline.status) }}
          </el-tag>
        </div>
        <el-button type="primary" size="small" plain @click="goEdit(outline.id)">编辑</el-button>
      </div>
    </div>
    <el-empty v-else-if="!generatingTasks.length" description="暂无大纲" :image-size="60">
      <template #description>
        <p>暂无大纲</p>
        <p class="empty-tip">从下方新建大纲，或选择已解析文件生成</p>
      </template>
    </el-empty>

    <!-- 新建大纲 -->
    <div class="create-section">
      <div class="section-title">新建大纲</div>
      <el-segmented v-model="createMode" :options="modeOptions" />
      <el-form label-width="90px" class="create-form">
        <el-form-item label="大纲名称">
          <el-input v-model="createForm.name" placeholder="请输入大纲名称" />
        </el-form-item>
        <el-form-item v-if="createMode === 'preset'" label="预设模板">
          <el-select v-model="createForm.templateId" placeholder="请选择" :loading="loadingTemplates" style="width: 100%">
            <el-option v-for="tpl in presetTemplates" :key="tpl.id" :label="tpl.name" :value="tpl.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="createMode === 'ai'" label="招标文件">
          <el-select v-model="createForm.tenderFileId" placeholder="请选择已解析的招标文件" style="width: 100%">
            <el-option v-for="f in readyFiles" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
          <div v-if="!readyFiles.length" class="ai-tip">暂无已解析文件，请先在「招标文件」步骤上传并解析</div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="creating" @click="handleCreate">创建大纲</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Connection, Loading } from '@element-plus/icons-vue'
import { http } from '@/api/http'
import type { WorkbenchStatus } from '@/api/workbench'

const props = defineProps<{
  lotId: number
  projectId: number
  status: WorkbenchStatus | null
}>()

const router = useRouter()

const createMode = ref<'manual' | 'preset' | 'ai'>('manual')
const modeOptions = [
  { label: '手动创建', value: 'manual' },
  { label: '预设模板', value: 'preset' },
  { label: 'AI 解析', value: 'ai' },
]
const createForm = ref({ name: '', templateId: null as number | null, tenderFileId: null as number | null })
const creating = ref(false)
const presetTemplates = ref<Array<{ id: number; name: string }>>([])
const loadingTemplates = ref(false)

const outlines = computed(() => props.status?.steps.outline_generation.outlines ?? [])
const generatingTasks = computed(() => props.status?.steps.outline_generation.tasks ?? [])
const readyFiles = computed(() =>
  (props.status?.steps.tender_file.files ?? []).filter(f => f.display_status === 'ready'),
)

async function loadPresetTemplates() {
  loadingTemplates.value = true
  try {
    const res = await http.get<{ results: Array<{ id: number; name: string }> }>(
      '/api/preset-templates/',
      { params: { page_size: 100 } },
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

function getStatusType(status: string): string {
  const map: Record<string, string> = { draft: 'info', active: 'success', archived: 'info' }
  return map[status] || 'info'
}

function getStatusLabel(status: string): string {
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
.panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-topline {
  height: 2px;
  background: var(--step-color, var(--el-color-primary));
  border-radius: 1px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.panel-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.gen-progress {
  padding: 16px;
  border: 1px solid var(--el-color-warning-light-7);
  border-radius: 8px;
  background: var(--el-color-warning-light-9);
}

.gen-progress-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
}

.gen-percent {
  margin-left: auto;
  color: #13C2C2;
  font-weight: 600;
}

.outline-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.outline-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  transition: box-shadow 0.2s;
}

.outline-card.is-current {
  border-color: var(--el-color-success-light-5);
  background: var(--el-color-success-light-9);
}

.outline-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.outline-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.outline-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.empty-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.create-section {
  padding-top: 8px;
  border-top: 1px dashed var(--el-border-color);
}

.section-title {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 12px;
  color: var(--el-text-color-primary);
}

.create-form {
  margin-top: 12px;
}

.ai-tip {
  font-size: 12px;
  color: var(--el-color-warning);
  margin-top: 4px;
}
</style>
