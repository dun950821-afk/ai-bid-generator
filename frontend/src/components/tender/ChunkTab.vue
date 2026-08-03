<template>
  <div class="chunk-tab">
    <!-- 统计卡片 -->
    <div class="stats-cards" v-if="stats">
      <el-card class="stats-card" shadow="hover">
        <div class="stats-item">
          <span class="label">总分块数</span>
          <span class="value">{{ stats.total_count }}</span>
        </div>
      </el-card>
      <el-card class="stats-card is-mandatory" shadow="hover">
        <div class="stats-item">
          <span class="label">强制条款</span>
          <span class="value">{{ stats.mandatory_count }}</span>
        </div>
      </el-card>
      <el-card class="stats-card is-deadline" shadow="hover">
        <div class="stats-item">
          <span class="label">含截止时间</span>
          <span class="value">{{ stats.feature_stats?.deadline || 0 }}</span>
        </div>
      </el-card>
      <el-card class="stats-card is-score" shadow="hover">
        <div class="stats-item">
          <span class="label">含评分项</span>
          <span class="value">{{ stats.feature_stats?.score || 0 }}</span>
        </div>
      </el-card>
    </div>

    <!-- 筛选工具栏 -->
    <div class="filter-bar">
      <el-select
        v-model="filterType"
        placeholder="类型筛选"
        clearable
        style="width: 140px"
        @change="handleFilterChange"
      >
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
      <el-input
        v-model="searchKeyword"
        placeholder="搜索内容"
        clearable
        style="width: 200px"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      >
        <template #append>
          <el-button @click="handleSearch">搜索</el-button>
        </template>
      </el-input>
      <el-button @click="refresh" :loading="loading">刷新</el-button>
    </div>

    <!-- 分块表格 -->
    <el-table
      :data="list"
      v-loading="loading"
      empty-text="暂无分块数据"
      :max-height="520"
      @row-click="handleRowClick"
    >
      <el-table-column type="expand" width="36">
        <template #default="{ row }">
          <div class="chunk-expand">
            <div v-if="row.section_path || row.clause_no" class="expand-meta">
              <el-tag v-if="row.chunk_type" size="small" :type="getChunkTypeTag(row.chunk_type)">
                {{ row.chunk_type_display }}
              </el-tag>
              <span v-if="row.section_path" class="expand-section">{{ row.section_path }}</span>
              <span v-if="row.clause_no" class="expand-clause">条款号：{{ row.clause_no }}</span>
              <span class="expand-page">P{{ formatPageRange(row) }}</span>
              <el-tag v-if="row.is_mandatory" type="danger" size="small">强制</el-tag>
              <el-tag v-if="row.has_score" type="success" size="small">评分</el-tag>
              <el-tag v-if="row.has_deadline" type="warning" size="small">截止</el-tag>
            </div>
            <div class="expand-keywords" v-if="row.matched_keywords?.length">
              <el-tag v-for="kw in row.matched_keywords" :key="kw" size="small" type="info" effect="plain">
                {{ kw }}
              </el-tag>
            </div>
            <pre class="expand-content">{{ row.content }}</pre>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="chunk_index" label="序号" width="70" />
      <el-table-column prop="chunk_type_display" label="类型" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="getChunkTypeTag(row.chunk_type)">
            {{ row.chunk_type_display }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="chunk_level_display" label="层级" width="80" />
      <el-table-column prop="clause_no" label="条款号" width="100">
        <template #default="{ row }">
          <span class="clause-no">{{ row.clause_no || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="section_path" label="章节" min-width="150">
        <template #default="{ row }">
          <span class="section-text">{{ row.section_path || row.section_title || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="特征" width="140">
        <template #default="{ row }">
          <div class="feature-tags">
            <el-tag v-if="row.is_mandatory" type="danger" size="small">强制</el-tag>
            <el-tag v-if="row.has_score" type="success" size="small">评分</el-tag>
            <el-tag v-if="row.has_deadline" type="warning" size="small">截止</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="token_count" label="Tokens" width="80" />
      <el-table-column label="操作" width="80">
        <template #default="{ row }">
          <el-button size="small" link @click.stop="showChunkDetail(row)">
            详情
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <AppPagination
      v-model:page="query.page"
      v-model:page-size="query.pageSize"
      :total="total"
      @change="fetchList"
    />

    <!-- 详情抽屉 -->
    <el-drawer v-model="showDetailDrawer" title="分块详情" size="50%">
      <div class="chunk-detail" v-if="selectedChunk">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="ID">{{ selectedChunk.id }}</el-descriptions-item>
          <el-descriptions-item label="层级">{{ selectedChunk.chunk_level_display }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ selectedChunk.chunk_type_display }}</el-descriptions-item>
          <el-descriptions-item label="条款编号">{{ selectedChunk.clause_no || '-' }}</el-descriptions-item>
          <el-descriptions-item label="章节路径" :span="2">
            {{ selectedChunk.section_path || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="Token数">{{ selectedChunk.token_count }}</el-descriptions-item>
          <el-descriptions-item label="分类置信度">
            {{ selectedChunk.classification_confidence?.toFixed(2) || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="页码范围">
            {{ formatPageRange(selectedChunk) }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="detail-section" v-if="selectedChunk.matched_keywords?.length">
          <h4>匹配关键词</h4>
          <div class="keyword-tags">
            <el-tag v-for="kw in selectedChunk.matched_keywords" :key="kw" size="small">
              {{ kw }}
            </el-tag>
          </div>
        </div>

        <div class="detail-section">
          <h4>内容</h4>
          <pre class="content-text">{{ selectedChunk.content }}</pre>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { listChunks, getChunkStats, type TenderChunk, type ChunkStats } from '@/api/tender'
import { usePagination } from '@/composables/usePagination'
import AppPagination from '@/components/common/AppPagination.vue'

const props = defineProps<{
  parsedDocumentId: number
}>()

const stats = ref<ChunkStats | null>(null)
const filterType = ref('')
const searchKeyword = ref('')

const showDetailDrawer = ref(false)
const selectedChunk = ref<TenderChunk | null>(null)

// 使用 usePagination 管理分页
const {
  list,
  loading,
  total,
  query,
  fetchList,
  search,
  refresh,
} = usePagination<TenderChunk, { chunk_type: string; search: string }>({
  request: (params) => listChunks(props.parsedDocumentId, {
    chunk_type: params.chunk_type || undefined,
    search: params.search || undefined,
    with_content: 'true',
    page: params.page,
    page_size: params.page_size,
  }),
  defaultQuery: {
    chunk_type: '',
    search: '',
  },
  immediate: false,
})

// 加载统计数据
async function loadStats() {
  if (!props.parsedDocumentId) return

  try {
    const res = await getChunkStats(props.parsedDocumentId)
    stats.value = res.data
  } catch (err) {
    console.error('加载统计失败:', err)
  }
}

// 处理筛选变化
function handleFilterChange() {
  query.chunk_type = filterType.value
  search()
}

// 处理搜索
function handleSearch() {
  query.search = searchKeyword.value
  search()
}

function handleRowClick(row: TenderChunk) {
  showChunkDetail(row)
}

function showChunkDetail(chunk: TenderChunk) {
  selectedChunk.value = chunk
  showDetailDrawer.value = true
}

function formatPageRange(chunk: TenderChunk): string {
  if (chunk.page_start && chunk.page_end) {
    return `${chunk.page_start} - ${chunk.page_end}`
  }
  if (chunk.page_start) {
    return String(chunk.page_start)
  }
  return '-'
}

function getChunkTypeTag(type: string): string {
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

// 监听 parsedDocumentId 变化
watch(
  () => props.parsedDocumentId,
  (newId) => {
    if (newId) {
      fetchList()
      loadStats()
    }
  },
  { immediate: true }
)

onMounted(() => {
  if (props.parsedDocumentId) {
    fetchList()
    loadStats()
  }
})
</script>

<style scoped>
.chunk-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.stats-card {
  margin-bottom: 0;
}

.stats-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stats-item .label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.stats-item .value {
  font-size: 20px;
  font-weight: 600;
}

.stats-card.is-mandatory .stats-item .value {
  color: var(--el-color-danger);
}

.stats-card.is-deadline .stats-item .value {
  color: var(--el-color-warning);
}

.stats-card.is-score .stats-item .value {
  color: var(--el-color-primary);
}

.filter-bar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.clause-no {
  font-family: monospace;
  font-size: 12px;
}

.section-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feature-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
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
}

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

/* 行展开内容 */
.chunk-expand {
  padding: 8px 16px 16px;
  background: var(--el-fill-color-lighter);
}

.expand-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.expand-section {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.expand-clause,
.expand-page {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.expand-keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.expand-content {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: monospace;
  font-size: 13px;
  line-height: 1.6;
  max-height: 360px;
  overflow: auto;
  margin: 0;
}
</style>
