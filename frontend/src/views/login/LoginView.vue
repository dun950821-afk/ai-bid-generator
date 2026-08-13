<template>
  <main class="login-page">
    <section class="brand-panel">
      <div class="brand-shell">
        <img src="/brand/logo.png" alt="国舜" class="brand-logo-img" />
        <div>
          <div class="brand-eyebrow">AI BID PLATFORM</div>
          <h1>AI 标书生成系统</h1>
        </div>
      </div>

      <div class="version-line">
        <span class="beta-badge">
          <span class="dot"></span>
          Web 测试版
        </span>
        <span class="version-text">v2.16.2 · 在线体验</span>
      </div>

      <p class="subtitle">企业级投标文件智能生成平台</p>
      <p class="description">
        从招标文件解析、知识库检索、章节生成到标书体检与导出，帮助投标团队更高效、更规范地完成标书生产。
      </p>

      <img src="/brand/hero.webp" alt="国舜招投标平台" class="brand-hero" />

      <a
        class="download-cta"
        :href="downloadUrl"
        download
        @click="handleDownloadClick"
      >
        <div class="cta-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 14v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
            <path d="M12 4v11" />
            <path d="m7 10 5 5 5-5" />
          </svg>
        </div>
        <div class="cta-body">
          <div class="cta-title">
            <span>推荐下载 Windows 桌面版</span>
            <span class="recommend-tag">推荐</span>
          </div>
          <div class="cta-meta">
            <span>Yibiao-2.16.2-win-x64.exe</span>
            <span class="dot-sep">·</span>
            <span>约 198 MB</span>
            <span class="dot-sep">·</span>
            <span>v2.16.2</span>
            <span class="dot-sep">·</span>
            <span>Windows 10/11 x64</span>
          </div>
          <div class="cta-hint">
            <span class="hint-dot"></span>
            桌面版离线可用、批量导出更快、支持本地文件直读
          </div>
        </div>
        <div class="cta-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </div>
      </a>

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
          <img src="/brand/icon-square.png" alt="国舜" class="mobile-brand-icon" />
          <span>AI 标书生成系统</span>
          <span class="beta-pill">测试版</span>
        </div>

        <div class="card-header">
          <div class="card-title-row">
            <h2>欢迎回来</h2>
            <span class="beta-pill soft">Web 测试版</span>
          </div>
          <p>当前为 Web 测试版，推荐使用 Windows 桌面版获得完整体验</p>
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

        <a class="card-download" :href="downloadUrl" download @click="handleDownloadClick">
          <span class="card-download-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 14v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
              <path d="M12 4v11" />
              <path d="m7 10 5 5 5-5" />
            </svg>
          </span>
          <span class="card-download-text">
            下载 Windows 桌面版
            <span class="card-download-meta">v2.16.2 · 198 MB</span>
          </span>
          <span class="card-download-arrow" aria-hidden="true">→</span>
        </a>
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

const DESKTOP_VERSION = '2.16.2'
const downloadUrl = `${import.meta.env.BASE_URL}downloads/Yibiao-${DESKTOP_VERSION}-win-x64.exe`

function handleDownloadClick() {
  // 留痕：可在埋点系统中替换为真实事件
  console.info('[analytics] desktop_download_click', { version: DESKTOP_VERSION })
}

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
  } catch (error) {
    const axiosError = error as { response?: { data?: { code?: string; message?: string } } }
    const code = axiosError.response?.data?.code
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
      errorMessage.value = axiosError.response?.data?.message || '登录失败，请检查账号或密码'
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
  padding: 48px 56px;
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
.brand-footer {
  position: relative;
  z-index: 1;
}

.brand-shell {
  display: flex;
  gap: 16px;
  align-items: center;
}

.brand-logo-img {
  height: 64px;
  width: auto;
  object-fit: contain;
  object-position: left center;
}

.mobile-brand-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.brand-hero {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 640px;
  margin: 0 0 24px;
  border-radius: var(--app-radius);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.1);
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

.version-line {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0 14px;
}

.beta-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(239, 68, 68, 0.14));
  border: 1px solid rgba(245, 158, 11, 0.45);
  color: #b45309;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.18);
}

