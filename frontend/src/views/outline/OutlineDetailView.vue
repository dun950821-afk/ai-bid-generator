<!-- frontend/src/views/outline/OutlineDetailView.vue -->
<template>
  <div class="outline-workspace" v-loading="pageLoading">
    <!-- 顶部工作台栏（紧凑设计） -->
    <header class="workspace-header">
      <div class="header-left">
        <el-button link class="back-btn" @click="router.back()">
          <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <h2 class="outline-title">{{ outline?.name || '大纲详情' }}</h2>
        <el-tag v-if="outline" :type="getStatusType(outline.status)" size="small" effect="plain">
          {{ outline.status_display }}
        </el-tag>
        <!-- 目录校验（原审核状态标签位置，显示逻辑与操作指引共用 ReviewStatusButton） -->
        <ReviewStatusButton
          :review-status="outline?.review_status ?? null"
          :loading="reviewing"
          @click="handleReviewButtonClick"
        />
      </div>
      <div class="header-right">
        <!-- 标书生成（操作指引）按钮 -->
        <el-button type="primary" size="small" @click="showGuide">
          <el-icon><Guide /></el-icon>
          标书生成
        </el-button>
        <!-- 批量生成进度条 -->
        <div v-if="batchProgress && ['pending', 'running', 'pause_requested', 'paused'].includes(batchProgress.status)" class="batch-progress-mini" @click="openBatchProgressDialog">
          <el-icon class="is-loading"><Loading /></el-icon>
          <span>{{ batchProgress.success + batchProgress.failed }}/{{ batchProgress.total }}</span>
        </div>
        <!-- 编辑 Word（无草稿时首次点击会提示先生成） -->
        <el-button size="small" @click="handleOpenWordEditor">
          <el-icon><EditPen /></el-icon>
          编辑 Word
        </el-button>
        <!-- 更多操作 -->
        <el-dropdown trigger="click" @command="handleMoreCommand">
          <el-button size="small">
            <el-icon><MoreFilled /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="prep">
                <el-icon><Checked /></el-icon>
                生成准备
                <el-tag v-if="prepDoneCount < 4" size="small" type="warning" class="prep-badge">{{ prepDoneCount }}/4</el-tag>
              </el-dropdown-item>
              <el-dropdown-item command="review" :disabled="reviewing">
                <el-icon><Stamp /></el-icon>
                {{ outline?.review_status ? '重新审核目录' : '目录审核' }}
              </el-dropdown-item>
              <el-dropdown-item command="batch_all">
                <el-icon><List /></el-icon>
                批量生成
              </el-dropdown-item>
              <el-dropdown-item command="build_word" :disabled="buildingDocx">
                <el-icon><Document /></el-icon>
                生成 Word
              </el-dropdown-item>
              <el-dropdown-item command="word_edit" :disabled="sections.length === 0" divided>
                <el-icon><EditPen /></el-icon>
                Word 编辑
              </el-dropdown-item>
              <el-dropdown-item command="download" :disabled="!latestBidDocument?.exists">
                <el-icon><Download /></el-icon>
                下载 Word
              </el-dropdown-item>
              <el-dropdown-item command="download_pdf" :disabled="!latestBidDocument?.exists">
                <el-icon><Document /></el-icon>
                下载 PDF
              </el-dropdown-item>
              <el-dropdown-item command="bid_check" :disabled="!latestBidDocument?.exists" divided>
                <el-icon><CircleCheck /></el-icon>
                废标检查
              </el-dropdown-item>
              <el-dropdown-item command="audit">
                <el-icon><Warning /></el-icon>
                一致性审计
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>

    <!-- 操作流程指引（首次使用引导） -->
    <WorkflowGuidePanel
      v-if="!guideHidden"
      :prep-done-count="prepDoneCount"
      :content-done="contentStats.done"
      :content-total="contentStats.total"
      :word-exists="!!latestBidDocument?.exists"
      :review-status="outline?.review_status ?? null"
      :review-loading="reviewing"
      :force-expand="guideForceExpand"
      @hide="hideGuide"
      @open-prep="prepChecklistVisible = true"
      @review="handleReviewButtonClick"
      @batch-generate="handleGenerateAll"
      @build-word="handleBuildDocx"
      @open-check="bidCheckVisible = true"
      @open-audit="consistencyAuditVisible = true"
      @download="handleDownloadWord"
    />

    <!-- 主体：左侧章节树 + 右侧工作区 -->
    <main class="workspace-body">
      <!-- 左侧章节树 -->
      <SectionTreePanel
        :sections="sections"
        :selected-id="selectedSection?.id ?? null"
        :loading="pageLoading"
        @select="handleNodeClick"
        @command="handleTreeCommand"
        @add="handleAddSection"
      />

      <!-- 右侧工作区 -->
      <section class="workspace-panel">
        <template v-if="selectedSection">
          <!-- 章节标题栏 -->
          <div class="section-header">
            <div class="section-title-area">
              <h3 class="section-main-title">{{ selectedSection.title }}</h3>
              <div class="section-meta">
                <el-tag
                  size="small"
                  :type="getContentType(selectedSection)"
                  effect="light"
                >
                  {{ getContentStatusText(selectedSection) }}
                </el-tag>
                <span v-if="sectionDetail?.word_count" class="meta-item">
                  {{ sectionDetail.word_count }} 字
                </span>
                <span class="meta-item matrix-status">
                  矩阵：{{ getMatrixStatusText(selectedSection.content_matrix_status) }}
                </span>
              </div>
            </div>
            <div class="section-actions">
              <el-button type="primary" size="small" @click="handleAnalyze">
                <el-icon><MagicStick /></el-icon>
                AI生成
              </el-button>
              <el-dropdown trigger="click" @command="handleSectionCommand">
                <el-button size="small">
                  <el-icon><MoreFilled /></el-icon>
                  更多
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="edit_matrix" v-if="selectedSection.content_matrix_status === 'generated' || selectedSection.content_matrix_status === 'edited'">
                      <el-icon><Edit /></el-icon>编辑内容责任矩阵
                    </el-dropdown-item>
                    <el-dropdown-item command="add_child">
                      <el-icon><Plus /></el-icon>添加子章节
                    </el-dropdown-item>
                    <el-dropdown-item command="versions" divided>
                      <el-icon><Clock /></el-icon>版本历史
                    </el-dropdown-item>
                    <el-dropdown-item command="delete">
                      <el-icon><Delete /></el-icon>删除章节
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>

          <!-- Tab 切换 -->
          <el-tabs v-model="activeTab" class="section-tabs">
            <el-tab-pane label="内容" name="content">
              <div class="tab-content content-panel">
                <SectionRichEditor
                  v-if="sectionDetail"
                  :key="sectionDetail.id"
                  v-model="sectionDetail.content"
                  :section-id="sectionDetail.id"
                  :outline-id="outlineId"
                  @saved="handleSectionContentSaved"
                  @dirty-change="contentDirty = $event"
                />
                <el-empty v-else description="请选择章节" :image-size="80" />
              </div>
            </el-tab-pane>

            <el-tab-pane label="AI生成" name="generate">
              <div class="tab-content generate-panel" v-loading="analyzing">
                <!-- AI 分析结果 -->
                <el-card shadow="never" class="analysis-card" v-if="analysisResult.keywords.length > 0">
                  <template #header>
                    <div class="card-header">
                      <span>AI 分析结果</span>
                      <el-button link size="small" @click="handleAnalyze" :loading="analyzing">
                        重新分析
                      </el-button>
                    </div>
                  </template>
                  <el-descriptions :column="1" border size="small">
                    <el-descriptions-item label="检索关键词">
                      <el-tag v-for="kw in analysisResult.keywords" :key="kw" size="small" class="keyword-tag">
                        {{ kw }}
                      </el-tag>
                    </el-descriptions-item>
                    <el-descriptions-item label="背景说明">
                      {{ analysisResult.background }}
                    </el-descriptions-item>
                  </el-descriptions>
                  <div class="suggested-prompt" v-if="analysisResult.suggested_prompt">
                    <div class="label">AI 建议提示：</div>
                    <div class="content">{{ analysisResult.suggested_prompt }}</div>
                  </div>
                </el-card>

                <!-- AI 提示词框 -->
                <el-card shadow="never" class="prompt-card">
                  <template #header>
                    <span>补充要求（可选）</span>
                  </template>
                  <el-input
                    v-model="userPrompt"
                    type="textarea"
                    :rows="4"
                    placeholder="请输入您的补充要求，AI 将根据这些要求生成章节内容..."
                  />
                </el-card>

                <!-- 操作按钮 -->
                <div class="generate-actions">
                  <el-button type="primary" @click="handleGenerate" :loading="generating" :disabled="analyzing">
                    <el-icon><MagicStick /></el-icon>
                    {{ generating ? '生成中...' : '开始生成' }}
                  </el-button>
                </div>
              </div>
            </el-tab-pane>

            <el-tab-pane label="版本记录" name="versions">
              <div class="tab-content versions-panel" v-loading="loadingVersions">
                <el-timeline v-if="versions.length > 0">
                  <el-timeline-item v-for="v in versions" :key="v.id" :timestamp="formatDate(v.created_at)" placement="top">
                    <el-card shadow="hover" class="version-card">
                      <div class="version-header">
                        <span class="version-no">V{{ v.version_no }}</span>
                        <el-tag size="small" effect="plain">{{ v.source_display }}</el-tag>
                        <span class="word-count">{{ v.word_count }} 字</span>
                      </div>
                      <div class="version-content" v-if="v.content">{{ truncate(v.content, 200) }}</div>
                      <el-button link type="primary" size="small" @click="handleRollback(v.version_no)">
                        恢复此版本
                      </el-button>
                    </el-card>
                  </el-timeline-item>
                </el-timeline>
                <el-empty v-else description="暂无版本记录" :image-size="80" />
              </div>
            </el-tab-pane>

            <el-tab-pane label="参考来源" name="references">
              <div class="tab-content references-panel" v-if="selectedSection">
                <el-tabs class="reference-tabs">
                  <el-tab-pane label="生成参考来源">
                    <SectionReferenceSources :section-id="selectedSection.id" />
                  </el-tab-pane>
                  <el-tab-pane label="手动检索材料">
                    <SectionManualRetrieval
                      :section-id="selectedSection.id"
                      :default-query="`${selectedSection.title} ${(selectedSection as any).content_matrix?.write_scope || ''}`"
                    />
                  </el-tab-pane>
                </el-tabs>
              </div>
              <el-empty v-else description="请选择章节" :image-size="80" />
            </el-tab-pane>
          </el-tabs>
        </template>

        <!-- 未选择章节 -->
        <div v-else class="empty-state">
          <el-empty>
            <template #description>
              <p>请从左侧选择一个章节开始编辑</p>
              <p class="empty-tip">第一次使用？按照上方「操作流程指引」从生成准备开始</p>
            </template>
          </el-empty>
        </div>
      </section>
    </main>

    <!-- 新增章节对话框 -->
    <el-dialog v-model="showAddDialog" title="新增章节" width="450px" destroy-on-close>
      <el-form :model="addForm" :rules="addRules" ref="addFormRef" label-width="80px">
        <el-form-item label="标题" prop="title">
          <el-input v-model="addForm.title" placeholder="请输入章节标题" autofocus />
        </el-form-item>
        <el-form-item label="父章节" v-if="parentSection">
          <el-input :model-value="parentSection.title" disabled />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="handleConfirmAdd" :loading="adding">确认</el-button>
      </template>
    </el-dialog>

    <!-- 矩阵编辑对话框（按需加载） -->
    <MatrixEditDialog
      v-if="showMatrixEditDialog"
      v-model:visible="showMatrixEditDialog"
      :section-id="editingSectionId"
      :section="selectedSection ? { id: selectedSection.id, title: selectedSection.title } : undefined"
      :all-sections="flattenSections(sections)"
      @saved="handleMatrixSaved"
    />

    <!-- 矩阵生成进度对话框（按需加载） -->
    <MatrixProgressDialog
      v-if="showMatrixProgressDialog"
      v-model:visible="showMatrixProgressDialog"
      :task-id="matrixTaskId"
      :outline-id="outlineId"
      @close="handleMatrixDialogClose"
      @completed="handleMatrixDialogClose"
    />

    <!-- 批量生成选项对话框（按需加载） -->
    <BatchGenerateOptionsDialog
      v-if="showBatchOptionsDialog"
      v-model:visible="showBatchOptionsDialog"
      :outline-id="outlineId"
      @started="handleBatchOptionsStarted"
    />

    <!-- 批量生成进度对话框（按需加载） -->
    <BatchProgressDialog
      v-if="showBatchProgressDialog"
      v-model:visible="showBatchProgressDialog"
      :task-id="batchTaskId"
      @close="handleBatchDialogClose"
      @completed="handleBatchDialogClose"
      @retry="handleBatchRetry"
    />

    <!-- 创建材料包对话框 -->
    <el-dialog v-model="showCreatePackageDialog" title="创建材料包" width="500px" destroy-on-close>
      <el-form :model="createPackageForm" label-width="100px">
        <el-form-item label="关联公司">
          <el-select v-model="createPackageForm.company_id" placeholder="选择公司" filterable style="width: 100%">
            <el-option v-for="c in availableCompanies" :key="c.id" :label="c.name" :value="c.id">
              <span>{{ c.name }}</span>
              <span style="color: #909399; font-size: 12px; margin-left: 8px;">{{ c.short_name }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="自动填充">
          <el-switch v-model="createPackageForm.auto_fill" />
          <span style="color: #909399; font-size: 12px; margin-left: 12px;">自动添加公司的现有材料</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreatePackageDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreatePackage" :loading="creatingPackage">创建</el-button>
      </template>
    </el-dialog>

    <!-- 知识库关联弹窗 -->
    <OutlineKbBindingDialog
      v-model:visible="kbDialogVisible"
      :outline-id="outlineId"
      :bound-kb-ids="kbBindings.map((b) => b.knowledge_base)"
      @bound="onKbBound"
    />

    <!-- 生成准备检查清单弹窗（需求4，按需加载） -->
    <el-dialog
      v-model="prepChecklistVisible"
      title="生成准备检查清单"
      width="560px"
      @open="refreshPrepChecklist"
    >
      <GenerationPrepChecklist
        v-if="prepChecklistVisible"
        ref="prepChecklistRef"
        :outline-id="outlineId"
        :matrix-status="matrixStatus"
        :matrix-generating="generatingMatrix"
        @open-global-facts="openGlobalFacts"
        @open-material-package="openMaterialPackage"
        @open-kb-binding="openKbBinding"
        @generate-matrix="handleGenerateMatrix"
        @start-generate="handleGenerateAll"
        @close="prepChecklistVisible = false"
      />
      <template #footer>
        <el-button @click="prepChecklistVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 全局事实变量抽屉（按需加载） -->
    <el-drawer
      v-model="globalFactsVisible"
      title="全局事实变量"
      direction="rtl"
      size="520px"
    >
      <GlobalFactsPanel v-if="globalFactsVisible" :outline-id="outlineId" @extracted="refreshPrepStatus" />
    </el-drawer>

    <!-- 废标检查抽屉（按需加载） -->
    <el-drawer
      v-model="bidCheckVisible"
      title="废标检查"
      direction="rtl"
      size="640px"
    >
      <CheckReport
        v-if="bidCheckVisible && latestBidDocument?.exists && latestBidDocument.document_id"
        :outline-id="outlineId"
        :bid-document-id="latestBidDocument.document_id"
      />
    </el-drawer>

    <!-- 一致性审计抽屉（按需加载） -->
    <el-drawer
      v-model="consistencyAuditVisible"
      title="一致性审计"
      direction="rtl"
      size="640px"
    >
      <ConsistencyAuditPanel v-if="consistencyAuditVisible" :outline-id="outlineId" />
    </el-drawer>

    <!-- 目录审核建议对话框（按需加载） -->
    <OutlineReviewDialog
      v-if="reviewDialogVisible"
      v-model="reviewDialogVisible"
      :outline="outline"
      @changed="handleReviewChanged"
      @applied="handleReviewApplied"
    />

    <!-- Word 模板选择对话框 -->
    <TemplateSelectDialog
      v-model="templateDialogVisible"
      :generating="buildingDocx"
      @confirm="handleTemplateSelected"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, defineAsyncComponent } from 'vue'
