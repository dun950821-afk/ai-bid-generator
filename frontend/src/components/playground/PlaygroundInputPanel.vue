<!-- frontend/src/components/playground/PlaygroundInputPanel.vue -->
<!-- Playground 文档输入面板：粘贴文本 / 上传文档（解析不落库） -->
<template>
  <div class="playground-input-panel">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="粘贴文本" name="paste">
        <el-input
          v-model="textModel"
          type="textarea"
          :rows="8"
          resize="vertical"
          placeholder="粘贴招标文件全文或片段，用于测试文档类模板…"
        />
        <div class="input-footer">
          <span :class="['char-count', { 'is-over': charCount > MAX_TEXT_CHARS }]">
            {{ charCount.toLocaleString() }} / {{ MAX_TEXT_CHARS.toLocaleString() }} 字符
          </span>
          <el-button text type="primary" :disabled="!modelValue" @click="clearText">清空</el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="上传文档" name="upload">
        <el-upload
          ref="uploadRef"
          class="upload-area"
          drag
          :auto-upload="false"
          :show-file-list="false"
          accept=".pdf,.doc,.docx,.txt,.md,.markdown"
          :on-change="handleFileChange"
          :disabled="parsing"
        >
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">
            拖拽文件到此处，或 <em>点击选择</em>
          </div>
          <template #tip>
            <div class="el-upload__tip">支持 PDF / Word / TXT / Markdown，最大 20MB</div>
          </template>
        </el-upload>

        <el-alert
          v-if="parsing"
          type="info"
          :closable="false"
          show-icon
          class="parsing-alert"
          title="正在解析文档…"
          :description="parseHint"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, type UploadFile, type UploadInstance } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { playgroundApi } from '@/api/prompt-playground'
import { extractApiError } from '@/utils/errors'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const MAX_TEXT_CHARS = 200_000
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 与后端 PLAYGROUND_MAX_DOCUMENT_SIZE 一致
const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt', 'md', 'markdown']

const activeTab = ref('paste')
const uploadRef = ref<UploadInstance>()
const parsing = ref(false)
const parseHint = ref('')

const textModel = computed({
  get: () => props.modelValue,
  set: (value: string) => {
    if (value.length > MAX_TEXT_CHARS) {
      // 硬上限：截断并警告，避免把超大文本塞进渲染请求
      value = value.slice(0, MAX_TEXT_CHARS)
      ElMessage.warning(`文本超过 ${MAX_TEXT_CHARS.toLocaleString()} 字符上限，已截断`)
    }
    emit('update:modelValue', value)
  },
})

const charCount = computed(() => props.modelValue.length)

function clearText() {
  emit('update:modelValue', '')
}

function getExtension(filename: string): string {
  if (!filename.includes('.')) return ''
  return filename.split('.').pop()!.toLowerCase()
}

async function handleFileChange(file: UploadFile) {
  const raw = file.raw
  if (!raw) return
  uploadRef.value?.clearFiles()

  // 客户端预检：扩展名 + 大小（避免无意义占用一次解析）
  const ext = getExtension(raw.name)
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    ElMessage.error(`不支持的文件格式: ${ext}`)
    return
  }
  if (raw.size > MAX_FILE_SIZE) {
    ElMessage.error(`文件大小超过 20MB 限制`)
    return
  }

  parsing.value = true
  parseHint.value = ext === 'doc' ? 'doc 需经 ONLYOFFICE 转换，最坏可能需要几分钟，请耐心等待…' : '正在提取文本…'
  try {
    const res = await playgroundApi.parseDocument(raw)
    emit('update:modelValue', res.data.text)
    if (res.data.parse_quality !== 'high') {
      ElMessage.warning(res.data.error_message || `解析质量一般（${res.data.parse_quality}），请检查提取结果`)
    }
    // 切回粘贴 Tab，方便用户直接看到并微调提取出的文本
    activeTab.value = 'paste'
  } catch (err) {
    ElMessage.error(extractApiError(err, '文档解析失败'))
  } finally {
    parsing.value = false
  }
}
</script>

<style scoped>
.input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
}

.char-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.char-count.is-over {
  color: var(--el-color-danger);
}

.upload-area :deep(.el-upload),
.upload-area :deep(.el-upload-dragger) {
  width: 100%;
}

.parsing-alert {
  margin-top: 12px;
}
</style>