.beta-badge .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.28);
  animation: pulse-dot 2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(0.85); }
}

.version-text {
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.brand-panel h1 {
  margin: 16px 0 0;
  font-size: 46px;
  line-height: 1.08;
  letter-spacing: -0.04em;
}

.subtitle {
  color: var(--app-text-primary);
  font-size: 20px;
  font-weight: 700;
  margin: 22px 0 8px;
}

.description {
  max-width: 620px;
  margin: 0 0 24px;
  color: var(--app-text-secondary);
  font-size: 15px;
  line-height: 1.75;
}

.brand-footer {
  display: flex;
  gap: 10px;
  margin-top: 24px;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.download-cta {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 20px;
  padding: 16px 18px;
  border-radius: 18px;
  text-decoration: none;
  color: inherit;
  background:
    linear-gradient(135deg, rgba(37, 99, 235, 0.92), rgba(16, 185, 129, 0.88));
  border: 1px solid rgba(255, 255, 255, 0.32);
  box-shadow:
    0 18px 38px -10px rgba(37, 99, 235, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.32);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  overflow: hidden;
}

.download-cta::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 90% 10%, rgba(255, 255, 255, 0.28), transparent 40%);
  pointer-events: none;
}

.download-cta:hover {
  transform: translateY(-2px);
  box-shadow:
    0 22px 48px -10px rgba(37, 99, 235, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

.download-cta:active {
  transform: translateY(0);
}

.cta-icon {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.36);
  backdrop-filter: blur(4px);
}

.cta-body {
  flex: 1;
  min-width: 0;
}

.cta-title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.recommend-tag {
  padding: 3px 9px;
  border-radius: 999px;
  background: #fff;
  color: #2563eb;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
}

.cta-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  color: rgba(255, 255, 255, 0.88);
  font-size: 12.5px;
  font-weight: 500;
}

.dot-sep {
  opacity: 0.55;
}

.cta-hint {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 8px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
  line-height: 1.5;
}

.hint-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #fff;
  opacity: 0.7;
}

.cta-arrow {
  flex-shrink: 0;
  color: #fff;
  opacity: 0.86;
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.download-cta:hover .cta-arrow {
  transform: translateX(4px);
  opacity: 1;
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

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 8px;
}

.card-title-row h2 {
  margin: 0;
  font-size: 28px;
}

.card-header p,
.terms {
  color: var(--app-text-secondary);
}

.beta-pill {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(239, 68, 68, 0.12));
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #b45309;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.beta-pill.soft {
  padding: 3px 8px;
  font-size: 10.5px;
}

.card-download {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
  padding: 12px 14px;
  border-radius: 12px;
  text-decoration: none;
  color: var(--app-primary);
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(16, 185, 129, 0.06));
  border: 1px dashed rgba(37, 99, 235, 0.35);
  transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.card-download:hover {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.14), rgba(16, 185, 129, 0.1));
  border-color: rgba(37, 99, 235, 0.6);
  transform: translateY(-1px);
}

.card-download-icon {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: rgba(37, 99, 235, 0.14);
  color: var(--app-primary);
}

.card-download-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--app-text-primary);
  line-height: 1.35;
}

.card-download-meta {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--app-text-secondary);
  letter-spacing: 0.02em;
}

.card-download-arrow {
  flex-shrink: 0;
  color: var(--app-primary);
  font-size: 16px;
  font-weight: 600;
  transition: transform 0.18s ease;
}

.card-download:hover .card-download-arrow {
  transform: translateX(3px);
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

@media (max-width: 520px) {
  .download-cta {
    flex-wrap: wrap;
    gap: 12px;
    padding: 16px;
  }

  .cta-arrow {
    display: none;
  }

  .cta-title {
    font-size: 15px;
  }

  .card-title-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
}
</style>
