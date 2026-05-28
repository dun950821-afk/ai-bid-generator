<template>
  <div class="parsed-document" v-loading="loading">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-left">
        <el-button link @click="router.back()">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <h2>{{ parsedDoc?.tender_file_name }}</h2>
      </div>
      <div class="header-right">
        <el-button @click="showDebugDialog = true">
          <el-icon><Document /></el-icon>
          调试信息
        </el-button>
      </div>
    </div>

    <!-- 概览卡片 -->
    <div class="overview-cards" v-if="parsedDoc">
      <el-card class="overview-card">
        <div class="card-title">解析信息</div>
        <div class="card-content">
          <div class="info-row">
            <span class="label">解析引擎:</span>
            <span class="value">{{ parsedDoc.parse_engine }} ({{ parsedDoc.parser_version }})</span>
          </div>
          <div class="info-row">
            <span class="label">解析质量:</span>
            <el-tag :type="getQualityType(parsedDoc.parse_quality)" size="small">
              {{ parsedDoc.parse_quality }}
            </el-tag>
          </div>
          <div class="info-row">
            <span class="label">页数:</span>
            <span class="value">{{ parsedDoc.page_count }}</span>
          </div>
          <div class="info-row">
            <span class="label">耗时:</span>
            <span class="value">{{ parsedDoc.parse_duration?.toFixed(1) || '-' }}秒</span>
          </div>
        </div>
      </el-card>

      <el-card class="overview-card">
        <div class="card-title">分块统计</div>
        <div class="card-content" v-if="chunkStats">
          <div class="info-row">
            <span class="label">总分块数:</span>
            <span class="value">{{ chunkStats.total_count }}</span>
          </div>
          <div class="info-row">
            <span class="label">强制条款:</span>
            <span class="value">{{ chunkStats.mandatory_count }}</span>
          </div>
          <div class="info-row">
            <span class="label">含截止时间:</span>
            <span class="value">{{ chunkStats.feature_stats?.deadline || 0 }}</span>
          </div>
          <div class="info-row">
            <span class="label">含评分项:</span>
            <span class="value">{{ chunkStats.feature_stats?.score || 0 }}</span>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 筛选工具栏 -->
    <div class="filter-bar">
      <el-select v-model="filterType" placeholder="类型筛选" clearable style="width: 140px" @change="loadChunks">
        <el-option label="资格要求" value="qualification" />
        <el-option label="评分办法" value="scoring" />
        <el-option label="技术要求" value="tech_req" />
        <el-option label="商务条款" value="commercial" />
        <el-option label="法律条款" value="legal" />
        <el-option label="投标递交" value="submission" />
        <el-option label="澄清补遗" value="clarification" />
        <el-option label="时间节点" value="schedule" />
        <el-option label="其他说明" value="general" />
      </el-select>
      <el-select v-model="filterLevel" placeholder="层级筛选" clearable style="width: 120px" @change="loadChunks">
        <el-option label="章节" value="section" />
        <el-option label="条款" value="clause" />
        <el-option label="窗口" value="window" />
      </el-select>
      <el-checkbox v-model="filterMandatory" @change="loadChunks">仅强制条款</el-checkbox>
      <el-input
        v-model="searchKeyword"
        placeholder="搜索内容"
        clearable
        style="width: 200px"
        @keyup.enter="loadChunks"
        @clear="loadChunks"
      >
        <template #append>
          <el-button @click="loadChunks">搜索</el-button>
        </template>
      </el-input>
    </div>

    <!-- 分块列表 -->
    <div class="chunk-list">
      <el-card v-for="chunk in chunks" :key="chunk.id" class="chunk-card" @click="showChunkDetail(chunk)">
        <div class="chunk-header">
          <div class="chunk-meta">
            <el-tag :type="getChunkTypeTag(chunk.chunk_type)" size="small">
              {{ chunk.chunk_type_display }}
            </el-tag>
            <el-tag type="info" size="small">{{ chunk.chunk_level_display }}</el-tag>
            <span v-if="chunk.clause_no" class="clause-no">{{ chunk.clause_no }}</span>
          </div>
          <div class="chunk-features">
            <el-tag v-if="chunk.is_mandatory" type="danger" size="small">强制</el-tag>
            <el-tag v-if="chunk.has_deadline" type="warning" size="small">截止时间</el-tag>
            <el-tag v-if="chunk.has_score" type="success" size="small">评分</el-tag>
            <el-tag v-if="chunk.has_amount" size="small">金额</el-tag>
            <el-tag v-if="chunk.has_penalty" type="danger" size="small">惩罚</el-tag>
          </div>
        </div>
        <div class="chunk-section">{{ chunk.section_path || chunk.section_title }}</div>
        <div class="chunk-content">
          {{ truncate(chunk.content, 200) }}
        </div>
        <div class="chunk-footer">
          <span>Tokens: {{ chunk.token_count }}</span>
        </div>
      </el-card>

      <el-empty v-if="!loading && chunks.length === 0" description="暂无分块数据" />
    </div>

    <!-- 分块详情抽屉 -->
    <el-drawer v-model="showDetailDrawer" title="分块详情" size="50%">
      <div class="chunk-detail" v-if="selectedChunk">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="ID">{{ selectedChunk.id }}</el-descriptions-item>
          <el-descriptions-item label="层级">{{ selectedChunk.chunk_level_display }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ selectedChunk.chunk_type_display }}</el-descriptions-item>
          <el-descriptions-item label="条款编号">{{ selectedChunk.clause_no || '-' }}</el-descriptions-item>
          <el-descriptions-item label="章节路径" :span="2">{{ selectedChunk.section_path || '-' }}</el-descriptions-item>
          <el-descriptions-item label="Token数">{{ selectedChunk.token_count }}</el-descriptions-item>
          <el-descriptions-item label="分类置信度">
            {{ selectedChunk.classification_confidence?.toFixed(2) || '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="detail-section">
          <h4>特征标记</h4>
          <div class="feature-tags">
            <el-tag v-if="selectedChunk.is_mandatory" type="danger">强制条款</el-tag>
            <el-tag v-if="selectedChunk.has_deadline" type="warning">含截止时间</el-tag>
            <el-tag v-if="selectedChunk.has_amount">含金额</el-tag>
            <el-tag v-if="selectedChunk.has_score" type="success">含评分</el-tag>
            <el-tag v-if="selectedChunk.has_penalty" type="danger">含惩罚条款</el-tag>
            <el-tag v-if="selectedChunk.has_timeline">含时间节点</el-tag>
            <el-tag v-if="selectedChunk.is_table">表格内容</el-tag>
          </div>
        </div>

        <div class="detail-section" v-if="selectedChunk.matched_keywords?.length">
          <h4>匹配关键词</h4>
          <div class="keyword-tags">
            <el-tag v-for="kw in selectedChunk.matched_keywords" :key="kw" size="small">{{ kw }}</el-tag>
          </div>
        </div>

        <div class="detail-section">
          <h4>内容</h4>
          <pre class="content-text">{{ selectedChunk.content }}</pre>
        </div>
      </div>
    </el-drawer>

    <!-- 调试信息弹窗 -->
    <el-dialog v-model="showDebugDialog" title="调试信息" width="800px">
      <el-tabs>
        <el-tab-pane label="解析调试">
          <pre class="debug-json">{{ JSON.stringify(parseDebug, null, 2) }}</pre>
        </el-tab-pane>
        <el-tab-pane label="分块调试">
          <pre class="debug-json">{{ JSON.stringify(chunkDebug, null, 2) }}</pre>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Document } from '@element-plus/icons-vue'
import {
  getParsedDocumentByFile,
  listChunks,
  getChunkStats,
  getParseDebug,
  getChunkDebug,
  type ParsedDocument,
  type TenderChunk,
  type ChunkStats,
  type ParseDebug,
  type ChunkDebug,
} from '@/api/tender'

const route = useRoute()
const router = useRouter()

const fileId = ref(Number(route.params.fileId))
const loading = ref(false)

const parsedDoc = ref<ParsedDocument | null>(null)
const chunks = ref<TenderChunk[]>([])
const chunkStats = ref<ChunkStats | null>(null)

const filterType = ref('')
const filterLevel = ref('')
const filterMandatory = ref(false)
const searchKeyword = ref('')

const showDetailDrawer = ref(false)
const selectedChunk = ref<TenderChunk | null>(null)

const showDebugDialog = ref(false)
const parseDebug = ref<ParseDebug | null>(null)
const chunkDebug = ref<ChunkDebug | null>(null)

// 加载解析文档
async function loadParsedDocument() {
  loading.value = true
  try {
    const res = await getParsedDocumentByFile(fileId.value)
    parsedDoc.value = res.data

    // 并行加载分块和统计
    await Promise.all([
      loadChunks(),
      loadChunkStats(),
    ])

    // 加载调试信息
    loadDebugInfo()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.detail || '加载失败')
    router.back()
  } finally {
    loading.value = false
  }
}

