<!-- frontend/src/views/outline/components/ImageInsertDialog.vue -->
<template>
  <el-dialog
    :model-value="modelValue"
    width="920px"
    top="5vh"
    destroy-on-close
    class="image-insert-dialog"
    :show-close="true"
    @update:model-value="emit('update:modelValue', $event)"
    @open="onOpen"
  >
    <template #header>
      <div class="dlg-header">
        <span class="dlg-title">插入图片</span>
        <span class="dlg-subtitle">从公司材料库、知识库选择，或直接本地上传</span>
      </div>
    </template>

    <div class="picker-layout">
      <!-- 来源导航 -->
      <nav class="source-nav">
        <div
          v-for="s in sources"
          :key="s.key"
          class="source-item"
          :class="{ active: activeTab === s.key }"
          @click="activeTab = s.key"
        >
          <el-icon :size="18"><component :is="s.icon" /></el-icon>
          <span>{{ s.label }}</span>
        </div>
      </nav>

      <!-- 内容区 -->
      <div class="picker-content">
        <!-- 公司材料库 -->
        <template v-if="activeTab === 'company'">
          <div class="picker-bar">
            <el-select
              v-model="companyId"
              placeholder="全部公司"
              clearable
              class="picker-company"
              @change="reloadMaterials"
            >
              <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
            <el-input
              v-model="materialSearch"
              placeholder="搜索材料名称，回车确认"
              clearable
              :prefix-icon="Search"
              class="picker-search"
              @keyup.enter="reloadMaterials"
              @clear="reloadMaterials"
            />
          </div>
          <div v-loading="materialsLoading" class="picker-grid-wrap">
            <div v-if="materials.length" class="picker-grid">
              <div
                v-for="m in materials"
                :key="m.id"
                class="picker-item"
                :class="{ selected: selectedMaterials.has(m.id) }"
                @click="toggleMaterial(m)"
              >
                <div class="picker-thumb">
                  <img v-if="materialThumbs[m.id]" :src="materialThumbs[m.id]" :alt="m.title" />
                  <el-icon v-else class="picker-thumb-loading"><Loading /></el-icon>
                  <div class="picker-mask">
                    <div class="picker-check"><el-icon><Check /></el-icon></div>
                  </div>
                </div>
                <div class="picker-meta">
                  <div class="picker-name" :title="m.title">{{ m.title }}</div>
                  <div class="picker-sub">{{ m.company_name }}</div>
                </div>
              </div>
            </div>
            <el-empty v-else-if="!materialsLoading" description="暂无图片材料" :image-size="70" />
          </div>
          <div v-if="materialTotal > materials.length" class="picker-more">
            <el-button link type="primary" :loading="materialsLoading" @click="loadMoreMaterials">
              加载更多（{{ materials.length }}/{{ materialTotal }}）
            </el-button>
          </div>
        </template>

        <!-- 知识库 -->
        <template v-else-if="activeTab === 'knowledge'">
          <div class="picker-bar">
            <el-input
              v-model="knowledgeSearch"
              placeholder="搜索图片名称，回车确认"
              clearable
              :prefix-icon="Search"
              class="picker-search"
              @keyup.enter="reloadKnowledge"
              @clear="reloadKnowledge"
            />
          </div>
          <div v-loading="knowledgeLoading" class="picker-grid-wrap">
            <div v-if="knowledgeImages.length" class="picker-grid">
              <div
                v-for="d in knowledgeImages"
                :key="d.id"
                class="picker-item"
                :class="{ selected: selectedKnowledge.has(d.id) }"
                @click="toggleKnowledge(d)"
              >
                <div class="picker-thumb">
                  <img v-if="knowledgeThumbs[d.id]" :src="knowledgeThumbs[d.id]" :alt="d.file_name" />
                  <el-icon v-else class="picker-thumb-loading"><Loading /></el-icon>
                  <div class="picker-mask">
                    <div class="picker-check"><el-icon><Check /></el-icon></div>
                  </div>
                </div>
                <div class="picker-meta">
                  <div class="picker-name" :title="d.file_name">{{ d.file_name }}</div>
                  <div class="picker-sub">{{ d.knowledge_base_name }}</div>
                </div>
              </div>
            </div>
            <el-empty v-else-if="!knowledgeLoading" description="知识库暂无图片" :image-size="70" />
          </div>
          <div v-if="knowledgeTotal > knowledgeImages.length" class="picker-more">
            <el-button link type="primary" :loading="knowledgeLoading" @click="loadMoreKnowledge">
              加载更多（{{ knowledgeImages.length }}/{{ knowledgeTotal }}）
            </el-button>
          </div>
        </template>

        <!-- 本地上传 -->
        <template v-else>
          <el-upload
            drag
            multiple
            accept="image/png,image/jpeg,image/webp"
            :show-file-list="false"
            :http-request="onLocalUpload"
            class="upload-zone"
          >
            <div class="upload-inner">
              <div class="upload-icon">
                <el-icon :size="26"><UploadFilled /></el-icon>
              </div>
              <div class="upload-title">拖拽图片到此处，或 <em>点击选择</em></div>
              <div class="upload-tip">支持多选 · PNG / JPG / WEBP · 单张最大 10MB</div>
            </div>
          </el-upload>
          <div v-if="uploadedImages.length" class="picker-grid upload-grid">
            <div v-for="(img, i) in uploadedImages" :key="img.url" class="picker-item selected">
              <div class="picker-thumb">
                <img :src="img.url" :alt="img.name" />
                <div class="picker-remove" @click.stop="uploadedImages.splice(i, 1)">
                  <el-icon><Close /></el-icon>
                </div>
              </div>
              <div class="picker-meta">
                <div class="picker-name" :title="img.name">{{ img.name }}</div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <template #footer>
      <div class="dlg-footer">
        <div class="selected-strip">
          <template v-if="selectedPreviewThumbs.length">
            <img
              v-for="(t, i) in selectedPreviewThumbs"
              :key="i"
              :src="t"
              class="selected-strip-thumb"
            />
          </template>
          <span v-else class="selected-empty">尚未选择图片</span>
        </div>
        <div class="footer-actions">
          <span class="selected-count">已选 {{ totalSelected }} 张</span>
          <el-button @click="emit('update:modelValue', false)">取消</el-button>
          <el-button
            type="primary"
            :disabled="totalSelected === 0"
            :loading="inserting"
            @click="confirmInsert"
          >
            插入{{ totalSelected ? ` ${totalSelected} 张` : '' }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, reactive, type Component } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Search,
  Check,
  Close,
  Loading,
  UploadFilled,
  OfficeBuilding,
  Collection,
  Upload
} from '@element-plus/icons-vue'
import {
  getCompanyList,
  getMaterialList,
  getMaterialPreviewBlob,
  copyMaterialToEditor,
  type CompanyProfile,
  type CompanyMaterial
} from '@/api/enterprise'
import {
  listKnowledgeImages,
  getKnowledgeDocumentFileBlob,
  copyKnowledgeDocToEditor,
  type KnowledgeDocument
} from '@/api/knowledge'
import { uploadEditorImage } from '@/api/sectionContent'
import { logError } from '@/utils/logger'

