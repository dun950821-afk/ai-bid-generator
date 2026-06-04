<!-- frontend/src/views/outline/OutlineDetailView.vue -->
<template>
  <div class="outline-workspace" v-loading="pageLoading">
    <!-- 顶部工具栏 -->
    <header class="workspace-header">
      <div class="header-left">
        <el-button link @click="router.back()">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <h2>{{ outline?.name || '大纲详情' }}</h2>
        <el-tag v-if="outline" :type="getStatusType(outline.status)" size="small">
          {{ outline.status_display }}
        </el-tag>
      </div>
      <div class="header-right">
        <el-button @click="handleGenerateAll" :loading="generatingAll">
          <el-icon><MagicStick /></el-icon>
          批量生成
        </el-button>
        <el-button type="primary" @click="handleExport" :disabled="!canExport">
          <el-icon><Download /></el-icon>
          导出
        </el-button>
      </div>
    </header>

    <!-- 矩阵状态栏 -->
    <div class="matrix-status-bar" v-if="matrixStatus.total > 0">
      <div class="matrix-stats">
        <span class="stat-label">内容责任矩阵:</span>
        <span class="stat-item stat-pending">待生成 {{ matrixStatus.pending }}</span>
        <span class="stat-item stat-generating" v-if="matrixStatus.generating > 0">
          <el-icon class="is-loading"><Loading /></el-icon>
          生成中 {{ matrixStatus.generating }}
        </span>
        <span class="stat-item stat-generated">已生成 {{ matrixStatus.generated }}</span>
        <span class="stat-item stat-edited">已编辑 {{ matrixStatus.edited }}</span>
        <span class="stat-item stat-failed" v-if="matrixStatus.failed > 0">失败 {{ matrixStatus.failed }}</span>
      </div>
      <div class="matrix-actions">
        <el-button
          type="primary"
          size="small"
          :loading="matrixStatus.is_generating"
          :disabled="matrixStatus.pending === 0 && !matrixStatus.is_generating"
          @click="handleGenerateMatrix"
        >
          {{ matrixStatus.is_generating ? '生成中...' : '生成矩阵' }}
        </el-button>
      </div>
    </div>

    <!-- 主体：左侧章节树 + 右侧工作区 -->
    <main class="workspace-body">
      <!-- 左侧章节树 -->
      <aside class="section-tree-panel">
        <div class="panel-header">
          <span>章节目录</span>
          <el-button type="primary" link size="small" @click="handleAddSection">
            <el-icon><Plus /></el-icon>
            新增
          </el-button>
        </div>

        <!-- 搜索框 -->
        <div class="tree-search">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索章节..."
            clearable
            :prefix-icon="Search"
            size="small"
          />
        </div>

        <!-- 章节树 -->
        <div class="tree-content">
          <el-tree
            :data="filteredSections"
            :props="treeProps"
            node-key="id"
            highlight-current
            :expand-on-click-node="false"
            default-expand-all
            @node-click="handleNodeClick"
          >
            <template #default="{ data }">
              <div class="tree-node">
                <span class="node-title">
                  <el-icon v-if="data.children_count > 0" class="node-icon"><Folder /></el-icon>
                  <el-icon v-else class="node-icon"><Document /></el-icon>
                  <span class="title-text">{{ data.title }}</span>
                </span>
                <div class="node-actions">
                  <MatrixStatusBadge
                    v-if="data.content_matrix_status"
                    :status="data.content_matrix_status"
                    class="matrix-badge"
                  />
                  <el-button
                    v-if="data.content_matrix_status === 'generated' || data.content_matrix_status === 'edited'"
                    link
                    type="primary"
                    size="small"
                    class="action-btn"
                    @click.stop="handleEditMatrix(data.id)"
                  >
                    <el-icon><Edit /></el-icon>
                  </el-button>
                  <el-button
                    v-if="data.children_count > 0 || data.level < 3"
                    link
                    type="primary"
                    size="small"
                    class="action-btn"
                    @click.stop="handleAddChild(data)"
                  >
                    <el-icon><Plus /></el-icon>
                  </el-button>
                  <el-button
                    link
                    type="danger"
                    size="small"
                    class="action-btn"
                    @click.stop="handleDeleteSectionFromTree(data)"
                  >
                    <el-icon><Minus /></el-icon>
                  </el-button>
                  <el-tag
                    v-if="data.generation_status === 'success'"
                    type="success"
                    size="small"
                    effect="plain"
                    class="node-tag"
                  >
                    已生成
                  </el-tag>
                  <el-tag
                    v-else-if="data.generation_status === 'running'"
                    type="warning"
                    size="small"
                    effect="plain"
                    class="node-tag"
                  >
                    生成中
                  </el-tag>
                  <el-tag
                    v-else-if="data.generation_status === 'failed'"
                    type="danger"
                    size="small"
                    effect="plain"
                    class="node-tag"
                  >
                    失败
                  </el-tag>
                </div>
              </div>
            </template>
          </el-tree>

          <el-empty v-if="filteredSections.length === 0 && !pageLoading" description="暂无章节" :image-size="60" />
        </div>
      </aside>

      <!-- 右侧工作区 -->
      <section class="workspace-panel">
        <template v-if="selectedSection">
          <!-- 章节标题栏 -->
          <div class="section-header">
            <div class="section-title-area">
              <h3>{{ selectedSection.title }}</h3>
              <div class="section-meta">
                <el-tag :type="getStatusType(selectedSection.status)" size="small">
                  {{ selectedSection.status_display }}
                </el-tag>
                <span v-if="sectionDetail?.word_count" class="word-count">
                  {{ sectionDetail.word_count }} 字
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
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="add_child">
                      <el-icon><Plus /></el-icon>添加子章节
                    </el-dropdown-item>
                    <el-dropdown-item command="versions">
                      <el-icon><Clock /></el-icon>版本历史
                    </el-dropdown-item>
                    <el-dropdown-item command="delete" divided>
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
                <div v-if="sectionDetail?.content" class="content-preview">
                  <div class="content-text">{{ sectionDetail.content }}</div>
                </div>
                <el-empty v-else description="暂无内容，请使用AI生成" :image-size="80" />
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
                      <el-tag
                        v-for="kw in analysisResult.keywords"
                        :key="kw"
                        size="small"
                        class="keyword-tag"
                      >
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
                  <el-button
                    type="primary"
                    @click="handleGenerate"
                    :loading="generating"
                    :disabled="analyzing"
                  >
                    <el-icon><MagicStick /></el-icon>
                    {{ generating ? '生成中...' : '开始生成' }}
                  </el-button>
                </div>
              </div>
            </el-tab-pane>

            <el-tab-pane label="版本记录" name="versions">
              <div class="tab-content versions-panel" v-loading="loadingVersions">
                <el-timeline v-if="versions.length > 0">
                  <el-timeline-item
                    v-for="v in versions"
                    :key="v.id"
                    :timestamp="formatDate(v.created_at)"
                    placement="top"
                  >
                    <el-card shadow="hover" class="version-card">
                      <div class="version-header">
                        <span class="version-no">V{{ v.version_no }}</span>
                        <el-tag size="small" effect="plain">{{ v.source_display }}</el-tag>
                        <span class="word-count">{{ v.word_count }} 字</span>
                      </div>
                      <div class="version-content" v-if="v.content">
                        {{ truncate(v.content, 200) }}
                      </div>
                      <el-button link type="primary" size="small" @click="handleRollback(v.version_no)">
                        恢复此版本
                      </el-button>
                    </el-card>
                  </el-timeline-item>
                </el-timeline>
                <el-empty v-else description="暂无版本记录" :image-size="80" />
              </div>
            </el-tab-pane>
          </el-tabs>
        </template>

        <!-- 未选择章节 -->
        <div v-else class="empty-state">
          <el-empty description="请从左侧选择一个章节" />
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

    <!-- 矩阵编辑对话框 -->
    <MatrixEditDialog
      v-model:visible="showMatrixEditDialog"
      :section-id="editingSectionId"
      :current-section-id="selectedSection?.id || 0"
      :all-sections="flattenSections(sections)"
      @saved="handleMatrixSaved"
    />

    <!-- 矩阵生成进度对话框 -->
    <MatrixProgressDialog
      v-model:visible="showMatrixProgressDialog"
      :task-id="matrixTaskId"
      :outline-id="outlineId"
      @close="loadMatrixStatus"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  Plus,
  Minus,
  MagicStick,
  Download,
  Search,
  Folder,
  Document,
  MoreFilled,
  Clock,
  Delete,
  Loading,
  Edit,
} from '@element-plus/icons-vue'
import {
  getOutline,
  getOutlineSections,
  generateAllSections,
  getSection,
  analyzeSection,
  generateSection,
  deleteSection,
  createSection,
  getSectionVersions,
  rollbackSection,
  getMatrixStatus,
  generateMatrix,
  type OutlineDetail,
  type SectionTreeItem,
  type Section,
  type SectionVersion,
  type AnalysisResult,
  type MatrixStatus,
} from '@/api/outline'
import MatrixStatusBadge from '@/components/outline/MatrixStatusBadge.vue'
import MatrixEditDialog from '@/components/outline/MatrixEditDialog.vue'
import MatrixProgressDialog from '@/components/outline/MatrixProgressDialog.vue'
import type { FormInstance, FormRules } from 'element-plus'

