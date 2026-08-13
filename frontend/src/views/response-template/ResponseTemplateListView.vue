<template>
  <div class="rt-list-page">
    <div class="rt-list-header">
      <div>
        <h2 class="rt-list-title">招标响应模板</h2>
        <p class="rt-list-sub">招标文件 → 响应文件: 识别格式 → 确认 → 生成 → 校对</p>
      </div>
      <div class="rt-list-filters">
        <el-input
          v-model="keyword"
          placeholder="搜索模板 / 项目 / 招标文件"
          clearable
          class="rt-list-search"
          @input="page = 1"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 130px" @change="page = 1">
          <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
      </div>
    </div>

    <div v-loading="loading">
      <el-empty v-if="!pagedTemplates.length && !loading" description="暂无响应模板, 请在招标文件详情页发起识别" />
      <div v-else class="rt-card-grid">
        <div
          v-for="t in pagedTemplates"
          :key="t.id"
          class="rt-card"
          @click="goDetail(t.id)"
        >
          <div class="rt-card-head">
            <span class="rt-card-name" :title="t.name">{{ t.name }}</span>
            <el-tag :type="statusType(t.status)" size="small" effect="dark">{{ t.status_display }}</el-tag>
          </div>
          <div class="rt-card-meta">
            <div class="rt-card-line" :title="t.project_name">
              <el-icon><Folder /></el-icon>{{ t.project_name || `项目 #${t.project}` }}
              <template v-if="t.lot_name"> · {{ t.lot_name }}</template>
            </div>
            <div class="rt-card-line" :title="t.source_file_name">
              <el-icon><Document /></el-icon>{{ t.source_file_name }}
            </div>
          </div>
          <div class="rt-card-foot">
            <el-progress
              :percentage="progressOf(t)"
              :stroke-width="6"
              :show-text="false"
              :status="t.status === 'failed' ? 'exception' : t.status === 'generated' ? 'success' : undefined"
              class="rt-card-progress"
            />
            <div class="rt-card-foot-text">
              <span>{{ stepText(t) }}</span>
              <span>{{ formatTime(t.updated_at) }}</span>
            </div>
          </div>
        </div>
      </div>
      <div v-if="filteredTemplates.length > pageSize" class="rt-list-pager">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="filteredTemplates.length"
          layout="total, prev, pager, next"
          background
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Document, Folder, Search } from '@element-plus/icons-vue'
import { listResponseTemplates, type ResponseTemplate } from '@/api/responseTemplate'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const templates = ref<ResponseTemplate[]>([])
const keyword = ref('')
const statusFilter = ref('')
const page = ref(1)
const pageSize = 12

const statusOptions = [
  { value: 'analyzing', label: '识别中' },
  { value: 'analyzed', label: '待确认' },
  { value: 'confirmed', label: '已确认' },
  { value: 'generating', label: '生成中' },
  { value: 'generated', label: '已生成' },
  { value: 'failed', label: '失败' },
]

const projectIdQuery = (route.query.project_id as string) || ''

const filteredTemplates = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return templates.value.filter((t) => {
    if (statusFilter.value && t.status !== statusFilter.value) return false
    if (kw) {
      const hay = `${t.name} ${t.project_name} ${t.source_file_name}`.toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
})

const pagedTemplates = computed(() => {
  const start = (page.value - 1) * pageSize
  return filteredTemplates.value.slice(start, start + pageSize)
})

/** 流程进度: 状态机 → 百分比 */
function progressOf(t: ResponseTemplate): number {
  switch (t.status) {
    case 'pending':
      return 10
    case 'analyzing':
      return 30
    case 'analyzed':
      return 55
    case 'confirmed':
      return 70
    case 'generating':
      return 85
    case 'generated':
      return 100
    case 'failed':
      return 30
    default:
      return 0
  }
}

function stepText(t: ResponseTemplate): string {
  switch (t.status) {
    case 'pending':
    case 'analyzing':
      return '识别响应格式中'
    case 'analyzed':
      return '待确认填充位置'
    case 'confirmed':
      return '待生成'
    case 'generating':
      return '生成中'
    case 'generated':
      return `${t.documents.length} 个产物, 可下载/校对`
    case 'failed':
      return '失败, 可重试'
    default:
      return ''
  }
}

function statusType(status: string): 'success' | 'info' | 'warning' | 'danger' | 'primary' {
  if (status === 'generated') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'confirmed') return 'warning'
  if (status === 'analyzed') return 'primary'
  return 'info'
}

function formatTime(t: string): string {
  return t ? t.replace('T', ' ').slice(0, 16) : ''
}

function goDetail(id: number) {
  router.push(`/response-templates/${id}`)
}

async function load() {
  loading.value = true
  try {
    const { data } = await listResponseTemplates(
      projectIdQuery ? { project_id: projectIdQuery } : undefined,
    )
    templates.value = Array.isArray(data) ? data : (data.results || [])
  } catch (e) {
    ElMessage.error('加载响应模板列表失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.rt-list-page {
  padding: 16px 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.rt-list-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.rt-list-title {
  margin: 0;
  font-size: 20px;
}

.rt-list-sub {
  margin: 4px 0 0;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.rt-list-filters {
  display: flex;
  gap: 10px;
}

.rt-list-search {
  width: 260px;
}

.rt-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
}

.rt-card {
  background: var(--app-card);
  border: 1px solid var(--app-border);
  border-radius: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.rt-card:hover {
  border-color: var(--app-primary);
  box-shadow: var(--app-shadow);
}

.rt-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.rt-card-name {
  font-weight: 600;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rt-card-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.rt-card-line {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--app-text-secondary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rt-card-progress {
  flex: 1;
}

.rt-card-foot-text {
  display: flex;
  justify-content: space-between;
  color: var(--app-text-secondary);
  font-size: 12px;
  margin-top: 6px;
}

.rt-list-pager {
  display: flex;
  justify-content: center;
  margin-top: 18px;
}
</style>
