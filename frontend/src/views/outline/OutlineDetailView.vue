<!-- frontend/src/views/outline/OutlineDetailView.vue -->
<template>
  <div class="outline-workspace" v-loading="pageLoading">
    <!-- 顶部工作台栏 -->
    <header class="workspace-header">
      <div class="header-left">
        <el-button link class="back-btn" @click="router.back()">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <div class="title-block">
          <div class="title-line">
            <h2 class="outline-title">{{ outline?.name || '大纲详情' }}</h2>
            <el-tag v-if="outline" :type="getStatusType(outline.status)" size="small" effect="plain">
              {{ outline.status_display }}
            </el-tag>
            <el-tooltip
              v-if="outline && outline.review_status"
              :content="reviewTooltipContent"
              placement="bottom"
            >
              <el-tag
                :type="outline.review_status === 'passed' ? 'success' : 'warning'"
                size="small"
                effect="plain"
                class="review-tag"
                @click="reviewDialogVisible = true"
              >
                {{ outline.review_status === 'passed' ? '目录审核通过' : '目录审核未通过' }}
              </el-tag>
            </el-tooltip>
            <el-button
              v-if="outline"
              size="small"
              link
              :loading="reviewing"
              @click="handleReviewOutline"
              class="review-btn"
            >
              {{ outline.review_status ? '重新审核' : '目录审核' }}
            </el-button>
          </div>
        </div>
      </div>
      <div class="header-right">
        <!-- 生成准备（材料包+知识库+全局事实 收进弹窗） -->
        <el-button size="default" @click="prepChecklistVisible = true" class="action-btn prep-btn">
          <el-icon><Checked /></el-icon>
          生成准备
          <el-tag v-if="prepDoneCount < 4" size="small" type="warning" class="prep-badge">{{ prepDoneCount }}/4</el-tag>
        </el-button>
        <el-divider direction="vertical" class="action-divider" />
        <div class="action-group matrix-group">
          <!-- 批量生成按钮或进度条 -->
          <div v-if="batchProgress && ['pending', 'running', 'pause_requested', 'paused'].includes(batchProgress.status)" class="batch-progress-wrapper" @click="openBatchProgressDialog">
            <el-tooltip :content="batchProgress.current_section?.title || '准备中...'" placement="bottom">
              <div class="batch-progress">
                <div class="progress-info">
                  <span class="progress-text">
                    <el-icon class="is-loading"><Loading /></el-icon>
                    {{ batchProgress.status === 'paused' ? '已暂停' : batchProgress.status === 'pause_requested' ? '暂停中...' : '批量生成中' }}
                  </span>
                  <span class="progress-count">
                    {{ batchProgress.success + batchProgress.failed }} / {{ batchProgress.total }}
                  </span>
                </div>
                <el-progress
                  :percentage="batchProgress.progress_percent"
                  :stroke-width="6"
                  :show-text="false"
                  status="success"
                />
              </div>
            </el-tooltip>
          </div>
          <el-button v-else size="default" @click="handleGenerateAll" :loading="generatingAll" class="action-btn batch-btn">
            <el-icon><List /></el-icon>
            批量生成
          </el-button>
        </div>
        <el-divider direction="vertical" class="action-divider" />
        <div class="action-group word-group">
          <el-button size="default" @click="handleBuildDocx" :loading="buildingDocx" class="action-btn word-btn">
            <el-icon><Document /></el-icon>
            生成 Word
          </el-button>
          <el-button size="default" @click="handleOpenWordEditor" :disabled="sections.length === 0" class="action-btn edit-btn">
            <el-icon><EditPen /></el-icon>
            Word 编辑
          </el-button>
          <el-button size="default" type="primary" @click="handleDownloadWord" :disabled="!latestBidDocument?.exists" class="action-btn download-btn">
            <el-icon><Download /></el-icon>
            下载
          </el-button>
        </div>
        <el-divider direction="vertical" class="action-divider" />
        <div class="action-group facts-group">
          <el-button
            size="default"
            @click="bidCheckVisible = true"
            :disabled="!latestBidDocument?.exists"
            class="action-btn check-btn"
          >
            <el-icon><CircleCheck /></el-icon>
            废标检查
          </el-button>
          <el-button
            size="default"
            @click="consistencyAuditVisible = true"
            class="action-btn audit-btn"
          >
            <el-icon><Warning /></el-icon>
            一致性审计
          </el-button>
        </div>
      </div>
    </header>

    <!-- 主体：左侧章节树 + 右侧工作区 -->
    <main class="workspace-body">
      <!-- 左侧章节树 -->
      <div class="section-tree-wrapper">
        <div class="section-tree-panel" :style="{ width: `${treePanelWidth}px` }">
          <div class="panel-header">
            <span class="panel-title">章节目录</span>
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
                <div
                  class="tree-node"
                  :class="{ 'is-current': selectedSection?.id === data.id }"
                  @contextmenu.prevent="handleContextMenu($event, data)"
                >
                  <div class="node-title">
                    <el-icon class="node-icon">
                      <Folder v-if="hasChildren(data)" />
                      <Document v-else />
                    </el-icon>
                    <span v-if="getSectionNumber(data)" class="section-number">
                      {{ getSectionNumber(data) }}
                    </span>
                    <span class="title-text" :title="getFullTitle(data)">
                      {{ stripNumberPrefix(data.title) }}
                    </span>
                  </div>
                  <div class="node-right" @click.stop>
                    <el-tooltip :content="getNodeDisplayStatus(data).text" placement="top">
                      <span class="status-dot" :class="getNodeDisplayStatus(data).className" />
                    </el-tooltip>
                    <el-dropdown trigger="click" placement="bottom-end" @command="(cmd: string) => handleNodeCommand(cmd, data)">
                      <span class="more-btn">
                        <el-icon><MoreFilled /></el-icon>
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item command="select">
                            <el-icon><View /></el-icon>查看详情
                          </el-dropdown-item>
                          <el-dropdown-item command="generate" v-if="!hasChildren(data)">
                            <el-icon><MagicStick /></el-icon>AI 生成正文
                          </el-dropdown-item>
                          <el-dropdown-item command="edit_matrix" v-if="data.content_matrix_status === 'generated' || data.content_matrix_status === 'edited'">
                            <el-icon><Edit /></el-icon>编辑内容责任矩阵
                          </el-dropdown-item>
                          <el-dropdown-item command="add_child" divided>
                            <el-icon><Plus /></el-icon>添加子章节
                          </el-dropdown-item>
                          <el-dropdown-item command="delete" class="danger-item">
                            <el-icon><Delete /></el-icon>删除章节
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </div>
              </template>
            </el-tree>
            <el-empty v-if="filteredSections.length === 0 && !pageLoading" description="暂无章节" :image-size="60" />
          </div>
        </div>
        <!-- 拖拽调整宽度手柄 -->
        <div class="resize-handle" @mousedown="startResize" />
      </div>

      <!-- 右键菜单 -->
      <div
        v-if="contextMenuVisible"
        class="context-menu"
        :style="{ left: `${contextMenuX}px`, top: `${contextMenuY}px` }"
        @click.stop
      >
        <div class="context-menu-item" @click="handleNodeCommand('select', contextMenuTarget!)">
          <el-icon><View /></el-icon>查看详情
        </div>
        <div class="context-menu-item" @click="handleNodeCommand('generate', contextMenuTarget!)">
          <el-icon><MagicStick /></el-icon>AI 生成正文
        </div>
        <div class="context-menu-item" @click="handleNodeCommand('edit_matrix', contextMenuTarget!)">
          <el-icon><Edit /></el-icon>编辑内容责任矩阵
        </div>
        <div class="context-menu-divider" />
        <div class="context-menu-item" @click="handleNodeCommand('add_child', contextMenuTarget!)">
          <el-icon><Plus /></el-icon>添加子章节
        </div>
        <div class="context-menu-item danger" @click="handleNodeCommand('delete', contextMenuTarget!)">
          <el-icon><Delete /></el-icon>删除章节
        </div>
      </div>

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
          <el-empty description="请从左侧选择一个章节开始编辑" />
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
      :section="selectedSection ? { id: selectedSection.id, title: selectedSection.title } : undefined"
      :all-sections="flattenSections(sections)"
      @saved="handleMatrixSaved"
    />

    <!-- 矩阵生成进度对话框 -->
    <MatrixProgressDialog
      v-model:visible="showMatrixProgressDialog"
      :task-id="matrixTaskId"
      :outline-id="outlineId"
      @close="handleMatrixDialogClose"
      @completed="handleMatrixDialogClose"
    />

    <!-- 批量生成选项对话框 -->
    <BatchGenerateOptionsDialog
      v-model:visible="showBatchOptionsDialog"
      :outline-id="outlineId"
      @started="handleBatchOptionsStarted"
    />

    <!-- 批量生成进度对话框 -->
    <BatchProgressDialog
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

    <!-- 生成准备检查清单弹窗（需求4） -->
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

    <!-- 全局事实变量抽屉 -->
    <el-drawer
      v-model="globalFactsVisible"
      title="全局事实变量"
      direction="rtl"
      size="520px"
    >
      <GlobalFactsPanel :outline-id="outlineId" @extracted="refreshPrepStatus" />
    </el-drawer>

    <!-- 废标检查抽屉 -->
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

    <!-- 一致性审计抽屉 -->
    <el-drawer
      v-model="consistencyAuditVisible"
      title="一致性审计"
      direction="rtl"
      size="640px"
    >
      <ConsistencyAuditPanel :outline-id="outlineId" />
    </el-drawer>

    <!-- 目录审核建议对话框 -->
    <el-dialog v-model="reviewDialogVisible" title="目录审核结果" width="640px" :close-on-click-modal="false">
      <div v-if="outline">
        <el-alert
          :title="reviewAlertTitle"
          :type="outline.review_status === 'passed' ? 'success' : 'warning'"
          :closable="false"
          show-icon
          class="review-alert"
        />
        <div v-if="outline.review_suggestions && outline.review_suggestions.length > 0" class="review-suggestions">
          <div class="suggestions-title">修改建议：</div>
          <ol>
            <li v-for="(s, i) in outline.review_suggestions" :key="i">{{ s }}</li>
          </ol>
        </div>

        <!-- refine 进度 -->
        <el-alert
          v-if="refining || refineError"
          :title="refineError || `正在完善目录：${refineStep}（${refineProgress}%）`"
          :type="refineError ? 'error' : 'info'"
          :closable="false"
          show-icon
          class="review-alert"
        >
          <el-progress v-if="!refineError" :percentage="refineProgress" :stroke-width="6" :show-text="false" />
        </el-alert>

        <!-- diff 预览 -->
        <div v-if="refineDiff" class="refine-diff">
          <el-divider content-position="left">目录变更预览</el-divider>
          <div class="diff-section">
            <div class="diff-title added">
              <el-icon><CirclePlus /></el-icon>
              新增一级目录（{{ refineDiff.added.length }}）
            </div>
            <div v-for="n in refineDiff.added" :key="n.title" class="diff-item added">
              <el-tag type="success" size="small">新增</el-tag>
              <span>{{ n.title }}</span>
            </div>
            <el-empty v-if="refineDiff.added.length === 0" description="无新增" :image-size="40" />
          </div>
          <div class="diff-section">
            <div class="diff-title removed">
              <el-icon><Remove /></el-icon>
              将删除一级目录（{{ refineDiff.removed.length }}）
            </div>
            <div v-for="n in refineDiff.removed" :key="n.title" class="diff-item removed">
              <el-tag type="danger" size="small">删除</el-tag>
              <span>{{ n.title }}</span>
            </div>
            <el-empty v-if="refineDiff.removed.length === 0" description="无删除" :image-size="40" />
          </div>
          <el-alert
            v-if="refineDiff.review.passed"
            type="success"
            title="完善后目录审核通过"
            :closable="false"
            show-icon
          />
          <el-alert
            v-else
            type="warning"
            title="完善后目录审核仍未完全通过，可选择性应用"
            :closable="false"
            show-icon
          />
        </div>
      </div>
      <template #footer>
        <template v-if="refineDiff">
          <el-button @click="cancelRefine">取消</el-button>
          <el-button type="primary" :loading="applying" @click="applyRefine">应用变更</el-button>
        </template>
        <template v-else>
          <el-button @click="reviewDialogVisible = false">关闭</el-button>
          <el-button
            v-if="outline && outline.review_status !== 'passed'"
            type="warning"
            :loading="ignoring"
            @click="handleIgnoreReview"
          >
            忽略建议通过
          </el-button>
          <el-button
            v-if="outline && outline.review_status !== 'passed'"
            type="primary"
            :loading="refining"
            @click="handleRefineOutline"
          >
            按建议完善
          </el-button>
        </template>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { logError } from '@/utils/logger'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  Plus,
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
  View,
  List,
  EditPen,
  CircleCheck,
  Checked,
  CirclePlus,
  Remove,
  Warning,
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
  ignoreReview,
  refineOutline,
  applyRefineOutline,
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
  getBidDocumentDownloadUrl,
  type LatestBidDocument,
} from '@/api/bidDocument'
import MatrixEditDialog from '@/components/outline/MatrixEditDialog.vue'
import MatrixProgressDialog from '@/components/outline/MatrixProgressDialog.vue'
import BatchProgressDialog from '@/components/outline/BatchProgressDialog.vue'
import BatchGenerateOptionsDialog from '@/components/outline/BatchGenerateOptionsDialog.vue'
import SectionRichEditor from './components/SectionRichEditor.vue'
import GlobalFactsPanel from './components/GlobalFactsPanel.vue'
import CheckReport from '@/views/bid/CheckReport.vue'
import GenerationPrepChecklist from './components/GenerationPrepChecklist.vue'
import ConsistencyAuditPanel from './components/ConsistencyAuditPanel.vue'
import type { FormInstance, FormRules } from 'element-plus'
import {
  getOutlineMaterialPackage,
  createMaterialPackage,
  checkMaterialPackage,
  getCompanyList,
  type BidMaterialPackage,
  type MaterialCheckResult,
} from '@/api/enterprise'

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
const buildingDocx = ref(false)
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
const showMatrixEditDialog = ref(false)
const editingSectionId = ref(0)

