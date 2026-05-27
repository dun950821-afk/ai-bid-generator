<!-- frontend/src/views/playground/PromptRunDetailView.vue -->
<script setup lang="ts">
/**
 * 运行记录详情视图。
 */

import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElButton, ElTag, ElDescriptions, ElDescriptionsItem, ElAlert } from 'element-plus'
import { promptRunApi, type PromptRunDetail } from '@/api/prompt-playground'
import { getStatusLabel, getStatusType, isErrorStatus } from '@/utils/status'

const route = useRoute()
const router = useRouter()

const run = ref<PromptRunDetail | null>(null)
const loading = ref(false)

async function loadRun() {
  const id = parseInt(route.params.id as string, 10)
  if (!id) return

  loading.value = true
  try {
    const res = await promptRunApi.get(id)
    run.value = res.data
  } catch (e) {
    console.error('加载运行记录失败', e)
  } finally {
    loading.value = false
  }
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('zh-CN')
}

function goBack() {
  router.push('/playground/runs')
}

onMounted(() => {
  loadRun()
})
</script>

<template>
  <div class="run-detail-view" v-loading="loading">
    <div class="header">
      <el-button @click="goBack">返回列表</el-button>
      <h2>运行记录 #{{ run?.id }}</h2>
      <el-tag v-if="run" :type="getStatusType(run.status)">{{ getStatusLabel(run.status) }}</el-tag>
    </div>

    <template v-if="run">
      <!-- 基本信息 -->
      <el-descriptions title="基本信息" :column="3" border>
        <el-descriptions-item label="模板">{{ run.template_name }}</el-descriptions-item>
        <el-descriptions-item label="模板Key">{{ run.template_key }}</el-descriptions-item>
        <el-descriptions-item label="版本">{{ run.version_number }}</el-descriptions-item>
        <el-descriptions-item label="模型">{{ run.model_name }}</el-descriptions-item>
        <el-descriptions-item label="供应商">{{ run.model_provider }}</el-descriptions-item>
        <el-descriptions-item label="创建人">{{ run.created_by_name }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDateTime(run.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="Prompt Tokens">{{ run.prompt_tokens }}</el-descriptions-item>
        <el-descriptions-item label="Completion Tokens">{{ run.completion_tokens }}</el-descriptions-item>
        <el-descriptions-item label="总 Tokens">{{ run.total_tokens }}</el-descriptions-item>
        <el-descriptions-item label="耗时">{{ run.latency_ms }}ms</el-descriptions-item>
      </el-descriptions>

      <!-- 输入变量 -->
      <el-descriptions title="输入变量" :column="1" border style="margin-top: 20px">
        <el-descriptions-item>
          <pre class="json-content">{{ JSON.stringify(run.input_variables, null, 2) }}</pre>
        </el-descriptions-item>
      </el-descriptions>

      <!-- 提示词 -->
      <div class="prompt-section">
        <h4>System Prompt</h4>
        <pre class="prompt-content">{{ run.rendered_system_prompt || '(空)' }}</pre>
      </div>

      <div class="prompt-section">
        <h4>User Prompt</h4>
        <pre class="prompt-content">{{ run.rendered_user_prompt }}</pre>
      </div>

      <!-- RAG 信息 -->
      <template v-if="run.rag_info?.enabled">
        <el-descriptions title="RAG 信息" :column="2" border style="margin-top: 20px">
          <el-descriptions-item label="检索日志ID">{{ run.rag_info.retrieval_log_id }}</el-descriptions-item>
          <el-descriptions-item label="来源数量">{{ run.rag_info.sources?.length || 0 }}</el-descriptions-item>
          <el-descriptions-item label="上下文预览" :span="2">
            <pre class="json-content">{{ run.rag_info.context_preview }}</pre>
          </el-descriptions-item>
        </el-descriptions>
      </template>

      <!-- 输出结果 -->
      <div class="output-section">
        <h4>
          输出结果
          <el-tag v-if="run.schema_valid" type="success" size="small">Schema 有效</el-tag>
          <el-tag v-else type="danger" size="small">Schema 失败</el-tag>
        </h4>

        <el-alert
          v-if="!run.schema_valid && run.schema_errors?.length"
          type="error"
          :closable="false"
          style="margin-bottom: 12px"
        >
          <template #title>Schema 校验错误</template>
          <ul style="margin: 0; padding-left: 16px">
            <li v-for="(err, i) in run.schema_errors" :key="i">{{ err }}</li>
          </ul>
        </el-alert>

        <pre class="output-content">{{ run.output_text }}</pre>
      </div>

      <!-- 错误信息 -->
      <el-alert
        v-if="run.error_message"
        type="error"
        :closable="false"
        style="margin-top: 20px"
      >
        <template #title>错误信息</template>
        {{ run.error_message }}
      </el-alert>
    </template>
  </div>
</template>

<style scoped>
.run-detail-view {
  padding: 20px;
  max-width: 1200px;
}

.header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.header h2 {
  margin: 0;
  flex: 1;
}

.json-content,
.prompt-content,
.output-content {
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

.prompt-section,
.output-section {
  margin-top: 20px;
}

.prompt-section h4,
.output-section h4 {
  margin: 0 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>