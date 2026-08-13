<!-- 响应文件产物 ONLYOFFICE 在线校对(全屏页) -->
<template>
  <div class="word-editor-page">
    <div v-if="loading" class="loading-box">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>正在加载校对编辑器...</span>
    </div>

    <div v-else-if="error" class="error-box">
      <el-icon><WarningFilled /></el-icon>
      <div class="error-content">
        <h3>编辑器加载失败</h3>
        <p>{{ error }}</p>
        <el-button type="primary" @click="loadConfig">重新加载</el-button>
        <el-button @click="goBack">返回工作台</el-button>
      </div>
    </div>

    <DocumentEditor
      v-else-if="editorConfig && docsApiReady"
      id="onlyoffice-editor"
      class="onlyoffice-editor"
      :documentServerUrl="documentServerUrl"
      :config="editorConfig"
      :events_onDocumentReady="onDocumentReady"
      :events_onError="onError"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loading, WarningFilled } from '@element-plus/icons-vue'
import { DocumentEditor } from '@onlyoffice/document-editor-vue'
import { getResponseDocOnlyofficeConfig } from '@/api/responseTemplate'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref('')
const documentServerUrl = ref('')
const editorConfig = ref<Record<string, unknown> | null>(null)
const docsApiReady = ref(false)

onMounted(() => {
  loadConfig()
})

// 与 WordEditorView 同一考量: 先自行预加载 api.js 并重试, 避免组件内部注入失败白屏
function loadDocsApiScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).DocsAPI) {
      resolve()
      return
    }
    document.getElementById('onlyoffice-api-script')?.remove()
    const script = document.createElement('script')
    script.id = 'onlyoffice-api-script'
    script.type = 'text/javascript'
    script.src = `${url}web-apps/apps/api/documents/api.js`
    script.async = true
    script.onload = () => {
      if ((window as any).DocsAPI) resolve()
      else reject(new Error('DocsAPI 未定义'))
    }
    script.onerror = () => reject(new Error('api.js 加载失败'))
    document.body.appendChild(script)
  })
}

async function ensureDocsApi(url: string) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await loadDocsApiScript(url)
      docsApiReady.value = true
      return
    } catch (err) {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * attempt))
      } else {
        throw new Error(`ONLYOFFICE 服务（${url}）连接被中断，自动重试 3 次仍失败`)
      }
    }
  }
}

async function loadConfig() {
  loading.value = true
  error.value = ''
  try {
    const documentId = route.params.documentId
    if (!documentId) {
      error.value = '缺少文档 ID'
      return
    }
    const { data } = await getResponseDocOnlyofficeConfig(Number(documentId))
    await ensureDocsApi(data.documentServerUrl)
    documentServerUrl.value = data.documentServerUrl
    editorConfig.value = data.config
  } catch (err: unknown) {
    console.error('加载 ONLYOFFICE 配置失败:', err)
    error.value = formatErrorMessage(err)
  } finally {
    loading.value = false
  }
}

function onDocumentReady() {
  console.log('ONLYOFFICE 校对编辑器加载完成')
}

function onError(errorCode: unknown, errorDescription: unknown) {
  console.error('ONLYOFFICE error:', errorCode, errorDescription)
  error.value = `编辑器错误 (${errorCode}): ${errorDescription}`
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/response-templates')
  }
}

function formatErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message
  }
  const e = err as { response?: { status?: number; data?: { error?: string } } }
  if (e.response?.status === 404) return '文档不存在或已被删除'
  if (e.response?.status === 403) return '没有权限访问此文档'
  if (e.response?.data?.error) return e.response.data.error
  return '请检查 ONLYOFFICE 服务是否可访问'
}
</script>

<style scoped>
.word-editor-page {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #fff;
}

.loading-box,
.error-box {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #606266;
}

.loading-box .is-loading {
  font-size: 24px;
  animation: rotate 1s linear infinite;
}

.error-box {
  color: #f56c6c;
}

.error-box .el-icon {
  font-size: 48px;
}

.error-content {
  text-align: center;
}

.error-content h3 {
  margin: 0 0 8px;
  color: #303133;
}

.error-content p {
  margin: 0 0 16px;
  white-space: pre-line;
  color: #909399;
  font-size: 13px;
  line-height: 1.6;
}

.onlyoffice-editor {
  width: 100%;
  height: 100%;
}

.word-editor-page :deep(iframe) {
  width: 100% !important;
  height: 100% !important;
  border: none;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
