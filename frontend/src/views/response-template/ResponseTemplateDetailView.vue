<template>
  <div class="rt-workbench">
    <!-- 首次加载: 与真实布局一致的骨架屏 -->
    <div v-if="initialLoading" class="rt-skeleton">
      <el-skeleton animated>
        <template #template>
          <el-skeleton-item variant="rect" class="sk-rt-header" />
          <div class="sk-rt-body">
            <el-skeleton-item variant="rect" class="sk-rt-left" />
            <el-skeleton-item variant="rect" class="sk-rt-right" />
          </div>
        </template>
      </el-skeleton>
    </div>

    <template v-else>
    <!-- 头部: 标题/状态/主操作 -->
    <div class="rt-header">
      <div class="rt-header-top">
        <el-button text class="rt-back" @click="goBack">
          <el-icon><ArrowLeft /></el-icon>返回
        </el-button>
        <h2 class="rt-title" :title="template.name">{{ template.name || '响应模板' }}</h2>
        <el-tag :type="statusType" effect="dark" size="small">{{ template.status_display }}</el-tag>
        <el-tag v-if="template.confidence != null" type="success" effect="plain" size="small">
          置信度 {{ (template.confidence * 100).toFixed(0) }}%
        </el-tag>
        <span v-if="summary" class="rt-summary-text">
          附件 {{ summary.attachments }} · 字段 {{ summary.fields }}
          <template v-if="summary.separate_attachments?.length">
            · <span class="rt-sep">单独密封 {{ (summary.separate_attachments as string[]).join('、') }}</span>
          </template>
        </span>
        <span class="rt-spacer" />
        <!-- 主操作: 按状态只显示一个主按钮 -->
        <el-button
          v-if="template.status === 'analyzed'"
          type="primary"
          :loading="acting"
          @click="confirmWithPrecheck"
        >确认模板</el-button>
        <el-button
          v-else-if="template.status === 'confirmed'"
          type="success"
          :loading="acting"
          @click="generateWithPrecheck"
        >生成响应文件</el-button>
        <el-button
          v-else-if="template.status === 'generated'"
          type="success"
          :loading="acting"
          @click="generateWithPrecheck"
        >重新生成</el-button>
        <el-button v-else-if="template.status === 'failed'" type="warning" :loading="acting" @click="reAnalyze">
          重新识别
        </el-button>
        <el-button
          v-else-if="isBusy"
          type="info"
          disabled
        >
          <el-icon class="is-loading"><Loading /></el-icon>
          {{ template.status === 'generating' ? '生成中...' : '识别中, 通常 1~2 分钟...' }}
        </el-button>
        <el-dropdown v-if="canReAnalyze" class="rt-more" @command="onMoreCommand">
          <el-button text><el-icon><MoreFilled /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="re-analyze">重新识别(清空当前块)</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <el-steps :active="stepIndex" simple finish-status="success" class="rt-steps">
        <el-step title="招标文件" />
        <el-step title="识别响应格式" />
        <el-step title="确认填充位置" />
        <el-step title="生成响应文件" />
        <el-step title="下载/校对" />
      </el-steps>
    </div>

    <el-alert
      v-if="template.error_message"
      type="error"
      :title="template.error_message"
      show-icon
      :closable="false"
      class="rt-error"
    />

    <!-- 识别中占位 -->
    <div v-if="isAnalyzing" class="rt-analyzing">
      <el-icon class="is-loading rt-analyzing-icon"><Loading /></el-icon>
      <p>AI 正在识别附件与填充位置, 通常需要 1~2 分钟, 页面会自动刷新</p>
    </div>

    <!-- 主体: 左块列表 + 右上下文 -->
    <div v-else class="rt-main">
      <div class="rt-left">
        <div class="rt-toolbar">
          <el-radio-group v-model="statusFilter" size="small">
            <el-radio-button value="all">全部 {{ counts.all }}</el-radio-button>
            <el-radio-button value="needs_review">待复核 {{ counts.needs_review }}</el-radio-button>
            <el-radio-button value="empty">待填充 {{ counts.empty }}</el-radio-button>
            <el-radio-button value="filled">已填充 {{ counts.filled }}</el-radio-button>
          </el-radio-group>
          <el-input
            v-model="search"
            size="small"
            placeholder="搜索标题 / 编号"
            clearable
            class="rt-search"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </div>

        <div class="rt-block-list">
          <el-empty v-if="!filteredGroups.length" description="无匹配的填充位置" :image-size="60" />
          <div v-for="group in filteredGroups" :key="group.name" class="rt-group">
            <div class="rt-group-title" @click="toggleGroup(group.name)">
              <el-icon class="rt-caret" :class="{ collapsed: !expandedGroups.has(group.name) }">
                <ArrowDown />
              </el-icon>
              <span class="rt-group-name">{{ group.name }}</span>
              <span class="rt-group-sub">{{ group.title }}</span>
              <el-tag size="small" effect="plain">{{ group.blocks.length }} 项</el-tag>
              <el-tag v-if="group.reviewCount" size="small" type="warning" effect="plain">
                待复核 {{ group.reviewCount }}
              </el-tag>
            </div>

            <div v-show="expandedGroups.has(group.name)">
              <div
                v-for="block in group.normalBlocks"
                :key="block.id"
                class="rt-block-row"
                :class="{ selected: selectedBlock?.id === block.id }"
                @click="selectBlock(block)"
              >
                <span class="rt-block-key">{{ block.block_key }}</span>
                <span class="rt-block-title" :title="block.title">{{ block.title }}</span>
                <el-tag :type="typeTagType(block.block_type)" size="small" effect="plain" class="rt-tag">
                  {{ block.type_display }}
                </el-tag>
                <el-tag :type="fillTagType(block.fill_status)" size="small" class="rt-tag">
                  {{ block.fill_status_display }}
                </el-tag>
                <span class="rt-block-actions" @click.stop>
                  <!-- PRICE 行内填报价 -->
                  <template v-if="block.block_type === 'PRICE'">
                    <el-input-number
                      v-model="block.priceValue"
                      :min="0"
                      :precision="2"
                      :controls="false"
                      size="small"
                      placeholder="元"
                      class="rt-price-input"
                    />
                    <el-button size="small" type="primary" link @click="savePrice(block)">保存</el-button>
                  </template>
                  <!-- REPEAT 行内份数 -->
                  <template v-else-if="block.block_type === 'REPEAT_TABLE' || block.block_type === 'REPEAT_BLOCK'">
                    <span class="rt-mini-label">份数</span>
                    <el-input-number
                      v-model="block.repeatCount"
                      :min="1"
                      :max="10"
                      size="small"
                      class="rt-repeat-input"
                      @change="saveBlock(block)"
                    />
                  </template>
                  <el-button size="small" link type="primary" @click="locateSource(block)">原文</el-button>
                </span>
              </div>

              <!-- 签字盖章折叠行 -->
              <div v-if="group.signatureBlocks.length" class="rt-sig-block">
                <div class="rt-sig-row" @click="toggleSig(group.name)">
                  <el-icon class="rt-caret" :class="{ collapsed: !expandedSigs.has(group.name) }">
                    <ArrowDown />
                  </el-icon>
                  <el-icon class="rt-sig-icon"><EditPen /></el-icon>
                  <span>签字 / 盖章 {{ group.signatureBlocks.length }} 处</span>
                  <span class="rt-sig-hint">无需系统处理, 打印后人工完成</span>
                </div>
                <div v-show="expandedSigs.has(group.name)" class="rt-sig-list">
                  <div v-for="b in group.signatureBlocks" :key="b.id" class="rt-sig-item">
                    {{ b.block_key }} · {{ b.title }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="rt-right">
        <el-tabs v-model="rightTab" class="rt-tabs">
          <el-tab-pane label="原文对照" name="source">
            <div class="rt-source-panel">
              <div v-if="sourceLoading" class="rt-source-loading">
                <el-icon class="is-loading"><Loading /></el-icon> 正在加载原文...
              </div>
              <template v-else>
                <!-- 优先: 原始 docx 按原格式渲染(表格/字体/版式保真) -->
                <template v-if="sourceDocxData">
                  <div class="rt-zoom-bar">
                    <el-button-group size="small">
                      <el-button :disabled="sourceZoom <= 40" @click="sourceZoom = Math.max(40, sourceZoom - 10)">
                        <el-icon><Minus /></el-icon>
                      </el-button>
                      <el-button class="rt-zoom-value">{{ sourceZoom }}%</el-button>
                      <el-button :disabled="sourceZoom >= 150" @click="sourceZoom = Math.min(150, sourceZoom + 10)">
                        <el-icon><Plus /></el-icon>
                      </el-button>
                    </el-button-group>
                    <el-button size="small" text @click="sourceZoom = 80">重置</el-button>
                  </div>
                  <div ref="sourceDocxRef" class="rt-source-docx" :style="{ zoom: sourceZoom / 100 }">
                    <VueOfficeDocx
                      :src="sourceDocxData"
                      @rendered="onDocxRendered"
                      @error="onDocxError"
                    />
                  </div>
                </template>
                <!-- 降级: 解析 markdown 按附件分节 -->
                <template v-else>
                  <el-alert v-if="sourceError" type="error" :title="sourceError" show-icon :closable="false" />
                  <el-empty v-else-if="!sourceSections.length" description="暂无原文" :image-size="60" />
                  <div v-else class="rt-source-content">
                    <div
                      v-for="sec in sourceSections"
                      :key="sec.no"
                      :id="`rt-src-${sec.no}`"
                      class="rt-source-section"
                    >
                      <div class="rt-source-heading">附件{{ sec.no }}：{{ sec.title }}</div>
                      <pre class="rt-source-pre">{{ sec.content }}</pre>
                    </div>
                  </div>
                </template>
              </template>
            </div>
          </el-tab-pane>

          <el-tab-pane label="块详情" name="block">
            <div v-if="selectedBlock" class="rt-detail-panel">
              <div class="rt-detail-head">
                <span class="rt-block-key">{{ selectedBlock.block_key }}</span>
                <span class="rt-detail-title">{{ selectedBlock.title }}</span>
              </div>
              <el-descriptions :column="1" size="small" border class="rt-detail-desc">
                <el-descriptions-item label="类型">
                  <el-select
                    v-model="selectedBlock.block_type"
                    size="small"
                    @change="saveBlock(selectedBlock)"
                  >
                    <el-option v-for="t in typeOptions" :key="t.value" :label="t.label" :value="t.value" />
                  </el-select>
                </el-descriptions-item>
                <el-descriptions-item label="填充状态">
                  <el-tag :type="fillTagType(selectedBlock.fill_status)" size="small">
                    {{ selectedBlock.fill_status_display }}
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="置信度">
                  {{ selectedBlock.confidence != null ? (selectedBlock.confidence * 100).toFixed(0) + '%' : '-' }}
                </el-descriptions-item>
                <el-descriptions-item label="绑定数据">{{ bindingText(selectedBlock) }}</el-descriptions-item>
                <el-descriptions-item label="AI 识别依据">{{ aiNote(selectedBlock) }}</el-descriptions-item>
                <el-descriptions-item v-if="selectedBlock.is_separate_package" label="密封要求">
                  <el-tag type="warning" size="small">单独密封 / 装订</el-tag>
                </el-descriptions-item>
              </el-descriptions>

              <!-- AI 生成内容快照(填充失败时可复制人工粘贴) -->
              <div v-if="generatedText(selectedBlock)" class="rt-generated">
                <div class="rt-detail-sub">
                  AI 生成内容
                  <el-button size="small" link type="primary" @click="copyText(generatedText(selectedBlock))">复制</el-button>
                </div>
                <pre class="rt-generated-pre">{{ generatedText(selectedBlock) }}</pre>
              </div>

              <!-- AI_RESPONSE 应答明细 -->
              <div v-if="payloadItems(selectedBlock).length" class="rt-response-items">
                <el-alert
                  v-if="(selectedBlock.fill_payload as any)?.review_count"
                  type="warning"
                  :closable="false"
                  class="rt-mb8"
                >
                  含 {{ (selectedBlock.fill_payload as any).review_count }} 条"待确认"条目, 需人工复核
                </el-alert>
                <el-table :data="payloadItems(selectedBlock)" size="small" border max-height="320">
                  <el-table-column prop="clause" label="章节" width="80" />
                  <el-table-column prop="requirement" label="招标要求" min-width="140" show-overflow-tooltip />
                  <el-table-column prop="response" label="响应内容" min-width="160" show-overflow-tooltip />
                  <el-table-column label="状态" width="90">
                    <template #default="{ row }">
                      <el-tag :type="row.status === '待确认' ? 'warning' : 'success'" size="small">
                        {{ row.status }}
                      </el-tag>
                    </template>
                  </el-table-column>
                </el-table>
              </div>

              <!-- 案例填充明细 -->
              <div v-if="(selectedBlock.fill_payload as any)?.cases" class="rt-detail-sub">
                已填充案例:
                <el-tag
                  v-for="c in (selectedBlock.fill_payload as any).cases"
                  :key="c.project_name"
                  size="small"
                  class="rt-ml8"
                >{{ c.project_name }}</el-tag>
              </div>
            </div>
            <el-empty v-else description="点击左侧块查看详情" :image-size="60" />
          </el-tab-pane>

          <el-tab-pane name="output">
            <template #label>
              产物与待办
              <el-badge v-if="todoItems.length" :value="todoItems.length" type="warning" class="rt-badge" />
            </template>
            <div class="rt-output-panel">
              <!-- 待办 -->
              <template v-if="template.status === 'generated' || todoItems.length">
                <div class="rt-panel-sub">待办事项</div>
                <div v-if="!todoItems.length && !signatureCount" class="rt-all-done">
                  <el-icon><CircleCheckFilled /></el-icon> 全部完成, 可交付
                </div>
                <div v-else>
                  <div
                    v-for="(item, i) in todoItems"
                    :key="i"
                    class="rt-todo-row"
                    @click="gotoTodo(item)"
                  >
                    <el-icon :color="todoColor(item.kind)"><WarningFilled /></el-icon>
                    <span class="rt-todo-label">{{ item.label }}</span>
                    <el-icon class="rt-todo-go"><ArrowRight /></el-icon>
                  </div>
                  <div v-if="signatureCount" class="rt-todo-row rt-todo-info">
                    <el-icon color="#909399"><EditPen /></el-icon>
                    <span class="rt-todo-label">签字盖章 {{ signatureCount }} 处(打印后人工完成)</span>
                  </div>
                </div>
              </template>

              <!-- 产物 -->
              <div class="rt-panel-sub">生成产物</div>
              <el-empty v-if="!template.documents.length" description="尚未生成响应文件" :image-size="60" />
              <div v-else class="rt-doc-cards">
                <div v-for="doc in template.documents" :key="doc.id" class="rt-doc-card">
                  <div class="rt-doc-icon">
                    <el-icon :size="26" color="#2563eb"><Document /></el-icon>
                  </div>
                  <div class="rt-doc-info">
                    <div class="rt-doc-title">{{ doc.kind === 'separate' ? '单独密封文件' : '响应文件(主文件)' }}</div>
                    <div class="rt-doc-meta">
                      {{ (doc.file_size / 1024).toFixed(0) }} KB · {{ formatDateTime(doc.created_at) }}
                      <el-tag
                        :type="doc.status === 'done' ? 'success' : doc.status === 'failed' ? 'danger' : 'info'"
                        size="small"
                        class="rt-ml8"
                      >{{ doc.status === 'done' ? '已完成' : doc.status === 'failed' ? '失败' : '生成中' }}</el-tag>
                    </div>
                  </div>
                  <div class="rt-doc-actions">
                    <el-button size="small" type="primary" plain @click="openEditor(doc)">在线校对</el-button>
                    <el-button size="small" @click="download(doc)">下载</el-button>
                  </div>
                </div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    </template>

    <!-- 生成前预检对话框 -->
    <el-dialog v-model="precheckVisible" title="生成前检查" width="560px">
      <div v-if="precheck" class="rt-precheck">
        <div v-if="isPrecheckClean" class="rt-all-done rt-mb8">
          <el-icon><CircleCheckFilled /></el-icon> 数据齐备, 可以{{ precheckAction === 'confirm' ? '确认' : '生成' }}
        </div>
        <template v-else>
          <div v-if="precheck.missing_company_fields.length" class="rt-check-item">
            <el-icon color="#f59e0b"><WarningFilled /></el-icon>
            <div>
              企业资料缺失字段:
              <b>{{ precheck.missing_company_fields.map((f) => f.field).join('、') }}</b>
              <router-link to="/enterprise/companies" class="rt-link">去补齐</router-link>
            </div>
          </div>
          <div v-if="precheck.missing_materials.length" class="rt-check-item">
            <el-icon color="#f59e0b"><WarningFilled /></el-icon>
            <div>
              材料包缺少材料:
              <b>{{ precheck.missing_materials.map((m) => m.usage_key).join('、') }}</b>
              <router-link to="/enterprise/packages" class="rt-link">去上传</router-link>
            </div>
          </div>
          <div v-if="precheck.members_empty" class="rt-check-item">
            <el-icon color="#f59e0b"><WarningFilled /></el-icon>
            <div>
              检测到人员重复块, 但人员库为空, 人员信息将无法自动填充
              <router-link to="/enterprise/members" class="rt-link">去录入</router-link>
            </div>
          </div>
          <div v-if="precheck.unfilled_price.length" class="rt-check-item">
            <el-icon color="#ef4444"><WarningFilled /></el-icon>
            <div>
              {{ precheck.unfilled_price.length }} 个报价块未填报价(生成后将留空):
              <b>{{ precheck.unfilled_price.map((p) => p.block_key).join('、') }}</b>
              <el-button size="small" link type="primary" @click="closePrecheckAndFilter">去填写</el-button>
            </div>
          </div>
          <div v-if="precheck.unbound_fields.length" class="rt-check-item">
            <el-icon color="#909399"><InfoFilled /></el-icon>
            <div>
              {{ precheck.unbound_fields.length }} 个字段无自动数据源, 生成后需在文档中人工填写
              (如 {{ precheck.unbound_fields.slice(0, 3).map((u) => u.title).join('、') }})
            </div>
          </div>
          <div v-if="precheck.signature_count" class="rt-check-item">
            <el-icon color="#909399"><InfoFilled /></el-icon>
            <div>签字盖章 {{ precheck.signature_count }} 处, 打印后人工完成</div>
          </div>
        </template>
      </div>
      <template #footer>
        <el-button @click="precheckVisible = false">取消</el-button>
        <el-button type="primary" :loading="acting" @click="proceedPrecheck">
          {{ precheckAction === 'confirm' ? '确认模板' : '仍然生成' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CircleCheckFilled,
  Document,
  EditPen,
  InfoFilled,
  Loading,
  Minus,
  MoreFilled,
  Plus,
  Search,
  WarningFilled,
} from '@element-plus/icons-vue'
import {
  confirmResponseTemplate,
  generateResponseTemplate,
  getPrecheck,
  getResponseTemplate,
  getSourceFileBlob,
  getSourceMarkdown,
  reAnalyzeResponseTemplate,
  updateTemplateBlock,
  type PrecheckResult,
  type ResponseDocument,
  type ResponseTemplate,
  type TemplateBlock,
} from '@/api/responseTemplate'
import VueOfficeDocx from '@vue-office/docx'
import '@vue-office/docx/lib/index.css'

const route = useRoute()
const router = useRouter()
const props = defineProps<{ templateId?: number | string }>()
const currentId = computed(() => {
  if (props.templateId !== undefined && props.templateId !== null && props.templateId !== '') {
    return Number(props.templateId)
  }
  return Number(route.params.id)
})

const template = ref<ResponseTemplate>({ blocks: [], documents: [] } as unknown as ResponseTemplate)
const acting = ref(false)
const initialLoading = ref(true)
const selectedBlock = ref<TemplateBlock | null>(null)
const statusFilter = ref<'all' | 'needs_review' | 'empty' | 'filled'>('all')
const search = ref('')
const expandedGroups = ref<Set<string>>(new Set())
const expandedSigs = ref<Set<string>>(new Set())
const rightTab = ref<'source' | 'block' | 'output'>('source')
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

const isBusy = computed(() =>
  ['pending', 'analyzing', 'generating'].includes(template.value.status),
)
const isAnalyzing = computed(() =>
  ['pending', 'analyzing'].includes(template.value.status),
)
const canReAnalyze = computed(() =>
  ['analyzed', 'confirmed', 'generated', 'failed'].includes(template.value.status),
)

const stepIndex = computed(() => {
  const s = template.value.status
  if (s === 'generated') return 5
  if (s === 'generating') return 4
  if (s === 'confirmed') return 3
  if (s === 'analyzed') return 2
  return 1
})

const statusType = computed(() => {
  const s = template.value.status
  if (s === 'generated') return 'success' as const
  if (s === 'failed') return 'danger' as const
  if (s === 'confirmed') return 'warning' as const
  if (s === 'analyzed') return 'primary' as const
  return 'info' as const
})

// ---------------------------------------------------------------------------
// 块列表: 分组 / 筛选 / 签字折叠
// ---------------------------------------------------------------------------
function isSignature(b: TemplateBlock): boolean {
  return Boolean((b.source_config as any)?.is_signature)
}

interface Group {
  name: string
  title: string
  blocks: TemplateBlock[]
  normalBlocks: TemplateBlock[]
  signatureBlocks: TemplateBlock[]
  reviewCount: number
}

const groups = computed<Group[]>(() => {
  const map = new Map<string, TemplateBlock[]>()
  for (const b of template.value.blocks || []) {
    const key = b.block_key.match(/^(附件[0-9一二三四五六七八九十]+)/)?.[1] || '其他'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(b)
  }
  return Array.from(map.entries()).map(([name, blocks]) => {
    const signatureBlocks = blocks.filter(isSignature)
    const normalBlocks = blocks.filter((b) => !isSignature(b))
    return {
      name,
      title: (blocks[0]?.source_config as any)?.attachment_title || '',
      blocks,
      normalBlocks,
      signatureBlocks,
      reviewCount: blocks.filter((b) => b.fill_status === 'needs_review').length,
    }
  })
})

const counts = computed(() => {
  const blocks = template.value.blocks || []
  return {
    all: blocks.length,
    needs_review: blocks.filter((b) => b.fill_status === 'needs_review').length,
    empty: blocks.filter((b) => b.fill_status === 'empty').length,
    filled: blocks.filter((b) => b.fill_status === 'filled').length,
  }
})

const filteredGroups = computed<Group[]>(() => {
  const kw = search.value.trim().toLowerCase()
  return groups.value
    .map((g) => {
      let blocks = g.blocks
      if (statusFilter.value !== 'all') {
        blocks = blocks.filter((b) => b.fill_status === statusFilter.value)
      }
      if (kw) {
        blocks = blocks.filter(
          (b) =>
            b.title.toLowerCase().includes(kw) ||
            b.block_key.toLowerCase().includes(kw),
        )
      }
      const signatureBlocks = blocks.filter(isSignature)
      const normalBlocks = blocks.filter((b) => !isSignature(b))
      return {
        ...g,
        blocks,
        normalBlocks,
        signatureBlocks,
        reviewCount: blocks.filter((b) => b.fill_status === 'needs_review').length,
      }
    })
    .filter((g) => g.blocks.length > 0)
})

const signatureCount = computed(
  () => (template.value.blocks || []).filter(isSignature).length,
)

function toggleGroup(name: string) {
  if (expandedGroups.value.has(name)) {
    expandedGroups.value.delete(name)
  } else {
    expandedGroups.value.add(name)
  }
  expandedGroups.value = new Set(expandedGroups.value)
}

function toggleSig(name: string) {
  if (expandedSigs.value.has(name)) {
    expandedSigs.value.delete(name)
  } else {
    expandedSigs.value.add(name)
  }
  expandedSigs.value = new Set(expandedSigs.value)
}

// ---------------------------------------------------------------------------
// 待办
// ---------------------------------------------------------------------------
interface TodoItem {
  kind: 'price' | 'material' | 'manual' | 'field' | 'review'
  label: string
  block: TemplateBlock
}

const todoItems = computed<TodoItem[]>(() => {
  const list: TodoItem[] = []
  for (const b of template.value.blocks || []) {
    const payload = (b.fill_payload || {}) as any
    if (b.block_type === 'PRICE' && payload.price == null) {
      list.push({ kind: 'price', label: `填写报价: ${b.block_key} ${b.title}`, block: b })
    } else if (b.block_type === 'MATERIAL_SLOT' && b.fill_status === 'needs_review') {
      list.push({ kind: 'material', label: `补充材料: ${b.block_key} ${b.title}`, block: b })
    } else if (
      (b.block_type === 'AUTO_FIELD' || b.block_type === 'DATA_TABLE') &&
      b.fill_status === 'needs_review'
    ) {
      list.push({ kind: 'field', label: `人工补填字段: ${b.block_key} ${b.title}`, block: b })
    } else if (b.block_type === 'MANUAL' && !isSignature(b) && b.fill_status === 'needs_review') {
      list.push({ kind: 'manual', label: `人工填写: ${b.block_key} ${b.title}`, block: b })
    } else if (b.block_type === 'AI_RESPONSE' && payload.review_count) {
      list.push({ kind: 'review', label: `复核应答表 ${b.block_key}(${payload.review_count} 条待确认)`, block: b })
    }
  }
  return list
})

function todoColor(kind: TodoItem['kind']): string {
  if (kind === 'price') return '#ef4444'
  if (kind === 'material' || kind === 'review') return '#f59e0b'
  return '#909399'
}

function gotoTodo(item: TodoItem) {
  if (item.kind === 'material') {
    router.push('/enterprise/packages')
    return
  }
  statusFilter.value = 'all'
  search.value = ''
  selectBlock(item.block)
  const groupName = item.block.block_key.match(/^(附件[0-9一二三四五六七八九十]+)/)?.[1] || '其他'
  if (!expandedGroups.value.has(groupName)) toggleGroup(groupName)
}

// ---------------------------------------------------------------------------
// 原文对照: 优先 docx 原格式渲染, 失败降级 markdown 分节
// ---------------------------------------------------------------------------
const sourceSections = ref<{ no: string; title: string; content: string }[]>([])
const sourceError = ref('')
const sourceLoading = ref(false)
const sourceDocxData = ref<ArrayBuffer | null>(null)
const sourceDocxRef = ref<HTMLElement | null>(null)
const sourceZoom = ref(80)  // Word 式缩放(默认 80%, 窄栏也能看全整页宽度)
let docxRendered = false
let sourceLoaded = false

async function ensureSource() {
  if (sourceLoaded) return
  sourceLoaded = true
  sourceLoading.value = true
  try {
    const { data } = await getSourceFileBlob(currentId.value)
    sourceDocxData.value = await data.arrayBuffer()
  } catch (e) {
    // docx 加载失败 → 降级 markdown
    sourceDocxData.value = null
    await loadMarkdownFallback()
  } finally {
    sourceLoading.value = false
  }
}

async function loadMarkdownFallback() {
  try {
    const { data } = await getSourceMarkdown(currentId.value)
    sourceError.value = data.error || ''
    sourceSections.value = splitAttachments(data.content || '')
  } catch (e) {
    sourceError.value = '加载原文失败'
  }
}

function onDocxRendered() {
  docxRendered = true
  if (pendingScrollNo) {
    scrollDocxToAttachment(pendingScrollNo)
    pendingScrollNo = ''
  }
}

function onDocxError(err: unknown) {
  console.warn('docx 渲染失败, 降级 markdown:', err)
  sourceDocxData.value = null
  loadMarkdownFallback()
}

/** 在渲染后的 docx DOM 中定位"附件N:"标题并滚动。
 *  招标文件正文前的指引里也有一套附件标题, 取最后一次出现(第四部分的正式标题)。 */
function scrollDocxToAttachment(no: string) {
  const root = sourceDocxRef.value
  if (!root) return
  const prefix = `附件${no}`
  const candidates: HTMLElement[] = []
  for (const el of Array.from(root.querySelectorAll('*')) as HTMLElement[]) {
    // 只取叶子级短文本元素(标题段), 避免命中包含整章的容器
    const text = (el.textContent || '').replace(/\s+/g, '')
    if (text.startsWith(prefix) && text.length < 40 && el.children.length === 0) {
      candidates.push(el)
    }
  }
  const target = candidates[candidates.length - 1]
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function splitAttachments(md: string) {
  const re = /^#{1,4}\s*附件\s*(\d+)[：:]\s*(.*)$/gm
  const matches = [...md.matchAll(re)]
  const sections: { no: string; title: string; content: string }[] = []
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index! + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index! : md.length
    sections.push({
      no: matches[i][1],
      title: matches[i][2].trim(),
      content: md.slice(start, end).trim(),
    })
  }
  if (!sections.length && md.trim()) {
    sections.push({ no: '0', title: '全文', content: md.trim() })
  }
  return sections
}

let pendingScrollNo = ''
async function locateSource(block: TemplateBlock) {
  rightTab.value = 'source'
  await ensureSource()
  const no = String((block.source_config as any)?.attachment_no || '')
  requestAnimationFrame(() => {
    if (sourceDocxData.value) {
      if (docxRendered) {
        scrollDocxToAttachment(no)
      } else {
        pendingScrollNo = no
      }
    } else {
      document.getElementById(`rt-src-${no}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  })
}

// ---------------------------------------------------------------------------
// 块操作
// ---------------------------------------------------------------------------
function selectBlock(block: TemplateBlock) {
  selectedBlock.value = block
  rightTab.value = 'block'
}

function bindingText(row: TemplateBlock): string {
  const binding = row.binding_config as Record<string, any>
  if (!binding || !Object.keys(binding).length) return '无(人工填写)'
  return Object.entries(binding).map(([k, v]) => `${k}: ${v}`).join(', ')
}

function aiNote(row: TemplateBlock): string {
  return ((row.ai_result as any)?.note as string) || '-'
}

function generatedText(row: TemplateBlock): string {
  return ((row.fill_payload as any)?.generated_text as string) || ''
}

function payloadItems(row: TemplateBlock): any[] {
  return (row.fill_payload as any)?.items || []
}

function copyText(text: string) {
  navigator.clipboard?.writeText(text).then(
    () => ElMessage.success('已复制'),
    () => ElMessage.error('复制失败'),
  )
}

function typeTagType(t: string): 'success' | 'info' | 'warning' | 'danger' | 'primary' {
  switch (t) {
    case 'AUTO_FIELD':
    case 'DATA_TABLE':
      return 'success'
    case 'AI_GENERATE':
    case 'REPEAT_TABLE':
    case 'REPEAT_BLOCK':
      return 'primary'
    case 'AI_RESPONSE':
    case 'MATERIAL_SLOT':
      return 'warning'
    case 'MANUAL':
    case 'PRICE':
      return 'danger'
    default:
      return 'info'
  }
}

function fillTagType(status: string): 'success' | 'info' | 'warning' | 'danger' {
  if (status === 'filled') return 'success'
  if (status === 'needs_review') return 'warning'
  if (status === 'skipped') return 'info'
  return 'danger'
}

async function savePrice(row: TemplateBlock & { priceValue?: number | null }) {
  try {
    await updateTemplateBlock(row.id, {
      fill_payload: { ...(row.fill_payload || {}), price: row.priceValue ?? null },
    })
    ElMessage.success(`已保存报价: ${row.block_key}`)
    load(false)
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
    load(false)
  } catch (e) {
    ElMessage.error('更新失败')
  }
}

// ---------------------------------------------------------------------------
// 预检 + 状态动作
// ---------------------------------------------------------------------------
const precheckVisible = ref(false)
const precheck = ref<PrecheckResult | null>(null)
const precheckAction = ref<'confirm' | 'generate'>('confirm')

const isPrecheckClean = computed(() => {
  const p = precheck.value
  if (!p) return false
  return (
    !p.missing_company_fields.length &&
    !p.missing_materials.length &&
    !p.unfilled_price.length &&
    !p.members_empty
  )
})

async function confirmWithPrecheck() {
  precheckAction.value = 'confirm'
  await runPrecheck()
}

async function generateWithPrecheck() {
  precheckAction.value = 'generate'
  await runPrecheck()
}

async function runPrecheck() {
  try {
    const { data } = await getPrecheck(template.value.id)
    precheck.value = data
    precheckVisible.value = true
  } catch (e) {
    // 预检失败不阻断主流程
    if (precheckAction.value === 'confirm') {
      await doConfirm()
    } else {
      await doGenerate()
    }
  }
}

function closePrecheckAndFilter() {
  precheckVisible.value = false
  statusFilter.value = 'all'
  search.value = ''
}

async function proceedPrecheck() {
  precheckVisible.value = false
  if (precheckAction.value === 'confirm') {
    await doConfirm()
  } else {
    await doGenerate()
  }
}

async function doConfirm() {
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

async function doGenerate() {
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
    ElMessage.success('重新识别已启动')
    template.value.status = 'pending'
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '重新识别失败')
  } finally {
    acting.value = false
  }
}

function onMoreCommand(cmd: string) {
  if (cmd === 're-analyze') reAnalyze()
}

// ---------------------------------------------------------------------------
// 产物
// ---------------------------------------------------------------------------
function openEditor(doc: ResponseDocument) {
  const { href } = router.resolve(`/response-documents/${doc.id}/editor`)
  window.open(href, '_blank')
}

function download(doc: ResponseDocument) {
  if (doc.url) window.open(doc.url, '_blank')
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function goBack() {
  router.push('/response-templates')
}

// ---------------------------------------------------------------------------
// 加载 + 轮询
// ---------------------------------------------------------------------------
async function load(showError = true) {
  try {
    const { data } = await getResponseTemplate(currentId.value)
    for (const b of data.blocks) {
      b.repeatCount = Number((b.binding_config as any)?.repeat_count) || 3
      b.priceValue = (b.fill_payload as any)?.price ?? null
    }
    template.value = data
    // 默认展开有待复核块的分组
    if (!expandedGroups.value.size) {
      const names = groups.value
        .filter((g) => g.reviewCount > 0)
        .map((g) => g.name)
      expandedGroups.value = new Set(names.length ? names : groups.value.slice(0, 2).map((g) => g.name))
    }
    // 生成完成后自动切到产物页
    if (data.status === 'generated' && rightTab.value === 'source' && prevStatus === 'generating') {
      rightTab.value = 'output'
    }
  } catch (e) {
    if (showError) ElMessage.error('加载响应模板失败')
  } finally {
    initialLoading.value = false
  }
}

let prevStatus = ''
function startPolling() {
  timer = window.setInterval(() => {
    const s = template.value.status
    if (s === 'analyzing' || s === 'generating' || s === 'pending') {
      load(false)
    }
    if (prevStatus && s && s !== prevStatus && !isBusy.value) {
      if (s === 'generated') {
        ElMessage.success('生成完成, 请在「产物与待办」中下载或在线校对')
      } else if (s === 'failed') {
        ElMessage.error('任务失败, 可重试')
      } else if (s === 'analyzed') {
        ElMessage.success('识别完成, 请确认填充位置')
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

// 原文对照 tab 激活时自动加载原文(immediate: 默认就在该 tab 时也触发)
watch(rightTab, (v) => {
  if (v === 'source') ensureSource()
}, { immediate: true })

onUnmounted(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<style scoped>
.rt-workbench {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 112px);
  padding: 0;
  gap: 12px;
  background: var(--app-bg);
  overflow: hidden;
}

/* 首屏骨架屏(布局与真实内容一致) */
.rt-skeleton {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rt-skeleton .sk-rt-header {
  height: 108px;
  border-radius: 12px;
  flex-shrink: 0;
}

.rt-skeleton .sk-rt-body {
  display: flex;
  gap: 12px;
  height: calc(100vh - 244px);
}

.rt-skeleton .sk-rt-left {
  width: 55%;
  height: 100%;
  border-radius: 12px;
}

.rt-skeleton .sk-rt-right {
  width: 45%;
  height: 100%;
  border-radius: 12px;
}

/* 头部 */
.rt-header {
  background: var(--app-card);
  border: 1px solid var(--app-border);
  border-radius: 12px;
  padding: 12px 16px 0;
  flex-shrink: 0;
}

.rt-header-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.rt-back {
  padding: 4px 6px;
}

.rt-title {
  margin: 0;
  font-size: 17px;
  max-width: 480px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rt-summary-text {
  color: var(--app-text-secondary);
  font-size: 12px;
}

.rt-sep {
  color: var(--app-warning);
}

.rt-spacer {
  flex: 1;
}

.rt-steps {
  margin: 0 -16px;
}

.rt-steps :deep(.el-step__title) {
  font-size: 12px;
}

.rt-error {
  flex-shrink: 0;
}

/* 识别中 */
.rt-analyzing {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--app-text-secondary);
  background: var(--app-card);
  border: 1px solid var(--app-border);
  border-radius: 12px;
}

.rt-analyzing-icon {
  font-size: 32px;
  color: var(--app-primary);
}

/* 主体 */
.rt-main {
  flex: 1;
  display: flex;
  gap: 12px;
  min-height: 0;
}

.rt-left {
  width: 55%;
  display: flex;
  flex-direction: column;
  background: var(--app-card);
  border: 1px solid var(--app-border);
  border-radius: 12px;
  overflow: hidden;
}

.rt-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
}

.rt-search {
  width: 180px;
  margin-left: auto;
}

.rt-block-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.rt-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  background: #f8fafc;
  border-bottom: 1px solid var(--app-border);
  position: sticky;
  top: 0;
  z-index: 1;
}

.rt-group-title:hover {
  background: #f1f5f9;
}

.rt-caret {
  transition: transform 0.2s;
  color: var(--app-text-secondary);
}

.rt-caret.collapsed {
  transform: rotate(-90deg);
}

.rt-group-name {
  font-weight: 600;
  font-size: 13px;
}

.rt-group-sub {
  color: var(--app-text-secondary);
  font-size: 12px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rt-block-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
}

.rt-block-row:hover {
  background: #f8fafc;
}

.rt-block-row.selected {
  background: var(--app-primary-soft);
}

.rt-block-key {
  color: var(--app-text-secondary);
  font-size: 12px;
  min-width: 76px;
  flex-shrink: 0;
}

.rt-block-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.rt-tag {
  flex-shrink: 0;
}

.rt-block-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.rt-price-input {
  width: 110px;
}

.rt-repeat-input {
  width: 76px;
}

.rt-mini-label {
  font-size: 12px;
  color: var(--app-text-secondary);
}

/* 签字盖章折叠 */
.rt-sig-block {
  border-bottom: 1px solid #f1f5f9;
}

.rt-sig-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--app-text-secondary);
  background: #fafbfc;
}

.rt-sig-row:hover {
  background: #f1f5f9;
}

.rt-sig-icon {
  color: var(--app-warning);
}

.rt-sig-hint {
  font-size: 12px;
  color: #c0c4cc;
  margin-left: auto;
}

.rt-sig-list {
  padding: 4px 12px 8px 32px;
}

.rt-sig-item {
  font-size: 12px;
  color: var(--app-text-secondary);
  line-height: 1.9;
}

/* 右栏 */
.rt-right {
  width: 45%;
  background: var(--app-card);
  border: 1px solid var(--app-border);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.rt-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 12px;
}

.rt-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
}

.rt-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow-y: auto;
}

.rt-badge {
  margin-left: 4px;
  vertical-align: 2px;
}

/* 原文对照 */
.rt-source-panel {
  height: 100%;
  overflow-y: auto;
}

.rt-source-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 0;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.rt-source-docx {
  background: #f1f5f9;
  border-radius: 8px;
  overflow: hidden;
}

.rt-source-docx :deep(.docx-wrapper) {
  background: #f1f5f9;
  padding: 12px 0;
}

.rt-zoom-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0 8px;
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--app-card);
}

.rt-zoom-value {
  min-width: 56px;
  pointer-events: none;
}

.rt-source-section {
  scroll-margin-top: 8px;
}

.rt-source-heading {
  font-weight: 600;
  font-size: 14px;
  padding: 10px 0 6px;
  color: var(--app-primary);
  border-bottom: 1px solid var(--app-border);
  margin-bottom: 6px;
}

.rt-source-pre {
  margin: 0 0 16px;
  font-size: 12px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-all;
  color: #374151;
  font-family: inherit;
}

/* 块详情 */
.rt-detail-panel {
  padding-bottom: 16px;
}

.rt-detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.rt-detail-title {
  font-weight: 600;
}

.rt-detail-desc {
  margin-bottom: 12px;
}

.rt-detail-sub {
  font-size: 13px;
  font-weight: 600;
  margin: 10px 0 6px;
}

.rt-generated-pre {
  background: #f7f8fa;
  border-radius: 6px;
  padding: 10px;
  font-size: 12px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 240px;
  overflow-y: auto;
}

.rt-mb8 {
  margin-bottom: 8px;
}

.rt-ml8 {
  margin-left: 8px;
}

/* 产物与待办 */
.rt-output-panel {
  padding-bottom: 16px;
}

.rt-panel-sub {
  font-size: 13px;
  font-weight: 600;
  margin: 8px 0;
  color: var(--app-text-secondary);
}

.rt-all-done {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--app-success);
  font-size: 13px;
  padding: 8px 0;
}

.rt-todo-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  margin-bottom: 6px;
  cursor: pointer;
  font-size: 13px;
}

.rt-todo-row:hover {
  border-color: var(--app-primary);
  background: #f8fafc;
}

.rt-todo-info {
  cursor: default;
  background: #fafbfc;
}

.rt-todo-label {
  flex: 1;
}

.rt-todo-go {
  color: #c0c4cc;
}

.rt-doc-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rt-doc-card {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  padding: 12px;
}

.rt-doc-info {
  flex: 1;
  min-width: 0;
}

.rt-doc-title {
  font-weight: 600;
  font-size: 14px;
}

.rt-doc-meta {
  color: var(--app-text-secondary);
  font-size: 12px;
  margin-top: 4px;
}

.rt-doc-actions {
  display: flex;
  gap: 6px;
}

/* 预检 */
.rt-check-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 0;
  font-size: 13px;
  line-height: 1.7;
}

.rt-check-item .el-icon {
  margin-top: 4px;
}

.rt-link {
  color: var(--app-primary);
  margin-left: 8px;
  font-size: 12px;
}
</style>
