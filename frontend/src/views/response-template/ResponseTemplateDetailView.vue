<template>
  <div class="page-container">
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
          <el-button
            v-if="template.status === 'analyzed' || template.status === 'failed'"
            type="primary"
            :loading="acting"
            @click="confirm"
          >确认模板</el-button>
          <el-button
            v-if="template.status === 'confirmed'"
            type="success"
            :loading="acting"
            @click="generate"
          >生成响应文件</el-button>
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
          <span class="gray">已填充 {{ filledCount }} / 待复核 {{ reviewCount }}</span>
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
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button v-if="row.url" size="small" type="primary" @click="download(row)">下载</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  confirmResponseTemplate,
  generateResponseTemplate,
  getResponseTemplate,
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

function download(row: { url: string }) {
  window.open(row.url, '_blank')
}

function startPolling() {
  timer = window.setInterval(() => {
    const s = template.value.status
    if (s === 'analyzing' || s === 'generating' || s === 'pending') {
      load()
    }
  }, 3000)
}

onMounted(() => {
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
</style>
