<!-- frontend/src/views/knowledge/components/KnowledgeBaseFormDialog.vue -->
<template>
  <el-dialog
    :model-value="modelValue"
    :title="knowledgeBase ? '编辑知识库' : '新建知识库'"
    width="520px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="名称" prop="name">
        <el-input v-model="form.name" placeholder="请输入知识库名称" />
      </el-form-item>

      <el-form-item label="类型" prop="kb_type">
        <el-select
          v-model="form.kb_type"
          :disabled="!!knowledgeBase"
          placeholder="请选择类型"
          style="width: 100%"
        >
          <el-option label="公司介绍" value="company_profile" />
          <el-option label="项目案例库" value="case_library" />
          <el-option label="资质证书库" value="qualification" />
          <el-option label="产品资料库" value="product" />
          <el-option label="历史标书库" value="bid_history" />
          <el-option label="技术方案库" value="technical_solution" />
        </el-select>
        <div v-if="knowledgeBase" class="hint">类型创建后不可修改</div>
      </el-form-item>

      <el-form-item label="可见范围" prop="visibility">
        <el-select
          v-model="form.visibility"
          :disabled="!!knowledgeBase"
          placeholder="请选择可见范围"
          style="width: 100%"
        >
          <el-option label="私有（仅自己）" value="private" />
          <el-option label="系统级（全租户）" value="system" />
        </el-select>
        <div v-if="knowledgeBase" class="hint">可见范围创建后不可修改</div>
        <div v-else class="hint">P0 阶段仅支持「私有」和「系统级」</div>
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
      <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
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
const submitting = ref(false)

const form = ref({
  name: '',
  kb_type: '',
  visibility: 'private',
  description: '',
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  kb_type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  visibility: [{ required: true, message: '请选择可见范围', trigger: 'change' }],
}

watch(
  () => props.modelValue,
  (val) => {
    if (val && props.knowledgeBase) {
      form.value = {
        name: props.knowledgeBase.name,
        kb_type: props.knowledgeBase.kb_type,
        visibility: props.knowledgeBase.visibility,
        description: props.knowledgeBase.description,
      }
    } else if (val) {
      form.value = {
        name: '',
        kb_type: '',
        visibility: 'private',
        description: '',
      }
    }
  }
)

const handleSubmit = async () => {
  const valid = await formRef.value?.validate()
  if (!valid) return

  submitting.value = true
  // 让父组件控制关闭时机（失败时不关闭）
  emit('submit', {
    name: form.value.name,
    kb_type: form.value.kb_type,
    visibility: form.value.visibility,
    description: form.value.description,
  })
  submitting.value = false
}
</script>

<style scoped>
.hint {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.4;
}
</style>
