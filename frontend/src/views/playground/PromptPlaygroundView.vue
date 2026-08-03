<!-- frontend/src/views/playground/PromptPlaygroundView.vue -->
<script setup lang="ts">
/**
 * Prompt Playground 主视图。
 * 三栏布局：左侧配置 → 中间预览 → 右侧输出。
 */

import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { promptApi, type PromptTemplate, type PromptVersion } from '@/api/prompt'
import { playgroundApi, type PlaygroundRenderResponse, type PlaygroundRunResponse, type RagOptions } from '@/api/prompt-playground'
import { getStatusLabel, getStatusType, isErrorStatus } from '@/utils/status'
import { logError } from '@/utils/logger'
import ResizablePane from '@/components/playground/ResizablePane.vue'
import PromptVariableEditor from '@/components/playground/PromptVariableEditor.vue'
import PromptModelSelector from '@/components/playground/PromptModelSelector.vue'
import PromptRagConfigPanel from '@/components/playground/PromptRagConfigPanel.vue'
import PromptPreviewPanel from '@/components/playground/PromptPreviewPanel.vue'

const route = useRoute()
const router = useRouter()

// ============================================================================
// State
// ============================================================================

// 模板和版本
const templates = ref<PromptTemplate[]>([])
const selectedTemplate = ref<PromptTemplate | null>(null)
const versions = ref<PromptVersion[]>([])
const selectedVersion = ref<PromptVersion | null>(null)

// 配置
const variables = ref<Record<string, unknown>>({})
const modelConfigId = ref<number | null>(null)
const ragOptions = ref<RagOptions>({
  enabled: false,
  knowledge_base_ids: [],
  query: '',
  top_k: 5,
  max_context_tokens: 4000,
})

// 预览
const previewLoading = ref(false)
const preview = ref<PlaygroundRenderResponse | null>(null)

// 运行
const runLoading = ref(false)
const runResult = ref<PlaygroundRunResponse | null>(null)

// 布局状态
const leftWidth = ref(300)
const rightWidth = ref(350)

// ============================================================================
// Computed
// ============================================================================

const canRun = computed(() => {
  return selectedVersion.value && !runLoading.value
})

const statusLabel = computed(() => {
  if (!runResult.value) return ''
  return getStatusLabel(runResult.value.status)
})

const statusType = computed(() => {
  if (!runResult.value) return ''
  return getStatusType(runResult.value.status)
})

// ============================================================================
// Methods
// ============================================================================

async function loadTemplates() {
  try {
    // Playground 需要全量模板（模板选择 + version_id 跳转匹配），不走分页
    const res = await promptApi.listTemplates({ page_size: 100 })
    templates.value = res.data.results || res.data as unknown as PromptTemplate[]
  } catch (e) {
    logError('加载模板失败', e)
  }
}

async function onTemplateChange(templateId: number) {
  selectedTemplate.value = templates.value.find(t => t.id === templateId) || null
  selectedVersion.value = null
  preview.value = null
  runResult.value = null

  if (selectedTemplate.value) {
    try {
      const res = await promptApi.listVersions(templateId)
      versions.value = res.data
    } catch (e) {
      logError('加载版本失败', e)
    }
  }
}

async function onVersionChange(versionId: number) {
  selectedVersion.value = versions.value.find(v => v.id === versionId) || null
  preview.value = null
  runResult.value = null

  // 初始化变量
  if (selectedVersion.value?.variable_schema?.properties) {
    const props = selectedVersion.value.variable_schema.properties as Record<string, { default?: unknown }>
    const initialVars: Record<string, unknown> = {}
    for (const [key, schema] of Object.entries(props)) {
      if (schema.default !== undefined) {
        initialVars[key] = schema.default
      }
    }
    variables.value = initialVars
  }
}

async function renderPreview() {
  if (!selectedVersion.value) return

  previewLoading.value = true
  try {
    const res = await playgroundApi.render({
      prompt_version_id: selectedVersion.value.id,
      variables: variables.value,
      rag_options: ragOptions.value.enabled ? ragOptions.value : undefined,
    })
    preview.value = res.data
  } catch (e: any) {
    ElMessage.error(e.response?.data?.detail || '渲染失败')
  } finally {
    previewLoading.value = false
  }
}

async function runPrompt() {
  if (!selectedVersion.value) return

  runLoading.value = true
  try {
    const res = await playgroundApi.run({
      prompt_version_id: selectedVersion.value.id,
      model_config_id: modelConfigId.value || undefined,
      variables: variables.value,
      rag_options: ragOptions.value.enabled ? ragOptions.value : undefined,
    })
    runResult.value = res.data
    if (isErrorStatus(res.data.status as any)) {
      ElMessage.warning(`执行完成，但状态为 ${getStatusLabel(res.data.status as any)}`)
    } else {
      ElMessage.success('执行成功')
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.detail || '执行失败')
  } finally {
    runLoading.value = false
  }
}