// 材料包状态
const materialPackage = ref<BidMaterialPackage | null>(null)
const materialCheckResult = ref<MaterialCheckResult | null>(null)

// 知识库关联
import OutlineKbBindingDialog from '@/components/outline/OutlineKbBindingDialog.vue'
import {
  listOutlineKbBindings,
  type OutlineKbBinding,
} from '@/api/outlineKb'
import { getTask } from '@/api/task'
import { listGlobalFacts } from '@/api/globalFact'
import SectionReferenceSources from '@/components/outline/SectionReferenceSources.vue'
import SectionManualRetrieval from '@/components/outline/SectionManualRetrieval.vue'

const kbBindings = ref<OutlineKbBinding[]>([])
const kbDialogVisible = ref(false)
const globalFactsVisible = ref(false)
const reviewDialogVisible = ref(false)
const bidCheckVisible = ref(false)
const consistencyAuditVisible = ref(false)
const prepChecklistVisible = ref(false)
const prepChecklistRef = ref<InstanceType<typeof GenerationPrepChecklist> | null>(null)
const prepDoneCount = ref(0)

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

/** 页面加载时独立查4项准备状态，更新工具栏徽标。
 * 复用已加载的 materialPackage/kbBindings/matrixStatus，只额外查 globalFacts。
 */
