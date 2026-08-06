<template>
  <div class="requirement-tab">
    <!-- 任务进度条 -->
    <TaskProgress
      v-if="currentTaskId"
      :task-id="currentTaskId"
      :poll-interval="2000"
      @completed="handleTaskCompleted"
      @failed="handleTaskFailed"
      @refresh="loadRequirements"
      @dismiss="currentTaskId = null"
    />

    <!-- 抽取工具栏 -->
    <RequirementExtractToolbar
      v-if="canManage"
      :loading="extractLoading"
      :parsed-document-id="parsedDocumentId"
      @extract="handleExtract"
    />

    <!-- 标段级条款去重 -->
    <div v-if="canManage" class="dedup-bar">
      <el-tooltip
        :disabled="!!lotId && !dedupCompleted"
        :content="dedupCompleted ? '已去重完成' : '当前文件未关联标段，无法执行标段级去重'"
        placement="top"
      >
        <span>
          <el-button
            size="small"
            :type="dedupCompleted ? 'success' : 'default'"
            :loading="dedupLoading"
            :disabled="!lotId"
            @click="handleDedup"
          >条款去重</el-button>
        </span>
      </el-tooltip>
      <span class="dedup-hint">合并标段内多份文件的重复条款</span>
    </div>

    <!-- 抽取版本选择 -->
    <div v-if="extractionRuns.length > 0" class="version-bar">
      <span class="version-label">抽取版本</span>
      <el-select
        v-model="selectedRunId"
        size="small"
        style="width: 280px"
        @change="handleRunChange"
      >
        <el-option :value="0" label="当前版本" />
        <el-option
          v-for="run in extractionRuns"
          :key="run.id"
          :value="run.id"
          :label="formatRunLabel(run)"
        />
      </el-select>
      <el-tag v-if="isHistoryView" type="warning" size="small">历史版本（只读）</el-tag>
      <el-button
        v-if="isHistoryView && canManage"
        size="small"
        link
        type="primary"
        :loading="activateLoading"
        @click="handleSetActive"
      >设为当前版本</el-button>
    </div>

    <!-- 左右布局 -->
    <div class="requirement-layout" v-if="requirements.length > 0 || loading">
      <!-- 左侧导航 -->
      <RequirementSidebar
        :categories="categoriesWithCount"
        :active-category="activeCategory"
        @select="handleCategorySelect"
        @extract-single="handleExtractSingle"
      />

      <!-- 右侧内容 -->
      <div class="requirement-content">
        <div class="category-header">
          <h3>{{ currentCategoryLabel }}</h3>
          <span class="count">共 {{ currentRequirements.length }} 条</span>
        </div>

        <el-table
          :data="currentRequirements"
          v-loading="loading"
          empty-text="该分类暂无条款"
          :row-class-name="rowClassName"
          :max-height="560"
          @row-click="handleRowClick"
        >
          <el-table-column type="expand" width="40">
            <template #default="{ row }">
              <div class="detail-points-panel">
                <template v-if="row.detail_points && row.detail_points.length > 0">
                  <div
                    v-for="(point, idx) in row.detail_points"
                    :key="point.point_id || idx"
                    class="detail-point-item"
                  >
                    <div class="detail-point-head">
                      <span class="detail-point-title">{{ point.title || '(无标题)' }}</span>
                      <el-tag v-if="point.mandatory_level === 'mandatory'" type="danger" size="small" effect="dark">强制</el-tag>
                      <el-tag v-else-if="point.mandatory_level === 'recommended'" type="warning" size="small">推荐</el-tag>
                      <span v-if="point.score !== null && point.score !== undefined" class="detail-point-score">得分 {{ point.score }} 分</span>
                      <span v-if="point.source_page" class="page-text">P{{ point.source_page }}</span>
                    </div>
                    <div v-if="point.requirement" class="detail-point-req">{{ point.requirement }}</div>
                    <div v-if="point.acceptance_basis" class="detail-point-basis">
                      <span class="basis-label">验收依据：</span>{{ point.acceptance_basis }}
                    </div>
                    <div v-if="point.evidence" class="detail-point-evidence">{{ point.evidence }}</div>
                  </div>
                </template>
                <div v-else class="detail-points-empty">无细项要点</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="标题" width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="requirement-title">{{ row.title || '(无标题)' }}</span>
              <el-tag
                v-if="(row.merged_count || 0) > 0"
                size="small"
                type="success"
                effect="plain"
                class="merged-tag"
                @click.stop="handleShowDuplicates(row)"
              >已合并 {{ row.merged_count }} 条</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="内容摘要" min-width="280" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="requirement-content-text">{{ row.content || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="强制" width="80" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.mandatory_level === 'mandatory'" type="danger" size="small" effect="dark">强制</el-tag>
              <el-tag v-else-if="row.mandatory_level === 'important'" type="warning" size="small">重要</el-tag>
              <span v-else class="muted-text">—</span>
            </template>
          </el-table-column>
          <el-table-column label="风险" width="80" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.risk_level === 'high'" type="danger" size="small">高风险</el-tag>
              <el-tag v-else-if="row.risk_level === 'medium'" type="warning" size="small">中风险</el-tag>
              <span v-else class="muted-text">—</span>
            </template>
          </el-table-column>
          <el-table-column label="分值" width="110" align="center">
            <template #default="{ row }">
              <span v-if="getScore(row) !== null" class="score-text">
                {{ getScore(row) }}
                <el-tooltip
                  v-if="getConsistencyNote(row)"
                  :content="getConsistencyNote(row)"
                  placement="top"
                >
                  <el-icon class="warn-icon"><Warning /></el-icon>
                </el-tooltip>
              </span>
              <el-tooltip
                v-else-if="getScoreStatus(row) === 'ambiguous'"
                content="原文存在分值但无法准确确定，待人工确认"
                placement="top"
              >
                <span class="score-pending">待人工确认</span>
              </el-tooltip>
              <span v-else-if="getScoreStatus(row) === 'not_found'" class="muted-text">未识别</span>
              <span v-else class="muted-text">—</span>
            </template>
          </el-table-column>
          <el-table-column label="来源" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="source-text">{{ row.source_section_path || row.source_section || '-' }}</span>
              <span v-if="row.source_page_start" class="page-text">
                P{{ row.source_page_start }}<template v-if="row.source_page_end && row.source_page_end !== row.source_page_start">-P{{ row.source_page_end }}</template>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" align="center">
            <template #default="{ row }">
              <el-button size="small" type="primary" plain @click.stop="handleView(row)">查看</el-button>
              <el-button v-if="canManage && !isHistoryView" size="small" link type="primary" @click.stop="handleEdit(row)">编辑</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-empty v-if="!loading && currentRequirements.length === 0" description="该分类暂无条款" />
      </div>
    </div>

    <!-- 空状态 -->
    <el-empty v-if="!loading && requirements.length === 0" description="暂无条款数据，请先执行抽取" />

    <!-- 详情抽屉 -->
    <RequirementDetailDrawer
      v-model="showDetailDrawer"
      :requirement="selectedRequirement"
      :loading="detailLoading"
    />

    <!-- 编辑对话框 -->
    <RequirementEditDialog
      v-model="showEditDialog"
      :requirement="selectedRequirement"
      @saved="handleSaved"
    />

    <!-- 已合并重复条目抽屉（只读溯源） -->
    <el-drawer
      v-model="showDuplicatesDrawer"
      title="已合并的重复条款"
      size="560px"
    >
      <div v-loading="duplicatesLoading" class="duplicates-panel">
        <div v-if="duplicatesFor" class="duplicates-kept">
          保留条款：{{ duplicatesFor.title || '(无标题)' }}
        </div>
        <el-empty
          v-if="!duplicatesLoading && duplicates.length === 0"
          description="暂无重复条目"
        />
        <div v-for="dup in duplicates" :key="dup.id" class="duplicate-item">
          <div class="duplicate-head">
            <span class="duplicate-title">{{ dup.title || '(无标题)' }}</span>
            <el-tag size="small" type="info" effect="plain">
              {{ dup.requirement_type_display || dup.requirement_type }}
            </el-tag>
          </div>
          <div class="duplicate-meta">
            <span v-if="dup.source_file_name">来源文件：{{ dup.source_file_name }}</span>
            <span v-if="dup.source_page_start" class="page-text">
              P{{ dup.source_page_start }}<template v-if="dup.source_page_end && dup.source_page_end !== dup.source_page_start">-P{{ dup.source_page_end }}</template>
            </span>
          </div>
          <div class="duplicate-content">{{ dup.content || '-' }}</div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Warning } from '@element-plus/icons-vue'
import {
  listRequirements,
  extractRequirements,
  getRequirement,
  getSafeRequirementList,
  listExtractionRuns,
  activateExtractionRun,
  deduplicateLot,
  listRequirementDuplicates,
  getLatestDedupRun,
  type Requirement,
  type RequirementDetail,
  type RequirementDuplicate,
  type ExtractionRun,
} from '@/api/requirements'
import { normalizeList } from '@/utils/normalize'
import { getCurrentTask } from '@/api/task'
import RequirementExtractToolbar from './RequirementExtractToolbar.vue'
import RequirementSidebar from './RequirementSidebar.vue'
import RequirementDetailDrawer from './RequirementDetailDrawer.vue'
import RequirementEditDialog from './RequirementEditDialog.vue'
import TaskProgress from '@/components/common/TaskProgress.vue'

interface ExtractPayload {
  force: boolean
  extractionTypes: string[]
  modelConfigId: number | null
  promptVersionId: number | null
}

// 展示分类 → 抽取类型映射（侧栏单提用）
const DISPLAY_TO_EXTRACTION: Record<string, string> = {
  qualification: 'qualification',
  tech_req: 'technical',
  scoring: 'scoring',
  commercial: 'commercial',
  submission: 'submission',
  legal: 'mandatory',
}

const props = defineProps<{
  tenderFileId: number
  tenderFileIds?: number[]  // 合并模式：主文件+附件的ID列表
  parsedDocumentId: number | null
  canManage?: boolean
  lotId?: number | null  // 标段ID：用于标段级条款去重
}>()

// 状态
const loading = ref(false)
const extractLoading = ref(false)
const detailLoading = ref(false)
const requirements = ref<Requirement[]>([])
const activeCategory = ref('qualification')

// 当前任务
const currentTaskId = ref<number | null>(null)
// 当前任务类型：区分抽取任务与去重任务（完成/失败回调文案不同）
const currentTaskKind = ref<'extract' | 'dedup'>('extract')

// 标段级去重
const dedupLoading = ref(false)
// 最新一次去重已成功（按钮完成态：绿色 + tooltip「已去重完成」）
const dedupCompleted = ref(false)
const isMultiFile = computed(() => (props.tenderFileIds?.length || 0) > 1)

// 已合并重复条目抽屉
const showDuplicatesDrawer = ref(false)
const duplicatesLoading = ref(false)
const duplicates = ref<RequirementDuplicate[]>([])
const duplicatesFor = ref<Requirement | null>(null)

// 抽取版本（作用于主文件 tenderFileId；0 表示当前版本）
const extractionRuns = ref<ExtractionRun[]>([])
const selectedRunId = ref<number>(0)
const activateLoading = ref(false)

// 选中的历史 run（选中当前激活 run 时不算历史查看）
const selectedRun = computed(() =>
  extractionRuns.value.find((r) => r.id === selectedRunId.value) || null
)
const isHistoryView = computed(
  () => selectedRunId.value !== 0 && !!selectedRun.value && !selectedRun.value.is_active
)

// 最近一次抽取使用的模型/提示词版本（侧栏单提复用；从未抽取过则为 null，由后端自动兜底）
const lastModelConfigId = ref<number | null>(null)
const lastPromptVersionId = ref<number | null>(null)

// 详情/编辑
const showDetailDrawer = ref(false)
const showEditDialog = ref(false)
const selectedRequirement = ref<RequirementDetail | null>(null)

// 实际抽取的 6 类（履约周期/材料要求/文件格式/澄清补遗/其他 不抽取，已移除展示）
const CATEGORY_DEFINITIONS = [
  { value: 'qualification', label: '资格要求' },
  { value: 'tech_req', label: '技术要求' },
  { value: 'scoring', label: '评分项' },
  { value: 'commercial', label: '商务条款' },
  { value: 'submission', label: '投标递交' },
  { value: 'legal', label: '合同法律' },
]

// 计算各分类数量
const categoriesWithCount = computed(() => {
  const countMap: Record<string, number> = {}
  for (const req of requirements.value) {
    const type = req.requirement_type || 'other'
    countMap[type] = (countMap[type] || 0) + 1
  }
  return CATEGORY_DEFINITIONS.map((def) => ({
    value: def.value,
    label: def.label,
    count: countMap[def.value] || 0,
  }))
})

// 当前分类标签
const currentCategoryLabel = computed(() => {
  const def = CATEGORY_DEFINITIONS.find((d) => d.value === activeCategory.value)
  return def?.label || '未知'
})

// 当前分类条款
const currentRequirements = computed(() => {
  return requirements.value.filter((req) => {
    const type = req.requirement_type || 'other'
    return type === activeCategory.value
  })
})

// 加载条款列表（支持多文件合并）
async function loadRequirements() {
  loading.value = true
  try {
    const fileIds = props.tenderFileIds?.length ? props.tenderFileIds : [props.tenderFileId]
    const allRequirements: Requirement[] = []

    // 并行加载所有文件的条款（历史版本查看只作用于主文件，其余文件仍取当前版本）
    const promises = fileIds.map(id => {
      const params: { is_active: boolean; extraction_run_id?: number } = { is_active: true }
      if (isHistoryView.value && id === props.tenderFileId) {
        params.extraction_run_id = selectedRunId.value
      }
      return listRequirements(id, params)
        .then(res => getSafeRequirementList(res))
        .catch(() => [] as Requirement[])
    })

    const results = await Promise.all(promises)
    for (const reqs of results) {
      allRequirements.push(...reqs)
    }

    requirements.value = allRequirements
  } catch (err: any) {
    console.error('加载条款列表失败:', err)
    ElMessage.error(err.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

// 检查是否有进行中的任务
async function checkCurrentTask() {
  try {
    const res = await getCurrentTask({
      related_object_type: 'TenderFile',
      related_object_id: props.tenderFileId,
      task_type: 'requirement_extraction_v2',
    })
    currentTaskId.value = res.data?.id || null
    currentTaskKind.value = 'extract'
  } catch (err) {
    console.error('检查当前任务失败:', err)
  }
}

// 拉取标段最近一次去重运行，更新「条款去重」按钮完成态
async function loadDedupStatus() {
  if (!props.lotId) {
    dedupCompleted.value = false
    return
  }
  try {
    const res = await getLatestDedupRun(props.lotId)
    dedupCompleted.value = res.data?.result?.status === 'success'
  } catch (err) {
    console.error('获取去重状态失败:', err)
  }
}

// 加载主文件的抽取版本列表
async function loadExtractionRuns() {
  try {
    const res = await listExtractionRuns(props.tenderFileId)
    extractionRuns.value = res.data?.results || []
    // 选中的版本可能已被覆盖删除，兜底回到当前版本
    if (selectedRunId.value !== 0 && !extractionRuns.value.some(r => r.id === selectedRunId.value)) {
      selectedRunId.value = 0
    }
  } catch (err) {
    console.error('加载抽取版本列表失败:', err)
    extractionRuns.value = []
  }
}

// 版本下拉选项文案
function formatRunLabel(run: ExtractionRun): string {
  const time = run.created_at ? run.created_at.slice(0, 16).replace('T', ' ') : ''
  const active = run.is_active ? '（当前）' : ''
  return `#${run.id} · ${time} · ${run.total_count} 条${active}`
}

// 切换查看版本
function handleRunChange() {
  loadRequirements()
}

// 将历史版本设为当前版本
async function handleSetActive() {
  if (!selectedRunId.value) return
  activateLoading.value = true
  try {
    await activateExtractionRun(selectedRunId.value)
    ElMessage.success('已切换为当前版本')
    selectedRunId.value = 0
    await loadExtractionRuns()
    loadRequirements()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '切换版本失败')
  } finally {
    activateLoading.value = false
  }
}

// 切换分类
function handleCategorySelect(category: string) {
  activeCategory.value = category
}

// 触发条款抽取
async function handleExtract(payload: ExtractPayload) {
  if (!payload.modelConfigId || !payload.promptVersionId) {
    ElMessage.error('请选择模型和提示词版本')
    return
  }
  const types = payload.extractionTypes?.length
    ? payload.extractionTypes
    : ['scoring', 'mandatory', 'qualification', 'commercial', 'technical', 'submission']

  // 记录最近一次使用的模型/提示词，供侧栏单提复用
  lastModelConfigId.value = payload.modelConfigId
  lastPromptVersionId.value = payload.promptVersionId

  extractLoading.value = true
  // 新一轮抽取会触发后端自动重新去重，先复位完成态
  dedupCompleted.value = false
  try {
    const res = await extractRequirements(props.tenderFileId, {
      extraction_types: types,
      overwrite: payload.force,
      model_config_id: payload.modelConfigId,
      prompt_version_id: payload.promptVersionId,
    })
    if (res.data?.task_id) {
      currentTaskId.value = res.data.task_id
      currentTaskKind.value = 'extract'
    }
    ElMessage.success('条款抽取任务已创建')
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '创建任务失败')
  } finally {
    extractLoading.value = false
  }
}

// 侧栏单提：只提取当前分类对应场景
async function handleExtractSingle(category: string) {
  const extractionType = DISPLAY_TO_EXTRACTION[category]
  if (!extractionType) {
    ElMessage.error(`未知分类: ${category}`)
    return
  }
  // 复用最近一次抽取的模型/提示词；若从未抽取过则为 null，后端自动用默认模型 + 按场景查找 published 版本
  extractLoading.value = true
  try {
    const res = await extractRequirements(props.tenderFileId, {
      extraction_types: [extractionType],
      overwrite: false,
      model_config_id: lastModelConfigId.value,
      prompt_version_id: lastPromptVersionId.value,
    })
    if (res.data?.task_id) {
      currentTaskId.value = res.data.task_id
      currentTaskKind.value = 'extract'
    }
    ElMessage.success(`已创建「${currentCategoryLabel.value}」单项抽取任务`)
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '创建任务失败')
  } finally {
    extractLoading.value = false
  }
}

// 触发标段级条款去重
async function handleDedup() {
  if (!props.lotId) {
    ElMessage.warning('当前文件未关联标段，无法执行标段级去重')
    return
  }
  if (!isMultiFile.value) {
    ElMessage.info('当前标段仅有一份文件，去重主要面向多文件标段')
  }
  dedupLoading.value = true
  try {
    const res = await deduplicateLot(props.lotId)
    if (res.data?.task_id) {
      currentTaskId.value = res.data.task_id
      currentTaskKind.value = 'dedup'
    }
    ElMessage.success('条款去重任务已创建')
  } catch (err: any) {
    if (err.response?.status === 409) {
      ElMessage.warning('已有去重任务进行中，请等待完成后再试')
    } else {
      ElMessage.error(err.response?.data?.message || '创建去重任务失败')
    }
  } finally {
    dedupLoading.value = false
  }
}

// 查看某条款已合并的重复条目
async function handleShowDuplicates(requirement: Requirement) {
  showDuplicatesDrawer.value = true
  duplicatesLoading.value = true
  duplicatesFor.value = requirement
  duplicates.value = []
  try {
    const res = await listRequirementDuplicates(requirement.id)
    duplicates.value = normalizeList<RequirementDuplicate>(res.data)
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '加载重复条目失败')
  } finally {
    duplicatesLoading.value = false
  }
}