import { logError } from '@/utils/logger'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  Plus,
  MagicStick,
  Download,
  MoreFilled,
  Clock,
  Delete,
  Loading,
  Edit,
  List,
  EditPen,
  CircleCheck,
  Checked,
  Warning,
  Stamp,
  Document,
  Guide,
} from '@element-plus/icons-vue'
import {
  getOutline,
  getOutlineSections,
  getSection,
  analyzeSection,
  generateSection,
  deleteSection,
  createSection,
  getSectionVersions,
  rollbackSection,
  getMatrixStatus,
  generateMatrix,
  getActiveBatchTask,
  subscribeGenerationTaskProgress,
  reviewOutline,
  type OutlineDetail,
  type SectionTreeItem,
  type Section,
  type SectionVersion,
  type AnalysisResult,
  type MatrixStatus,
  type BatchGenerationProgress,
} from '@/api/outline'
import {
  buildDocx,
  getLatestBidDocument,
  downloadBidDocument,
  exportBidDocumentPdf,
  type LatestBidDocument,
} from '@/api/bidDocument'
import {
  getOutlineMaterialPackage,
  createMaterialPackage,
  getCompanyList,
  type BidMaterialPackage,
} from '@/api/enterprise'
import {
  listOutlineKbBindings,
  type OutlineKbBinding,
} from '@/api/outlineKb'
import { listGlobalFacts } from '@/api/globalFact'
import { http } from '@/api/http'
import type { FormInstance, FormRules } from 'element-plus'
import SectionRichEditor from './components/SectionRichEditor.vue'
import SectionTreePanel from './components/SectionTreePanel.vue'
import WorkflowGuidePanel from './components/WorkflowGuidePanel.vue'
import OutlineKbBindingDialog from '@/components/outline/OutlineKbBindingDialog.vue'
import ReviewStatusButton from '@/components/outline/ReviewStatusButton.vue'
import SectionReferenceSources from '@/components/outline/SectionReferenceSources.vue'
import SectionManualRetrieval from '@/components/outline/SectionManualRetrieval.vue'