async function loadPrepStatus() {
  if (!outlineId.value) return
  let count = 0
  // 全局事实
  try {
    const factRes = await listGlobalFacts(outlineId.value)
    if ((factRes.data?.count || 0) > 0) count++
  } catch {
    // 静默
  }
  // 材料包（复用已加载的 materialPackage ref）
  if (materialPackage.value) count++
  // 知识库（复用已加载的 kbBindings ref）
  if (kbBindings.value && kbBindings.value.length > 0) count++
  // 矩阵（复用已加载的 matrixStatus ref）
  if ((matrixStatus.value?.generated || 0) > 0) count++
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
const reviewing = ref(false)

const reviewTooltipContent = computed(() => {
  if (!outline.value?.review_status) return ''
  if (outline.value.review_status === 'passed') return '目录审核通过，点击查看详情'
  const count = outline.value.review_suggestions?.length || 0
  return `审核未通过（${count} 条建议），点击查看详情`
})

async function handleReviewOutline() {
  if (!outline.value) return
  reviewing.value = true
  resetRefineState()
  try {
    const res = await reviewOutline(outline.value.id)
    outline.value.review_status = res.data.passed ? 'passed' : 'failed'
    outline.value.review_suggestions = res.data.suggestions
    reviewDialogVisible.value = true
  } catch (e: any) {
    logError(e, { view: 'OutlineDetailView', action: 'reviewOutline' })
  } finally {
    reviewing.value = false
  }
}

const reviewAlertTitle = computed(() => {
  if (!outline.value) return ''
  if (outline.value.review_status === 'passed') {
    return outline.value.review_overridden
      ? '已忽略建议，人工审核通过'
      : '审核通过：一级目录与技术评分大类一一对应'
  }
  return '审核未通过'
})

// ===== 忽略建议通过 =====
const ignoring = ref(false)
async function handleIgnoreReview() {
  if (!outline.value) return
  try {
    await ElMessageBox.confirm('确认忽略 AI 建议强制通过？后续可重新审核', '确认忽略', { type: 'warning' })
  } catch {
    return
  }
  ignoring.value = true
  try {
    const res = await ignoreReview(outline.value.id)
    outline.value.review_status = 'passed'
    outline.value.review_overridden = true
    ElMessage.success(res.data.message)
    reviewDialogVisible.value = false
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '操作失败')
  } finally {
    ignoring.value = false
  }
}