// 加载分块列表
async function loadChunks() {
  if (!parsedDoc.value) return

  try {
    const res = await listChunks(parsedDoc.value.id, {
      chunk_type: filterType.value || undefined,
      chunk_level: filterLevel.value || undefined,
      is_mandatory: filterMandatory.value ? 'true' : undefined,
      search: searchKeyword.value || undefined,
      with_content: 'true',
    })
    chunks.value = res.data as TenderChunk[]
  } catch (err: any) {
    console.error('加载分块失败:', err)
  }
}

// 加载分块统计
async function loadChunkStats() {
  if (!parsedDoc.value) return

  try {
    const res = await getChunkStats(parsedDoc.value.id)
    chunkStats.value = res.data
  } catch (err: any) {
    console.error('加载统计失败:', err)
  }
}

// 加载调试信息
async function loadDebugInfo() {
  if (!parsedDoc.value) return

  try {
    const [parseRes, chunkRes] = await Promise.all([
      getParseDebug(parsedDoc.value.id),
      getChunkDebug(parsedDoc.value.id),
    ])
    parseDebug.value = parseRes.data
    chunkDebug.value = chunkRes.data
  } catch (err: any) {
    console.error('加载调试信息失败:', err)
  }
}

// 显示分块详情
function showChunkDetail(chunk: TenderChunk) {
  selectedChunk.value = chunk
  showDetailDrawer.value = true
}