// 重型弹窗/抽屉按需加载，减少首屏加载体积
const MatrixEditDialog = defineAsyncComponent(() => import('@/components/outline/MatrixEditDialog.vue'))
const MatrixProgressDialog = defineAsyncComponent(() => import('@/components/outline/MatrixProgressDialog.vue'))
const BatchProgressDialog = defineAsyncComponent(() => import('@/components/outline/BatchProgressDialog.vue'))
const BatchGenerateOptionsDialog = defineAsyncComponent(() => import('@/components/outline/BatchGenerateOptionsDialog.vue'))
const GlobalFactsPanel = defineAsyncComponent(() => import('./components/GlobalFactsPanel.vue'))
const CheckReport = defineAsyncComponent(() => import('@/views/bid/CheckReport.vue'))
const GenerationPrepChecklist = defineAsyncComponent(() => import('./components/GenerationPrepChecklist.vue'))
const ConsistencyAuditPanel = defineAsyncComponent(() => import('./components/ConsistencyAuditPanel.vue'))
const TemplateSelectDialog = defineAsyncComponent(() => import('@/components/bid-template/TemplateSelectDialog.vue'))
const OutlineReviewDialog = defineAsyncComponent(() => import('./components/OutlineReviewDialog.vue'))

const route = useRoute()
const router = useRouter()

const outlineId = computed(() => Number(route.params.outlineId))

// 页面状态
const pageLoading = ref(false)
const generating = ref(false)
const analyzing = ref(false)
const loadingVersions = ref(false)
const adding = ref(false)
const buildingDocx = ref(false)
const templateDialogVisible = ref(false)
const contentDirty = ref(false)

// 批量生成进度
const batchProgress = ref<BatchGenerationProgress | null>(null)
const batchEventSource = ref<EventSource | null>(null)
const showBatchProgressDialog = ref(false)
const showBatchOptionsDialog = ref(false)
const batchTaskId = ref(0)

// 数据
const outline = ref<OutlineDetail | null>(null)
const sections = ref<SectionTreeItem[]>([])
const selectedSection = ref<SectionTreeItem | null>(null)
const sectionDetail = ref<Section | null>(null)
const versions = ref<SectionVersion[]>([])
const analysisResult = ref<AnalysisResult>({
  keywords: [],
  knowledge_types: [],
  requirement_types: [],
  background: '',
  suggested_prompt: '',
})