// ===== 按建议完善（异步+diff）=====
const refining = ref(false)
const refineProgress = ref(0)
const refineStep = ref('')
const refineError = ref('')
const refineDiff = ref<{ added: any[]; removed: any[]; new_tree: any[]; review: { passed: boolean } } | null>(null)
const applying = ref(false)
let refineTimer: ReturnType<typeof setTimeout> | null = null

function resetRefineState() {
  refineProgress.value = 0
  refineStep.value = ''
  refineError.value = ''
  refineDiff.value = null
  if (refineTimer) {
    clearTimeout(refineTimer)
    refineTimer = null
  }
}

async function handleRefineOutline() {
  if (!outline.value) return
  resetRefineState()
  refining.value = true
  try {
    const res = await refineOutline(outline.value.id)
    pollRefineTask(res.data.task_id)
  } catch (e: any) {
    refining.value = false
    refineError.value = e?.response?.data?.detail || e?.message || '提交完善任务失败'
  }
}

function pollRefineTask(taskId: number) {
  const poll = async () => {
    try {
      const res = await getTask(taskId)
      const t = res.data
      refineProgress.value = t.progress
      refineStep.value = t.current_step
      if (t.status === 'success') {
        refining.value = false
        const payload = (t.result_payload || {}) as any
        refineDiff.value = {
          added: payload.added || [],
          removed: payload.removed || [],
          new_tree: payload.new_tree || [],
          review: payload.review || { passed: false },
        }
        ElMessage.success('目录完善完成，请预览变更')
        return
      }
      if (t.status === 'failed') {
        refining.value = false
        refineError.value = t.error_message || '完善失败'
        return
      }
      refineTimer = setTimeout(poll, 2000)
    } catch (e: any) {
      refining.value = false
      refineError.value = e?.message || '查询任务状态失败'
    }
  }
  poll()
}

