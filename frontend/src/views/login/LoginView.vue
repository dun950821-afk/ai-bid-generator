<template>
  <main class="login-page">
    <section class="brand-panel">
      <div class="brand-shell">
        <div class="brand-logo">
          <span>AI</span>
        </div>
        <div>
          <div class="brand-eyebrow">AI BID PLATFORM</div>
          <h1>AI 标书生成系统</h1>
        </div>
      </div>

      <p class="subtitle">企业级投标文件智能生成平台</p>
      <p class="description">
        从招标文件解析、知识库检索、章节生成到标书体检与导出，帮助投标团队更高效、更规范地完成标书生产。
      </p>

      <div class="features">
        <div v-for="item in features" :key="item.title" class="feature-card">
          <div class="feature-icon">{{ item.icon }}</div>
          <div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.desc }}</p>
          </div>
        </div>
      </div>

      <div class="brand-footer">
        <span>私有化部署</span>
        <span>·</span>
        <span>企业数据隔离</span>
        <span>·</span>
        <span>权限审计</span>
      </div>
    </section>

    <section class="form-panel">
      <el-card class="login-card" shadow="never">
        <div class="mobile-brand">
          <div class="brand-logo small"><span>AI</span></div>
          <span>AI 标书生成系统</span>
        </div>

        <div class="card-header">
          <h2>欢迎回来</h2>
          <p>请输入账号和密码登录</p>
        </div>

        <el-alert
          v-if="errorMessage"
          :title="errorMessage"
          type="error"
          show-icon
          :closable="false"
          class="login-error"
        />

        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @keyup.enter="handleSubmit">
          <el-form-item label="账号" prop="username">
            <el-input
              v-model="form.username"
              size="large"
              placeholder="请输入账号"
              autocomplete="username"
              clearable
            />
          </el-form-item>

          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              size="large"
              placeholder="请输入密码"
              autocomplete="current-password"
              show-password
              type="password"
            />
          </el-form-item>

          <CaptchaInput
            v-if="captchaRequired"
            ref="captchaInputRef"
            @update="handleCaptchaChange"
          />

          <div class="form-row">
            <el-checkbox v-model="rememberMe">记住登录</el-checkbox>
            <el-link type="primary" underline="never">忘记密码？联系管理员</el-link>
          </div>

          <el-button type="primary" size="large" class="login-button" :loading="loading" @click="handleSubmit">
            登录系统
          </el-button>
        </el-form>

        <p class="terms">登录即表示你同意企业内部系统使用规范与数据保密要求。</p>
      </el-card>
    </section>
  </main>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { login } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import CaptchaInput from '@/components/auth/CaptchaInput.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const formRef = ref<FormInstance>()
const loading = ref(false)
const errorMessage = ref('')
const rememberMe = ref(false)
const captchaRequired = ref(false)
const captchaState = reactive({ token: '', answer: '' })
const captchaInputRef = ref<InstanceType<typeof CaptchaInput> | null>(null)

const form = reactive({
  username: '',
  password: '',
})

const rules: FormRules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

const features = [
  { icon: '📄', title: '招标文件智能解析', desc: '自动提取项目、资格、评分与风险信息' },
  { icon: '🧠', title: '知识库辅助生成', desc: '结合企业资料生成可追溯的章节初稿' },
  { icon: '✅', title: '标书体检与导出', desc: '检查响应、偏离、资质与格式后导出 Word/PDF' },
]

function handleCaptchaChange(payload: { token: string; answer: string }) {
  captchaState.token = payload.token
  captchaState.answer = payload.answer
}