// 辅助函数
function getQualityType(quality: string) {
  const map: Record<string, string> = {
    high: 'success',
    medium: 'warning',
    low: 'danger',
  }
  return map[quality] || 'info'
}

function getChunkTypeTag(type: string) {
  const map: Record<string, string> = {
    qualification: 'danger',
    scoring: 'success',
    tech_req: 'primary',
    commercial: 'warning',
    legal: 'danger',
    submission: 'info',
    clarification: 'warning',
    schedule: 'info',
    general: '',
  }
  return map[type] || ''
}

function truncate(text: string, length: number) {
  if (!text) return ''
  return text.length > length ? text.slice(0, length) + '...' : text
}

// 监听路由变化
watch(() => route.params.fileId, (newId) => {
  if (newId) {
    fileId.value = Number(newId)
    loadParsedDocument()
  }
})

onMounted(() => {
  loadParsedDocument()
})
</script>

<style scoped>
.parsed-document {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h2 {
  margin: 0;
  font-size: 20px;
}

.overview-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.overview-card {
  margin-bottom: 0;
}

.card-title {
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--el-text-color-primary);
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-row .label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  min-width: 80px;
}

.info-row .value {
  font-size: 13px;
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  align-items: center;
}

.chunk-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 12px;
}

.chunk-card {
  cursor: pointer;
  transition: all 0.2s;
}

.chunk-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.chunk-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.chunk-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.clause-no {
  font-family: monospace;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.chunk-features {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.chunk-section {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.chunk-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  margin-bottom: 8px;
}

.chunk-footer {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.chunk-detail {
  padding: 0 16px;
}

.detail-section {
  margin-top: 20px;
}

.detail-section h4 {
  margin-bottom: 12px;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.feature-tags,
.keyword-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.content-text {
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: monospace;
  font-size: 13px;
  line-height: 1.6;
  max-height: 400px;
  overflow: auto;
}

.debug-json {
  background: var(--el-fill-color-light);
  padding: 16px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: monospace;
  font-size: 12px;
  max-height: 400px;
  overflow: auto;
}
</style>