// Word 文档状态
const latestBidDocument = ref<LatestBidDocument>({ exists: false })

// 矩阵状态
const matrixStatus = ref<MatrixStatus>({
  total: 0,
  pending: 0,
  generating: 0,
  generated: 0,
  edited: 0,
  failed: 0,
  is_generating: false,
  current_task_id: null,
})
const showMatrixProgressDialog = ref(false)
const matrixTaskId = ref(0)
const generatingMatrix = ref(false)
const showMatrixEditDialog = ref(false)
const editingSectionId = ref(0)

// 材料包状态
const materialPackage = ref<BidMaterialPackage | null>(null)

// 知识库关联
const kbBindings = ref<OutlineKbBinding[]>([])
const kbDialogVisible = ref(false)
const globalFactsVisible = ref(false)
const reviewDialogVisible = ref(false)
const bidCheckVisible = ref(false)
const consistencyAuditVisible = ref(false)
const prepChecklistVisible = ref(false)
const prepChecklistRef = ref<{ refresh?: () => Promise<number | undefined> } | null>(null)
const prepDoneCount = ref(0)

// ===== 操作流程指引 =====
const GUIDE_HIDDEN_KEY = 'outline_workflow_guide_hidden'
const guideHidden = ref(localStorage.getItem(GUIDE_HIDDEN_KEY) === '1')
const guideForceExpand = ref(false)

function hideGuide() {
  guideHidden.value = true
  localStorage.setItem(GUIDE_HIDDEN_KEY, '1')
}

function showGuide() {
  guideHidden.value = false
  localStorage.removeItem(GUIDE_HIDDEN_KEY)
  // 触发强制展开
  guideForceExpand.value = true
  // 重置以便下次触发
  setTimeout(() => {
    guideForceExpand.value = false
  }, 100)
}

// 章节内容生成进度，用于指引面板第 2 步（与批量生成口径一致：父章节也会生成，需统计全部章节）
const contentStats = computed(() => {
  let total = 0
  let done = 0
  const walk = (items: SectionTreeItem[]) => {
    for (const item of items) {
      total++
      if (item.content_generation_status === 'success') done++
      if (item.children && item.children.length > 0) {
        walk(item.children)
      }
    }
  }
  walk(sections.value)
  return { total, done }
})

/** 刷新生成准备状态：弹窗打开时复用弹窗内部加载结果，否则走 loadPrepStatus。
 * 创建材料包/绑定知识库/全局事实/矩阵生成成功后都应调用，同步弹窗与工具栏徽标。
 */
async function refreshPrepStatus() {
  if (prepChecklistVisible.value && prepChecklistRef.value) {
    const done = await prepChecklistRef.value.refresh?.()
    prepDoneCount.value = done ?? prepDoneCount.value
  } else {
    await loadPrepStatus()
  }
}

function refreshPrepChecklist() {
  setTimeout(refreshPrepStatus, 0)
}

/** 页面加载/准备项变化时实时查询 4 项准备状态，更新工具栏徽标。
 * 注意必须全部走实时接口：此前复用 materialPackage/kbBindings/matrixStatus 等
 * 挂载期缓存，导致用户在弹窗里完成准备后校验结果不更新（一直显示未准备完成）。
 */
async function loadPrepStatus() {
  if (!outlineId.value) return
  let count = 0
  const [factRes, pkgRes, kbRes, matrixRes] = await Promise.all([
    listGlobalFacts(outlineId.value).catch(() => null),
    getOutlineMaterialPackage(outlineId.value).catch(() => null),
    http.get<any[]>(`/api/outlines/${outlineId.value}/knowledge-bases/`).catch(() => null),
    getMatrixStatus(outlineId.value).catch(() => null),
  ])
  // 全局事实
  if ((factRes?.data?.count || 0) > 0) count++
  // 材料包（同步缓存供他处复用）
  materialPackage.value = pkgRes?.data || null
  if (pkgRes?.data) count++
  // 知识库（接口直接返回数组；同步缓存）
  const kbData: any = kbRes?.data
  const kbList = Array.isArray(kbData) ? kbData : (kbData?.results || [])
  kbBindings.value = kbList
  if (kbList.length > 0) count++
  // 矩阵（同步缓存）
  if (matrixRes?.data) matrixStatus.value = matrixRes.data
  if ((matrixRes?.data?.generated || 0) > 0) count++
  prepDoneCount.value = count
}

function openGlobalFacts() {
  globalFactsVisible.value = true
}

function openMaterialPackage() {
  // 有材料包：跳企业材料管理页查看/修改；无：打开创建弹窗
  if (materialPackage.value) {
    router.push('/enterprise/materials')
  } else {
    openCreatePackageDialog()
  }
}

function openKbBinding() {
  openKbBindingDialog()
}

// ===== 目录审核（对话框逻辑在 OutlineReviewDialog 中） =====
const reviewing = ref(false)

// 已校验 → 显示审核详情；未校验 → 触发校验（校验后自动打开详情）
function handleReviewButtonClick() {
  if (outline.value?.review_status) {
    reviewDialogVisible.value = true
  } else {
    handleReviewOutline(true)
  }
}

async function handleReviewOutline(openDialog = true) {
  if (!outline.value) return
  reviewing.value = true
  ElMessage.info('目录校验进行中，预计需要 1-2 分钟，请耐心等待')
  try {
    const res = await reviewOutline(outline.value.id)
    outline.value.review_status = res.data.passed ? 'passed' : 'failed'
    outline.value.review_suggestions = res.data.suggestions
    if (res.data.passed) {
      ElMessage.success('目录校验通过')
    } else {
      ElMessage.info(`校验完成，存在 ${res.data.suggestions?.length || 0} 条修改建议`)
    }
    if (openDialog) reviewDialogVisible.value = true
  } catch (e: any) {
    logError(e, { view: 'OutlineDetailView', action: 'reviewOutline' })
    const detail = e?.response?.data?.detail
    ElMessage.error(detail || '目录校验失败，请稍后重试')
  } finally {
    reviewing.value = false
  }
}

function handleReviewChanged(patch: Partial<OutlineDetail>) {
  if (outline.value) {
    Object.assign(outline.value, patch)
  }
}

async function handleReviewApplied() {
  reviewDialogVisible.value = false
  await loadPageData()
}

async function loadKbBindings() {
  try {
    const res = await listOutlineKbBindings(outlineId.value)
    kbBindings.value = (res.data as unknown as OutlineKbBinding[]) || []
  } catch (e) {
    logError('加载知识库绑定失败', e)
  }
}

/** 知识库绑定成功后：重新加载绑定列表并同步生成准备检查清单 */
async function onKbBound() {
  await loadKbBindings()
  await refreshPrepStatus()
}

function openKbBindingDialog() {
  kbDialogVisible.value = true
}