const route = useRoute()
const router = useRouter()

const outlineId = computed(() => Number(route.params.outlineId))

// 页面状态
const pageLoading = ref(false)
const generatingAll = ref(false)
const generating = ref(false)
const analyzing = ref(false)
const loadingVersions = ref(false)
const adding = ref(false)

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
const showMatrixEditDialog = ref(false)
const editingSectionId = ref(0)

// UI 状态
const searchKeyword = ref('')
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

const treeProps = {
  children: 'children',
  label: 'title',
}

// 计算属性
const filteredSections = computed(() => {
  if (!searchKeyword.value) return sections.value

  const keyword = searchKeyword.value.toLowerCase()
  const filterTree = (items: SectionTreeItem[]): SectionTreeItem[] => {
    return items.reduce((acc: SectionTreeItem[], item) => {
      const match = item.title.toLowerCase().includes(keyword)
      const children = item.children ? filterTree(item.children) : []

      if (match || children.length > 0) {
        acc.push({ ...item, children })
      }
      return acc
    }, [])
  }
  return filterTree(sections.value)
})

const canExport = computed(() => {
  return sections.value.some(s => s.generation_status === 'success')
})

// 扁平化章节列表（用于矩阵编辑对话框）
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

onMounted(() => {
  loadPageData()
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

    // 加载矩阵状态
    await loadMatrixStatus()

    // 默认选中第一个章节
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

// 加载矩阵状态
async function loadMatrixStatus() {
  try {
    const res = await getMatrixStatus(outlineId.value)
    matrixStatus.value = res.data
  } catch (err) {
    console.error('加载矩阵状态失败:', err)
  }
}

// 生成矩阵
async function handleGenerateMatrix() {
  try {
    const res = await generateMatrix(outlineId.value, { force: false })
    matrixTaskId.value = res.data.task_id
    showMatrixProgressDialog.value = true
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } }
    ElMessage.error(error.response?.data?.message || '启动矩阵生成失败')
  }
}

