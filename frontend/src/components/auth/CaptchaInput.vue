<template>
  <div class="captcha-input">
    <div class="captcha-question">
      <span class="question-label">请回答：</span>
      <span class="question-text">{{ question || '加载中…' }}</span>
      <el-button text type="primary" :disabled="loading" @click="refresh">
        换一题
      </el-button>
    </div>
    <el-input
      v-model="answer"
      size="large"
      placeholder="请输入计算结果"
      @input="emitChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchCaptcha } from '@/api/auth'

const emit = defineEmits<{
  update: [payload: { token: string; answer: string }]
}>()

const token = ref('')
const question = ref('')
const answer = ref('')
const loading = ref(false)

async function refresh() {
  loading.value = true
  try {
    const res = await fetchCaptcha()
    token.value = res.data.captcha_token
    question.value = res.data.question
    answer.value = ''
    emitChange()
  } finally {
    loading.value = false
  }
}

function emitChange() {
  emit('update', { token: token.value, answer: answer.value })
}

onMounted(refresh)

defineExpose({ refresh })
</script>

<style scoped>
.captcha-input {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 18px;
  padding: 14px 16px;
  border: 1px solid rgba(229, 231, 235, 0.9);
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.6);
}
.captcha-question {
  display: flex;
  align-items: center;
  gap: 10px;
}
.question-label {
  color: var(--app-text-secondary);
  font-size: 13px;
}
.question-text {
  font-family: 'JetBrains Mono', Menlo, monospace;
  font-weight: 700;
  font-size: 16px;
  color: var(--app-text-primary);
}
</style>