const showCreatePackageDialog = ref(false)
const creatingPackage = ref(false)
const createPackageForm = ref({ company_id: null as number | null, auto_fill: true })
const availableCompanies = ref<Array<{ id: number; name: string; short_name: string }>>([])

// UI 状态
const activeTab = ref('content')
const userPrompt = ref('')

// 新增章节
const showAddDialog = ref(false)
const addFormRef = ref<FormInstance>()
const addForm = ref({ title: '' })
const addRules: FormRules = {
  title: [{ required: true, message: '请输入章节标题', trigger: 'blur' }],
}
const parentSection = ref<SectionTreeItem | null>(null)

// 扁平化章节列表
function flattenSections(items: SectionTreeItem[]): Array<{ id: number; section_number: string; title: string }> {
  const result: Array<{ id: number; section_number: string; title: string }> = []
  const flatten = (nodes: SectionTreeItem[], prefix = '') => {
    nodes.forEach((node, index) => {
      const sectionNumber = prefix ? `${prefix}.${index + 1}` : `${index + 1}`
      result.push({ id: node.id, section_number: sectionNumber, title: node.title })
      if (node.children && node.children.length > 0) {
        flatten(node.children, sectionNumber)
      }
    })
  }
  flatten(items)
  return result
}

// 章节树命令处理（来自 SectionTreePanel）
function handleTreeCommand(command: string, data: SectionTreeItem) {
  switch (command) {
    case 'generate':
      handleNodeClick(data)
      activeTab.value = 'generate'
      handleAnalyze()
      break
    case 'edit_matrix':
      handleEditMatrix(data.id)
      break
    case 'add_child':
      handleAddChild(data)
      break
    case 'delete':
      handleDeleteSectionFromTree(data)
      break
  }
}

// 顶部「更多操作」下拉菜单
function handleMoreCommand(command: string) {
  switch (command) {
    case 'prep':
      prepChecklistVisible.value = true
      break
    case 'review':
      handleReviewOutline()
      break
    case 'batch_all':
      handleGenerateAll()
      break
    case 'build_word':
      handleBuildDocx()
      break
    case 'word_edit':
      handleOpenWordEditor()
      break
    case 'download':
      handleDownloadWord()
      break
    case 'download_pdf':
      handleDownloadPdf()
      break
    case 'bid_check':
      bidCheckVisible.value = true
      break
    case 'audit':
      consistencyAuditVisible.value = true
      break
  }
}

onMounted(() => {
  loadPageData()
})

onBeforeUnmount(() => {
  stopBatchSSE()
  clearAllPollTimers()
})

async function loadPageData() {
  pageLoading.value = true
  try {
    const [outlineRes, sectionsRes] = await Promise.all([
      getOutline(outlineId.value),
      getOutlineSections(outlineId.value),
    ])
    outline.value = outlineRes.data
    sections.value = buildTree(sectionsRes.data)
    await loadMatrixStatus()
    await fetchLatestBidDocument()
    // 检查是否有正在运行的批量生成任务
    await checkActiveBatchTask()
    // 检查是否有正在运行的矩阵生成任务
    await checkActiveMatrixTask()
    // 加载材料包状态
    await loadMaterialPackage()
    // 加载知识库绑定
    await loadKbBindings()
    // 更新工具栏准备清单徽标
    await loadPrepStatus()
    if (sections.value.length > 0) {
      handleNodeClick(sections.value[0])
    }
  } catch {
    ElMessage.error('加载失败')
    router.back()
  } finally {
    pageLoading.value = false
  }
}

// 加载材料包
async function loadMaterialPackage() {
  try {
    const res = await getOutlineMaterialPackage(outlineId.value)
    materialPackage.value = res.data
  } catch {
    // 材料包不存在，忽略
    materialPackage.value = null
  }
}

// 检查活跃的批量生成任务
async function checkActiveBatchTask() {
  try {
    const res = await getActiveBatchTask(outlineId.value)
    if (res.data && ['pending', 'running', 'pause_requested', 'paused', 'cancel_requested'].includes(res.data.status)) {
      batchProgress.value = res.data
      batchTaskId.value = res.data.task_id
      // 使用 SSE 监听进度
      startBatchSSE(res.data.task_id)
    } else {
      // 没有活跃任务时清除进度状态
      batchProgress.value = null
      batchTaskId.value = 0
    }
  } catch (err) {
    logError('检查批量任务状态失败:', err)
    // 出错时也清除进度状态
    batchProgress.value = null
  }
}

// 打开批量生成进度对话框
function openBatchProgressDialog() {
  if (batchProgress.value) {
    batchTaskId.value = batchProgress.value.task_id
    showBatchProgressDialog.value = true
  }
}

// 批量生成对话框关闭处理
async function handleBatchDialogClose() {
  await loadSections()
  await checkActiveBatchTask()
}

// 批量生成重试处理
function handleBatchRetry(_retryCount: number) {
  // 重试会启动新任务，需要重新检查活跃任务
  checkActiveBatchTask()
}

// 开始 SSE 监听批量生成进度
function startBatchSSE(taskId: number) {
  if (batchEventSource.value) {
    batchEventSource.value.close()
  }

  batchEventSource.value = subscribeGenerationTaskProgress(taskId, {
    onMessage: async (data) => {
      batchProgress.value = {
        task_id: data.task_id,
        status: data.status,
        total: data.total,
        success: data.success,
        failed: data.failed,
        skipped: data.skipped,
        running: data.running,
        pending: data.pending,
        cancelled: batchProgress.value?.cancelled || 0,
        progress_percent: data.progress_percent,
        current_section: data.current_section,
        sections: [],
        error_message: data.error_message,
        started_at: null,
        finished_at: data.finished_at,
        paused_at_index: batchProgress.value?.paused_at_index || 0,
      }

      // 刷新章节列表以更新状态点颜色
      await loadSections()

      // 刷新当前章节详情
      if (selectedSection.value) {
        await loadSectionDetail(selectedSection.value.id)
      }
    },
    onDone: async (data) => {
      // 先保存最终进度状态用于显示消息
      const finalStatus = data.status
      const finalSuccess = data.success
      const finalFailed = data.failed

      stopBatchSSE()

      // 清除进度状态，让按钮重新显示
      batchProgress.value = null

      // 刷新最终状态
      await loadSections()
      if (selectedSection.value) {
        await loadSectionDetail(selectedSection.value.id)
      }

      if (data.force_stopped) {
        ElMessage.warning('任务已被强制结束，可重新发起批量生成')
      } else if (finalStatus === 'success' || finalStatus === 'completed') {
        ElMessage.success(`批量生成完成：成功 ${finalSuccess} 个，失败 ${finalFailed} 个`)
      } else if (finalStatus === 'failed') {
        ElMessage.error('批量生成任务失败')
      } else if (finalStatus === 'cancelled') {
        ElMessage.warning('批量生成任务已取消')
      }
    },
    onError: (error) => {
      logError('SSE 连接错误:', error)
      stopBatchSSE()
      // 清除进度状态，否则迷你进度条永远停在转圈状态
      batchProgress.value = null
      ElMessage.error('进度连接中断，请刷新页面查看状态')
    },
    onTimeout: () => {
      stopBatchSSE()
      ElMessage.info('进度监听超时，任务仍在后台运行')
    },
  })
}