// 编辑章节矩阵
function handleEditMatrix(sectionId: number) {
  editingSectionId.value = sectionId
  showMatrixEditDialog.value = true
}

// 矩阵编辑保存后刷新
function handleMatrixSaved() {
  loadMatrixStatus()
  loadSections()
}

// 构建树形结构
function buildTree(items: SectionTreeItem[]): SectionTreeItem[] {
  const map = new Map<number, SectionTreeItem>()
  const roots: SectionTreeItem[] = []

  items.forEach(item => {
    map.set(item.id, { ...item, children: [] })
  })

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
    console.error('加载章节失败:', err)
  }
}

async function loadSectionDetail(sectionId: number) {
  try {
    const res = await getSection(sectionId)
    sectionDetail.value = res.data
  } catch (err) {
    console.error('加载章节详情失败:', err)
    sectionDetail.value = null
  }
}

// 点击章节节点
function handleNodeClick(data: SectionTreeItem) {
  selectedSection.value = data
  activeTab.value = 'content'
  loadSectionDetail(data.id)
  // 重置分析结果
  analysisResult.value = {
    keywords: [],
    knowledge_types: [],
    requirement_types: [],
    background: '',
    suggested_prompt: '',
  }
  userPrompt.value = ''
}

// 批量生成
async function handleGenerateAll() {
  try {
    await ElMessageBox.confirm('确认批量生成所有章节？这可能需要较长时间。', '提示')
    generatingAll.value = true
    await generateAllSections(outlineId.value)
    ElMessage.success('批量生成任务已提交，正在生成中...')
    // 开始轮询批量生成状态
    pollBatchGenerationStatus()
  } catch (err: unknown) {
    if (err !== 'cancel') {
      const error = err as { response?: { data?: { message?: string } } }
      ElMessage.error(error.response?.data?.message || '操作失败')
    }
  }
}

