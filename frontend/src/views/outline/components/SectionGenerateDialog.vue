<!-- frontend/src/views/outline/components/SectionGenerateDialog.vue -->
<template>
  <el-dialog
    v-model="visible"
    :title="`生成章节：${section?.title || ''}`"
    width="700px"
    :close-on-click-modal="false"
  >
    <div v-loading="analyzing" class="generate-content">
      <!-- AI 分析结果 -->
      <el-card shadow="never" class="analysis-card">
        <template #header>
          <div class="card-header">
            <span>AI 分析结果</span>
            <el-button link @click="handleReanalyze" :loading="analyzing">
              重新分析
            </el-button>
          </div>
        </template>

        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="检索关键词">
            <el-tag
              v-for="kw in analysisResult.keywords"
              :key="kw"
              size="small"
              class="keyword-tag"
            >
              {{ kw }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="背景说明">
            {{ analysisResult.background }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="suggested-prompt">
          <div class="label">AI 建议提示：</div>
          <div class="content">{{ analysisResult.suggested_prompt }}</div>
        </div>
      </el-card>

      <!-- AI 提示词框 -->
      <el-card shadow="never" class="prompt-card">
        <template #header>
          <span>AI 提示词框（可编辑）</span>
        </template>
        <el-input
          v-model="userPrompt"
          type="textarea"
          :rows="6"
          placeholder="请输入您的补充要求，AI 将根据这些要求生成章节内容..."
        />
      </el-card>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleGenerate" :loading="generating">
        确认生成
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  analyzeSection,
  generateSection,
  type SectionTreeItem,
  type AnalysisResult,
} from '@/api/outline'

const props = defineProps<{
  modelValue: boolean
  section: SectionTreeItem | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'success', taskId: number): void
}>()

const visible = ref(false)
const analyzing = ref(false)
const generating = ref(false)
const userPrompt = ref('')
const analysisResult = ref<AnalysisResult>({
  keywords: [],
  knowledge_types: [],
  requirement_types: [],
  background: '',
  suggested_prompt: '',
})

watch(
  () => props.modelValue,
  (val) => {
    visible.value = val
    if (val && props.section) {
      handleAnalyze()
    }
  }
)

watch(visible, (val) => {
  emit('update:modelValue', val)
})

async function handleAnalyze() {
  if (!props.section) return

  analyzing.value = true
  try {
    const res = await analyzeSection(props.section.id)
    analysisResult.value = res.data
    userPrompt.value = res.data.suggested_prompt || ''
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '分析失败')
  } finally {
    analyzing.value = false
  }
}

function handleReanalyze() {
  handleAnalyze()
}

async function handleGenerate() {
  if (!props.section) return

  generating.value = true
  try {
    const res = await generateSection(props.section.id, {
      user_prompt: userPrompt.value,
      analysis_result: analysisResult.value,
      force: false,
    })
    ElMessage.success('章节生成任务已提交')
    emit('success', res.data.task_id)
    visible.value = false
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '生成失败')
  } finally {
    generating.value = false
  }
}
</script>

<style scoped>
.generate-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.analysis-card,
.prompt-card {
  margin-bottom: 0;
}

.keyword-tag {
  margin-right: 4px;
  margin-bottom: 4px;
}

.suggested-prompt {
  margin-top: 12px;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

.suggested-prompt .label {
  font-weight: 500;
  margin-bottom: 4px;
}

.suggested-prompt .content {
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
}
</style>