const props = defineProps<{
  modelValue: boolean
  sectionId?: number
  outlineId?: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'insert', urls: string[]): void
}>()

type SourceKey = 'company' | 'knowledge' | 'upload'

const sources: Array<{ key: SourceKey; label: string; icon: Component }> = [
  { key: 'company', label: '公司材料库', icon: OfficeBuilding },
  { key: 'knowledge', label: '知识库图片', icon: Collection },
  { key: 'upload', label: '本地上传', icon: Upload }
]

const PAGE_SIZE = 24
const activeTab = ref<SourceKey>('company')
const inserting = ref(false)

// ---------- 公司材料库 ----------

const companies = ref<CompanyProfile[]>([])
const companyId = ref<number | null>(null)
const materialSearch = ref('')
const materials = ref<CompanyMaterial[]>([])
const materialTotal = ref(0)
const materialPage = ref(1)
const materialsLoading = ref(false)
const materialThumbs = reactive<Record<number, string>>({})
const selectedMaterials = reactive(new Map<number, CompanyMaterial>())

const isImageMaterial = (m: CompanyMaterial) => {
  if (m.content_type?.startsWith('image/')) return true
  const ext = m.object_key?.split('.').pop()?.toLowerCase() || ''
  return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
}

const loadMaterials = async (append = false) => {
  materialsLoading.value = true
  try {
    const res = await getMaterialList({
      company_id: companyId.value || undefined,
      search: materialSearch.value.trim() || undefined,
      page: materialPage.value,
      page_size: PAGE_SIZE
    })
    const images = res.data.results.filter(isImageMaterial)
    materials.value = append ? [...materials.value, ...images] : images
    materialTotal.value = res.data.count
    loadThumbs(images, materialThumbs, getMaterialPreviewBlob)
  } catch (e) {
    logError('加载材料图片失败', e)
  } finally {
    materialsLoading.value = false
  }
}

