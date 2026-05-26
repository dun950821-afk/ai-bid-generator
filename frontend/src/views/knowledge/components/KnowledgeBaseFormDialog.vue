<!-- frontend/src/views/knowledge/components/KnowledgeBaseFormDialog.vue -->
<template>
  <el-dialog
    :model-value="modelValue"
    :title="knowledgeBase ? '编辑知识库' : '新建知识库'"
    width="500px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="名称" prop="name">
        <el-input v-model="form.name" placeholder="请输入知识库名称" />
      </el-form-item>

      <el-form-item label="类型" prop="kb_type">
        <el-select v-model="form.kb_type" placeholder="请选择类型" style="width: 100%">
          <el-option label="公司介绍" value="company_profile" />
          <el-option label="项目案例库" value="case_library" />
          <el-option label="资质证书库" value="qualification" />
          <el-option label="产品资料库" value="product" />
          <el-option label="历史标书库" value="bid_history" />
          <el-option label="技术方案库" value="technical_solution" />
        </el-select>
      </el-form-item>

      <el-form-item label="描述" prop="description">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          placeholder="请输入描述"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import type { KnowledgeBase } from '@/api/knowledge'

const props = defineProps<{
  modelValue: boolean
  knowledgeBase?: KnowledgeBase | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [data: Partial<KnowledgeBase>]
}>()

const formRef = ref<FormInstance>()

const form = ref({
  name: '',
  kb_type: '',
  description: '',
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  kb_type: [{ required: true, message: '请选择类型', trigger: 'change' }],
}

watch(
  () => props.modelValue,
  (val) => {
    if (val && props.knowledgeBase) {
      form.value = {
        name: props.knowledgeBase.name,
        kb_type: props.knowledgeBase.kb_type,
        description: props.knowledgeBase.description,
      }
    } else if (val) {
      form.value = { name: '', kb_type: '', description: '' }
    }
  }
)

const handleSubmit = async () => {
  const valid = await formRef.value?.validate()
  if (!valid) return

  emit('submit', {
    name: form.value.name,
    kb_type: form.value.kb_type,
    description: form.value.description,
  })
}
</script>