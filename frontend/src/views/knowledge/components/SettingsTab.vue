<!-- frontend/src/views/knowledge/components/SettingsTab.vue -->
<template>
  <el-card shadow="never">
    <template #header>知识库设置</template>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="名称" prop="name">
        <el-input v-model="form.name" />
      </el-form-item>

      <el-form-item label="类型">
        <el-tag>{{ knowledgeBase.kb_type_display }}</el-tag>
      </el-form-item>

      <el-form-item label="可见范围">
        <el-tag>{{ knowledgeBase.visibility_display }}</el-tag>
      </el-form-item>

      <el-form-item label="描述" prop="description">
        <el-input v-model="form.description" type="textarea" :rows="3" />
      </el-form-item>

      <el-form-item label="状态">
        <el-switch v-model="form.is_active" active-text="启用" inactive-text="停用" />
      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { updateKnowledgeBase, type KnowledgeBase } from '@/api/knowledge'

const props = defineProps<{
  knowledgeBase: KnowledgeBase
}>()

const emit = defineEmits<{
  updated: []
}>()

const formRef = ref<FormInstance>()

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

const handleSave = async () => {
  const valid = await formRef.value?.validate()
  if (!valid) return

  try {
    await updateKnowledgeBase(props.knowledgeBase.id, form.value)
    ElMessage.success('保存成功')
    emit('updated')
  } catch (e) {
    ElMessage.error('保存失败')
  }
}
</script>