function cancelRefine() {
  resetRefineState()
  reviewDialogVisible.value = false
}

async function applyRefine() {
  if (!outline.value || !refineDiff.value) return
  applying.value = true
  try {
    const res = await applyRefineOutline(outline.value.id, refineDiff.value.new_tree)
    ElMessage.success(`已应用新目录，共 ${res.data.section_count} 个章节`)
    reviewDialogVisible.value = false
    resetRefineState()
    await loadPageData()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '应用失败')
  } finally {
    applying.value = false
  }
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

// 拖拽宽度
const treePanelWidth = ref(340)
const resizing = ref(false)

// 右键菜单
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuTarget = ref<SectionTreeItem | null>(null)

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

// 状态聚合函数
interface NodeDisplayStatus {
  type: string
  text: string
  className: string
}

function getNodeDisplayStatus(data: SectionTreeItem): NodeDisplayStatus {
  const contentStatus = data.content_generation_status
  const matrixStatus = data.content_matrix_status

  if (contentStatus === 'failed') {
    return { type: 'content-failed', text: '正文生成失败', className: 'failed' }
  }
  if (contentStatus === 'running') {
    return { type: 'content-running', text: '正文生成中', className: 'running' }
  }
  if (matrixStatus === 'failed') {
    return { type: 'matrix-failed', text: '矩阵生成失败', className: 'failed' }
  }
  if (matrixStatus === 'generating') {
    return { type: 'matrix-generating', text: '矩阵生成中', className: 'running' }
  }
  if (matrixStatus === 'edited') {
    return { type: 'matrix-edited', text: '矩阵已编辑', className: 'edited' }
  }
  if (contentStatus === 'success') {
    return {
      type: 'content-success',
      text: data.content_word_count ? `正文已生成，${data.content_word_count}字` : '正文已生成',
      className: 'success',
    }
  }
  if (matrixStatus === 'generated') {
    return { type: 'matrix-generated', text: '矩阵已生成', className: 'matrix-generated' }
  }
  return { type: 'pending', text: '待处理', className: 'pending' }
}

// 节点辅助函数
function hasChildren(data: SectionTreeItem) {
  return Boolean(data.children?.length || data.children_count)
}

function getSectionNumber(data: SectionTreeItem) {
  // 优先使用后端计算的 section_number_display
  return data.section_number_display || data.section_number || ''
}

function stripNumberPrefix(title: string) {
  if (!title) return ''
  return title
    .replace(/^第?[一二三四五六七八九十百千万]+[、.．]\s*/, '')
    .replace(/^\d+(\.\d+)*[、.．]?\s*/, '')
    .replace(/^（[一二三四五六七八九十]+）\s*/, '')
    .replace(/^\([一二三四五六七八九十]+\)\s*/, '')
    .trim()
}

