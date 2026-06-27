<!-- frontend/src/components/outline/SectionReferenceSources.vue -->
<template>
  <div class="reference-sources">
    <div v-if="loading" class="loading-tip">加载中...</div>
    <div v-else-if="sources.length === 0" class="empty-tip">
      本次生成未使用 RAG 参考来源
    </div>
    <div v-else>
      <div class="panel-hint">本次 AI 生成时使用的参考来源，人工编辑后可能不一致。</div>
      <div v-for="(src, idx) in sources" :key="idx" class="source-item">
        <div class="source-header">
          <span class="source-rank">#{{ src.rank }}</span>
          <span class="source-title">{{ src.document_title }}</span>
          <el-tag size="small" type="info">{{ channelLabel(src.channel) }}</el-tag>
          <el-tag size="small">{{ src.kb_name }}</el-tag>
          <span class="source-score">分数 {{ src.score }}</span>
        </div>
        <div class="source-meta">
          <span v-if="src.section_path">路径: {{ src.section_path }}</span>
          <span v-if="src.page_start">页码: {{ src.page_start }}-{{ src.page_end }}</span>
        </div>
      </div>
      <el-collapse class="trace-collapse">
        <el-collapse-item title="检索 trace（调试）" name="trace">
          <pre>{{ JSON.stringify(trace, null, 2) }}</pre>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { getSectionLatestRecord } from '@/api/outlineKb'

const props = defineProps<{ sectionId: number }>()

const loading = ref(false)
const sources = ref<Array<Record<string, any>>>([])
const trace = ref<Record<string, any>>({})

const CHANNEL_LABELS: Record<string, string> = {
  company_info: '公司信息',
  historical_bid: '历史标书',
  project_case: '项目案例',
  certificate: '资质证书',
  personnel: '人员资料',
}

function channelLabel(ch: string) {
  return CHANNEL_LABELS[ch] || ch
}

async function loadRecord() {
  loading.value = true
  try {
    const res = await getSectionLatestRecord(props.sectionId)
    const data = res.data as any
    sources.value = data.rag_sources || []
    trace.value = (data.generation_meta || {}).retrieval || {}
  } catch {
    sources.value = []
  } finally {
    loading.value = false
  }
}

watch(() => props.sectionId, loadRecord, { immediate: true })
</script>

<style scoped>
.loading-tip,
.empty-tip {
  color: #909399;
  padding: 16px;
  text-align: center;
}
.panel-hint {
  color: #909399;
  font-size: 12px;
  margin-bottom: 12px;
}
.source-item {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 8px;
}
.source-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.source-rank {
  font-weight: 600;
  color: #409eff;
}
.source-title {
  font-weight: 500;
}
.source-score {
  margin-left: auto;
  color: #909399;
  font-size: 12px;
}
.source-meta {
  font-size: 12px;
  color: #909399;
  display: flex;
  gap: 16px;
}
.trace-collapse {
  margin-top: 16px;
}
.trace-collapse pre {
  font-size: 12px;
  background: #f5f7fa;
  padding: 12px;
  overflow-x: auto;
}
</style>