// 任务完成回调
async function handleTaskCompleted(result: Record<string, unknown>) {
  if (currentTaskKind.value === 'dedup') {
    currentTaskKind.value = 'extract'
    dedupCompleted.value = true
    ElMessage.success('去重完成')
    loadRequirements()
    return
  }
  ElMessage.success(`抽取完成，已创建新版本，共 ${result.total_count || 0} 条条款`)
  // 重新抽取生成新版本后回到当前版本视图
  selectedRunId.value = 0
  loadExtractionRuns()
  await loadRequirements()
  // 后端可能在抽取完成后自动触发去重：若有进行中的去重任务则接管进度展示
  await adoptAutoDedupTask()
}

// 抽取完成后接管后端自动发起的去重任务（复用 TaskProgress 展示去重进度）
async function adoptAutoDedupTask() {
  if (!props.lotId) return
  try {
    const res = await getLatestDedupRun(props.lotId)
    const run = res.data?.result
    if (run && (run.status === 'pending' || run.status === 'running') && run.async_task_id) {
      currentTaskId.value = run.async_task_id
      currentTaskKind.value = 'dedup'
    } else {
      dedupCompleted.value = run?.status === 'success'
    }
  } catch (err) {
    console.error('获取自动去重任务失败:', err)
  }
}