function getFullTitle(data: SectionTreeItem) {
  // 使用 section_number_display + 清洗后的标题
  const number = getSectionNumber(data)
  const cleanTitle = stripNumberPrefix(data.title)
  if (number) {
    return `${number}${cleanTitle}`
  }
  return cleanTitle
}

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

// 拖拽宽度相关函数
function startResize(event: MouseEvent) {
  resizing.value = true
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  event.preventDefault()
}

function handleResize(event: MouseEvent) {
  if (!resizing.value) return
  const minWidth = 280
  const maxWidth = 460
  treePanelWidth.value = Math.min(maxWidth, Math.max(minWidth, event.clientX - getTreePanelLeft()))
}

function stopResize() {
  resizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
}

function getTreePanelLeft() {
  const panel = document.querySelector('.section-tree-panel') as HTMLElement | null
  return panel?.getBoundingClientRect().left || 0
}

// 右键菜单处理
function handleContextMenu(event: MouseEvent, data: SectionTreeItem) {
  event.preventDefault()
  contextMenuTarget.value = data
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  contextMenuVisible.value = true
}

function closeContextMenu() {
  contextMenuVisible.value = false
}

// 节点命令处理
function handleNodeCommand(command: string, data: SectionTreeItem) {
  contextMenuVisible.value = false
  switch (command) {
    case 'select':
      handleNodeClick(data)
      break
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

onMounted(() => {
  loadPageData()
  document.addEventListener('click', closeContextMenu)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.removeEventListener('click', closeContextMenu)
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
    // 加载材料完整性检查结果
    await loadMaterialCheckResult()
  } catch {
    // 材料包不存在，忽略
    materialPackage.value = null
    materialCheckResult.value = null
  }
}

// 加载材料完整性检查结果
async function loadMaterialCheckResult() {
  try {
    const res = await checkMaterialPackage(outlineId.value)
    materialCheckResult.value = res.data
  } catch {
    materialCheckResult.value = null
  }
}

// 检查活跃的批量生成任务
async function checkActiveBatchTask() {
  try {
    const res = await getActiveBatchTask(outlineId.value)
    if (res.data && ['pending', 'running', 'pause_requested', 'paused'].includes(res.data.status)) {
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

      if (finalStatus === 'success' || finalStatus === 'completed') {
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
  generatingAll.value = false
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
  try {
    const res = await generateMatrix(outlineId.value, { force: false })
    matrixTaskId.value = res.data.task_id
    showMatrixProgressDialog.value = true
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string; error?: string } } }
    ElMessage.error(error.response?.data?.error || error.response?.data?.message || '启动矩阵生成失败')
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
  // 强制校验生成准备：4 项全部完成才允许批量生成
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
  buildingDocx.value = true
  try {
    const res = await buildDocx(outlineId.value)
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
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: string } } }
    ElMessage.error(error.response?.data?.error || '生成 Word 草稿失败')
  } finally {
    buildingDocx.value = false
  }
}

async function handleOpenWordEditor() {
  // 如果没有最新文档，先生成
  if (!latestBidDocument.value?.exists) {
    await handleBuildDocx()
    if (!latestBidDocument.value?.exists) return
  }

  const documentId = latestBidDocument.value.document_id
  window.open(`/bid-documents/${documentId}/word-editor`, '_blank')
}

