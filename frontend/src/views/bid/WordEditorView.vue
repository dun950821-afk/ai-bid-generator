<!-- frontend/src/views/bid/WordEditorView.vue -->
<template>
  <div class="word-editor-page">
    <div v-if="loading" class="loading-box">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>正在加载 Word 编辑器...</span>
    </div>

    <div v-else-if="error" class="error-box">
      <el-icon><WarningFilled /></el-icon>
      <div class="error-content">
        <h3>Word 编辑器加载失败</h3>
        <p>{{ error }}</p>
        <el-button type="primary" @click="loadConfig">重新加载</el-button>
      </div>
    </div>

    <DocumentEditor
      v-else-if="editorConfig"
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
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Loading, WarningFilled } from '@element-plus/icons-vue'
import { DocumentEditor } from '@onlyoffice/document-editor-vue'
import { getOnlyofficeConfig, type OnlyofficeConfig } from '@/api/bidDocument'

const route = useRoute()

const loading = ref(true)
const error = ref('')
const documentServerUrl = ref('')
const editorConfig = ref<OnlyofficeConfig['config'] | null>(null)

onMounted(() => {
  loadConfig()
})

async function loadConfig() {
  loading.value = true
  error.value = ''

  try {
    const documentId = route.params.documentId
    if (!documentId) {
      error.value = '缺少文档 ID'
      return
    }

    const res = await getOnlyofficeConfig(Number(documentId))
    const data = res.data

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
  console.log('ONLYOFFICE 编辑器加载完成')
}

function onError(errorCode: unknown, errorDescription: unknown) {
  console.error('ONLYOFFICE error:', errorCode, errorDescription)
  error.value = `编辑器错误 (${errorCode}): ${errorDescription}`
}

function formatErrorMessage(err: unknown): string {
  const e = err as { response?: { status?: number; data?: { error?: string; message?: string } } }
  if (e.response?.status === 404) {
    return '文档不存在或已被删除'
  }
  if (e.response?.status === 403) {
    return '没有权限访问此文档'
  }
  if (e.response?.data?.error) {
    return e.response.data.error
  }
  if (e.response?.data?.message) {
    return e.response.data.message
  }
  return '请检查：\n1. ONLYOFFICE 服务是否可访问（http://163.7.6.60:8082/）\n2. Word 文件是否可下载\n3. 回调地址是否可访问\n4. JWT 密钥是否一致'
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
  margin: 0 0 8px 0;
  color: #303133;
}

.error-content p {
  margin: 0 0 16px 0;
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