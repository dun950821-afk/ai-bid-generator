<!-- frontend/src/views/knowledge/KnowledgeBaseDetailView.vue -->
<template>
  <div class="knowledge-base-detail">
    <el-page-header @back="() => router.push('/knowledge')">
      <template #content>
        <span class="kb-title">{{ knowledgeBase?.name || '加载中...' }}</span>
      </template>
      <template #extra>
        <el-tag v-if="knowledgeBase">{{ knowledgeBase.visibility_display }}</el-tag>
        <el-tag v-if="knowledgeBase" :type="knowledgeBase.is_active ? 'success' : 'info'">
          {{ knowledgeBase.is_active ? '启用' : '停用' }}
        </el-tag>
      </template>
    </el-page-header>

    <el-tabs v-model="activeTab" class="detail-tabs">
      <el-tab-pane label="文档" name="documents">
        <DocumentTab
          v-if="knowledgeBase"
          :knowledge-base-id="knowledgeBase.id"
          @document-status-changed="handleDocumentStatusChanged"
        />
      </el-tab-pane>
      <el-tab-pane label="分块" name="chunks">
        <ChunkTab
          v-if="knowledgeBase"
          :knowledge-base-id="knowledgeBase.id"
          :refresh-key="chunkRefreshKey"
        />
      </el-tab-pane>
      <el-tab-pane label="检索测试" name="retrieval">
        <RetrievalTestTab v-if="knowledgeBase" :knowledge-base-id="knowledgeBase.id" />
      </el-tab-pane>
      <el-tab-pane label="设置" name="settings">
        <SettingsTab v-if="knowledgeBase" :knowledge-base="knowledgeBase" @updated="fetchDetail" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getKnowledgeBase, type KnowledgeBase, type KnowledgeDocument } from '@/api/knowledge'
import DocumentTab from './components/DocumentTab.vue'
import ChunkTab from './components/ChunkTab.vue'
import RetrievalTestTab from './components/RetrievalTestTab.vue'
import SettingsTab from './components/SettingsTab.vue'

const route = useRoute()
const router = useRouter()

const knowledgeBase = ref<KnowledgeBase | null>(null)
const activeTab = ref('documents')
const chunkRefreshKey = ref(0)

const fetchDetail = async () => {
  const id = Number(route.params.id)
  try {
    const res = await getKnowledgeBase(id)
    knowledgeBase.value = res.data
  } catch (e) {
    ElMessage.error('获取知识库详情失败')
    router.push('/knowledge')
  }
}

const handleDocumentStatusChanged = (doc: KnowledgeDocument) => {
  if (doc.status === 'ready') {
    chunkRefreshKey.value += 1
  }
}

onMounted(() => {
  fetchDetail()
})
</script>

<style scoped>
.knowledge-base-detail {
  padding: 20px;
}

.kb-title {
  font-size: 18px;
  font-weight: 500;
}

.detail-tabs {
  margin-top: 20px;
}
</style>
