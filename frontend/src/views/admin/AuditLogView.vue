<template>
  <div class="audit-log-view">
    <el-page-header @back="() => router.push('/')" content="操作审计" />

    <!-- 统计卡片 -->
    <div class="stats-row">
      <div class="stat-card">
        <span class="stat-label">日志总数</span>
        <span class="stat-value">{{ stats.total.toLocaleString() }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">今日日志</span>
        <span class="stat-value">{{ stats.today.toLocaleString() }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">登录成功</span>
        <span class="stat-value stat-success">{{ loginSuccessCount.toLocaleString() }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">登录失败</span>
        <span class="stat-value stat-danger">{{ loginFailedCount.toLocaleString() }}</span>
      </div>
    </div>

    <div class="toolbar">
      <el-input
        v-model="searchText"
        placeholder="搜索摘要"
        clearable
        style="width: 180px"
        @clear="handleSearch"
        @keyup.enter="handleSearch"
      />
      <el-select
        v-model="filterAction"
        placeholder="操作类型"
        clearable
        filterable
        style="width: 160px"
        @change="handleSearch"
      >
        <el-option
          v-for="action in metaActions"
          :key="action"
          :label="getActionLabel(action)"
          :value="action"
        />
      </el-select>
      <el-select
        v-model="filterActorId"
        placeholder="操作者"
        clearable
        filterable
        remote
        :remote-method="searchActors"
        :loading="actorLoading"
        style="width: 160px"
        @change="handleSearch"
      >
        <el-option
          v-for="user in actorOptions"
          :key="user.id"
          :label="formatUser(user)"
          :value="user.id"
        />
      </el-select>
      <el-select
        v-model="filterTargetType"
        placeholder="对象类型"
        clearable
        filterable
        style="width: 140px"
        @change="handleSearch"
      >
        <el-option
          v-for="type in metaTargetTypes"
          :key="type"
          :label="type"
          :value="type"
        />
      </el-select>
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
        style="width: 240px"
        @change="handleSearch"
      />
      <el-button type="primary" @click="handleSearch">查询</el-button>
      <el-button :loading="exporting" @click="handleExport">
        <el-icon style="margin-right: 4px"><Download /></el-icon>
        导出 CSV
      </el-button>
    </div>

    <el-table :data="logs" v-loading="loading" border>
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column label="操作者" width="120">
        <template #default="{ row }">
          {{ row.actor_name || '系统' }}
        </template>
      </el-table-column>
      <el-table-column label="操作类型" width="120">
        <template #default="{ row }">
          <el-tag :type="getActionType(row.action)" size="small">
            {{ getActionLabel(row.action) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="target_type" label="对象类型" width="120" />
      <el-table-column prop="summary" label="摘要" min-width="200" />
      <el-table-column prop="ip" label="IP" width="140" />
      <el-table-column prop="created_at" label="时间" width="180">
        <template #default="{ row }">
          {{ formatDateTime(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="80" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link size="small" @click="showDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-row">
      <el-pagination
        :current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        @current-change="handlePageChange"
        @size-change="handleSizeChange"
      />
    </div>

    <!-- 详情弹窗 -->
    <el-dialog v-model="showDetailDialog" title="操作详情" width="600px">
      <el-descriptions v-if="selectedLog" :column="2" border>
        <el-descriptions-item label="ID">{{ selectedLog.id }}</el-descriptions-item>
        <el-descriptions-item label="操作者">{{ selectedLog.actor_name || '系统' }}</el-descriptions-item>
        <el-descriptions-item label="操作类型">{{ getActionLabel(selectedLog.action) }}</el-descriptions-item>
        <el-descriptions-item label="对象类型">{{ selectedLog.target_type }}</el-descriptions-item>
        <el-descriptions-item label="对象ID">{{ selectedLog.target_id }}</el-descriptions-item>
        <el-descriptions-item label="IP">{{ selectedLog.ip }}</el-descriptions-item>
        <el-descriptions-item label="时间" :span="2">{{ formatDateTime(selectedLog.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="摘要" :span="2">{{ selectedLog.summary }}</el-descriptions-item>
        <el-descriptions-item label="User-Agent" :span="2">{{ selectedLog.user_agent }}</el-descriptions-item>
      </el-descriptions>
      <div v-if="selectedLog?.extra && Object.keys(selectedLog.extra).length > 0" style="margin-top: 16px">
        <h4>附加信息</h4>
        <pre class="extra-json">{{ JSON.stringify(selectedLog.extra, null, 2) }}</pre>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import {
  listAuditLogs,
  getAuditLogDetail,
  getAuditMeta,
  getAuditStats,
  exportAuditLogs,
  type OperationLog,
  type OperationLogDetail,
  type AuditActionCount,
} from '@/api/audit'
import { userApi, type User } from '@/api/admin'

// 操作类型中文映射（未知值回退显示原始 action）
const ACTION_LABELS: Record<string, string> = {
  login_success: '登录成功',
  login_failed: '登录失败',
  user_create: '创建用户',
  user_update: '更新用户',
  user_disable: '禁用用户',
  user_enable: '启用用户',
  password_changed: '修改密码',
  password_reset: '重置密码',
  role_create: '创建角色',
  role_update: '更新角色',
  role_delete: '删除角色',
  company_create: '创建公司',
  company_update: '更新公司',
  company_delete: '删除公司',
  company_set_default: '设为默认公司',
  material_create: '上传材料',
  material_update: '更新材料',
  material_delete: '删除材料',
  material_download: '下载材料',
  material_archive: '归档材料',
  material_replace: '替换材料',
  package_create: '创建材料包',
  package_delete: '删除材料包',
  'knowledge.create': '知识库创建',
  'model_config.create': '创建模型配置',
  'model_config.update': '更新模型配置',
  'model_config.set_default': '设为默认模型',
  'model_provider.update': '更新模型服务商',
  'prompt_version.copy_draft': '复制草稿版本',
  'prompt_version.delete': '删除版本',
  'task_queue.force_stop': '强制结束任务',
  'tender.reparse': '重新解析招标文件',
  'tender.merge_parse': '合并解析招标文件',
}

const router = useRouter()

const loading = ref(false)
const exporting = ref(false)
const logs = ref<OperationLog[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)

const searchText = ref('')
const filterAction = ref('')
const filterActorId = ref<number | null>(null)
const filterTargetType = ref('')
const dateRange = ref<[string, string] | null>(null)

const metaActions = ref<string[]>([])
const metaTargetTypes = ref<string[]>([])
const actorOptions = ref<User[]>([])
const actorLoading = ref(false)

const stats = ref({ total: 0, today: 0, by_action: [] as AuditActionCount[] })
const loginSuccessCount = computed(
  () => stats.value.by_action.find((item) => item.action === 'login_success')?.count ?? 0,
)
const loginFailedCount = computed(
  () => stats.value.by_action.find((item) => item.action === 'login_failed')?.count ?? 0,
)

const showDetailDialog = ref(false)
const selectedLog = ref<OperationLogDetail | null>(null)

function buildParams(page?: number) {
  const params: Record<string, unknown> = {}
  if (searchText.value) params.search = searchText.value
  if (filterAction.value) params.action = filterAction.value
  if (filterActorId.value) params.actor_id = filterActorId.value
  if (filterTargetType.value) params.target_type = filterTargetType.value
  if (dateRange.value) {
    params.start_date = dateRange.value[0]
    params.end_date = dateRange.value[1]
  }
  params.page = page ?? currentPage.value
  params.page_size = pageSize.value
  return params
}

async function loadLogs() {
  loading.value = true
  try {
    const res = await listAuditLogs(buildParams())
    logs.value = res.data.results
    total.value = res.data.count
  } catch (e) {
    ElMessage.error('获取审计日志失败')
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  try {
    const res = await getAuditStats(buildParams(1))
    stats.value = res.data
  } catch {
    // 统计失败不阻塞页面，保留上一次数值
  }
}

async function loadMeta() {
  try {
    const res = await getAuditMeta()
    metaActions.value = res.data.actions
    metaTargetTypes.value = res.data.target_types
  } catch {
    // 元数据失败时下拉为空，功能降级但不报错
  }
}

async function loadActors() {
  actorLoading.value = true
  try {
    const res = await userApi.list({ page_size: 50 })
    actorOptions.value = res.data.results
  } catch {
    actorOptions.value = []
  } finally {
    actorLoading.value = false
  }
}

async function searchActors(query: string) {
  actorLoading.value = true
  try {
    const res = await userApi.list({ search: query, page_size: 50 })
    actorOptions.value = res.data.results
  } catch {
    actorOptions.value = []
  } finally {
    actorLoading.value = false
  }
}

function formatUser(user: User) {
  return user.real_name ? `${user.real_name} (${user.username})` : user.username
}

function handleSearch() {
  currentPage.value = 1
  loadLogs()
  loadStats()
}

function handlePageChange(page: number) {
  currentPage.value = page
  loadLogs()
}

function handleSizeChange(size: number) {
  pageSize.value = size
  currentPage.value = 1
  loadLogs()
}

async function handleExport() {
  exporting.value = true
  try {
    await exportAuditLogs(buildParams())
    ElMessage.success('日志已导出')
  } catch (e) {
    ElMessage.error('导出失败，请稍后重试')
  } finally {
    exporting.value = false
  }
}

function getActionLabel(action: string) {
  return ACTION_LABELS[action] || action
}

function getActionType(action: string) {
  // 兼容下划线（material_create）与点号（knowledge.create）两种 action 命名
  if (action === 'login_success') return 'success'
  if (action === 'login_failed') return 'danger'
  const kind = action.replace('.', '_')
  if (kind.includes('_create') || kind.includes('_upload') || kind.includes('_set_default')) {
    return 'primary'
  }
  if (kind.includes('_update') || kind.includes('_replace') || kind.includes('_changed')) {
    return 'warning'
  }
  if (kind.includes('_delete') || kind.includes('_archive') || kind.includes('_disable')) {
    return 'danger'
  }
  return 'info'
}

async function showDetail(row: OperationLog) {
  try {
    const res = await getAuditLogDetail(row.id)
    selectedLog.value = res.data
    showDetailDialog.value = true
  } catch (e) {
    ElMessage.error('获取详情失败')
  }
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('zh-CN')
}

onMounted(() => {
  loadMeta()
  loadActors()
  loadLogs()
  loadStats()
})
</script>

<style scoped>
.audit-log-view {
  padding: 20px;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin: 20px 0 0;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
}

.stat-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
}

.stat-success {
  color: var(--el-color-success);
}

.stat-danger {
  color: var(--el-color-danger);
}

.toolbar {
  display: flex;
  gap: 12px;
  margin: 16px 0;
  flex-wrap: wrap;
}

.pagination-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.extra-json {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  overflow: auto;
}
</style>