async function handleSubmit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  errorMessage.value = ''
  try {
    const response = await login({
      username: form.username,
      password: form.password,
      // 未触发 captcha 时空串也无害 —— 后端 captcha_required 才会校验。
      captcha_token: captchaState.token,
      captcha_answer: captchaState.answer,
    })
    auth.setSession(response.data)

    if (response.data.must_change_password) {
      await router.push('/change-password')
      return
    }

    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.push(redirect)
  } catch (error: any) {
    const code = error.response?.data?.code
    if (code === 'captcha_required' || code === 'captcha_invalid') {
      // 第一次拿到 captcha_required 时把 input 渲染出来；onMounted 会自动
      // 拉题。captcha_invalid 时 token 已被后端一次性消费，必须刷新。
      const needsRefresh = captchaRequired.value && code === 'captcha_invalid'
      captchaRequired.value = true
      captchaState.token = ''
      captchaState.answer = ''
      if (needsRefresh) {
        await captchaInputRef.value?.refresh()
      }
      errorMessage.value =
        code === 'captcha_invalid' ? '验证码错误，请重新输入' : '为安全起见，请先完成验证码'
    } else {
      errorMessage.value = error.response?.data?.message || '登录失败，请检查账号或密码'
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(420px, 0.92fr);
  background:
    radial-gradient(circle at 18% 16%, rgba(37, 99, 235, 0.16), transparent 34%),
    radial-gradient(circle at 80% 88%, rgba(16, 185, 129, 0.12), transparent 28%),
    linear-gradient(135deg, #f8fbff 0%, #eef4ff 45%, #f7fafc 100%);
  color: var(--app-text-primary);
  overflow: hidden;
}

.brand-panel {
  position: relative;
  padding: 72px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.brand-panel::before,
.brand-panel::after {
  content: '';
  position: absolute;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.54);
  filter: blur(1px);
}

.brand-panel::before {
  width: 220px;
  height: 220px;
  right: 10%;
  top: 12%;
}

.brand-panel::after {
  width: 120px;
  height: 120px;
  left: 10%;
  bottom: 12%;
}

.brand-shell,
.subtitle,
.description,
.features,
.brand-footer {
  position: relative;
  z-index: 1;
}

.brand-shell {
  display: flex;
  gap: 16px;
  align-items: center;
}

.brand-logo {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: linear-gradient(135deg, #2563eb, #10b981);
  color: #fff;
  font-weight: 800;
  box-shadow: 0 18px 40px rgba(37, 99, 235, 0.22);
}

.brand-logo.small {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  font-size: 13px;
}

.brand-eyebrow {
  width: fit-content;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: var(--app-primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.brand-panel h1 {
  margin: 20px 0 0;
  font-size: 52px;
  line-height: 1.08;
  letter-spacing: -0.04em;
}

.subtitle {
  color: var(--app-text-primary);
  font-size: 22px;
  font-weight: 700;
  margin: 28px 0 10px;
}

.description {
  max-width: 640px;
  margin: 0 0 36px;
  color: var(--app-text-secondary);
  font-size: 16px;
  line-height: 1.8;
}

.features {
  display: grid;
  gap: 16px;
  max-width: 590px;
}

.feature-card {
  display: flex;
  gap: 16px;
  padding: 18px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(229, 231, 235, 0.82);
  border-radius: var(--app-radius);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(14px);
}

.feature-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: #f8fafc;
  font-size: 22px;
}

.feature-card h3 {
  margin: 0 0 6px;
  font-size: 16px;
}

.feature-card p {
  margin: 0;
  color: var(--app-text-secondary);
  line-height: 1.6;
}

.brand-footer {
  display: flex;
  gap: 10px;
  margin-top: 34px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.form-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
}

.login-card {
  width: 430px;
  border: 1px solid rgba(229, 231, 235, 0.9);
  border-radius: 24px;
  box-shadow: var(--app-shadow);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(18px);
}

.mobile-brand {
  display: none;
  align-items: center;
  gap: 10px;
  margin-bottom: 22px;
  font-weight: 800;
}

.card-header {
  margin-bottom: 28px;
}

.card-header h2 {
  margin: 0 0 8px;
  font-size: 28px;
}

.card-header p,
.terms {
  color: var(--app-text-secondary);
}

.login-error {
  margin-bottom: 18px;
}

.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 4px 0 22px;
}

.login-button {
  width: 100%;
  border-radius: 12px;
  font-weight: 700;
}

.terms {
  margin: 18px 0 0;
  font-size: 12px;
  text-align: center;
  line-height: 1.6;
}

@media (max-width: 960px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .brand-panel {
    display: none;
  }

  .form-panel {
    padding: 28px;
  }

  .login-card {
    width: 100%;
  }

  .mobile-brand {
    display: flex;
  }
}
</style>
