<template>
  <main class="change-page">
    <el-card class="change-card" shadow="never">
      <h2>修改初始密码</h2>
      <p>为了账号安全，请先修改密码后继续使用系统。</p>

      <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon :closable="false" />

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="旧密码" prop="old_password">
          <el-input v-model="form.old_password" type="password" show-password size="large" />
        </el-form-item>
        <el-form-item label="新密码" prop="new_password">
          <el-input v-model="form.new_password" type="password" show-password size="large" />
        </el-form-item>
        <el-button type="primary" size="large" :loading="loading" class="submit" @click="handleSubmit">
          保存并进入系统
        </el-button>
      </el-form>
    </el-card>
  </main>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { useRouter } from 'vue-router'
import { changePassword } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const formRef = ref<FormInstance>()
const loading = ref(false)
const errorMessage = ref('')

const form = reactive({
  old_password: '',
  new_password: '',
})

const rules: FormRules = {
  old_password: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  new_password: [{ required: true, min: 8, message: '新密码至少 8 位', trigger: 'blur' }],
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  errorMessage.value = ''
  try {
    await changePassword(form)
    auth.mustChangePassword = false
    await router.push('/dashboard')
  } catch (error) {
    const axiosError = error as { response?: { data?: { message?: string } } }
    errorMessage.value = axiosError.response?.data?.message || '修改密码失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.change-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--app-bg);
}
.change-card {
  width: 420px;
  border-radius: 20px;
  box-shadow: var(--app-shadow);
}
.submit {
  width: 100%;
}
</style>
