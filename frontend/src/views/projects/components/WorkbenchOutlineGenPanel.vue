<template>
  <WorkbenchPanelShell
    title="大纲生成"
    :desc="outlineSummary"
    :icon="Connection"
    :theme-color="STEP_THEME.outline_generation.color"
    :theme-bg-color="STEP_THEME.outline_generation.bgColor"
  >
    <!-- 生成进度 -->
    <div v-if="generatingTasks.length" class="gen-banner">
      <div class="gen-banner-icon">
        <el-icon class="is-loading" :size="20"><Loading /></el-icon>
      </div>
      <div class="gen-banner-content">
        <div class="gen-banner-title">AI 正在生成大纲</div>
        <div class="gen-banner-step">{{ generatingTasks[0].current_step || '处理中...' }}</div>
      </div>
      <div class="gen-banner-progress">
        <el-progress
          type="circle"
          :percentage="generatingTasks[0].progress"
          :width="56"
          :stroke-width="5"
          color="var(--el-color-success)"
        />
      </div>
    </div>

    <!-- 大纲列表 -->
    <div v-if="visibleOutlines.length" class="outline-section">
      <div class="section-header">
        <span class="section-title">已生成大纲</span>
        <span class="section-count">{{ visibleOutlines.length }} 个</span>
      </div>
      <div class="outline-list">
        <div
          v-for="outline in visibleOutlines"
          :key="outline.id"
          class="outline-item"
          :class="{ 'is-current': outline.is_current }"
        >
          <div class="outline-icon">
            <el-icon :size="20"><Connection /></el-icon>
          </div>
          <div class="outline-info">
            <div class="outline-name">
              <span class="name-text">{{ outline.name }}</span>
              <el-tag v-if="outline.is_current" type="success" size="small" effect="light">当前版本</el-tag>
            </div>
            <div class="outline-meta">
              <el-tag :type="getStatusType(outline.status)" size="small" effect="plain">
                {{ getStatusLabel(outline.status) }}
              </el-tag>
            </div>
          </div>
          <div class="outline-actions">
            <el-button
              v-if="!outline.is_current"
              type="success"
              size="small"
              plain
              :loading="settingId === outline.id"
              @click="handleSetCurrent(outline.id)"
            >设为当前</el-button>
            <el-button type="primary" size="small" plain @click="goEdit(outline.id)">编辑</el-button>
          </div>
        </div>
      </div>
    </div>
    <el-empty v-else-if="!generatingTasks.length" description="暂无大纲" :image-size="80">
      <template #description>
        <p>暂无大纲</p>
        <p class="empty-tip">从下方新建大纲，或选择已解析文件生成</p>
      </template>
    </el-empty>

    <!-- 新建大纲 -->
    <div class="create-card">
      <div class="create-header">
        <span class="create-title">新建大纲</span>
        <el-segmented v-model="createMode" :options="modeOptions" size="small" />
      </div>
      <el-form label-width="90px" class="create-form">
        <el-form-item label="大纲名称">
          <el-input
            v-model="createForm.name"
            :placeholder="createMode === 'ai'
              ? '选填，最终名称将拼接为「{标段名} - AI解析大纲 - {您输入的名称}」'
              : '请输入大纲名称'"
          />
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
        <el-form-item class="create-actions">
          <el-button type="primary" :loading="creating" @click="handleCreate">创建大纲</el-button>
        </el-form-item>
      </el-form>
    </div>
  </WorkbenchPanelShell>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Connection, Loading } from '@element-plus/icons-vue'
import { http } from '@/api/http'
import { extractApiError } from '@/utils/errors'
import type { WorkbenchStatus } from '@/api/workbench'
import WorkbenchPanelShell from './WorkbenchPanelShell.vue'
import { STEP_THEME } from './workbenchTheme'

const props = defineProps<{
  lotId: number
  projectId: number
  status: WorkbenchStatus | null
}>()

const emit = defineEmits<{ uploaded: [] }>()

const router = useRouter()

const createMode = ref<'manual' | 'preset' | 'ai'>('ai')
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
// status=generating 的 outline 是任务正在生成中的草稿锚点，章节尚未写入，
// 始终隐藏避免用户在生成中看到空草稿卡片并误点编辑
const visibleOutlines = computed(() => outlines.value.filter(o => o.status !== 'generating'))
// 仅展示招标文件本体：附件/澄清由合并解析带入，不应作为独立选择项
// 必须真有解析文档（has_parsed_content）才可选——display_status=ready 也包含"已上传待开始解析"
const readyFiles = computed(() =>
  (props.status?.steps.tender_file.files ?? []).filter(
    f => f.file_category === 'tender_file' && f.display_status === 'ready' && f.has_parsed_content,
  ),
)

const outlineSummary = computed(() => {
  const n = visibleOutlines.value.length
  if (generatingTasks.value.length) return `AI 生成中 ${generatingTasks.value[0].progress}%`
  return n ? `${n} 个大纲` : '暂无大纲'
})

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
        name: createForm.value.name,
      })
      ElMessage.success('AI 生成任务已提交，请稍候...')
      // 立即触发一次状态拉取，启动轮询让进度条实时刷新
      emit('uploaded')
    }
    createForm.value = { name: '', templateId: null, tenderFileId: null }
  } catch (err: any) {
    ElMessage.error(extractApiError(err, '创建失败'))
  } finally {
    creating.value = false
  }
}

function goEdit(outlineId: number) {
  router.push(`/outlines/${outlineId}`)
}

const settingId = ref<number | null>(null)
async function handleSetCurrent(outlineId: number) {
  settingId.value = outlineId
  try {
    await http.post(`/api/outlines/${outlineId}/set_current/`)
    ElMessage.success('已设置为当前大纲')
    emit('uploaded')
  } catch (err: any) {
    ElMessage.error(err.response?.data?.detail || err.response?.data?.message || '设置失败')
  } finally {
    settingId.value = null
  }
}

function getStatusType(status: string): string {
  const map: Record<string, string> = { draft: 'info', generating: 'warning', active: 'success', archived: 'info' }
  return map[status] || 'info'
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = { draft: '草稿', generating: '生成中', active: '活跃', archived: '已归档' }
  return map[status] || status
}

watch(createMode, (mode) => {
  if (mode === 'preset' && presetTemplates.value.length === 0) {
    loadPresetTemplates()
  }
})
</script>

<style scoped>
.gen-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: var(--el-color-success-light-9);
  border: 1px solid var(--el-color-success-light-5);
  border-radius: 12px;
}

.gen-banner-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--el-color-success-light-7);
  color: var(--el-color-success);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.gen-banner-content {
  flex: 1;
  min-width: 0;
}

.gen-banner-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.gen-banner-step {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.gen-banner-progress {
  flex-shrink: 0;
}

.outline-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.section-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.outline-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.outline-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  transition: all 0.2s ease;
}

.outline-item:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.outline-item.is-current {
  border-color: var(--el-color-success-light-5);
  background: var(--el-color-success-light-9);
}

.outline-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.outline-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.outline-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.name-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.outline-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.outline-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.empty-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.create-card {
  padding: 16px;
  border: 1px dashed var(--el-border-color);
  border-radius: 12px;
  background: var(--el-fill-color-lighter);
}

.create-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.create-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.create-form {
  margin-top: 0;
}

.create-actions :deep(.el-form-item__content) {
  margin-left: 0 !important;
}

.ai-tip {
  font-size: 12px;
  color: var(--el-color-warning);
  margin-top: 4px;
}
</style>