// 任务失败回调
function handleTaskFailed(error: string) {
  const prefix = currentTaskKind.value === 'dedup' ? '去重失败' : '抽取失败'
  currentTaskKind.value = 'extract'
  ElMessage.error(`${prefix}: ${error}`)
}

// 行点击（展开图标点击只展开不打开详情）
function handleRowClick(requirement: Requirement, _column: unknown, event: Event) {
  const target = event.target as HTMLElement
  if (target.closest('.el-table__expand-icon')) return
  handleView(requirement)
}

// 查看详情
async function handleView(requirement: Requirement) {
  showDetailDrawer.value = true
  detailLoading.value = true
  try {
    const res = await getRequirement(requirement.id)
    selectedRequirement.value = res.data
  } catch (err: any) {
    ElMessage.error('加载详情失败')
    showDetailDrawer.value = false
  } finally {
    detailLoading.value = false
  }
}

// 编辑
function handleEdit(requirement: Requirement) {
  selectedRequirement.value = requirement as RequirementDetail
  showEditDialog.value = true
}

// 编辑保存后刷新
function handleSaved() {
  loadRequirements()
}

// 评分分值（score_info 兼容数值或 {score: n} 结构）
function getScore(requirement: Requirement): number | null {
  const info = requirement.score_info
  if (info == null) return null
  if (typeof info === 'number') return info
  const score = (info as Record<string, unknown>).score
  return typeof score === 'number' ? score : null
}