// 导出
function handleExport() {
  ElMessage.info('导出功能开发中')
}

// AI 分析
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

// AI 生成
async function handleGenerate() {
  if (!selectedSection.value) return

  generating.value = true
  try {
    await generateSection(selectedSection.value.id, {
      user_prompt: userPrompt.value,
      analysis_result: analysisResult.value,
      force: false,
    })
    ElMessage.success('章节生成任务已提交，正在生成中...')
    activeTab.value = 'content'
    // 立即刷新一次，然后开始轮询
    await loadSections()
    pollGenerationStatus(selectedSection.value.id)
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } } }
    ElMessage.error(error.response?.data?.message || '生成失败')
  } finally {
    generating.value = false
  }
}

// 轮询单个章节生成状态
function pollGenerationStatus(sectionId: number) {
  let count = 0
  const maxCount = 120 // 最多轮询120次，约4分钟（每2秒一次）

  const timer = setInterval(async () => {
    count++
    if (count > maxCount) {
      clearInterval(timer)
      ElMessage.warning('生成状态检查超时，请手动刷新查看结果')
      return
    }

    try {
      const res = await getSection(sectionId)
      const status = res.data.generation_status

      // 更新当前显示的章节详情
      if (selectedSection.value?.id === sectionId) {
        sectionDetail.value = res.data
      }

      // 刷新章节树以更新状态标签
      await loadSections()

      if (status === 'success') {
        clearInterval(timer)
        ElMessage.success('章节生成完成')
        // 再次刷新确保数据最新
        await loadSectionDetail(sectionId)
      } else if (status === 'failed') {
        clearInterval(timer)
        ElMessage.error('章节生成失败')
      }
      // running 状态继续轮询
    } catch {
      clearInterval(timer)
    }
  }, 2000) // 每2秒轮询一次
}

// 轮询批量生成状态
function pollBatchGenerationStatus() {
  let count = 0
  const maxCount = 180 // 最多轮询180次，约6分钟

  const timer = setInterval(async () => {
    count++
    if (count > maxCount) {
      clearInterval(timer)
      generatingAll.value = false
      ElMessage.warning('批量生成检查超时，请手动刷新查看结果')
      return
    }

    try {
      await loadSections()

      // 检查是否所有章节都已完成生成
      const allDone = sections.value.every(s =>
        s.generation_status === 'success' || s.generation_status === 'failed' || s.generation_status === 'not_started'
      )

      if (allDone) {
        clearInterval(timer)
        generatingAll.value = false
        const successCount = sections.value.filter(s => s.generation_status === 'success').length
        const failedCount = sections.value.filter(s => s.generation_status === 'failed').length

        if (failedCount > 0) {
          ElMessage.warning(`批量生成完成：成功 ${successCount} 个，失败 ${failedCount} 个`)
        } else {
          ElMessage.success(`批量生成完成：成功生成 ${successCount} 个章节`)
        }

        // 如果当前有选中章节，刷新其详情
        if (selectedSection.value) {
          await loadSectionDetail(selectedSection.value.id)
        }
      }
    } catch {
      clearInterval(timer)
      generatingAll.value = false
    }
  }, 2000)
}

