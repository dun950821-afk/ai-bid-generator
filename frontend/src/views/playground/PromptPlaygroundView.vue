<!-- frontend/src/views/playground/PromptPlaygroundView.vue -->
<script setup lang="ts">
/**
 * Prompt Playground 主视图。
 * 三栏布局：左侧配置 → 中间预览 → 右侧输出。
 */

import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument } from '@element-plus/icons-vue'
import { promptApi, type PromptTemplate, type PromptVersion } from '@/api/prompt'
import { playgroundApi, type PlaygroundRenderResponse, type PlaygroundRunResponse, type RagOptions } from '@/api/prompt-playground'
import { getStatusLabel, getStatusType, isErrorStatus } from '@/utils/status'
import { logError } from '@/utils/logger'
import { copyToClipboard } from '@/utils/clipboard'
import ResizablePane from '@/components/playground/ResizablePane.vue'
import PromptVariableEditor from '@/components/playground/PromptVariableEditor.vue'
import PromptModelSelector from '@/components/playground/PromptModelSelector.vue'
import PromptRagConfigPanel from '@/components/playground/PromptRagConfigPanel.vue'
import PlaygroundInputPanel from '@/components/playground/PlaygroundInputPanel.vue'

// 文档类模板的正文变量（按优先级取第一个命中 schema 的键）
const DOCUMENT_FIELD_PRIORITY = ['document_text', 'chunk_content', 'content']

// schema 可选变量按类型填空值（与后端 _fill_optional_schema_variables 一致）
const EMPTY_BY_TYPE: Record<string, unknown> = {
  string: '',
  number: 0,
  integer: 0,
  boolean: false,
  array: [],
  object: {},
}

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

// 下拉框绑定原始 id（el-select 对象作为 value 时，valueKey 匹配对无 .value 属性的
// 对象恒为 undefined===undefined，显示标签会固定成列表最后一个 option，故绑 id）
const selectedTemplateId = ref<number | null>(null)
const selectedVersionId = ref<number | null>(null)

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

// 调试草稿（仅当前页面生效，不落库）：文档正文 + 可编辑的模板文本
const documentInputText = ref('')
const draftedSystem = ref('')
const draftedUser = ref('')

// 预览
const previewLoading = ref(false)
const preview = ref<PlaygroundRenderResponse | null>(null)

// 运行
const runLoading = ref(false)
const runResult = ref<PlaygroundRunResponse | null>(null)

// 复制为新版本
const copying = ref(false)

// 布局状态
const leftWidth = ref(300)
const rightWidth = ref(350)

// ============================================================================
// Computed
// ============================================================================

const canRun = computed(() => {
  return selectedVersion.value && !runLoading.value
})

// 文档类模板：schema 含 document_text / chunk_content / content 之一
const docFieldKey = computed<string | null>(() => {
  if (!selectedVersion.value?.variable_schema?.properties) return null
  const props = selectedVersion.value.variable_schema.properties as Record<string, unknown>
  return DOCUMENT_FIELD_PRIORITY.find(k => k in props) || null
})

const isDocumentTemplate = computed(() => docFieldKey.value !== null)

