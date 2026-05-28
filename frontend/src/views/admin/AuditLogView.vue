<template>
  <div class="audit-log-view">
    <el-page-header @back="() => router.push('/')" content="操作审计" />

    <div class="toolbar">
      <el-input
        v-model="searchText"
        placeholder="搜索摘要"
        clearable
        style="width: 200px"
        @clear="loadLogs"
        @keyup.enter="loadLogs"
      />
      <el-select v-model="filterAction" placeholder="操作类型" clearable @change="loadLogs">
        <el-option label="登录" value="login" />
        <el-option label="登出" value="logout" />
        <el-option label="创建" value="create" />
        <el-option label="更新" value="update" />
        <el-option label="删除" value="delete" />
      </el-select>
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
        @change="loadLogs"
      />
      <el-button type="primary" @click="loadLogs">查询</el-button>
    </div>

    <el-table :data="safeLogs" v-loading="loading" border>
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column label="操作者" width="120">
        <template #default="{ row }">
          {{ row.actor_name || '系统' }}
        </template>
      </el-table-column>
      <el-table-column prop="action" label="操作类型" width="100">
        <template #default="{ row }">
          <el-tag :type="getActionType(row.action)" size="small">
            {{ row.action }}
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

    <!-- 详情弹窗 -->
    <el-dialog v-model="showDetailDialog" title="操作详情" width="600px">
      <el-descriptions v-if="selectedLog" :column="2" border>
        <el-descriptions-item label="ID">{{ selectedLog.id }}</el-descriptions-item>
        <el-descriptions-item label="操作者">{{ selectedLog.actor_name || '系统' }}</el-descriptions-item>
        <el-descriptions-item label="操作类型">{{ selectedLog.action }}</el-descriptions-item>
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
import { listAuditLogs, getAuditLogDetail, type OperationLog, type OperationLogDetail } from '@/api/audit'
import { normalizeList } from '@/utils/normalize'

const router = useRouter()

const loading = ref(false)
const logs = ref<OperationLog[]>([])
const searchText = ref('')
const filterAction = ref('')
const dateRange = ref<[string, string] | null>(null)

const showDetailDialog = ref(false)
const selectedLog = ref<OperationLogDetail | null>(null)

const safeLogs = computed(() => Array.isArray(logs.value) ? logs.value : [])

async function loadLogs() {
  loading.value = true
  try {
    const params: Record<string, unknown> = {}
    if (searchText.value) params.search = searchText.value
    if (filterAction.value) params.action = filterAction.value
    if (dateRange.value) {
      params.start_date = dateRange.value[0]
      params.end_date = dateRange.value[1]
    }
    const res = await listAuditLogs(params)
    logs.value = normalizeList<OperationLog>(res)
  } catch (e) {
    ElMessage.error('获取审计日志失败')
  } finally {
    loading.value = false
  }
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

function getActionType(action: string) {
  const map: Record<string, string> = {
    login: 'success',
    logout: 'info',
    create: 'primary',
    update: 'warning',
    delete: 'danger',
  }
  return map[action] || 'info'
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('zh-CN')
}

onMounted(() => {
  loadLogs()
})
</script>

<style scoped>
.audit-log-view {
  padding: 20px;
}

.toolbar {
  display: flex;
  gap: 12px;
  margin: 20px 0;
  flex-wrap: wrap;
}

.extra-json {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  overflow: auto;
}
</style>
