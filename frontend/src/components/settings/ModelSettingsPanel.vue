<template>
  <el-card shadow="never">
    <el-alert type="info" :closable="false" show-icon style="margin-bottom: 20px">
      <template #title>模型配置由「提示词管理」模块统一管理，此处仅显示默认模型状态</template>
    </el-alert>

    <!-- 供应商列表 -->
    <div class="section-title">模型供应商</div>
    <el-table :data="providers" border v-loading="loading">
      <el-table-column prop="name" label="供应商" width="150" />
      <el-table-column prop="provider_type" label="类型" width="150" />
      <el-table-column prop="base_url" label="Base URL" min-width="200" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
            {{ row.is_active ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>

    <!-- 模型配置 -->
    <div class="section-title" style="margin-top: 24px">默认模型配置</div>
    <el-table :data="groupedModels" border>
      <el-table-column label="类型" width="120">
        <template #default="{ row }">
          <el-tag :type="getModelTypeTag(row.type)" size="small">{{ row.typeLabel }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="模型名称" min-width="200">
        <template #default="{ row }">
          {{ row.config?.display_name || row.config?.model_name || '未配置' }}
        </template>
      </el-table-column>
      <el-table-column label="供应商" width="150">
        <template #default="{ row }">
          {{ row.config?.provider_name || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="默认" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.config?.is_default" type="success" size="small">是</el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.config" :type="row.config.is_active ? 'success' : 'info'" size="small">
            {{ row.config.is_active ? '启用' : '禁用' }}
          </el-tag>
          <el-tag v-else type="warning" size="small">未配置</el-tag>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ModelProvider, ModelConfig } from '@/api/systemConfig'

const props = defineProps<{
  providers: ModelProvider[]
  modelConfigs: ModelConfig[]
  loading?: boolean
}>()

const emit = defineEmits<{
  refresh: []
}>()

const groupedModels = computed(() => {
  const types = [
    { type: 'chat', typeLabel: 'Chat 模型' },
    { type: 'embedding', typeLabel: 'Embedding 模型' },
    { type: 'rerank', typeLabel: 'Rerank 模型' },
  ]

  return types.map(t => ({
    ...t,
    config: props.modelConfigs.find(m => m.model_type === t.type && m.is_default) || null,
  }))
})

function getModelTypeTag(type: string) {
  const map: Record<string, string> = {
    chat: 'primary',
    embedding: 'success',
    rerank: 'warning',
  }
  return map[type] || 'info'
}
</script>

<style scoped>
.section-title {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 12px;
}
</style>