// 文档正文由输入面板独占：即使 JSON 模式手改了该键也会被这里覆盖
const renderVars = computed<Record<string, unknown>>(() => {
  const vars = { ...variables.value }
  if (docFieldKey.value) {
    vars[docFieldKey.value] = documentInputText.value
  }
  return vars
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
  const template = templates.value.find(t => t.id === templateId) || null
  selectedTemplate.value = template
  selectedTemplateId.value = template?.id ?? null
  selectedVersion.value = null
  selectedVersionId.value = null
  versions.value = []
  resetDebugState()
  variables.value = {}
  draftedSystem.value = ''
  draftedUser.value = ''
  documentInputText.value = ''

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
  const version = versions.value.find(v => v.id === versionId) || null
  selectedVersion.value = version
  selectedVersionId.value = version?.id ?? null
  resetDebugState()

  // 初始化变量：全部 schema 属性（default ?? 按类型空值），根治必填无 default
  // 字段缺失导致的 jsonschema required 报错
  if (version?.variable_schema?.properties) {
    const props = version.variable_schema.properties as Record<string, Record<string, unknown>>
    const required = new Set((version.variable_schema.required as string[]) || [])
    const initialVars: Record<string, unknown> = {}
    for (const [key, schema] of Object.entries(props)) {
      if (schema.default !== undefined) {
        initialVars[key] = schema.default
      } else if (!required.has(key)) {
        initialVars[key] = EMPTY_BY_TYPE[schema.type as string] ?? ''
      }
    }
    variables.value = initialVars
  }

  // 调试草稿初始化为版本模板内容
  draftedSystem.value = version?.system_prompt || ''
  draftedUser.value = version?.user_prompt || ''
  documentInputText.value = ''
}

function resetDebugState() {
  preview.value = null
  runResult.value = null
}

async function renderPreview() {
  if (!selectedVersion.value) return

  previewLoading.value = true
  try {
    const res = await playgroundApi.render({
      prompt_version_id: selectedVersion.value.id,
      variables: renderVars.value,
      rag_options: ragOptions.value.enabled ? ragOptions.value : undefined,
      // 调试覆盖：用当前编辑的草稿文本渲染（不落库）
      system_prompt: draftedSystem.value,
      user_prompt: draftedUser.value,
    })
    preview.value = res.data
    if (res.data.missing_variables.length) {
      ElMessage.warning(`存在未填写变量: ${res.data.missing_variables.join(', ')}`)
    }
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
      variables: renderVars.value,
      rag_options: ragOptions.value.enabled ? ragOptions.value : undefined,
      // 纯调试默认不落库
      system_prompt: draftedSystem.value,
      user_prompt: draftedUser.value,
      save_run: false,
    })
    runResult.value = res.data
    if (isErrorStatus(res.data.status as any)) {
      ElMessage.warning(`执行完成，但状态为 ${getStatusLabel(res.data.status as any)}`)
    } else {
      ElMessage.success('执行成功（调试运行，未保存记录）')
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.detail || '执行失败')
  } finally {
    runLoading.value = false
  }
}

// 恢复调试草稿为版本原始模板
function resetDrafts() {
  if (!selectedVersion.value) return
  draftedSystem.value = selectedVersion.value.system_prompt || ''
  draftedUser.value = selectedVersion.value.user_prompt || ''
  ElMessage.info('已恢复为版本原始模板')
}

async function copyPrompt(text: string) {
  const ok = await copyToClipboard(text)
  if (ok) ElMessage.success('已复制')
}