// 停止 SSE 监听
function stopBatchSSE() {
  if (batchEventSource.value) {
    batchEventSource.value.close()
    batchEventSource.value = null
  }
}

async function loadMatrixStatus() {
  try {
    const res = await getMatrixStatus(outlineId.value)
    matrixStatus.value = res.data
  } catch (err) {
    logError('加载矩阵状态失败:', err)
  }
}

// 检查活跃的矩阵生成任务
async function checkActiveMatrixTask() {
  try {
    const res = await getMatrixStatus(outlineId.value)
    matrixStatus.value = res.data
    // 如果有正在进行的任务，显示进度对话框
    if (res.data.is_generating && res.data.current_task_id) {
      matrixTaskId.value = res.data.current_task_id
      showMatrixProgressDialog.value = true
    }
  } catch (err) {
    logError('检查矩阵任务状态失败:', err)
  }
}

// 矩阵对话框关闭处理
async function handleMatrixDialogClose() {
  await loadMatrixStatus()
  await loadSections()
}

async function handleGenerateMatrix() {
  // 未关联知识库时弹引导（材料包单独提醒，不作为不弹引导的借口）
  if (kbBindings.value.filter((b) => b.is_active).length === 0) {
    try {
      await ElMessageBox.confirm(
        '当前大纲未关联知识库。矩阵生成将仅基于招标条款，可能写出公司无法支撑的章节。\n是否现在关联知识库？',
        '关联知识库',
        { confirmButtonText: '去关联', cancelButtonText: '继续生成', type: 'warning' }
      )
      openKbBindingDialog()
      return
    } catch {
      // 用户选「继续生成」→ 走原流程
    }
  }
  generatingMatrix.value = true
  try {
    const res = await generateMatrix(outlineId.value, { force: false })
    matrixTaskId.value = res.data.task_id
    showMatrixProgressDialog.value = true
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string; error?: string } } }
    ElMessage.error(error.response?.data?.error || error.response?.data?.message || '启动矩阵生成失败')
  } finally {
    generatingMatrix.value = false
  }
}

function handleEditMatrix(sectionId: number) {
  editingSectionId.value = sectionId
  showMatrixEditDialog.value = true
}

function handleMatrixSaved() {
  loadMatrixStatus()
  loadSections()
}

function buildTree(items: SectionTreeItem[]): SectionTreeItem[] {
  const map = new Map<number, SectionTreeItem>()
  const roots: SectionTreeItem[] = []
  items.forEach(item => map.set(item.id, { ...item, children: [] }))
  items.forEach(item => {
    const node = map.get(item.id)!
    if (item.parent === null) {
      roots.push(node)
    } else {
      const parent = map.get(item.parent)
      if (parent) {
        parent.children = parent.children || []
        parent.children.push(node)
      }
    }
  })
  return roots
}

async function loadSections() {
  try {
    const res = await getOutlineSections(outlineId.value)
    sections.value = buildTree(res.data)
  } catch (err) {
    logError('加载章节失败:', err)
  }
}

async function loadSectionDetail(sectionId: number) {
  try {
    const res = await getSection(sectionId)
    sectionDetail.value = res.data
  } catch (err) {
    logError('加载章节详情失败:', err)
    sectionDetail.value = null
  }
}

async function handleNodeClick(data: SectionTreeItem) {
  // 检查是否有未保存的内容
  if (contentDirty.value) {
    try {
      await ElMessageBox.confirm(
        '当前章节有未保存的内容，是否保存？',
        '提示',
        {
          confirmButtonText: '保存',
          cancelButtonText: '不保存',
          distinguishCancelAndClose: true,
        }
      )
      // 用户选择保存 - 需要等待保存完成
      // 这里只能提示，因为编辑器组件内部处理保存
    } catch (result: unknown) {
      if (result === 'close') {
        return // 用户关闭对话框，不切换章节
      }
      // 用户选择不保存，继续切换
    }
    contentDirty.value = false
  }

  selectedSection.value = data
  activeTab.value = 'content'
  loadSectionDetail(data.id)
  analysisResult.value = { keywords: [], knowledge_types: [], requirement_types: [], background: '', suggested_prompt: '' }
  userPrompt.value = ''
}

async function handleGenerateAll() {
  // 已有进行中的批量任务：直接打开进度框，不再弹出重新生成选项
  if (batchProgress.value) {
    openBatchProgressDialog()
    return
  }
  // 强制校验生成准备：点击时实时查询 4 项状态，不用页面挂载期的缓存计数
  await loadPrepStatus()
  if (prepDoneCount.value < 4) {
    ElMessage.warning(`生成准备尚未全部完成（${prepDoneCount.value}/4），请先完成生成准备`)
    prepChecklistVisible.value = true
    return
  }
  showBatchOptionsDialog.value = true
}

// 批量生成任务启动后的处理
function handleBatchOptionsStarted(taskId: number) {
  batchTaskId.value = taskId
  showBatchProgressDialog.value = true

  // 设置初始进度
  batchProgress.value = {
    task_id: taskId,
    status: 'pending',
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    running: 0,
    pending: 0,
    cancelled: 0,
    progress_percent: 0,
    current_section: null,
    sections: [],
    error_message: '',
    started_at: null,
    finished_at: null,
    paused_at_index: 0,
  }

  // 使用 SSE 监听进度
  startBatchSSE(taskId)
}

// ========== Word 文档相关函数 ==========

async function fetchLatestBidDocument() {
  try {
    const res = await getLatestBidDocument(outlineId.value)
    latestBidDocument.value = res.data
  } catch (err) {
    logError('获取最新 Word 文档状态失败:', err)
  }
}

async function handleBuildDocx() {
  // 弹出模板选择对话框；确认后由 doBuildDocx 执行生成
  templateDialogVisible.value = true
}

function handleTemplateSelected(templateId: number | null, openEditor: boolean) {
  templateDialogVisible.value = false
  doBuildDocx(templateId ?? undefined).then((documentId) => {
    if (openEditor && documentId) {
      window.open(`/bid-documents/${documentId}/word-editor?refresh_toc=1`, '_blank')
    }
  })
}

async function doBuildDocx(templateId?: number): Promise<number | null> {
  buildingDocx.value = true
  try {
    const res = await buildDocx(outlineId.value, templateId)
    latestBidDocument.value = {
      exists: true,
      document_id: res.data.document_id,
      title: res.data.title,
      version: res.data.version,
      status: 'draft',
      updated_at: new Date().toISOString(),
    }
    ElMessage.success('Word 草稿已生成')

    // 显示警告
    if (res.data.warnings && res.data.warnings.length > 0) {
      res.data.warnings.forEach((w: { message: string }) => {
        ElMessage.warning(w.message)
      })
    }
    return res.data.document_id
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: string } } }
    ElMessage.error(error.response?.data?.error || '生成 Word 草稿失败')
    return null
  } finally {
    buildingDocx.value = false
  }
}

