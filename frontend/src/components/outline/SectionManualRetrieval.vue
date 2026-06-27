<!-- frontend/src/components/outline/SectionManualRetrieval.vue -->
<template>
  <div class="manual-retrieval">
    <div class="search-bar">
      <el-input v-model="query" placeholder="检索词（默认章节标题+写作范围）" class="query-input" />
      <el-select
        v-model="selectedChannels"
        multiple
        placeholder="通道（空=全部）"
        class="channel-select"
      >
        <el-option label="公司信息" value="company_info" />
        <el-option label="历史标书" value="historical_bid" />
        <el-option label="项目案例" value="project_case" />
        <el-option label="资质证书" value="certificate" />
        <el-option label="人员资料" value="personnel" />
      </el-select>
      <el-button type="primary" :loading="searching" @click="handleSearch">检索</el-button>
    </div>

    <div class="hint">
      手动检索结果不会覆盖本次生成参考来源。勾选后的材料可用于下一次重新生成或人工补充正文。
    </div>

    <div v-if="results.length > 0" class="results-section">
      <div class="section-title">检索结果（{{ results.length }}）</div>
      <div v-for="(r, idx) in results" :key="idx" class="result-item">
        <el-checkbox v-model="checkedIds" :label="r.chunk_id">
          <span class="result-title">{{ r.document_title }}</span>
          <el-tag size="small" type="info">{{ r.channel }}</el-tag>
          <span class="result-score">{{ r.score }}</span>
        </el-checkbox>
        <div class="result-preview">{{ (r.content_preview || '').slice(0, 100) }}...</div>
      </div>
      <el-button
        type="success"
        :disabled="checkedIds.length === 0"
        :loading="saving"
        @click="handleSave"
      >
        加入本章节参考材料（{{ checkedIds.length }}）
      </el-button>
    </div>

    <div v-if="savedSources.length > 0" class="saved-section">
      <div class="section-title">已保存的人工选源（{{ savedSources.length }}）</div>
      <div v-for="s in savedSources" :key="s.id" class="saved-item">
        <span>{{ s.document_title }}</span>
        <el-tag size="small">{{ s.channel }}</el-tag>
        <el-button type="danger" size="small" link @click="handleDelete(s)">删除</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  searchSectionRetrieval,
  listSectionManualSources,
  saveSectionManualSources,
  deleteSectionManualSource,
} from '@/api/outlineKb'

const props = defineProps<{ sectionId: number; defaultQuery?: string }>()

const query = ref('')
const selectedChannels = ref<string[]>([])
const results = ref<Array<Record<string, any>>>([])
const checkedIds = ref<number[]>([])
const savedSources = ref<Array<Record<string, any>>>([])
const searching = ref(false)
const saving = ref(false)

watch(
  () => props.sectionId,
  () => {
    query.value = props.defaultQuery || ''
    loadSavedSources()
  },
  { immediate: true }
)

async function handleSearch() {
  searching.value = true
  try {
    const res = await searchSectionRetrieval(props.sectionId, {
      query: query.value || undefined,
      channels: selectedChannels.value.length > 0 ? selectedChannels.value : undefined,
    })
    results.value = (res.data as any).results || []
    checkedIds.value = []
  } catch {
    ElMessage.error('检索失败')
  } finally {
    searching.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    const selected = results.value.filter((r) => checkedIds.value.includes(r.chunk_id))
    await saveSectionManualSources(props.sectionId, selected)
    ElMessage.success(`已保存 ${selected.length} 条`)
    checkedIds.value = []
    await loadSavedSources()
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function loadSavedSources() {
  try {
    const res = await listSectionManualSources(props.sectionId)
    savedSources.value = (res.data as any) || []
  } catch {
    savedSources.value = []
  }
}

async function handleDelete(source: Record<string, any>) {
  try {
    await deleteSectionManualSource(props.sectionId, source.id)
    ElMessage.success('已删除')
    await loadSavedSources()
  } catch {
    ElMessage.error('删除失败')
  }
}
</script>

<style scoped>
.search-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.query-input {
  flex: 1;
}
.channel-select {
  width: 240px;
}
.hint {
  color: #909399;
  font-size: 12px;
  margin-bottom: 16px;
}
.results-section,
.saved-section {
  margin-top: 16px;
}
.section-title {
  font-weight: 600;
  margin-bottom: 8px;
}
.result-item {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 8px;
}
.result-title {
  font-weight: 500;
  margin: 0 8px;
}
.result-score {
  color: #909399;
  font-size: 12px;
  margin-left: auto;
}
.result-preview {
  color: #606266;
  font-size: 12px;
  margin-top: 4px;
  padding-left: 24px;
}
.saved-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid #f0f0f0;
}
</style>