// 复制为新版本：创建草稿（不发布），跳转到版本管理页继续编辑
async function copyToNewVersion() {
  if (!selectedTemplate.value || !selectedVersion.value) return
  try {
    const { value } = await ElMessageBox.prompt(
      '将当前调试好的内容复制为新版本草稿（不会直接发布），跳转到版本管理页后请手动保存并发布。',
      '复制为新版本',
      {
        confirmButtonText: '复制为新版本',
        cancelButtonText: '取消',
        inputPlaceholder: '版本说明（可选）',
        inputValidator: () => true,
      },
    )
    copying.value = true
    const res = await promptApi.copyDraftVersion(
      selectedTemplate.value.id,
      selectedVersion.value.id,
      {
        system_prompt: draftedSystem.value,
        user_prompt: draftedUser.value,
        changelog: value || undefined,
      },
    )
    ElMessage.success(`已创建草稿版本 ${res.data.version}，正在跳转…`)
    router.push(`/admin/prompts/${selectedTemplate.value.id}`)
  } catch (e: any) {
    // 用户取消弹窗
    if (!e || e === 'cancel' || e?.action === 'cancel') return
    ElMessage.error(e.response?.data?.detail || '复制失败')
  } finally {
    copying.value = false
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
      selectedTemplateId.value = template.id
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
          selectedTemplateId.value = t.id
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
          v-model="selectedTemplateId"
          placeholder="选择模板"
          style="width: 200px"
          @change="onTemplateChange"
        >
          <el-option
            v-for="t in templates"
            :key="t.id"
            :label="t.name"
            :value="t.id"
          />
        </el-select>

        <el-select
          v-model="selectedVersionId"
          placeholder="选择版本"
          style="width: 150px"
          :disabled="!selectedTemplate"
          @change="onVersionChange"
        >
          <el-option
            v-for="v in versions"
            :key="v.id"
            :label="v.version"
            :value="v.id"
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
        <el-button
          type="success"
          :disabled="!selectedVersion"
          :loading="copying"
          @click="copyToNewVersion"
        >
          复制为新版本
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
          <el-alert
            v-if="isDocumentTemplate"
            type="info"
            :closable="false"
            class="doc-tip"
            title="文档类模板"
            description="先在下方输入招标文档内容，正文会绑定到模板的 {{ docFieldKey }} 变量"
          />

          <PlaygroundInputPanel
            v-if="isDocumentTemplate"
            v-model="documentInputText"
          />

          <el-collapse class="advanced-collapse">
            <el-collapse-item
              v-if="selectedVersion?.variable_schema"
              title="高级变量"
              name="variables"
            >
              <PromptVariableEditor
                v-model="variables"
                :variable-schema="selectedVersion.variable_schema"
                :hidden-keys="docFieldKey ? [docFieldKey] : undefined"
              />
            </el-collapse-item>
            <el-collapse-item title="模型选择" name="model">
              <PromptModelSelector v-model="modelConfigId" />
            </el-collapse-item>
            <el-collapse-item title="知识库检索 (RAG)" name="rag">
              <PromptRagConfigPanel v-model="ragOptions" />
            </el-collapse-item>
          </el-collapse>
        </div>
      </ResizablePane>

      <!-- 中栏：调试草稿（改动仅当前页面生效，不落库） -->
      <div class="preview-panel">
        <div class="preview-header">
          <h4>提示词调试</h4>
          <div class="preview-actions">
            <el-button size="small" text :disabled="!selectedVersion" @click="resetDrafts">
              恢复原版
            </el-button>
          </div>
        </div>

        <el-alert
          v-if="selectedVersion"
          type="warning"
          :closable="false"
          class="debug-hint"
          title="调试模式：修改仅当前页面生效，不写入数据库"
          description="调试完成后点击「复制为新版本」保存为草稿，再到版本管理页发布"
        />

        <template v-if="selectedVersion">
          <div class="draft-section">
            <div class="section-header">
              <span>System Prompt</span>
              <el-button size="small" text @click="copyPrompt(draftedSystem)">
                <el-icon><CopyDocument /></el-icon>
              </el-button>
            </div>
            <el-input
              v-model="draftedSystem"
              type="textarea"
              :rows="6"
              resize="vertical"
              placeholder="系统提示词（可编辑，仅当前调试生效）"
            />
          </div>

          <div class="draft-section">
            <div class="section-header">
              <span>User Prompt</span>
              <el-button size="small" text @click="copyPrompt(draftedUser)">
                <el-icon><CopyDocument /></el-icon>
              </el-button>
            </div>
            <el-input
              v-model="draftedUser"
              type="textarea"
              :rows="12"
              resize="vertical"
              placeholder="用户提示词（可编辑，仅当前调试生效）"
            />
          </div>

          <div v-if="previewLoading" class="preview-meta">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>渲染中...</span>
          </div>
          <template v-else-if="preview">
            <div class="preview-meta">
              <span>~{{ preview.token_estimate }} tokens</span>
            </div>
            <el-alert
              v-if="preview.missing_variables.length"
              type="warning"
              :closable="false"
              class="missing-alert"
            >
              缺失变量: {{ preview.missing_variables.join(', ') }}
            </el-alert>
          </template>
          <div v-else class="empty-state small">
            点击「预览」查看渲染结果与 token 估算
          </div>
        </template>

        <div v-else class="empty-state">
          选择模板和版本后开始调试
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
            <el-tag v-if="runResult && !runResult.run_id" type="info" size="small">未保存</el-tag>
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
.output-panel h4,
.preview-panel h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.doc-tip {
  margin-bottom: 12px;
}

.advanced-collapse {
  margin-top: 12px;
  background: var(--el-bg-color);
  border-radius: 6px;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.debug-hint {
  margin-bottom: 12px;
}

.draft-section {
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.preview-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.missing-alert {
  margin-bottom: 8px;
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

.empty-state.small {
  height: auto;
  padding: 16px 0;
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