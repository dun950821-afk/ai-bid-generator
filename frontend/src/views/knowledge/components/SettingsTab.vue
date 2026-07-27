<!-- frontend/src/views/knowledge/components/SettingsTab.vue -->
<template>
  <div class="settings-tab">
    <el-row :gutter="16">
      <el-col :span="14">
        <el-card shadow="never">
          <template #header>知识库设置</template>

          <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
            <el-form-item label="名称" prop="name">
              <el-input v-model="form.name" />
            </el-form-item>

            <el-form-item label="类型">
              <el-tag>{{ knowledgeBase.kb_type_display }}</el-tag>
              <span class="hint">类型创建后不可修改</span>
            </el-form-item>

            <el-form-item label="可见范围">
              <el-tag>{{ knowledgeBase.visibility_display }}</el-tag>
              <span class="hint">范围创建后不可修改</span>
            </el-form-item>

            <el-form-item label="描述" prop="description">
              <el-input v-model="form.description" type="textarea" :rows="3" />
            </el-form-item>

            <el-form-item label="状态">
              <el-switch v-model="form.is_active" active-text="启用" inactive-text="停用" />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <el-col :span="10">
        <el-card shadow="never" class="stats-card">
          <template #header>统计信息</template>
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-value">{{ knowledgeBase.document_count }}</div>
              <div class="stat-label">文档数</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ knowledgeBase.chunk_count }}</div>
              <div class="stat-label">分块数</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ knowledgeBase.is_active ? '启用' : '停用' }}</div>
              <div class="stat-label">状态</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ formatDate(knowledgeBase.created_at) }}</div>
              <div class="stat-label">创建时间</div>
            </div>
          </div>
        </el-card>

        <el-card shadow="never" class="ops-card">
          <template #header>运维操作</template>
          <el-button
            type="warning"
            plain
            :loading="rebuilding"
            style="width: 100%; margin-bottom: 8px"
            @click="handleRebuildIndex"
          >
            <el-icon class="mr-4"><Refresh /></el-icon>
            重建全文索引
          </el-button>
          <div class="ops-hint">仅刷新 search_vector 字段，不重跑解析/分块/嵌入。适用于检索结果异常时。</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import {
  updateKnowledgeBase,
  rebuildKnowledgeBaseIndex,
  type KnowledgeBase,
} from '@/api/knowledge'
import { extractApiError } from '@/utils/errors'

const props = defineProps<{
  knowledgeBase: KnowledgeBase
}>()

const emit = defineEmits<{
  updated: []
}>()

const formRef = ref<FormInstance>()
const saving = ref(false)
const rebuilding = ref(false)

const form = ref({
  name: '',
  description: '',
  is_active: true,
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
}

onMounted(() => {
  form.value = {
    name: props.knowledgeBase.name,
    description: props.knowledgeBase.description,
    is_active: props.knowledgeBase.is_active,
  }
})

const formatDate = (date: string) => {
  return new Date(date).toLocaleString('zh-CN')
}

const handleSave = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    await updateKnowledgeBase(props.knowledgeBase.id, form.value)
    ElMessage.success('保存成功')
    emit('updated')
  } catch (e) {
    ElMessage.error(extractApiError(e, '保存失败'))
  } finally {
    saving.value = false
  }
}

const handleRebuildIndex = async () => {
  try {
    await ElMessageBox.confirm(
      `确定重建知识库「${props.knowledgeBase.name}」的全文索引吗？任务将在后台执行，期间检索结果可能不稳定。`,
      '确认重建索引',
      { type: 'warning' }
    )
    rebuilding.value = true
    const res = await rebuildKnowledgeBaseIndex(props.knowledgeBase.id)
    ElMessage.success(res.data.message)
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(extractApiError(e, '提交重建任务失败'))
    }
  } finally {
    rebuilding.value = false
  }
}
</script>

<style scoped>
.settings-tab {
  padding: 0;
}

.stats-card {
  margin-bottom: 16px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.stat-item {
  text-align: center;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.stat-label {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.ops-hint {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
  margin-top: 4px;
}

.hint {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
}

.mr-4 {
  margin-right: 4px;
}
</style>