// 分值状态（3.0：identified/calculated/upper_limit/formula/ambiguous/not_found/not_applicable）
function getScoreStatus(requirement: Requirement): string | null {
  const info = requirement.score_info
  if (info == null || typeof info === 'number') return null
  const status = (info as Record<string, unknown>).score_status
  return typeof status === 'string' ? status : null
}

// 一致性检查提示（大类分值与细项合计不一致时后端只标记不覆盖）
function getConsistencyNote(requirement: Requirement): string | null {
  const info = requirement.score_info
  if (info == null || typeof info === 'number') return null
  const note = (info as Record<string, unknown>).consistency_note
  return typeof note === 'string' ? note : null
}

// 高风险条款行高亮，重要信息一眼可见
function rowClassName({ row }: { row: Requirement }): string {
  if (row.risk_level === 'high' || row.mandatory_level === 'mandatory') {
    return 'is-critical'
  }
  return ''
}

// 监听 tenderFileId 或 tenderFileIds 变化
watch(
  () => [props.tenderFileId, props.tenderFileIds],
  () => {
    if (props.tenderFileId || props.tenderFileIds?.length) {
      selectedRunId.value = 0
      loadRequirements()
      loadExtractionRuns()
      checkCurrentTask()
      loadDedupStatus()
    } else {
      requirements.value = []
      extractionRuns.value = []
      selectedRunId.value = 0
      dedupCompleted.value = false
    }
  },
  { immediate: true, deep: true }
)

