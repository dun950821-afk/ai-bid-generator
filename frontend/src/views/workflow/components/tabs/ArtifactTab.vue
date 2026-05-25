<!-- frontend/src/views/workflow/components/tabs/ArtifactTab.vue -->
<template>
  <div class="artifact-tab" v-loading="loading">
    <el-empty v-if="artifacts.length === 0" description="暂无产物" />
    <el-table v-else :data="artifacts" border>
      <el-table-column label="名称" prop="title" />
      <el-table-column label="类型" prop="artifact_type" width="120" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'ready' ? 'success' : 'info'" size="small">
            {{ row.status === 'ready' ? '就绪' : '生成中' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button
            v-if="row.previewable"
            type="primary"
            link
            @click="handlePreview(row)"
          >
            预览
          </el-button>
          <el-button
            v-if="row.download_url"
            type="primary"
            link
            @click="handleDownload(row)"
          >
            下载
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { workflowApi } from '@/api/workflow'

const props = defineProps<{
  nodeId: number
}>()

const loading = ref(false)
const artifacts = ref<any[]>([])

async function loadArtifacts() {
  loading.value = true
  try {
    const res = await workflowApi.getNodeArtifacts(props.nodeId)
    artifacts.value = res.data.results
  } finally {
    loading.value = false
  }
}

function handlePreview(artifact: any) {
  console.log('Preview artifact:', artifact)
}

function handleDownload(artifact: any) {
  if (artifact.download_url) {
    window.open(artifact.download_url, '_blank')
  }
}

onMounted(() => {
  loadArtifacts()
})
</script>

<style scoped>
.artifact-tab {
  padding: 16px;
}
</style>