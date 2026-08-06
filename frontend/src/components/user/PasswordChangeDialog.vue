<!-- 修改密码弹窗：POST /api/auth/change-password，本人主动改密 -->
<template>
  <el-dialog
    :model-value="visible"
    title="修改密码"
    width="460px"
    @update:model-value="(val: boolean) => emit('update:visible', val)"
    @closed="handleClosed"
  >
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="修改成功后请使用新密码登录"
      style="margin-bottom: 16px"
    />
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="旧密码" prop="old_password">
        <el-input
          v-model="form.old_password"
          type="password"
          show-password
          placeholder="请输入旧密码"
        />
      </el-form-item>
      <el-form-item label="新密码" prop="new_password">
        <el-input
          v-model="form.new_password"
          type="password"
          show-password
          placeholder="至少 8 位"
        />
      </el-form-item>
      <el-form-item label="确认密码" prop="confirm_password">
        <el-input
          v-model="form.confirm_password"
          type="password"
          show-password
          placeholder="再次输入新密码"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleSubmit">确认修改</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { changePassword } from '@/api/auth'
import { extractApiError } from '@/utils/errors'

const props = defineProps<{ visible: boolean; username?: string }>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  changed: []
}>()

const formRef = ref<FormInstance>()
const loading = ref(false)

const form = reactive({
  old_password: '',
  new_password: '',
  confirm_password: '',
})

const rules: FormRules = {
  old_password: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  new_password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, message: '新密码至少 8 位', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) => {
        if (!value) return callback()
        // 后端还有常见密码/相似性校验（无法在客户端完全复刻），此处先拦最常见的两类
        if (/^\d+$/.test(value)) {
          return callback(new Error('密码不能是纯数字'))
        }
        if (props.username && value.includes(props.username)) {
          return callback(new Error('密码不能包含用户名'))
        }
        if (value === form.old_password) {
          return callback(new Error('新密码不能与旧密码相同'))
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
  confirm_password: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) => {
        if (value && value !== form.new_password) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

function handleClosed() {
  formRef.value?.resetFields()
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    await changePassword({
      old_password: form.old_password,
      new_password: form.new_password,
    })
    ElMessage.success('密码已修改，请牢记新密码')
    emit('changed')
    emit('update:visible', false)
  } catch (err) {
    ElMessage.error(extractApiError(err, '修改密码失败'))
  } finally {
    loading.value = false
  }
}
</script>