onMounted(() => {
  if (props.tenderFileId) {
    loadRequirements()
    loadExtractionRuns()
    checkCurrentTask()
    loadDedupStatus()
  }
})
</script>

<style scoped>
.requirement-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.version-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dedup-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dedup-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.merged-tag {
  margin-left: 6px;
  cursor: pointer;
  vertical-align: 1px;
}

/* 已合并重复条目抽屉 */
.duplicates-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.duplicates-kept {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.duplicate-item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px 12px;
}

.duplicate-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.duplicate-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.duplicate-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.duplicate-content {
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
  white-space: pre-wrap;
}

.version-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.requirement-layout {
  display: flex;
  min-height: 500px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  overflow: hidden;
}

.requirement-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.category-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.category-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.category-header .count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.requirement-no {
  font-family: monospace;
  font-size: 12px;
}

.requirement-title {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.requirement-content-text {
  font-size: 12px;
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.score-text {
  font-size: 14px;
  font-weight: 700;
  color: var(--el-color-primary);
}

.source-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.page-text {
  font-size: 11px;
  color: var(--el-color-primary);
  margin-left: 4px;
}

.muted-text {
  color: var(--el-text-color-placeholder);
}

.warn-icon {
  color: var(--el-color-warning);
  vertical-align: -2px;
  margin-left: 2px;
  cursor: help;
}

.score-pending {
  color: var(--el-color-warning);
  font-size: 12px;
  cursor: help;
}

/* 细项要点展开行 */
.detail-points-panel {
  padding: 8px 24px;
}

.detail-point-item {
  padding: 8px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}

.detail-point-item:last-child {
  border-bottom: none;
}

.detail-point-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.detail-point-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.detail-point-score {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-primary);
  margin-left: 4px;
}

.detail-point-req {
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
  white-space: pre-wrap;
}

.detail-point-basis {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.detail-point-basis .basis-label {
  color: var(--el-color-success);
  font-weight: 500;
}

.detail-point-evidence {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-radius: 4px;
  padding: 4px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.detail-points-empty {
  padding: 12px 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
}

/* 强制/高风险条款行高亮 */
.requirement-content :deep(.is-critical) {
  background: var(--el-color-danger-light-9);
}

.requirement-content :deep(.is-critical:hover > td) {
  background: var(--el-color-danger-light-8) !important;
}

.requirement-content :deep(.el-table__row) {
  cursor: pointer;
}
</style>