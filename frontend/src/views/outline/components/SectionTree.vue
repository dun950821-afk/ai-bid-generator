<!-- frontend/src/views/outline/components/SectionTree.vue -->
<template>
  <div class="section-tree">
    <el-table
      :data="sections"
      row-key="id"
      :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
      :indent="24"
      @row-click="handleRowClick"
    >
      <el-table-column prop="title" label="章节标题">
        <template #default="{ row }">
          <span :style="{ paddingLeft: (row.level - 1) * 20 + 'px' }">
            <el-icon v-if="row.children_count > 0" class="tree-icon">
              <Folder />
            </el-icon>
            <el-icon v-else class="tree-icon">
              <Document />
            </el-icon>
            {{ row.title }}
          </span>
        </template>
      </el-table-column>

      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">
            {{ row.status_display }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="generation_status" label="生成状态" width="120">
        <template #default="{ row }">
          <el-tag
            v-if="row.generation_status !== 'not_started'"
            :type="getGenerationStatusType(row.generation_status)"
            size="small"
          >
            {{ row.generation_status_display }}
          </el-tag>
          <span v-else class="text-muted">-</span>
        </template>
      </el-table-column>

      <el-table-column prop="word_count" label="字数" width="80">
        <template #default="{ row }">
          {{ row.word_count || '-' }}
        </template>
      </el-table-column>

      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="handleGenerate(row)">
            生成
          </el-button>
          <el-button link type="primary" @click.stop="handleEdit(row)">
            编辑
          </el-button>
          <el-dropdown trigger="click" @command="(cmd: string) => handleCommand(cmd, row)">
            <el-button link>
              <el-icon><MoreFilled /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="add_child">添加子章节</el-dropdown-item>
                <el-dropdown-item command="versions">版本历史</el-dropdown-item>
                <el-dropdown-item command="delete" divided>删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { Folder, Document, MoreFilled } from '@element-plus/icons-vue'
import type { SectionTreeItem } from '@/api/outline'

defineProps<{
  sections: SectionTreeItem[]
}>()

const emit = defineEmits<{
  (e: 'generate', section: SectionTreeItem): void
  (e: 'edit', section: SectionTreeItem): void
  (e: 'add-child', section: SectionTreeItem): void
  (e: 'versions', section: SectionTreeItem): void
  (e: 'delete', section: SectionTreeItem): void
}>()

function handleRowClick(row: SectionTreeItem) {
  emit('edit', row)
}

function handleGenerate(row: SectionTreeItem) {
  emit('generate', row)
}

function handleEdit(row: SectionTreeItem) {
  emit('edit', row)
}

function handleCommand(cmd: string, row: SectionTreeItem) {
  switch (cmd) {
    case 'add_child':
      emit('add-child', row)
      break
    case 'versions':
      emit('versions', row)
      break
    case 'delete':
      emit('delete', row)
      break
  }
}

function getStatusType(status: string): string {
  const map: Record<string, string> = {
    draft: 'info',
    generated: 'success',
    reviewing: 'warning',
    approved: 'success',
    rejected: 'danger',
  }
  return map[status] || 'info'
}

function getGenerationStatusType(status: string): string {
  const map: Record<string, string> = {
    pending: 'warning',
    running: 'primary',
    success: 'success',
    failed: 'danger',
  }
  return map[status] || 'info'
}
</script>

<style scoped>
.section-tree {
  min-height: 200px;
}

.tree-icon {
  margin-right: 4px;
  vertical-align: middle;
}

.text-muted {
  color: var(--el-text-color-placeholder);
}
</style>