const reloadMaterials = () => {
  materialPage.value = 1
  loadMaterials()
}

const loadMoreMaterials = () => {
  materialPage.value += 1
  loadMaterials(true)
}

const toggleMaterial = (m: CompanyMaterial) => {
  if (selectedMaterials.has(m.id)) selectedMaterials.delete(m.id)
  else selectedMaterials.set(m.id, m)
}

// ---------- 知识库 ----------

const knowledgeSearch = ref('')
const knowledgeImages = ref<KnowledgeDocument[]>([])
const knowledgeTotal = ref(0)
const knowledgePage = ref(1)
const knowledgeLoading = ref(false)
const knowledgeThumbs = reactive<Record<number, string>>({})
const selectedKnowledge = reactive(new Map<number, KnowledgeDocument>())

const loadKnowledge = async (append = false) => {
  knowledgeLoading.value = true
  try {
    const res = await listKnowledgeImages({
      search: knowledgeSearch.value.trim() || undefined,
      page: knowledgePage.value,
      page_size: PAGE_SIZE
    })
    knowledgeImages.value = append ? [...knowledgeImages.value, ...res.data.results] : res.data.results
    knowledgeTotal.value = res.data.count
    loadThumbs(res.data.results, knowledgeThumbs, getKnowledgeDocumentFileBlob)
  } catch (e) {
    logError('加载知识库图片失败', e)
  } finally {
    knowledgeLoading.value = false
  }
}

const reloadKnowledge = () => {
  knowledgePage.value = 1
  loadKnowledge()
}

const loadMoreKnowledge = () => {
  knowledgePage.value += 1
  loadKnowledge(true)
}

const toggleKnowledge = (d: KnowledgeDocument) => {
  if (selectedKnowledge.has(d.id)) selectedKnowledge.delete(d.id)
  else selectedKnowledge.set(d.id, d)
}

// ---------- 缩略图 ----------

const loadThumbs = <T extends { id: number }>(
  items: T[],
  cache: Record<number, string>,
  fetcher: (id: number) => Promise<{ data: Blob }>
) => {
  items.forEach(async (item) => {
    if (cache[item.id]) return
    try {
      const res = await fetcher(item.id)
      cache[item.id] = URL.createObjectURL(res.data)
    } catch {
      // 缩略图加载失败保持 loading 图标，不阻塞选择
    }
  })
}

// ---------- 本地上传 ----------

const uploadedImages = ref<Array<{ url: string; name: string }>>([])

const onLocalUpload = async (options: { file: File }) => {
  try {
    const res = await uploadEditorImage(options.file, props.sectionId, props.outlineId)
    uploadedImages.value.push({ url: res.data.url, name: options.file.name })
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || `「${options.file.name}」上传失败`)
    logError('上传图片失败', e)
  }
}

// ---------- 插入 ----------

const totalSelected = computed(
  () => selectedMaterials.size + selectedKnowledge.size + uploadedImages.value.length
)

