<template>
  <div class="page-container">
    <!-- 流程步骤条 -->
    <el-card shadow="never" class="mb16">
      <el-steps :active="stepIndex" align-center finish-status="success">
        <el-step title="招标文件" :description="shortFileName" />
        <el-step title="识别响应格式" description="AI 分析附件与填充位置" />
        <el-step title="确认填充位置" description="检查/调整块类型与绑定" />
        <el-step title="生成响应文件" description="原位填充原始模板" />
        <el-step title="下载/校对" description="主文件 + 密封文件" />
      </el-steps>
    </el-card>

    <!-- 状态卡片 -->
    <el-card shadow="never" class="mb16">
      <div class="header-row">
        <div>
          <h3 class="title">{{ template.name }}</h3>
          <div class="meta">
            <el-tag :type="statusType" class="mr8">{{ template.status_display }}</el-tag>
            <el-tag v-if="template.confidence != null" type="success" class="mr8">
              置信度 {{ (template.confidence * 100).toFixed(0) }}%
            </el-tag>
            <span class="gray">来源: {{ template.source_file_name }}</span>
          </div>
        </div>
        <div class="actions">
          <!-- 识别中 -->
          <el-button v-if="template.status === 'analyzing' || template.status === 'pending'" type="info" disabled>
            <el-icon class="is-loading"><Loading /></el-icon>
            识别中, 通常 1~2 分钟...
          </el-button>
          <!-- 待确认 -->
          <el-button
            v-if="template.status === 'analyzed'"
            type="primary"
            :loading="acting"
            @click="confirm"
          >确认模板, 进入生成</el-button>
          <!-- 已确认 -->
          <el-button
            v-if="template.status === 'confirmed'"
            type="success"
            :loading="acting"
            @click="generate"
          >生成响应文件</el-button>
          <!-- 已生成: 修改块内容后可重新生成(用最新数据覆盖产物) -->
          <el-tooltip content="修改报价/类型/份数后点击, 用最新内容重新生成">
            <el-button v-if="template.status === 'generated'" type="success" @click="generate">
              重新生成
            </el-button>
          </el-tooltip>
          <!-- 生成中 -->
          <el-button v-if="template.status === 'generating'" type="info" disabled>
            <el-icon class="is-loading"><Loading /></el-icon>
            生成中...
          </el-button>
          <!-- 失败: 重试 -->
          <el-button v-if="template.status === 'failed'" type="warning" :loading="acting" @click="reAnalyze">
            重新识别
          </el-button>
        </div>
      </div>

      <el-alert
        v-if="template.error_message"
        type="error"
        :title="template.error_message"
        show-icon
        :closable="false"
        class="mt8"
      />
    </el-card>

    <!-- 识别统计 -->
    <el-card v-if="summary" shadow="never" class="mb16">
      <template #header>识别统计</template>
      <el-descriptions :column="4" size="small" border>
        <el-descriptions-item label="附件数">{{ summary.attachments }}</el-descriptions-item>
        <el-descriptions-item label="识别字段">{{ summary.fields }}</el-descriptions-item>
        <el-descriptions-item label="平均置信度">
          {{ summary.avg_confidence != null ? (summary.avg_confidence * 100).toFixed(0) + '%' : '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="单独密封">
          <el-tag v-if="summary.separate_attachments?.length" type="warning" size="small">
            {{ (summary.separate_attachments as string[]).join('、') }}
          </el-tag>
          <span v-else>-</span>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 填充块列表 -->
    <el-card shadow="never" class="mb16">
      <template #header>
        <div class="card-header">
          <span>填充位置({{ template.blocks.length }})</span>
          <div>
            <span class="gray mr8">已填充 {{ filledCount }} / 待复核 {{ reviewCount }}</span>
            <el-button size="small" @click="openSourcePreview">查看招标文件原文</el-button>
          </div>
        </div>
      </template>

      <el-collapse v-model="openedGroups">
        <el-collapse-item v-for="group in groups" :key="group.name" :name="group.name">
          <template #title>
            <div class="group-title">
              <span class="bold">{{ group.name }}</span>
              <el-tag size="small" type="info" class="ml8">{{ group.blocks.length }} 项</el-tag>
            </div>
          </template>

          <el-table :data="group.blocks" size="small" stripe>
            <el-table-column type="expand">
              <template #default="{ row }">
                <div class="expand-panel">
                  <!-- AI_RESPONSE 应答明细 -->
                  <template v-if="row.block_type === 'AI_RESPONSE' && payloadItems(row).length">
                    <el-alert
                      v-if="row.fill_payload?.review_count"
                      type="warning"
                      :closable="false"
                      class="mb8"
                    >
                      含 {{ row.fill_payload.review_count }} 条"待确认"条目, 生成后需人工复核
                    </el-alert>
                    <el-table :data="payloadItems(row)" size="small" border>
                      <el-table-column prop="clause" label="章节号" width="110" />
                      <el-table-column prop="requirement" label="招标要求" min-width="180" show-overflow-tooltip />
                      <el-table-column prop="response" label="响应内容" min-width="200" show-overflow-tooltip />
                      <el-table-column label="状态" width="100">
                        <template #default="{ row: it }">
                          <el-tag :type="it.status === '待确认' ? 'warning' : 'success'" size="small">
                            {{ it.status }}
                          </el-tag>
                        </template>
                      </el-table-column>
                      <el-table-column prop="deviation" label="偏离描述" min-width="120" show-overflow-tooltip />
                    </el-table>
                  </template>
                  <!-- PRICE 报价编辑 -->
                  <div v-else-if="row.block_type === 'PRICE'" class="price-edit">
                    <span class="gray">报价填写(生成时自动填充): </span>
                    <el-input-number
                      v-model="row.priceValue"
                      :min="0"
                      :precision="2"
                      :controls="false"
                      style="width: 160px"
                      placeholder="元/个"
                    />
                    <el-button size="small" type="primary" @click="savePrice(row)">保存</el-button>
                    <span v-if="row.fill_payload?.price != null" class="rt-conf">
                      已保存: {{ row.fill_payload.price }}
                    </span>
                  </div>
                  <!-- REPEAT 复制信息 -->
                  <div v-else-if="row.fill_payload?.copied" class="payload-text">
                    已复制 {{ row.fill_payload.copied }} 份 ({{ row.fill_payload.elements }} 个元素),
                    {{ row.fill_payload.note }}
                  </div>
                  <div v-else-if="row.fill_payload?.cases" class="payload-text">
                    已填充案例: {{ row.fill_payload.filled }} 条
                    <el-tag v-for="c in row.fill_payload.cases" :key="c.project_name" size="small" class="ml8">
                      {{ c.project_name }}
                    </el-tag>
                  </div>
                  <div v-else class="gray">暂无填充明细</div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="block_key" label="编号" width="110" />
            <el-table-column prop="title" label="位置" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">
                <div class="block-title">
                  <span>{{ row.title }}</span>
                  <el-tag
                    v-if="row.is_separate_package"
                    size="small"
                    type="warning"
                    class="ml8"
                  >单独密封</el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="类型" width="140">
              <template #default="{ row }">
                <el-select
                  v-model="row.block_type"
                  size="small"
                  @change="saveBlock(row)"
                >
                  <el-option
                    v-for="t in typeOptions"
                    :key="t.value"
                    :label="t.label"
                    :value="t.value"
                  />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="重复份数" width="100" v-if="hasRepeatBlock">
              <template #default="{ row }">
                <el-input-number
                  v-if="row.block_type === 'REPEAT_TABLE' || row.block_type === 'REPEAT_BLOCK'"
                  v-model="row.repeatCount"
                  :min="1"
                  :max="10"
                  size="small"
                  style="width: 80px"
                  @change="saveBlock(row)"
                />
              </template>
            </el-table-column>
            <el-table-column label="置信度" width="80">
              <template #default="{ row }">
                <span v-if="row.confidence != null">{{ (row.confidence * 100).toFixed(0) }}%</span>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="fillTagType(row.fill_status)" size="small">
                  {{ row.fill_status_display }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="绑定" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="gray">{{ bindingText(row) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-collapse-item>
      </el-collapse>
    </el-card>

    <!-- 生成产物 -->
    <el-card shadow="never">
      <template #header>生成产物</template>
      <el-empty v-if="!template.documents.length" description="尚未生成响应文件" :image-size="60" />
      <el-table v-else :data="template.documents" size="small">
        <el-table-column prop="title" label="文档" min-width="200" />
        <el-table-column label="类型" width="110">
          <template #default="{ row }">{{ row.kind === 'separate' ? '单独密封' : '响应文件' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'done' ? 'success' : row.status === 'failed' ? 'danger' : 'info'" size="small">
              {{ row.status === 'done' ? '已完成' : row.status === 'failed' ? '失败' : '生成中' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="file_size" label="大小" width="100">
          <template #default="{ row }">{{ (row.file_size / 1024).toFixed(1) }} KB</template>
        </el-table-column>
        <el-table-column label="生成时间" width="150">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button v-if="row.url" size="small" type="primary" @click="download(row)">下载</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 招标文件原文预览抽屉(双栏辅助) -->
    <el-drawer v-model="previewVisible" title="招标文件原文(解析结果)" size="55%">
      <el-alert v-if="sourceError" type="error" :title="sourceError" show-icon :closable="false" class="mb8" />
      <pre class="source-pre">{{ sourceMarkdown }}</pre>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import {
  confirmResponseTemplate,
  generateResponseTemplate,
  getResponseTemplate,
  getSourceMarkdown,
  reAnalyzeResponseTemplate,
  updateTemplateBlock,
  type ResponseTemplate,
  type TemplateBlock,
} from '@/api/responseTemplate'

const route = useRoute()
const props = defineProps<{ templateId?: number | string }>()
// 优先使用父组件传入的 prop(CreateView 场景), 否则从路由参数取
const currentId = computed(() => {
  if (props.templateId !== undefined && props.templateId !== null && props.templateId !== '') {
    return Number(props.templateId)
  }
  return Number(route.params.id)
})
const template = ref<ResponseTemplate>({ blocks: [], documents: [] } as unknown as ResponseTemplate)
const openedGroups = ref<string[]>([])
const acting = ref(false)
let timer: number | null = null

const typeOptions = [
  { value: 'FIXED', label: '固定内容' },
  { value: 'AUTO_FIELD', label: '企业自动字段' },
  { value: 'AI_GENERATE', label: 'AI生成内容' },
  { value: 'AI_RESPONSE', label: '条款应答' },
  { value: 'DATA_TABLE', label: '企业数据表' },
  { value: 'REPEAT_TABLE', label: '重复行表格' },
  { value: 'REPEAT_BLOCK', label: '重复块' },
  { value: 'MATERIAL_SLOT', label: '材料插槽' },
  { value: 'MANUAL', label: '人工填写' },
  { value: 'PRICE', label: '报价' },
]

const summary = computed(() => template.value.summary_json as Record<string, any> | undefined)

const shortFileName = computed(() => {
  const name = template.value.source_file_name || ''
  return name.length > 24 ? name.slice(0, 24) + '…' : name
})

/** 步骤条: 0=招标文件 1=识别 2=确认 3=生成 4=下载 */
const stepIndex = computed(() => {
  const s = template.value.status
  if (s === 'generated') return 4
  if (s === 'generating') return 3
  if (s === 'confirmed') return 3
  if (s === 'analyzed') return 2
  if (s === 'failed') return 1
  return 1 // pending/analyzing
})

const statusType = computed(() => {
  const s = template.value.status
  if (s === 'generated') return 'success' as const
  if (s === 'failed') return 'danger' as const
  if (s === 'confirmed') return 'warning' as const
  if (s === 'analyzed') return 'primary' as const
  return 'info' as const
})

const groups = computed(() => {
  const map = new Map<string, TemplateBlock[]>()
  for (const b of template.value.blocks) {
    const key = b.block_key.match(/^(附件\d+)/)?.[1] || '其他'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(b)
  }
  const result = Array.from(map.entries()).map(([name, blocks]) => ({ name, blocks }))
  if (!openedGroups.value.length && result.length) {
    openedGroups.value = result.slice(0, 3).map((g) => g.name)
  }
  return result
})

const filledCount = computed(() => template.value.blocks.filter((b) => b.fill_status === 'filled').length)
const reviewCount = computed(() => template.value.blocks.filter((b) => b.fill_status === 'needs_review').length)

function bindingText(row: TemplateBlock): string {
  const binding = row.binding_config as Record<string, any>
  if (!binding || !Object.keys(binding).length) return '-'
  return Object.entries(binding).map(([k, v]) => `${k}: ${v}`).join(', ')
}

function fillTagType(status: string): 'success' | 'info' | 'warning' | 'danger' {
  if (status === 'filled') return 'success'
  if (status === 'needs_review') return 'warning'
  if (status === 'skipped') return 'info'
  return 'danger'
}

async function load() {
  try {
    const { data } = await getResponseTemplate(currentId.value)
    // 初始化重复份数(从 binding_config 读取)
    for (const b of data.blocks) {
      b.repeatCount = Number((b.binding_config as any)?.repeat_count) || 3
      b.priceValue = (b.fill_payload as any)?.price ?? null
    }
    template.value = data
  } catch (e) {
    ElMessage.error('加载响应模板失败')
  }
}

/** 展开明细: AI_RESPONSE 应答条目 */
function payloadItems(row: TemplateBlock & { fill_payload?: any }): any[] {
  return row.fill_payload?.items || []
}

const hasRepeatBlock = computed(() =>
  template.value.blocks.some(
    (b) => b.block_type === 'REPEAT_TABLE' || b.block_type === 'REPEAT_BLOCK'
  )
)

async function savePrice(row: TemplateBlock & { priceValue?: number | null }) {
  try {
    await updateTemplateBlock(row.id, {
      fill_payload: { ...(row.fill_payload || {}), price: row.priceValue ?? null },
    })
    ElMessage.success(`已保存报价: ${row.block_key}`)
    load()
  } catch (e) {
    ElMessage.error('保存报价失败')
  }
}

async function saveBlock(row: TemplateBlock & { repeatCount?: number }) {
  try {
    const payload: Record<string, unknown> = { block_type: row.block_type }
    if (row.block_type === 'REPEAT_TABLE' || row.block_type === 'REPEAT_BLOCK') {
      payload.binding_config = {
        ...(row.binding_config || {}),
        repeat_count: row.repeatCount || 3,
      }
    }
    await updateTemplateBlock(row.id, payload)
    ElMessage.success(`已更新 ${row.block_key}`)
    load()
  } catch (e) {
    ElMessage.error('更新失败')
  }
}

async function confirm() {
  acting.value = true
  try {
    const { data } = await confirmResponseTemplate(template.value.id)
    template.value = data
    ElMessage.success('模板已确认, 可生成响应文件')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '确认失败')
  } finally {
    acting.value = false
  }
}

async function generate() {
  acting.value = true
  try {
    await generateResponseTemplate(template.value.id)
    ElMessage.success('生成任务已提交')
    template.value.status = 'generating'
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '生成失败')
  } finally {
    acting.value = false
  }
}

async function reAnalyze() {
  acting.value = true
  try {
    await reAnalyzeResponseTemplate(template.value.id)
    ElMessage.success('已重新识别')
    template.value.status = 'pending'
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '重新识别失败')
  } finally {
    acting.value = false
  }
}

// 原文预览
const previewVisible = ref(false)
const sourceMarkdown = ref('')
const sourceError = ref('')

async function openSourcePreview() {
  previewVisible.value = true
  if (sourceMarkdown.value) return
  try {
    const { data } = await getSourceMarkdown(currentId.value)
    sourceMarkdown.value = data.content || '(解析产物为空)'
    sourceError.value = data.error || ''
  } catch (e) {
    sourceError.value = '加载原文失败'
  }
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function download(row: { url: string }) {
  window.open(row.url, '_blank')
}

// 轮询: 识别/生成中每 3s 刷新; 检测到生成完成时提示
let prevStatus = ''
function startPolling() {
  timer = window.setInterval(() => {
    const s = template.value.status
    if (s === 'analyzing' || s === 'generating' || s === 'pending') {
      load()
    }
    // 生成完成(或失败)动态提示
    if ((prevStatus === 'generating' || prevStatus === 'pending' || prevStatus === 'analyzing') && s && s !== prevStatus && s !== 'generating') {
      if (s === 'generated') {
        ElMessage.success('生成完成, 可下载产物')
      } else if (s === 'failed') {
        ElMessage.error('生成失败, 可重试')
      } else if (s === 'analyzed') {
        ElMessage.success('识别完成, 请确认模板')
      }
    }
    prevStatus = s
  }, 3000)
}

onMounted(() => {
  prevStatus = template.value.status
  load()
  startPolling()
})

onUnmounted(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<style scoped>
.mb16 { margin-bottom: 16px; }
.mt8 { margin-top: 8px; }
.mr8 { margin-right: 8px; }
.ml8 { margin-left: 8px; }
.header-row { display: flex; justify-content: space-between; align-items: flex-start; }
.title { margin: 0 0 8px; }
.meta { color: #606266; font-size: 13px; }
.gray { color: #909399; font-size: 12px; }
.bold { font-weight: 600; }
.group-title { display: flex; align-items: center; }
.block-title { display: flex; align-items: center; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.expand-panel { padding: 8px 16px 8px 48px; }
.payload-text { color: #606266; font-size: 13px; line-height: 2; }
.mb8 { margin-bottom: 8px; }
.mr8 { margin-right: 8px; }
.source-pre {
  margin: 0;
  padding: 12px;
  background: #f7f8fa;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: calc(100vh - 140px);
  overflow-y: auto;
}
</style>
