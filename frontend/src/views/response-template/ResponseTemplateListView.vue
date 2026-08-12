<template>
  <div class="page-container">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>招标响应模板</span>
          <el-input
            v-model="projectId"
            placeholder="按项目 ID 过滤"
            clearable
            style="width: 200px"
            @change="load"
          />
        </div>
      </template>

      <el-table :data="templates" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="name" label="模板名称" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <el-link type="primary" @click="goDetail(row.id)">{{ row.name }}</el-link>
          </template>
        </el-table-column>
        <el-table-column prop="source_file_name" label="源招标文件" min-width="200" show-overflow-tooltip />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)">{{ row.status_display }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="置信度" width="90">
          <template #default="{ row }">
            <span v-if="row.confidence != null">{{ (row.confidence * 100).toFixed(0) }}%</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="170">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="goDetail(row.id)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { listResponseTemplates, type ResponseTemplate } from '@/api/responseTemplate'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const templates = ref<ResponseTemplate[]>([])
const projectId = ref((route.query.project_id as string) || '')

function statusType(status: string): 'success' | 'info' | 'warning' | 'danger' {
  if (status === 'generated') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'confirmed') return 'warning'
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
    const { data } = await listResponseTemplates({ project_id: projectId.value || undefined })
    // DRF 列表接口返回分页格式 {count, results}, 兼容数组
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
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