/** 底部已选图片预览条 */
const selectedPreviewThumbs = computed(() => {
  const list: string[] = []
  for (const id of selectedMaterials.keys()) {
    if (materialThumbs[id]) list.push(materialThumbs[id])
  }
  for (const id of selectedKnowledge.keys()) {
    if (knowledgeThumbs[id]) list.push(knowledgeThumbs[id])
  }
  uploadedImages.value.forEach((img) => list.push(img.url))
  return list.slice(0, 12)
})

const confirmInsert = async () => {
  inserting.value = true
  try {
    const urls: string[] = []
    // 库图片先复制到编辑器图床换取持久 URL
    for (const m of selectedMaterials.values()) {
      const res = await copyMaterialToEditor(m.id)
      urls.push(res.data.url)
    }
    for (const d of selectedKnowledge.values()) {
      const res = await copyKnowledgeDocToEditor(d.id)
      urls.push(res.data.url)
    }
    uploadedImages.value.forEach((img) => urls.push(img.url))

    emit('insert', urls)
    emit('update:modelValue', false)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '图片处理失败，请重试')
    logError('插入图片失败', e)
  } finally {
    inserting.value = false
  }
}

// ---------- 生命周期 ----------

let initialized = false
const onOpen = () => {
  if (initialized) return
  initialized = true
  getCompanyList({ status: 'active', page_size: 100 })
    .then((res) => { companies.value = res.data.results })
    .catch((e) => logError('加载公司列表失败', e))
  loadMaterials()
  loadKnowledge()
}
</script>

<style scoped>
.dlg-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.dlg-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.dlg-subtitle {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 左右布局 */
.picker-layout {
  display: flex;
  gap: 16px;
  min-height: 400px;
}

/* 来源导航 */
.source-nav {
  width: 140px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-right: 1px solid var(--el-border-color-lighter);
  padding-right: 12px;
}

.source-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.source-item:hover {
  background: var(--el-fill-color-light);
}

.source-item.active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}

/* 内容区 */
.picker-content {
  flex: 1;
  min-width: 0;
}

.picker-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.picker-company {
  width: 210px;
  flex-shrink: 0;
}

.picker-search {
  width: 250px;
}

.picker-grid-wrap {
  min-height: 300px;
  max-height: 400px;
  overflow-y: auto;
  padding: 2px;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.upload-grid {
  margin-top: 16px;
}

/* 图片卡片 */
.picker-item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  background: var(--el-bg-color);
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}

.picker-item:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
  transform: translateY(-2px);
}

.picker-item.selected {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-7);
}

.picker-thumb {
  position: relative;
  aspect-ratio: 4 / 3;
  background: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.picker-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s;
}

.picker-item:hover .picker-thumb img {
  transform: scale(1.04);
}

.picker-thumb-loading {
  color: var(--el-text-color-placeholder);
  font-size: 20px;
  animation: rotating 1.5s linear infinite;
}

@keyframes rotating {
  to { transform: rotate(360deg); }
}

/* 选中遮罩 + 角标 */
.picker-mask {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(37, 99, 235, 0.18), transparent 45%);
  opacity: 0;
  transition: opacity 0.15s;
}

.picker-item.selected .picker-mask {
  opacity: 1;
}

.picker-check {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}

.picker-remove {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.picker-remove:hover {
  background: var(--el-color-danger);
}

.picker-meta {
  padding: 8px 10px;
}

.picker-name {
  font-size: 12px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-sub {
  margin-top: 2px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-more {
  text-align: center;
  padding-top: 12px;
}

/* 上传区 */
.upload-zone :deep(.el-upload-dragger) {
  padding: 34px 20px;
  border-radius: 12px;
}

.upload-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.upload-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-title {
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.upload-title em {
  color: var(--el-color-primary);
  font-style: normal;
}

.upload-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 底部 */
.dlg-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.selected-strip {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.selected-strip-thumb {
  width: 34px;
  height: 34px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.selected-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.selected-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>

<style>
/* 对话框整体观感（非 scoped，作用于 el-dialog 本体） */
.image-insert-dialog {
  border-radius: 14px;
}

.image-insert-dialog .el-dialog__header {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  margin-right: 0;
}

.image-insert-dialog .el-dialog__body {
  padding-top: 16px;
}
</style>
