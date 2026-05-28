<template>
  <div class="upload-view">
    <div class="page-header">
      <div>
        <h1>招标文件上传</h1>
        <p>通过 MinIO 预签名 URL 直传文件，上传完成后自动创建解析任务。</p>
      </div>
    </div>

    <el-card class="config-card" shadow="never">
      <el-form inline>
        <el-form-item label="项目 ID">
          <el-input-number v-model="projectId" :min="1" />
        </el-form-item>
        <el-form-item label="标段 ID">
          <el-input-number v-model="lotId" :min="1" placeholder="可选" />
        </el-form-item>
      </el-form>
      <p class="hint">v1 暂用项目 ID/标段 ID 手工输入；完整项目选择器由 projects 模块后续实现。</p>
    </el-card>

    <PresignedFileUploader :project-id="projectId" :lot-id="lotId" @uploaded="loadFiles" />

    <el-card class="list-card" shadow="never">
      <template #header>已上传文件</template>
      <el-table :data="files" empty-text="暂无文件">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="original_name" label="文件名" />
        <el-table-column prop="file_category" label="类别" width="120" />
        <el-table-column prop="status" label="状态" width="140" />
        <el-table-column prop="created_at" label="上传时间" width="220" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PresignedFileUploader from '@/components/upload/PresignedFileUploader.vue'
import { listTenderFiles } from '@/api/tender'

const projectId = ref(1)
const lotId = ref<number | null>(null)
const files = ref<any[]>([])

async function loadFiles() {
  const res = await listTenderFiles({ project_id: projectId.value })
  files.value = res.data
}
</script>

<style scoped>
.upload-view {
  display: grid;
  gap: 18px;
}
.page-header {
  padding: 26px;
  border-radius: 24px;
  background: #ffffff;
  border: 1px solid var(--app-border);
}
.page-header h1 {
  margin: 0 0 8px;
}
.page-header p,
.hint {
  margin: 0;
  color: var(--app-text-secondary);
}
.config-card,
.list-card {
  border-radius: 18px;
}
</style>
