<template>
  <div class="chunk-tab">
    <!-- 统计卡片 -->
    <div class="stats-cards" v-if="stats">
      <el-card class="stats-card">
        <div class="stats-item">
          <span class="label">总分块数</span>
          <span class="value">{{ stats.total_count }}</span>
        </div>
      </el-card>
      <el-card class="stats-card">
        <div class="stats-item">
          <span class="label">强制条款</span>
          <span class="value">{{ stats.mandatory_count }}</span>
        </div>
      </el-card>
      <el-card class="stats-card">
        <div class="stats-item">
          <span class="label">含截止时间</span>
          <span class="value">{{ stats.feature_stats?.deadline || 0 }}</span>
        </div>
      </el-card>
      <el-card class="stats-card">
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
        @change="loadChunks"
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
        @keyup.enter="loadChunks"
        @clear="loadChunks"
      >
        <template #append>
          <el-button @click="loadChunks">搜索</el-button>
        </template>
      </el-input>
      <el-button @click="loadChunks" :loading="loading">刷新</el-button>
    </div>

    <!-- 分块表格 -->
    <el-table
      :data="chunks"
      v-loading="loading"
      empty-text="暂无分块数据"
      :max-height="500"
      @row-click="handleRowClick"
    >
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
import { ref, onMounted } from 'vue'
import { listChunks, getChunkStats, type TenderChunk, type ChunkStats } from '@/api/tender'

const props = defineProps<{
  parsedDocumentId: number
}>()

const loading = ref(false)
const chunks = ref<TenderChunk[]>([])
const stats = ref<ChunkStats | null>(null)
const filterType = ref('')
const searchKeyword = ref('')

const showDetailDrawer = ref(false)
const selectedChunk = ref<TenderChunk | null>(null)

async function loadChunks() {
  if (!props.parsedDocumentId) {
    chunks.value = []
    return
  }

  loading.value = true
  try {
    const res = await listChunks(props.parsedDocumentId, {
      chunk_type: filterType.value || undefined,
      search: searchKeyword.value || undefined,
      with_content: 'true',
    })
    // 使用 normalize 处理列表数据
    chunks.value = (res.data as TenderChunk[]) || []
  } catch (err) {
    console.error('加载分块失败:', err)
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  if (!props.parsedDocumentId) return

  try {
    const res = await getChunkStats(props.parsedDocumentId)
    stats.value = res.data
  } catch (err) {
    console.error('加载统计失败:', err)
  }
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

onMounted(() => {
  loadChunks()
  loadStats()
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
</style>