function goToHistory() {
  router.push('/playground/runs')
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(async () => {
  // 恢复布局状态
  const savedLeft = localStorage.getItem('playground-left-width')
  const savedRight = localStorage.getItem('playground-right-width')
  if (savedLeft) leftWidth.value = parseInt(savedLeft, 10)
  if (savedRight) rightWidth.value = parseInt(savedRight, 10)

  await loadTemplates()

  // 从 query 参数加载模板
  const templateId = route.query.template_id
  if (templateId) {
    const id = parseInt(templateId as string, 10)
    const template = templates.value.find(t => t.id === id)
    if (template) {
      selectedTemplate.value = template
      await onTemplateChange(id)
    }
  }

  // 从 query 参数加载版本
  const versionId = route.query.version_id
  if (versionId) {
    const id = parseInt(versionId as string, 10)
    // 查找对应的模板（onVersionChange 内部会按 id 重新 find 并初始化变量）
    for (const t of templates.value) {
      try {
        const res = await promptApi.listVersions(t.id)
        if (res.data.some((v: PromptVersion) => v.id === id)) {
          selectedTemplate.value = t
          versions.value = res.data
          await onVersionChange(id)
          break
        }
      } catch {
        // 继续查找下一个模板
      }
    }
  }
})

// 保存布局状态
watch(leftWidth, (v) => localStorage.setItem('playground-left-width', String(v)))
watch(rightWidth, (v) => localStorage.setItem('playground-right-width', String(v)))
</script>

<template>
  <div class="playground-view">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-select
          v-model="selectedTemplate"
          placeholder="选择模板"
          style="width: 200px"
          @change="onTemplateChange(($event as any)?.id)"
        >
          <el-option
            v-for="t in templates"
            :key="t.id"
            :label="t.name"
            :value="t"
          />
        </el-select>

        <el-select
          v-model="selectedVersion"
          placeholder="选择版本"
          style="width: 150px"
          :disabled="!selectedTemplate"
          @change="onVersionChange(($event as any)?.id)"
        >
          <el-option
            v-for="v in versions"
            :key="v.id"
            :label="v.version"
            :value="v"
          />
        </el-select>
      </div>

      <div class="toolbar-right">
        <el-button @click="renderPreview" :loading="previewLoading" :disabled="!selectedVersion">
          预览
        </el-button>
        <el-button type="primary" @click="runPrompt" :loading="runLoading" :disabled="!canRun">
          运行
        </el-button>
        <el-button @click="goToHistory">
          历史记录
        </el-button>
      </div>
    </div>

    <!-- 三栏布局 -->
    <div class="main-content">
      <!-- 左栏：配置 -->
      <ResizablePane
        :initial-width="leftWidth + 'px'"
        min-width="250px"
        max-width="400px"
        side="right"
        @resize="leftWidth = $event"
      >
        <div class="config-panel">
          <PromptVariableEditor
            v-model="variables"
            :variable-schema="selectedVersion?.variable_schema"
          />

          <PromptModelSelector v-model="modelConfigId" />

          <PromptRagConfigPanel v-model="ragOptions" />
        </div>
      </ResizablePane>

      <!-- 中栏：预览 -->
      <div class="preview-panel">
        <h4>提示词预览</h4>
        <div v-if="previewLoading" class="loading-state">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>渲染中...</span>
        </div>
        <PromptPreviewPanel
          v-else-if="preview"
          :system-prompt="preview.system_prompt"
          :user-prompt="preview.user_prompt"
          :missing-variables="preview.missing_variables"
          :token-estimate="preview.token_estimate"
        />
        <div v-else class="empty-state">
          选择模板和版本后点击「预览」
        </div>
      </div>

      <!-- 右栏：输出 -->
      <ResizablePane
        :initial-width="rightWidth + 'px'"
        min-width="300px"
        max-width="500px"
        side="left"
        @resize="rightWidth = $event"
      >
        <div class="output-panel">
          <h4>
            输出结果
            <el-tag v-if="runResult" :type="statusType" size="small">{{ statusLabel }}</el-tag>
          </h4>

          <div v-if="runLoading" class="loading-state">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>执行中...</span>
          </div>

          <template v-else-if="runResult">
            <!-- Token 使用 -->
            <div class="usage-info">
              <span>Prompt: {{ runResult.usage.prompt_tokens }}</span>
              <span>Completion: {{ runResult.usage.completion_tokens }}</span>
              <span>总计: {{ runResult.usage.total_tokens }}</span>
              <span>耗时: {{ runResult.usage.latency_ms }}ms</span>
            </div>

            <!-- 输出内容 -->
            <div class="output-content">
              <pre>{{ runResult.output.raw_text }}</pre>
            </div>

            <!-- Schema 校验 -->
            <div v-if="!runResult.output.schema_valid" class="schema-errors">
              <el-alert type="error" :closable="false">
                <template #title>Schema 校验失败</template>
                <ul>
                  <li v-for="(err, i) in runResult.output.schema_errors" :key="i">{{ err }}</li>
                </ul>
              </el-alert>
            </div>

            <!-- 错误信息 -->
            <div v-if="runResult.error_message" class="error-info">
              <el-alert type="error" :closable="false">
                {{ runResult.error_message }}
              </el-alert>
            </div>
          </template>

          <div v-else class="empty-state">
            点击「运行」执行提示词
          </div>
        </div>
      </ResizablePane>
    </div>
  </div>
</template>

<script lang="ts">
import { Loading } from '@element-plus/icons-vue'
export default {
  components: { Loading },
}
</script>

<style scoped>
.playground-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--el-bg-color-page);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
}

.toolbar-left,
.toolbar-right {
  display: flex;
  gap: 12px;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.config-panel,
.preview-panel,
.output-panel {
  padding: 16px;
  overflow: auto;
}

.preview-panel {
  flex: 1;
  background: var(--el-bg-color-page);
}

.config-panel h4,
.output-panel h4 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.preview-content {
  background: var(--el-bg-color);
  border-radius: 8px;
  padding: 16px;
}

.prompt-section {
  margin-bottom: 16px;
}

.section-header {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.prompt-text {
  margin: 0;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}

.token-info {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: right;
}

.usage-info {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
}

.output-content {
  background: var(--el-fill-color-light);
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
}

.output-content pre {
  margin: 0;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--el-text-color-secondary);
  gap: 8px;
}

.schema-errors {
  margin-top: 12px;
}

.schema-errors ul {
  margin: 0;
  padding-left: 16px;
}

.error-info {
  margin-top: 12px;
}
</style>