// 加载版本历史
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

// 回滚版本
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

// 章节操作
function handleSectionCommand(cmd: string) {
  switch (cmd) {
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

// 新增章节
function handleAddSection() {
  parentSection.value = null
  addForm.value = { title: '' }
  showAddDialog.value = true
}

// 添加子章节
function handleAddChild(data: SectionTreeItem) {
  parentSection.value = data
  addForm.value = { title: '' }
  showAddDialog.value = true
}

async function handleConfirmAdd() {
  if (!addFormRef.value) return
  await addFormRef.value.validate()

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

// 删除章节
async function handleDeleteSection() {
  if (!selectedSection.value) return

  try {
    await ElMessageBox.confirm('确认删除此章节？删除后无法恢复。', '警告', {
      type: 'warning',
    })
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

// 从树中删除章节
async function handleDeleteSectionFromTree(data: SectionTreeItem) {
  try {
    await ElMessageBox.confirm(`确认删除章节"${data.title}"？删除后无法恢复。`, '警告', {
      type: 'warning',
    })
    await deleteSection(data.id)
    ElMessage.success('删除成功')
    // 如果删除的是当前选中的章节，清空选中状态
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

// 切换到版本Tab时加载
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

function formatDate(date: string): string {
  return new Date(date).toLocaleString('zh-CN')
}

function truncate(text: string, max: number): string {
  if (!text) return ''
  return text.length <= max ? text : text.slice(0, max) + '...'
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

/* 顶部工具栏 */
.workspace-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.header-right {
  display: flex;
  gap: 8px;
}

/* 矩阵状态栏 */
.matrix-status-bar {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 20px;
  background: #f0f7ff;
  border-bottom: 1px solid #d9ecff;
}

.matrix-stats {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-label {
  font-weight: 500;
  color: #303133;
  font-size: 13px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #606266;
}

.stat-pending {
  color: #909399;
}

.stat-generating {
  color: #409eff;
}

.stat-generated {
  color: #67c23a;
}

.stat-edited {
  color: #e6a23c;
}

.stat-failed {
  color: #f56c6c;
}

.matrix-badge {
  margin-right: 4px;
}

/* 主体布局 */
.workspace-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

/* 左侧章节树面板 */
.section-tree-panel {
  flex-shrink: 0;
  width: 280px;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #ebeef5;
  font-weight: 500;
  font-size: 14px;
}

.tree-search {
  flex-shrink: 0;
  padding: 8px 12px;
}

.tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

.tree-node {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding-right: 4px;
}

.node-title {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  flex: 1;
  min-width: 0;
}

.node-icon {
  font-size: 14px;
  color: #909399;
  flex-shrink: 0;
}

.title-text {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.action-btn {
  padding: 2px;
  opacity: 0;
  transition: opacity 0.2s;
}

.tree-node:hover .action-btn {
  opacity: 1;
}

.node-tag {
  margin-left: 4px;
}

.is-loading {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 右侧工作区面板 */
.workspace-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  min-width: 0;
}

.section-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid #e4e7ed;
  background: #fafafa;
}

.section-title-area h3 {
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.section-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.word-count {
  color: #909399;
  font-size: 12px;
}

.section-actions {
  display: flex;
  gap: 8px;
}

/* Tab 样式 */
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

/* Tab 内容区域 - 添加滚动 */
.tab-content {
  height: 100%;
  overflow-y: auto;
  padding: 16px 20px;
}

/* 内容面板 */
.content-preview {
  padding: 16px;
  background: #fafafa;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.content-text {
  white-space: pre-wrap;
  word-wrap: break-word;
  line-height: 1.8;
  font-size: 14px;
  color: #303133;
}

/* 生成面板 */
.generate-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.analysis-card,
.prompt-card {
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

/* 版本面板 */
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

/* 空状态 */
.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* el-tree 样式调整 */
.tree-content :deep(.el-tree-node__content) {
  height: 32px;
}

.tree-content :deep(.el-tree-node__expand-icon) {
  font-size: 12px;
}
</style>
