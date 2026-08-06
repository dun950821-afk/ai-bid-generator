<!-- frontend/src/views/knowledge/KnowledgeBaseListView.vue -->
<template>
  <div class="knowledge-base-list">
    <!-- 页头 -->
    <header class="page-header">
      <div class="page-header-text">
        <h1 class="page-title">知识库管理</h1>
        <p class="page-subtitle">为 AI 生成标书提供检索增强的企业知识资产</p>
      </div>
      <el-button type="primary" @click="openCreateDialog">
        <el-icon class="mr-4"><Plus /></el-icon>新建知识库
      </el-button>
    </header>

    <!-- 工具栏 -->
    <div class="toolbar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索知识库名称或描述"
        clearable
        class="search-input"
        @keyup.enter="fetchList"
        @clear="fetchList"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>

      <el-select v-model="filterType" placeholder="类型筛选" clearable class="type-select" @change="fetchList">
        <el-option label="公司介绍" value="company_profile" />
        <el-option label="项目案例库" value="case_library" />
        <el-option label="资质证书库" value="qualification" />
        <el-option label="产品资料库" value="product" />
        <el-option label="历史标书库" value="bid_history" />
        <el-option label="技术方案库" value="technical_solution" />
      </el-select>

      <span class="toolbar-count" v-if="filteredBases.length">
        共 {{ filteredBases.length }} 个知识库
      </span>
    </div>

    <div v-loading="loading" class="base-list">
      <KnowledgeBaseCard
        v-for="kb in filteredBases"
        :key="kb.id"
        :knowledge-base="kb"
        @click="goToDetail(kb.id)"
        @edit="openEditDialog(kb)"
        @delete="handleDelete(kb)"
      />

      <el-empty
        v-if="!loading && filteredBases.length === 0"
        :description="searchKeyword || filterType ? '未匹配到知识库' : '暂无知识库，点击右上角新建'"
        class="list-empty"
      />
    </div>

    <KnowledgeBaseFormDialog
      v-model="showCreateDialog"
      @submit="handleCreate"
    />

    <KnowledgeBaseFormDialog
      v-model="showEditDialog"
      :knowledge-base="editingKb"
      @submit="handleUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import {
  listKnowledgeBases,
  createKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  type KnowledgeBase,
} from '@/api/knowledge'
import { normalizeList } from '@/utils/normalize'
import { extractApiError } from '@/utils/errors'
import KnowledgeBaseCard from './components/KnowledgeBaseCard.vue'
import KnowledgeBaseFormDialog from './components/KnowledgeBaseFormDialog.vue'

const router = useRouter()

const loading = ref(false)
const knowledgeBases = ref<KnowledgeBase[]>([])
const filterType = ref('')
const searchKeyword = ref('')
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const editingKb = ref<KnowledgeBase | null>(null)

const filteredBases = computed(() => {
  if (!searchKeyword.value) return knowledgeBases.value
  const kw = searchKeyword.value.toLowerCase()
  return knowledgeBases.value.filter(
    (kb) => kb.name.toLowerCase().includes(kw) || kb.description?.toLowerCase().includes(kw)
  )
})

const fetchList = async () => {
  loading.value = true
  try {
    const params: Record<string, unknown> = {}
    if (filterType.value) {
      params.kb_type = filterType.value
    }
    const res = await listKnowledgeBases(params)
    knowledgeBases.value = normalizeList<KnowledgeBase>(res)
  } catch (e) {
    ElMessage.error(extractApiError(e, '获取知识库列表失败'))
  } finally {
    loading.value = false
  }
}

const goToDetail = (id: number) => {
  router.push(`/knowledge/${id}`)
}

const openCreateDialog = () => {
  showCreateDialog.value = true
}

const openEditDialog = (kb: KnowledgeBase) => {
  editingKb.value = kb
  showEditDialog.value = true
}

const handleCreate = async (data: Partial<KnowledgeBase>) => {
  try {
    await createKnowledgeBase(data as any)
    ElMessage.success('创建成功')
    showCreateDialog.value = false
    fetchList()
  } catch (e) {
    ElMessage.error(extractApiError(e, '创建失败'))
  }
}

const handleUpdate = async (data: Partial<KnowledgeBase>) => {
  if (!editingKb.value) return
  try {
    await updateKnowledgeBase(editingKb.value.id, data)
    ElMessage.success('更新成功')
    showEditDialog.value = false
    fetchList()
  } catch (e) {
    ElMessage.error(extractApiError(e, '更新失败'))
  }
}

const handleDelete = async (kb: KnowledgeBase) => {
  try {
    await ElMessageBox.confirm(
      `确定删除知识库「${kb.name}」吗？此操作会保留文档软删除记录但清理所有分块。`,
      '确认删除',
      { type: 'warning' }
    )
    await deleteKnowledgeBase(kb.id)
    ElMessage.success('删除成功')
    fetchList()
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(extractApiError(e, '删除失败'))
    }
  }
}

onMounted(() => {
  fetchList()
})
</script>

<style scoped>
.knowledge-base-list {
  padding: 20px;
  background: var(--app-bg, #f6f8fb);
  min-height: calc(100vh - 60px);
}

/* 页头 */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px;
  background: var(--app-card, #fff);
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: var(--app-radius, 16px);
  margin-bottom: 16px;
}

.page-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 600;
  color: var(--app-text-primary, #111827);
}

.page-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--app-text-secondary, #6b7280);
}

/* 工具栏 */
.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 16px;
  background: var(--app-card, #fff);
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: var(--app-radius, 16px);
  margin-bottom: 16px;
}

.search-input {
  width: 260px;
}

.type-select {
  width: 160px;
}

.toolbar-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--app-text-secondary, #6b7280);
}

.mr-4 {
  margin-right: 4px;
}

/* 卡片网格 */
.base-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  min-height: 200px;
}

.list-empty {
  grid-column: 1 / -1;
}

@media (max-width: 900px) {
  .toolbar {
    flex-wrap: wrap;
  }
  .toolbar-count {
    margin-left: 0;
  }
}
</style>
