<template>
  <div class="version-tab">
    <el-table
      :data="versions"
      v-loading="loading"
      empty-text="暂无解析版本"
    >
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag v-if="row.is_active" type="success" size="small">当前版本</el-tag>
          <el-tag v-else type="info" size="small">历史版本</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="parser_version" label="解析版本" width="120" />
      <el-table-column prop="parse_engine" label="解析引擎" width="120" />
      <el-table-column prop="parse_quality" label="解析质量" width="100">
        <template #default="{ row }">
          <el-tag :type="getQualityTag(row.parse_quality)" size="small">
            {{ row.parse_quality }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="page_count" label="页数" width="80" />
      <el-table-column prop="chunk_count" label="分块数" width="80" />
      <el-table-column prop="created_at" label="创建时间" width="160">
        <template #default="{ row }">
          {{ formatDateTime(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button
            v-if="!row.is_active"
            type="primary"
            size="small"
            :loading="activateLoading === row.id"
            @click="handleActivate(row)"
          >
            设为当前
          </el-button>
          <span v-else class="active-text">当前使用</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getParseVersions, activateParseVersion, type ParseVersion } from '@/api/tender'
import { normalizeList } from '@/utils/normalize'

const props = defineProps<{
  tenderFileId: number
  currentVersionId: number | null | undefined
}>()

const emit = defineEmits<{
  activated: []
}>()

const loading = ref(false)
const versions = ref<ParseVersion[]>([])
const activateLoading = ref<number | null>(null)

async function loadVersions() {
  loading.value = true
  try {
    const res = await getParseVersions(props.tenderFileId)
    versions.value = normalizeList<ParseVersion>(res as unknown as { data: { results: ParseVersion[] } })
  } catch (err) {
    console.error('加载版本列表失败:', err)
  } finally {
    loading.value = false
  }
}

async function handleActivate(version: ParseVersion) {
  try {
    await ElMessageBox.confirm(
      '切换解析版本只会改变当前展示的解析结果，不会自动同步已有条款抽取、响应矩阵或大纲。如需保持一致，请切换后重新执行条款抽取。',
      '切换解析版本',
      { type: 'warning', confirmButtonText: '确认切换', cancelButtonText: '取消' }
    )
    activateLoading.value = version.id
    await activateParseVersion(props.tenderFileId, version.id)
    ElMessage.success('解析版本已切换，已有条款可能与当前解析版本不一致，如需同步请重新抽取')
    emit('activated')
    loadVersions()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '操作失败')
    }
  } finally {
    activateLoading.value = null
  }
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getQualityTag(quality: string): string {
  const map: Record<string, string> = {
    high: 'success',
    medium: 'warning',
    low: 'danger',
  }
  return map[quality] || 'info'
}

onMounted(() => {
  loadVersions()
})
</script>

<style scoped>
.version-tab {
  padding: 0;
}

.active-text {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>