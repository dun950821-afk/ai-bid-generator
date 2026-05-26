<!-- frontend/src/views/knowledge/KnowledgeBaseListView.vue -->
<template>
  <div class="knowledge-base-list">
    <el-page-header @back="() => router.push('/')" content="知识库管理" />

    <div class="toolbar">
      <el-select v-model="filterType" placeholder="类型筛选" clearable @change="fetchList">
        <el-option label="公司介绍" value="company_profile" />
        <el-option label="项目案例库" value="case_library" />
        <el-option label="资质证书库" value="qualification" />
        <el-option label="产品资料库" value="product" />
        <el-option label="历史标书库" value="bid_history" />
        <el-option label="技术方案库" value="technical_solution" />
      </el-select>

      <el-button type="primary" @click="showCreateDialog = true">
        + 新建知识库
      </el-button>
    </div>

    <div class="base-list">
      <KnowledgeBaseCard
        v-for="kb in knowledgeBases"
        :key="kb.id"
        :knowledge-base="kb"
        @click="goToDetail(kb.id)"
        @edit="openEditDialog(kb)"
        @delete="handleDelete(kb)"
      />

      <el-empty v-if="knowledgeBases.length === 0 && !loading" description="暂无知识库" />
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
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listKnowledgeBases,
  createKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  type KnowledgeBase,
} from '@/api/knowledge'
import KnowledgeBaseCard from './components/KnowledgeBaseCard.vue'
import KnowledgeBaseFormDialog from './components/KnowledgeBaseFormDialog.vue'

const router = useRouter()

const loading = ref(false)
const knowledgeBases = ref<KnowledgeBase[]>([])
const filterType = ref('')
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const editingKb = ref<KnowledgeBase | null>(null)

const fetchList = async () => {
  loading.value = true
  try {
    const params: Record<string, unknown> = {}
    if (filterType.value) {
      params.kb_type = filterType.value
    }
    const res = await listKnowledgeBases(params)
    knowledgeBases.value = res.data.results
  } catch (e) {
    ElMessage.error('获取知识库列表失败')
  } finally {
    loading.value = false
  }
}

const goToDetail = (id: number) => {
  router.push(`/knowledge/${id}`)
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
    ElMessage.error('创建失败')
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
    ElMessage.error('更新失败')
  }
}

const handleDelete = async (kb: KnowledgeBase) => {
  try {
    await ElMessageBox.confirm(`确定删除知识库「${kb.name}」吗？`, '确认删除', {
      type: 'warning',
    })
    await deleteKnowledgeBase(kb.id)
    ElMessage.success('删除成功')
    fetchList()
  } catch (e) {
    // 用户取消
  }
}

onMounted(() => {
  fetchList()
})
</script>

<style scoped>
.knowledge-base-list {
  padding: 20px;
}

.toolbar {
  display: flex;
  gap: 16px;
  margin: 20px 0;
}

.base-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
</style>