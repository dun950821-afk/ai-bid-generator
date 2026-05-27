<!-- frontend/src/components/playground/PromptPreviewPanel.vue -->
<script setup lang="ts">
/**
 * 提示词预览面板。
 * 支持：
 * - 安全高亮缺失变量（无 v-html）
 * - Token 估算进度条
 * - 复制功能
 */

import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument } from '@element-plus/icons-vue'
import { copyToClipboard } from '@/utils/clipboard'

interface PromptPart {
  text: string
  missing: boolean
}

const CONTEXT_LIMIT = 8192

const props = defineProps<{
  systemPrompt: string
  userPrompt: string
  missingVariables: string[]
  tokenEstimate: number
  loading?: boolean
}>()

// 安全分段渲染（无 v-html，避免 XSS）
function parsePromptParts(text: string, missingVars: string[]): PromptPart[] {
  if (!text) return []
  const parts: PromptPart[] = []
  const regex = /\{\{\s*(\w+)\s*\}\}/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    // 普通文本部分
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), missing: false })
    }
    // 变量部分
    const varName = match[1]
    parts.push({
      text: match[0],
      missing: missingVars.includes(varName),
    })
    lastIndex = match.index + match[0].length
  }
  // 剩余文本
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), missing: false })
  }
  return parts
}

const systemPromptParts = computed(() =>
  parsePromptParts(props.systemPrompt, props.missingVariables)
)

const userPromptParts = computed(() =>
  parsePromptParts(props.userPrompt, props.missingVariables)
)

// Token 进度
const tokenPercentage = computed(() =>
  Math.min(100, (props.tokenEstimate / CONTEXT_LIMIT) * 100)
)

const tokenColor = computed(() => {
  if (tokenPercentage.value > 100) return '#f56c6c'
  if (tokenPercentage.value > 80) return '#e6a23c'
  return '#67c23a'
})

// 复制功能
async function copyPrompt(type: 'system' | 'user' | 'all') {
  let text = ''
  let msg = ''
  if (type === 'system') {
    text = props.systemPrompt
    msg = 'System Prompt 已复制'
  } else if (type === 'user') {
    text = props.userPrompt
    msg = 'User Prompt 已复制'
  } else {
    text = `# System Prompt\n${props.systemPrompt}\n\n# User Prompt\n${props.userPrompt}`
    msg = '已复制全部 Prompt'
  }

  const success = await copyToClipboard(text)
  if (success) {
    ElMessage.success(msg)
  }
}
</script>

<template>
  <div class="preview-panel">
    <!-- Token 估算进度条 -->
    <div v-if="tokenEstimate > 0" class="token-section">
      <el-progress
        :percentage="tokenPercentage"
        :color="tokenColor"
        :stroke-width="6"
        :show-text="false"
      />
      <span class="token-text">~{{ tokenEstimate }} / {{ CONTEXT_LIMIT }} tokens</span>
    </div>

    <!-- System Prompt -->
    <div v-if="systemPrompt" class="prompt-section">
      <div class="section-header">
        <span>System Prompt</span>
        <el-button size="small" text @click="copyPrompt('system')">
          <el-icon><CopyDocument /></el-icon>
        </el-button>
      </div>
      <pre class="prompt-text">
        <span
          v-for="(part, index) in systemPromptParts"
          :key="index"
          :class="{ 'missing-var': part.missing }"
        >{{ part.text }}</span>
      </pre>
    </div>

    <!-- User Prompt -->
    <div class="prompt-section">
      <div class="section-header">
        <span>User Prompt</span>
        <el-button size="small" text @click="copyPrompt('user')">
          <el-icon><CopyDocument /></el-icon>
        </el-button>
      </div>
      <pre class="prompt-text">
        <span
          v-for="(part, index) in userPromptParts"
          :key="index"
          :class="{ 'missing-var': part.missing }"
        >{{ part.text }}</span>
      </pre>
    </div>

    <!-- 缺失变量提示 -->
    <div v-if="missingVariables.length" class="missing-alert">
      <el-alert type="warning" :closable="false">
        缺失变量: {{ missingVariables.join(', ') }}
      </el-alert>
    </div>

    <!-- 复制全部按钮 -->
    <div class="copy-all">
      <el-button size="small" @click="copyPrompt('all')">复制全部</el-button>
    </div>
  </div>
</template>

<style scoped>
.preview-panel {
  padding: 16px;
}

.token-section {
  margin-bottom: 16px;
}

.token-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  display: block;
}

.prompt-section {
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.prompt-text {
  margin: 0;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow: auto;
}

.missing-var {
  background-color: #fef0f0;
  color: #f56c6c;
  border-radius: 2px;
  padding: 0 2px;
}

.missing-alert {
  margin-bottom: 16px;
}

.copy-all {
  text-align: right;
}
</style>