function handleDownloadWord() {
  if (!latestBidDocument.value?.exists) {
    ElMessage.warning('请先生成 Word 草稿')
    return
  }
  window.open(getBidDocumentDownloadUrl(latestBidDocument.value.document_id!), '_blank')
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
    await generateSection(selectedSection.value.id, {
      user_prompt: userPrompt.value,
      analysis_result: analysisResult.value,
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
  padding: 10px 20px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  flex-wrap: wrap;
  gap: 10px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.back-btn {
  font-size: 14px;
  color: #606266;
}

.back-btn:hover {
  color: #409eff;
}

.title-block {
  min-width: 0;
}

.title-line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.outline-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
  max-width: 480px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.matrix-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.summary-label {
  color: #606266;
  font-weight: 500;
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.summary-item.pending {
  color: #909399;
}

.summary-item.generating {
  color: #409eff;
}

.summary-item.generated {
  color: #67c23a;
}

.summary-item.edited {
  color: #e6a23c;
}

.summary-item.failed {
  color: #f56c6c;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* 分组容器：浅色圆角背景替代竖线分隔 */
.action-group {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  background: var(--el-fill-color-light);
  border-radius: 10px;
  border: 1px solid var(--el-border-color-lighter);
}

.action-divider {
  display: none;
}

/* 材料包状态 */
.material-package-status {
  display: flex;
  align-items: center;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 8px;
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  cursor: pointer;
  transition: all 0.2s;
}

.status-badge:hover {
  background: #ecf5ff;
  border-color: #409eff;
}

.status-badge.ok {
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
  border-color: #67c23a;
}

.status-badge.warning {
  background: linear-gradient(135deg, #fefce8 0%, #fef3c7 100%);
  border-color: #e6a23c;
}

.status-badge.locked {
  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
  border-color: #909399;
}

.status-text {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
}

.material-btn {
  background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%);
  border: none;
  color: #fff;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35);
}

.material-btn:hover {
  background: linear-gradient(135deg, #7373e8 0%, #5253d0 100%);
  transform: translateY(-1px);
}

/* 批量生成进度条 */
.batch-progress-wrapper {
  min-width: 180px;
}

.batch-progress {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(17, 153, 142, 0.35);
}

.progress-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.progress-text {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.progress-text .el-icon {
  font-size: 14px;
}

.progress-count {
  color: rgba(255, 255, 255, 0.95);
  font-size: 13px;
  font-weight: 700;
  font-family: 'SF Mono', 'Monaco', monospace;
}

.batch-progress :deep(.el-progress-bar__outer) {
  background: rgba(255, 255, 255, 0.25);
}

.batch-progress :deep(.el-progress-bar__inner) {
  background: #fff;
}

.action-btn {
  height: 32px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 7px;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  border: 1px solid transparent;
}

.action-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.action-btn:active:not(:disabled) {
  transform: translateY(0);
}

.action-btn .el-icon {
  font-size: 15px;
}

/* 矩阵按钮 - 蓝紫色调 */
.matrix-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  color: #fff;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.35);
}

.matrix-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #5a6fd6 0%, #6a4190 100%);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.45);
  transform: translateY(-1px);
}

.matrix-btn:disabled {
  background: linear-gradient(135deg, #a5b4fc 0%, #c4b5fd 100%);
  opacity: 0.6;
}

/* 批量生成按钮 - 青绿色调 */
.batch-btn {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
  border: none;
  color: #fff;
  box-shadow: 0 2px 8px rgba(17, 153, 142, 0.35);
}

.batch-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #0f8a80 0%, #32d970 100%);
  box-shadow: 0 4px 12px rgba(17, 153, 142, 0.45);
  transform: translateY(-1px);
}

.batch-btn:disabled {
  background: linear-gradient(135deg, #6ee7b7 0%, #a7f3d0 100%);
  opacity: 0.6;
}

/* Word 生成按钮 - 橙色调 */
.word-btn {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  border: none;
  color: #fff;
  box-shadow: 0 2px 8px rgba(240, 147, 251, 0.35);
}

.word-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #e07ee6 0%, #e04a5e 100%);
  box-shadow: 0 4px 12px rgba(240, 147, 251, 0.45);
  transform: translateY(-1px);
}

.word-btn:disabled {
  background: linear-gradient(135deg, #fbcfe8 0%, #fecdd3 100%);
  opacity: 0.6;
}

/* Word 编辑按钮 - 靛蓝色调 */
.edit-btn {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  border: none;
  color: #fff;
  box-shadow: 0 2px 8px rgba(79, 172, 254, 0.35);
}

.edit-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #3a9ae8 0%, #00dce0 100%);
  box-shadow: 0 4px 12px rgba(79, 172, 254, 0.45);
  transform: translateY(-1px);
}

.edit-btn:disabled {
  background: linear-gradient(135deg, #bae6fd 0%, #a5f3fc 100%);
  opacity: 0.6;
}

/* 下载按钮 - 主题蓝色 */
.download-btn {
  background: linear-gradient(135deg, #409eff 0%, #3b82f6 100%);
  border: none;
  color: #fff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.35);
}

.download-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #3385d6 0%, #2d72c9 100%);
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.45);
  transform: translateY(-1px);
}

.download-btn:disabled {
  background: linear-gradient(135deg, #a0cfff 0%, #93c5fd 100%);
  opacity: 0.6;
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

/* ========== 左侧章节树面板 ========== */
.section-tree-wrapper {
  display: flex;
  height: 100%;
  min-width: 0;
}

.section-tree-panel {
  flex-shrink: 0;
  width: 340px;
  min-width: 280px;
  max-width: 460px;
  height: 100%;
  border: 1px solid #e4e7ed;
  border-radius: 10px 0 0 10px;
  background: #fff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.resize-handle {
  width: 6px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.2s;
  flex-shrink: 0;
}

.resize-handle:hover {
  background: #d9ecff;
}

.panel-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #ebeef5;
}

.panel-title {
  font-size: 15px;
  font-weight: 700;
  color: #303133;
}

.tree-search {
  flex-shrink: 0;
  padding: 12px 14px;
  border-bottom: 1px solid #f0f2f5;
}

.tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

/* ========== 树节点样式 ========== */
.tree-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 36px;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.tree-node:hover {
  background: #f5f7fa;
}

.tree-node.is-current {
  background: #ecf5ff;
}

.node-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.node-icon {
  font-size: 14px;
  color: #909399;
  flex-shrink: 0;
}

.section-number {
  color: #606266;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title-text {
  flex: 1;
  min-width: 0;
  color: #303133;
  font-size: 13px;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
  width: 42px;
  margin-left: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.success { background: #67c23a; }
.status-dot.running { background: #409eff; animation: statusPulse 1s infinite; }
.status-dot.failed { background: #f56c6c; }
.status-dot.edited { background: #e6a23c; }
.status-dot.pending { background: #c0c4cc; }
.status-dot.matrix-generated { background: #8cc5ff; }

@keyframes statusPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

.more-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  color: #909399;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.tree-node:hover .more-btn {
  opacity: 1;
}

.more-btn:hover {
  background: #e4e7ed;
  color: #409eff;
}

/* ========== 右键菜单 ========== */
.context-menu {
  position: fixed;
  min-width: 180px;
  padding: 6px 0;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  z-index: 3000;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 14px;
  color: #303133;
  font-size: 13px;
  cursor: pointer;
}

.context-menu-item:hover {
  background: #f5f7fa;
  color: #409eff;
}

.context-menu-item.danger {
  color: #f56c6c;
}

.context-menu-divider {
  height: 1px;
  margin: 4px 0;
  background: #ebeef5;
}

.danger-item {
  color: #f56c6c;
}

/* ========== Element Plus Tree 覆盖 ========== */
:deep(.el-tree) {
  background: transparent;
}

:deep(.el-tree-node__content) {
  height: auto;
  min-height: 36px;
  padding-right: 4px;
}

:deep(.el-tree-node__content:hover) {
  background: transparent;
}

:deep(.el-tree--highlight-current .el-tree-node.is-current > .el-tree-node__content) {
  background: transparent;
}

:deep(.el-tree-node__expand-icon) {
  color: #909399;
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

.is-loading {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.prep-btn .prep-badge {
  margin-left: 6px;
}

/* 生成准备按钮 - 靛蓝渐变 */
.prep-btn {
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%) !important;
  border: none !important;
  color: #fff !important;
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.35);
}
.prep-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #5457e5 0%, #4338ca 100%) !important;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.45);
}

/* 废标检查按钮 - 青色渐变 */
.check-btn {
  background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%) !important;
  border: none !important;
  color: #fff !important;
  box-shadow: 0 2px 8px rgba(8, 145, 178, 0.35);
}
.check-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #08a3c0 0%, #0e7490 100%) !important;
  box-shadow: 0 4px 14px rgba(8, 145, 178, 0.45);
}
.check-btn:disabled {
  background: linear-gradient(135deg, #a5f3fc 0%, #cffafe 100%) !important;
  color: #fff !important;
  opacity: 0.7;
}

/* 审核状态徽标动效 */
.review-tag {
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.review-tag:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(230, 162, 60, 0.35);
}

/* 返回按钮 */
.back-btn {
  padding: 0 10px !important;
  height: 32px !important;
  transition: transform 0.18s ease;
}
.back-btn:hover {
  transform: translateX(-2px);
}

.review-alert {
  margin-bottom: 12px;
}
.review-suggestions {
  margin-top: 8px;
}
.suggestions-title {
  font-weight: 600;
  margin-bottom: 8px;
}
.review-suggestions ol {
  margin: 0;
  padding-left: 20px;
  color: var(--el-text-color-regular);
  line-height: 1.8;
}
.refine-diff {
  margin-top: 12px;
}
.diff-section {
  margin-bottom: 16px;
}
.diff-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  margin-bottom: 8px;
  font-size: 14px;
}
.diff-title.added { color: var(--el-color-success); }
.diff-title.removed { color: var(--el-color-danger); }
.diff-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  margin-bottom: 4px;
  border-radius: 6px;
  font-size: 13px;
}
.diff-item.added {
  background: var(--el-color-success-light-9);
}
.diff-item.removed {
  background: var(--el-color-danger-light-9);
  text-decoration: line-through;
  color: var(--el-text-color-secondary);
}
</style>