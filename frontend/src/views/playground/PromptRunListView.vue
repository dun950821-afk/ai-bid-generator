<!-- frontend/src/views/playground/PromptRunListView.vue -->
<script setup lang="ts">
/**
 * 运行记录列表视图。
 */

import { ref, onMounted } from 'vue'
import { logError } from '@/utils/logger'
import { useRouter } from 'vue-router'
import { ElTable, ElTableColumn, ElTag, ElButton, ElPagination } from 'element-plus'
import { promptRunApi, type PromptRun } from '@/api/prompt-playground'
import { getStatusLabel, getStatusType } from '@/utils/status'

const router = useRouter()

const runs = ref<PromptRun[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

async function loadRuns() {
  loading.value = true
  try {
    const res = await promptRunApi.list({
      limit: pageSize.value,
      offset: (page.value - 1) * pageSize.value,
    })
    runs.value = res.data
    // 假设返回的是数组，无分页信息
    total.value = runs.value.length
  } catch (e) {
    logError('加载运行记录失败', e)
  } finally {
    loading.value = false
  }
}

function viewDetail(id: number) {
  router.push(`/playground/runs/${id}`)
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('zh-CN')
}

onMounted(() => {
  loadRuns()
})
</script>

<template>
  <div class="run-list-view">
    <div class="header">
      <h2>运行记录</h2>
      <el-button @click="router.push('/playground')">返回 Playground</el-button>
    </div>

    <el-table :data="runs" v-loading="loading" stripe>
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="template_name" label="模板" min-width="150" />
      <el-table-column prop="version_number" label="版本" width="100" />
      <el-table-column prop="model_name" label="模型" min-width="120" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">
            {{ getStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Token" width="100">
        <template #default="{ row }">
          {{ row.total_tokens }}
        </template>
      </el-table-column>
      <el-table-column label="耗时" width="80">
        <template #default="{ row }">
          {{ row.latency_ms }}ms
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="160">
        <template #default="{ row }">
          {{ formatDateTime(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column prop="created_by_name" label="创建人" width="100" />
      <el-table-column label="操作" width="80" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="viewDetail(row.id)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      layout="total, sizes, prev, pager, next"
      @change="loadRuns"
    />
  </div>
</template>

<style scoped>
.run-list-view {
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header h2 {
  margin: 0;
  font-size: 18px;
}
</style>