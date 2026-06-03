<!-- frontend/src/views/outline/OutlineDetailView.vue -->
<template>
  <div class="outline-detail" v-loading="pageLoading">
    <div class="page-header">
      <div class="header-left">
        <el-button link @click="router.back()">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <h2>{{ outline?.name || '大纲详情' }}</h2>
        <el-tag v-if="outline" :type="getStatusType(outline.status)" size="small">
          {{ outline.status_display }}
        </el-tag>
      </div>
      <div class="header-right">
        <el-button @click="handleGenerateAll" :loading="generatingAll">
          批量生成
        </el-button>
      </div>
    </div>

    <!-- 章节树 -->
    <SectionTree
      v-if="sections.length > 0"
      :sections="sections"
      @generate="handleGenerate"
      @edit="handleEdit"
      @add-child="handleAddChild"
      @versions="handleVersions"
      @delete="handleDeleteSection"
    />

    <el-empty v-else-if="!pageLoading" description="暂无章节" />

    <!-- 章节生成对话框 -->
    <SectionGenerateDialog
      v-model="showGenerateDialog"
      :section="selectedSection"
      @success="handleGenerateSuccess"
    />

    <!-- 章节编辑抽屉 -->
    <el-drawer v-model="showEditDrawer" title="编辑章节" size="50%">
      <div v-if="selectedSection">
        <el-form :model="editForm" label-width="80px">
          <el-form-item label="标题">
            <el-input v-model="editForm.title" />
          </el-form-item>
          <el-form-item label="内容">
            <el-input v-model="editForm.content" type="textarea" :rows="15" />
          </el-form-item>
        </el-form>
        <el-button type="primary" @click="handleSaveEdit" :loading="saving">保存</el-button>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import {
  getOutline,
  getOutlineSections,
  generateAllSections,
  deleteSection,
  updateSection,
  type OutlineDetail,
  type SectionTreeItem,
} from '@/api/outline'
import SectionTree from './components/SectionTree.vue'
import SectionGenerateDialog from './components/SectionGenerateDialog.vue'

const route = useRoute()
const router = useRouter()

const outlineId = computed(() => Number(route.params.outlineId))
const pageLoading = ref(false)
const generatingAll = ref(false)

const outline = ref<OutlineDetail | null>(null)
const sections = ref<SectionTreeItem[]>([])

const showGenerateDialog = ref(false)
const showEditDrawer = ref(false)
const selectedSection = ref<SectionTreeItem | null>(null)
const editForm = ref({
  title: '',
  content: '',
})
const saving = ref(false)

onMounted(() => {
  loadPageData()
})

async function loadPageData() {
  pageLoading.value = true
  try {
    const [outlineRes, sectionsRes] = await Promise.all([
      getOutline(outlineId.value),
      getOutlineSections(outlineId.value),
    ])
    outline.value = outlineRes.data
    sections.value = sectionsRes.data
  } catch (err) {
    ElMessage.error('加载失败')
    router.back()
  } finally {
    pageLoading.value = false
  }
}

async function loadSections() {
  try {
    const res = await getOutlineSections(outlineId.value)
    sections.value = res.data
  } catch (err) {
    console.error('加载章节失败:', err)
  }
}

async function handleGenerateAll() {
  try {
    await ElMessageBox.confirm('确认批量生成所有章节？这可能需要较长时间。', '提示')
    generatingAll.value = true
    await generateAllSections(outlineId.value)
    ElMessage.success('批量生成任务已提交')
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '操作失败')
    }
  } finally {
    generatingAll.value = false
  }
}

function handleGenerate(row: SectionTreeItem) {
  selectedSection.value = row
  showGenerateDialog.value = true
}

function handleEdit(row: SectionTreeItem) {
  selectedSection.value = row
  editForm.value = {
    title: row.title,
    content: '',
  }
  showEditDrawer.value = true
}

function handleAddChild(row: SectionTreeItem) {
  ElMessage.info('添加子章节功能待实现')
}

function handleVersions(row: SectionTreeItem) {
  ElMessage.info('版本历史功能待实现')
}

async function handleDeleteSection(row: SectionTreeItem) {
  try {
    await ElMessageBox.confirm('确认删除此章节？删除后无法恢复。', '警告', {
      type: 'warning',
    })
    await deleteSection(row.id)
    ElMessage.success('删除成功')
    loadSections()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.message || '删除失败')
    }
  }
}

async function handleSaveEdit() {
  if (!selectedSection.value) return
  saving.value = true
  try {
    await updateSection(selectedSection.value.id, editForm.value)
    ElMessage.success('保存成功')
    showEditDrawer.value = false
    loadSections()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function handleGenerateSuccess(taskId: number) {
  loadSections()
}

function getStatusType(status: string): string {
  const map: Record<string, string> = {
    draft: 'info',
    active: 'success',
    archived: 'warning',
  }
  return map[status] || 'info'
}
</script>

<style scoped>
.outline-detail {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h2 {
  margin: 0;
}
</style>
