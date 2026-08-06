<!-- 个人信息修改弹窗：PATCH /api/auth/me，本人资料字段 -->
<template>
  <el-dialog
    :model-value="visible"
    title="修改个人信息"
    width="460px"
    @update:model-value="(val: boolean) => emit('update:visible', val)"
    @closed="handleClosed"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="用户名">
        <el-input :model-value="username" disabled />
      </el-form-item>
      <el-form-item label="姓名" prop="real_name">
        <el-input v-model="form.real_name" placeholder="请输入姓名" maxlength="50" />
      </el-form-item>
      <el-form-item label="邮箱" prop="email">
        <el-input v-model="form.email" placeholder="请输入邮箱" />
      </el-form-item>
      <el-form-item label="手机号" prop="phone">
        <el-input v-model="form.phone" placeholder="请输入手机号" />
      </el-form-item>
      <el-form-item label="部门" prop="department">
        <el-input v-model="form.department" placeholder="请输入部门" maxlength="50" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { updateMe } from '@/api/auth'
import { extractApiError } from '@/utils/errors'

const props = defineProps<{
  visible: boolean
  username: string
  realName?: string
  email?: string
  phone?: string
  department?: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: [payload: { real_name?: string; email?: string; phone?: string; department?: string }]
}>()

const formRef = ref<FormInstance>()
const loading = ref(false)

const form = reactive({
  real_name: '',
  email: '',
  phone: '',
  department: '',
})

const rules: FormRules = {
  email: [{ type: 'email', message: '邮箱格式不正确', trigger: 'blur' }],
  phone: [
    {
      pattern: /^$|^1\d{10}$/,
      message: '手机号格式不正确',
      trigger: 'blur',
    },
  ],
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      form.real_name = props.realName ?? ''
      form.email = props.email ?? ''
      form.phone = props.phone ?? ''
      form.department = props.department ?? ''
    }
  },
)

function handleClosed() {
  formRef.value?.resetFields()
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    const payload = {
      real_name: form.real_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      department: form.department.trim(),
    }
    await updateMe(payload)
    ElMessage.success('个人信息已更新')
    emit('saved', payload)
    emit('update:visible', false)
  } catch (err) {
    ElMessage.error(extractApiError(err, '保存失败'))
  } finally {
    loading.value = false
  }
}
</script>