async function handleOpenWordEditor() {
  // 没有 Word 草稿：打开模板选择对话框，生成后按勾选自动打开编辑器
  // （不再绕过模板选择直接生成）
  if (!latestBidDocument.value?.exists) {
    templateDialogVisible.value = true
    return
  }

  const documentId = latestBidDocument.value.document_id
  window.open(`/bid-documents/${documentId}/word-editor`, '_blank')
}

async function handleDownloadWord() {
  if (!latestBidDocument.value?.exists) {
    ElMessage.warning('请先生成 Word 草稿')
    return
  }
  const docId = latestBidDocument.value.document_id!
  const fallbackName = latestBidDocument.value.title || `标书文档-${docId}.docx`
  try {
    // window.open 导航不带 Authorization header，必须用 blob 下载携带 token
    const res = await downloadBidDocument(docId)
    const url = URL.createObjectURL(res.data as Blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fallbackName.endsWith('.docx') ? fallbackName : `${fallbackName}.docx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (err) {
    const error = err as { response?: { data?: { message?: string } } }
    ElMessage.error(error.response?.data?.message || '下载失败，请稍后重试')
  }
}

async function handleDownloadPdf() {
  if (!latestBidDocument.value?.exists) {
    ElMessage.warning('请先生成 Word 草稿')
    return
  }
  const docId = latestBidDocument.value.document_id!
  const baseName = (latestBidDocument.value.title || `标书文档-${docId}`).replace(/\.docx$/i, '')
  const loading = ElMessage.info({ message: '正在转换 PDF，请稍候……', duration: 0 })
  try {
    const res = await exportBidDocumentPdf(docId)
    const url = URL.createObjectURL(res.data as Blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${baseName}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (err) {
    ElMessage.error('PDF 转换失败，请稍后重试')
  } finally {
    loading.close()
  }
}

async function handleAnalyze() {
  if (!selectedSection.value) return
  analyzing.value = true
  try {
    const res = await analyzeSection(selectedSection.value.id)
    analysisResult.value = res.data
    userPrompt.value = res.data.suggested_prompt || ''
    activeTab.value = 'generate'
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } }
    ElMessage.error(error.response?.data?.message || '分析失败')
  } finally {
    analyzing.value = false
  }
}

async function handleGenerate() {
  if (!selectedSection.value) return
  generating.value = true
  try {
    // 未点过「AI 生成」时 analysisResult 是全空初始值，传空对象会掩盖后端
    // "未传分析结果则自动分析" 分支（空 dict 在 Python 侧为真值），
    // 导致用空分析结果生成正文。未分析时不传该字段。
    const a = analysisResult.value
    const hasAnalysis =
      a.keywords.length > 0 ||
      a.knowledge_types.length > 0 ||
      a.requirement_types.length > 0 ||
      !!a.background ||
      !!a.suggested_prompt
    await generateSection(selectedSection.value.id, {
      user_prompt: userPrompt.value,
      ...(hasAnalysis ? { analysis_result: a } : {}),
      force: false,
    })
    ElMessage.success('章节生成任务已提交，正在生成中...')
    activeTab.value = 'content'
    await loadSections()
    pollGenerationStatus(selectedSection.value.id)
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } }
    ElMessage.error(error.response?.data?.message || '生成失败')
  } finally {
    generating.value = false
  }
}

// 跟踪所有进行中的轮询定时器, 组件卸载时统一清理, 防止内存泄漏
const pollTimers = new Set<ReturnType<typeof setInterval>>()

function clearAllPollTimers() {
  for (const t of pollTimers) {
    clearInterval(t)
  }
  pollTimers.clear()
}

function pollGenerationStatus(sectionId: number) {
  let count = 0
  const maxCount = 120
  const timer = setInterval(async () => {
    count++
    if (count > maxCount) {
      clearInterval(timer)
      pollTimers.delete(timer)
      ElMessage.warning('生成状态检查超时，请手动刷新查看结果')
      return
    }
    try {
      const res = await getSection(sectionId)
      const status = res.data.generation_status
      if (selectedSection.value?.id === sectionId) {
        sectionDetail.value = res.data
      }
      await loadSections()
      if (status === 'success') {
        clearInterval(timer)
        pollTimers.delete(timer)
        ElMessage.success('章节生成完成')
        await loadSectionDetail(sectionId)
      } else if (status === 'failed') {
        clearInterval(timer)
        pollTimers.delete(timer)
        ElMessage.error('章节生成失败')
      }
    } catch {
      clearInterval(timer)
      pollTimers.delete(timer)
      ElMessage.error('查询生成状态失败，请刷新页面查看结果')
    }
  }, 2000)
  pollTimers.add(timer)
}

async function loadVersions() {
  if (!selectedSection.value) return
  loadingVersions.value = true
  try {
    const res = await getSectionVersions(selectedSection.value.id)
    versions.value = res.data
  } catch {
    versions.value = []
  } finally {
    loadingVersions.value = false
  }
}

async function handleRollback(versionNo: number) {
  if (!selectedSection.value) return
  try {
    await ElMessageBox.confirm(`确认恢复到版本 V${versionNo}？`, '提示')
    await rollbackSection(selectedSection.value.id, versionNo)
    ElMessage.success('已恢复到指定版本')
    loadSectionDetail(selectedSection.value.id)
    loadVersions()
  } catch (err: unknown) {
    if (err !== 'cancel') {
      const error = err as { response?: { data?: { message?: string } } }
      ElMessage.error(error.response?.data?.message || '恢复失败')
    }
  }
}

function handleSectionContentSaved(data: { content: string; version: number }) {
  // 更新章节详情的字数
  if (sectionDetail.value) {
    sectionDetail.value.content = data.content
  }
  // 刷新版本记录
  loadVersions()
}

function handleSectionCommand(cmd: string) {
  switch (cmd) {
    case 'edit_matrix':
      if (selectedSection.value) {
        handleEditMatrix(selectedSection.value.id)
      }
      break
    case 'add_child':
      parentSection.value = selectedSection.value
      addForm.value = { title: '' }
      showAddDialog.value = true
      break
    case 'versions':
      activeTab.value = 'versions'
      loadVersions()
      break
    case 'delete':
      handleDeleteSection()
      break
  }
}

function handleAddSection() {
  parentSection.value = null
  addForm.value = { title: '' }
  showAddDialog.value = true
}

function handleAddChild(data: SectionTreeItem) {
  parentSection.value = data
  addForm.value = { title: '' }
  showAddDialog.value = true
}

async function handleConfirmAdd() {
  if (!addFormRef.value) return
  const valid = await addFormRef.value.validate().catch(() => false)
  if (!valid) return
  adding.value = true
  try {
    await createSection({
      outline: outlineId.value,
      parent: parentSection.value?.id || undefined,
      title: addForm.value.title,
    })
    ElMessage.success('章节创建成功')
    showAddDialog.value = false
    await loadSections()
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } }
    ElMessage.error(error.response?.data?.message || '创建失败')
  } finally {
    adding.value = false
  }
}

async function handleDeleteSection() {
  if (!selectedSection.value) return
  try {
    await ElMessageBox.confirm('确认删除此章节？删除后无法恢复。', '警告', { type: 'warning' })
    await deleteSection(selectedSection.value.id)
    ElMessage.success('删除成功')
    selectedSection.value = null
    sectionDetail.value = null
    await loadSections()
  } catch (err: unknown) {
    if (err !== 'cancel') {
      const error = err as { response?: { data?: { message?: string } } }
      ElMessage.error(error.response?.data?.message || '删除失败')
    }
  }
}

async function handleDeleteSectionFromTree(data: SectionTreeItem) {
  try {
    await ElMessageBox.confirm(`确认删除章节"${data.title}"？删除后无法恢复。`, '警告', { type: 'warning' })
    await deleteSection(data.id)
    ElMessage.success('删除成功')
    if (selectedSection.value?.id === data.id) {
      selectedSection.value = null
      sectionDetail.value = null
    }
    await loadSections()
  } catch (err: unknown) {
    if (err !== 'cancel') {
      const error = err as { response?: { data?: { message?: string } } }
      ElMessage.error(error.response?.data?.message || '删除失败')
    }
  }
}

watch(activeTab, (tab) => {
  if (tab === 'versions' && selectedSection.value) {
    loadVersions()
  }
})

function getStatusType(status: string): string {
  const map: Record<string, string> = {
    draft: 'info',
    generated: 'success',
    reviewing: 'warning',
    approved: 'success',
    rejected: 'danger',
  }
  return map[status] || 'info'
}

// 获取章节内容状态类型
function getContentType(section: SectionTreeItem): string {
  const status = section.content_generation_status
  if (status === 'success') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running') return 'warning'
  return 'info'
}

// 获取章节内容状态文本
function getContentStatusText(section: SectionTreeItem): string {
  const status = section.content_generation_status
  if (status === 'success') return '已生成'
  if (status === 'failed') return '生成失败'
  if (status === 'running') return '生成中'
  return '待生成'
}

// 获取矩阵状态文本
function getMatrixStatusText(status?: string): string {
  const map: Record<string, string> = {
    pending: '待生成',
    generating: '生成中',
    generated: '已生成',
    edited: '已编辑',
    failed: '失败',
  }
  return map[status || ''] || '待生成'
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString('zh-CN')
}

function truncate(text: string, max: number): string {
  if (!text) return ''
  return text.length <= max ? text : text.slice(0, max) + '...'
}

// 打开创建材料包对话框
async function openCreatePackageDialog() {
  try {
    const res = await getCompanyList({ status: 'active' })
    availableCompanies.value = res.data.results
    if (res.data.results.length > 0) {
      // 默认选择第一个公司
      createPackageForm.value.company_id = res.data.results[0].id
    }
    showCreatePackageDialog.value = true
  } catch {
    ElMessage.error('获取公司列表失败')
  }
}

// 创建材料包
async function handleCreatePackage() {
  if (!createPackageForm.value.company_id) {
    ElMessage.warning('请选择关联公司')
    return
  }
  creatingPackage.value = true
  try {
    await createMaterialPackage(outlineId.value, {
      company_id: createPackageForm.value.company_id,
      auto_fill: createPackageForm.value.auto_fill,
    })
    ElMessage.success('材料包创建成功')
    showCreatePackageDialog.value = false
    await loadMaterialPackage()
    // 同步生成准备检查清单弹窗与工具栏徽标
    await refreshPrepStatus()
  } catch (err: unknown) {
    const error = err as { response?: { data?: { detail?: string } } }
    ElMessage.error(error.response?.data?.detail || '创建失败')
  } finally {
    creatingPackage.value = false
  }
}
</script>

<style scoped>
.outline-workspace {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f7fa;
  overflow: hidden;
}

/* ========== 顶部工作台栏 ========== */
.workspace-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  gap: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.back-btn {
  padding: 0 6px !important;
  height: 28px !important;
  font-size: 14px;
  color: #606266;
}

.back-btn:hover {
  color: #409eff;
}

.outline-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.prep-badge {
  margin-left: 6px;
}

/* 批量生成进度（迷你版） */
.batch-progress-mini {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: var(--el-color-warning-light-9);
  border-radius: 16px;
  cursor: pointer;
  font-size: 12px;
  color: var(--el-color-warning);
  font-weight: 600;
}

.batch-progress-mini:hover {
  background: var(--el-color-warning-light-7);
}

.batch-progress-mini .el-icon {
  font-size: 14px;
}

/* ========== 主体工作区 ========== */
.workspace-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
  padding: 16px;
  gap: 0;
}

/* ========== 右侧工作区面板 ========== */
.workspace-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-left: none;
  border-radius: 0 10px 10px 0;
  min-width: 0;
}

.section-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #ebeef5;
  background: #fafbfc;
}

.section-title-area {
  min-width: 0;
}

.section-main-title {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.meta-item {
  color: #909399;
}

.meta-item.matrix-status {
  color: #606266;
}

.section-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* ========== Tab 样式 ========== */
.section-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.section-tabs :deep(.el-tabs__header) {
  flex-shrink: 0;
  margin: 0;
  padding: 0 20px;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
}

.section-tabs :deep(.el-tabs__nav-wrap) {
  margin-bottom: 0;
}

.section-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.section-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: hidden;
}

.tab-content {
  height: 100%;
  overflow-y: auto;
  padding: 16px 20px;
}

.content-panel {
  padding: 0;
  background: #f5f7fa;
}

.generate-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.analysis-card, .prompt-card {
  margin-bottom: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.keyword-tag {
  margin-right: 4px;
  margin-bottom: 4px;
}

.suggested-prompt {
  margin-top: 12px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
}

.suggested-prompt .label {
  font-weight: 500;
  margin-bottom: 4px;
  font-size: 13px;
  color: #606266;
}

.suggested-prompt .content {
  color: #303133;
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.6;
}

.generate-actions {
  display: flex;
  justify-content: center;
  padding-top: 8px;
}

.versions-panel {
  max-width: 600px;
}

.version-card {
  margin-bottom: 0;
}

.version-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.version-no {
  font-weight: 600;
  color: #303133;
}

.version-header .word-count {
  font-size: 12px;
  color: #909399;
}

.version-content {
  color: #606266;
  font-size: 13px;
  margin-bottom: 8px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 4px;
  line-height: 1.5;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-tip {
  font-size: 12px;
  color: #909399;
}

</style>
