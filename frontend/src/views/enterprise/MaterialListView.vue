<!-- frontend/src/views/enterprise/MaterialListView.vue -->
<template>
  <div class="material-page">
    <!-- 页头 -->
    <header class="page-header">
      <div class="page-header-left">
        <el-button text @click="router.push('/enterprise')">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <div class="page-header-text">
          <h1 class="page-title">企业材料库</h1>
          <p class="page-subtitle">按公司管理营业执照、证件、资质证书等材料，跟踪有效期</p>
        </div>
      </div>
      <div class="page-header-right">
        <el-tag v-if="expiredCount" type="danger" effect="light" round>
          {{ expiredCount }} 项已过期
        </el-tag>
        <el-tag v-if="expiringCount" type="warning" effect="light" round>
          {{ expiringCount }} 项 30 天内到期
        </el-tag>
      </div>
    </header>

    <div class="page-body">
      <!-- 公司侧栏 -->
      <aside class="panel company-panel">
        <div class="company-panel-header">
          <span class="panel-title">公司</span>
          <el-button type="primary" link size="small" @click="router.push('/enterprise/companies')">
            管理
          </el-button>
        </div>
        <div v-if="companies.length" class="company-list">
          <div
            v-for="c in companies"
            :key="c.id"
            class="company-item"
            :class="{ active: c.id === selectedCompanyId }"
            @click="selectCompany(c.id)"
          >
            <div class="company-item-main">
              <span class="company-item-name" :title="c.name">{{ c.name }}</span>
              <el-tag v-if="c.is_default" size="small" type="success" effect="plain" round>默认</el-tag>
            </div>
            <span class="company-item-count">{{ c.material_count }}</span>
          </div>
        </div>
        <el-empty v-else description="暂无公司" :image-size="70">
          <el-button type="primary" size="small" @click="router.push('/enterprise/companies')">
            去创建公司
          </el-button>
        </el-empty>
      </aside>

      <!-- 材料区 -->
      <main class="material-main" v-if="selectedCompany">
        <!-- 筛选栏 -->
        <section class="panel filter-panel">
          <el-input
            v-model="searchKeyword"
            class="filter-search"
            :placeholder="`搜索「${selectedCompany.name}」的材料`"
            clearable
            :prefix-icon="Search"
            @keyup.enter="onSearch"
            @clear="onSearch"
          />
          <el-select v-model="typeFilter" clearable placeholder="全部类型" class="filter-item" @change="onSearch">
            <el-option v-for="t in materialTypes" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
          <el-button :icon="RefreshLeft" @click="resetFilters">重置</el-button>
          <div class="filter-spacer" />
          <el-button type="primary" @click="showUploadDialog">
            <el-icon><Upload /></el-icon>
            上传材料
          </el-button>
        </section>

        <!-- 材料列表 -->
        <section class="panel">
          <el-table
            :data="materials"
            v-loading="loading"
            style="width: 100%"
            border
            @header-dragend="onHeaderDragend"
          >
            <el-table-column
              label="材料"
              :min-width="colWidths['材料'] ? undefined : 300"
              :width="colWidths['材料']"
              resizable
            >
              <template #default="{ row }">
                <div class="material-name">
                  <div class="file-icon" :class="fileIconClass(row)">
                    <el-icon :size="18"><component :is="fileIcon(row)" /></el-icon>
                  </div>
                  <div class="material-name-text">
                    <div class="material-title">
                      <span class="title-text" :title="row.title">{{ row.title }}</span>
                      <el-tag v-if="row.is_sensitive" type="warning" size="small" effect="plain" round>敏感</el-tag>
                    </div>
                    <div class="material-meta">
                      <span>{{ formatFileSize(row.file_size) }}</span>
                      <template v-if="row.tags?.length">
                        <el-tag v-for="tag in row.tags" :key="tag" size="small" effect="plain" round>{{ tag }}</el-tag>
                      </template>
                    </div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="类型" :width="colWidths['类型'] || 120" align="center" resizable>
              <template #default="{ row }">
                <el-tag effect="plain" round size="small">{{ row.material_type_display }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="有效期" :width="colWidths['有效期'] || 220" resizable>
              <template #default="{ row }">
                <div class="validity-cell">
                  <span :class="{ 'text-danger': row.is_expired }">{{ validityText(row) }}</span>
                  <el-tag
                    v-if="row.is_expired"
                    type="danger"
                    size="small"
                    effect="light"
                    round
                  >已过期</el-tag>
                  <el-tag
                    v-else-if="row.days_to_expire !== null && row.days_to_expire <= 30"
                    :type="row.days_to_expire <= 7 ? 'danger' : 'warning'"
                    size="small"
                    effect="light"
                    round
                  >剩 {{ row.days_to_expire }} 天</el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="操作" :width="colWidths['操作'] || 170" fixed="right" align="center" resizable>
              <template #default="{ row }">
                <div class="action-cell">
                  <el-tooltip content="预览" placement="top" :show-after="300">
                    <el-button
                      class="action-btn"
                      text
                      :disabled="!row.file_url || (row.is_sensitive && !canDownloadSensitive)"
                      @click="previewMaterial(row)"
                    >
                      <el-icon><View /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip content="下载" placement="top" :show-after="300">
                    <el-button
                      class="action-btn"
                      text
                      :disabled="!row.file_url || (row.is_sensitive && !canDownloadSensitive)"
                      @click="downloadMaterial(row)"
                    >
                      <el-icon><Download /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip content="编辑信息" placement="top" :show-after="300">
                    <el-button class="action-btn" text @click="showEditDialog(row)">
                      <el-icon><EditPen /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip
                    :content="row.status === 'archived' ? '已归档材料不可替换' : '替换文件'"
                    placement="top"
                    :show-after="300"
                  >
                    <el-button
                      class="action-btn"
                      text
                      :disabled="row.status === 'archived'"
                      @click="showReplaceDialog(row)"
                    >
                      <el-icon><Refresh /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip content="删除" placement="top" :show-after="300">
                    <el-button class="action-btn action-btn-danger" text @click="removeMaterial(row)">
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </el-tooltip>
                </div>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty description="该公司暂无材料，点击右上角上传" :image-size="90" />
            </template>
          </el-table>

          <div class="pagination-bar" v-if="total > 0">
            <el-pagination
              v-model:current-page="page"
              v-model:page-size="pageSize"
              :total="total"
              :page-sizes="[10, 20, 50, 100]"
              layout="total, sizes, prev, pager, next"
              background
              @current-change="loadMaterials"
              @size-change="onPageSizeChange"
            />
          </div>
        </section>
      </main>

      <!-- 未选择公司（无公司时） -->
      <main class="material-main" v-else>
        <section class="panel empty-panel">
          <el-empty description="请先在左侧选择或创建公司" :image-size="100" />
        </section>
      </main>
    </div>

    <!-- 上传对话框 -->
    <el-dialog v-model="uploadDialogVisible" title="上传材料" width="560px" destroy-on-close>
      <el-form :model="uploadForm" label-width="96px">
        <el-form-item label="所属公司">
          <el-input :model-value="selectedCompany?.name" disabled />
        </el-form-item>
        <el-form-item label="材料类型" required>
          <el-select v-model="uploadForm.material_type" placeholder="请选择类型" style="width: 100%">
            <el-option v-for="t in materialTypes" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="材料名称" required>
          <el-input v-model="uploadForm.title" placeholder="请输入材料名称" />
        </el-form-item>
        <el-form-item label="有效期">
          <ValidityRangePicker v-model="uploadForm.valid_range" />
        </el-form-item>
        <el-form-item label="发证机构">
          <el-input v-model="uploadForm.issuing_authority" placeholder="选填" />
        </el-form-item>
        <el-form-item label="证书编号">
          <el-input v-model="uploadForm.certificate_no" placeholder="选填" />
        </el-form-item>
        <el-form-item label="标签">
          <el-select
            v-model="uploadForm.tags"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="输入后回车创建标签"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="文件" required>
          <el-upload
            drag
            :auto-upload="false"
            :limit="1"
            :show-file-list="false"
            :on-change="onFileChange"
            style="width: 100%"
          >
            <div v-if="selectedFile" class="upload-selected">
              <el-icon :size="22"><Document /></el-icon>
              <div class="upload-selected-text">
                <div class="upload-selected-name">{{ selectedFile.name }}</div>
                <div class="text-muted">{{ formatFileSize(selectedFile.size) }}</div>
              </div>
            </div>
            <template v-else>
              <el-icon :size="28" class="text-muted"><UploadFilled /></el-icon>
              <div class="el-upload__text">拖拽文件到此处，或 <em>点击选择</em></div>
            </template>
          </el-upload>
          <div class="el-upload__tip">支持 PDF / JPG / PNG / GIF / WEBP / DOC / DOCX，最大 50MB</div>
        </el-form-item>
        <el-form-item v-if="uploading" label="上传进度">
          <div class="upload-progress">
            <el-progress
              :percentage="uploadProgress"
              :status="uploadPhase === 'creating' ? 'success' : undefined"
              :stroke-width="10"
              style="width: 100%"
            />
            <span class="text-muted">{{ uploadPhaseText }}</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="uploadDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="uploadMaterial" :loading="uploading">上传</el-button>
      </template>
    </el-dialog>

    <!-- 编辑对话框 -->
    <el-dialog v-model="editDialogVisible" title="编辑材料信息" width="560px" destroy-on-close>
      <el-form :model="editForm" label-width="96px">
        <el-form-item label="材料类型" required>
          <el-select v-model="editForm.material_type" style="width: 100%">
            <el-option v-for="t in materialTypes" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="材料名称" required>
          <el-input v-model="editForm.title" />
        </el-form-item>
        <el-form-item label="有效期">
          <ValidityRangePicker v-model="editForm.valid_range" />
        </el-form-item>
        <el-form-item label="发证机构">
          <el-input v-model="editForm.issuing_authority" placeholder="选填" />
        </el-form-item>
        <el-form-item label="证书编号">
          <el-input v-model="editForm.certificate_no" placeholder="选填" />
        </el-form-item>
        <el-form-item label="标签">
          <el-select
            v-model="editForm.tags"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="输入后回车创建标签"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEdit" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 替换文件对话框 -->
    <el-dialog v-model="replaceDialogVisible" title="替换文件" width="480px" destroy-on-close>
      <p class="replace-tip">
        为「{{ replacingMaterial?.title }}」上传新文件，上传后旧文件将被删除。
        <template v-if="replacingMaterial?.status === 'draft'">草稿材料补传文件后将自动启用。</template>
      </p>
      <el-upload
        drag
        :auto-upload="false"
        :limit="1"
        :show-file-list="false"
        :on-change="onReplaceFileChange"
      >
        <div v-if="replaceFile" class="upload-selected">
          <el-icon :size="22"><Document /></el-icon>
          <div class="upload-selected-text">
            <div class="upload-selected-name">{{ replaceFile.name }}</div>
            <div class="text-muted">{{ formatFileSize(replaceFile.size) }}</div>
          </div>
        </div>
        <template v-else>
          <el-icon :size="28" class="text-muted"><UploadFilled /></el-icon>
          <div class="el-upload__text">拖拽文件到此处，或 <em>点击选择</em></div>
        </template>
      </el-upload>
      <div v-if="replacing" class="upload-progress" style="margin-top: 12px">
        <el-progress
          :percentage="replaceProgress"
          :status="replacePhase === 'creating' ? 'success' : undefined"
          :stroke-width="10"
          style="width: 100%"
        />
        <span class="text-muted">{{ replacePhaseText }}</span>
      </div>
      <template #footer>
        <el-button @click="replaceDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitReplace" :loading="replacing" :disabled="!replaceFile">
          确认替换
        </el-button>
      </template>
    </el-dialog>

    <!-- 预览对话框 -->
    <el-dialog
      v-model="previewDialogVisible"
      :title="previewingMaterial?.title || '材料预览'"
      :width="`${previewSize.w}px`"
      top="4vh"
      draggable
      destroy-on-close
      class="material-preview-dialog"
      @close="resetPreview"
    >
      <div v-if="previewingMaterial" class="preview-wrap">
        <div class="preview-summary">
          <el-tag effect="plain" round size="small">{{ previewingMaterial.material_type_display }}</el-tag>
          <span class="text-muted">有效期：{{ previewingMaterial.valid_from || '-' }} 至 {{ previewingMaterial.valid_to || '长期' }}</span>
          <span v-if="previewingMaterial.certificate_no" class="text-muted">编号：{{ previewingMaterial.certificate_no }}</span>
        </div>
        <div class="preview-body" v-loading="previewLoading">
          <template v-if="!previewLoading && !previewError">
            <el-image
              v-if="previewKind === 'image' && previewObjectUrl"
              :src="previewObjectUrl"
              fit="contain"
              class="preview-media"
              :style="{ maxHeight: `${previewSize.h}px` }"
              :preview-src-list="[previewObjectUrl]"
              preview-teleported
            />
            <iframe
              v-else-if="previewKind === 'pdf' && previewObjectUrl"
              :src="previewObjectUrl"
              class="preview-media preview-iframe"
              :style="{ height: `${previewSize.h}px` }"
            />
            <div
              v-else-if="previewKind === 'docx' && previewDocxData"
              class="preview-docx"
              :style="{ maxHeight: `${previewSize.h}px` }"
            >
              <VueOfficeDocx
                :src="previewDocxData"
                @rendered="onDocxRendered"
                @error="onPreviewError"
              />
            </div>
            <div v-else class="preview-fallback">
              <el-icon :size="40" class="text-muted"><Document /></el-icon>
              <p class="text-muted">
                {{ previewKind === 'doc' ? '旧版 .doc 格式暂不支持在线预览' : '该文件类型不支持在线预览' }}，请下载后查看
              </p>
              <el-button type="primary" @click="downloadMaterial(previewingMaterial!)">下载文件</el-button>
            </div>
          </template>
          <div v-else-if="previewError" class="preview-fallback">
            <el-icon :size="40" class="text-muted"><WarningFilled /></el-icon>
            <p class="text-muted">{{ previewError }}</p>
            <el-button type="primary" @click="downloadMaterial(previewingMaterial!)">下载文件</el-button>
          </div>
        </div>
        <!-- 右下角拖拽调大小 -->
        <div
          v-if="resizablePreview"
          class="preview-resize-handle"
          title="拖拽调整窗口大小"
          @mousedown="onPreviewResizeStart"
        >
          <el-icon><Rank /></el-icon>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'
import type { UploadProps } from 'element-plus'
import {
  ArrowLeft,
  Search,
  RefreshLeft,
  Upload,
  UploadFilled,
  Document,
  Picture,
  Files,
  Folder,
  WarningFilled,
  View,
  Download,
  EditPen,
  Refresh,
  Delete,
  Rank
} from '@element-plus/icons-vue'
import VueOfficeDocx from '@vue-office/docx'
import '@vue-office/docx/lib/index.css'
import ValidityRangePicker from '@/components/enterprise/ValidityRangePicker.vue'
import { useAuthStore } from '@/stores/auth'
import {
  getCompanyList,
  getMaterialList,
  getMaterialUploadPresign,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  downloadMaterialFile,
  getMaterialPreviewBlob,
  getExpiringMaterials,
  replaceMaterialFile,
  type CompanyProfile,
  type CompanyMaterial
} from '@/api/enterprise'
import { logError } from '@/utils/logger'

const router = useRouter()
const auth = useAuthStore()

const materialTypes = [
  { value: 'business_license', label: '营业执照' },
  { value: 'legal_id_front', label: '法人身份证正面' },
  { value: 'legal_id_back', label: '法人身份证背面' },
  { value: 'authorization_letter', label: '授权委托书' },
  { value: 'agent_id_front', label: '委托代理人身份证正面' },
  { value: 'agent_id_back', label: '委托代理人身份证背面' },
  { value: 'qualification', label: '资格证明' },
  { value: 'certificate', label: '资质证书' },
  { value: 'iso_certificate', label: '体系认证证书' },
  { value: 'case_contract', label: '案例合同' },
  { value: 'case', label: '业绩案例' },
  { value: 'acceptance_report', label: '验收报告' },
  { value: 'social_security', label: '社保证明' },
  { value: 'bank_account', label: '开户许可证' },
  { value: 'other', label: '其他' }
]

// 检查是否有下载敏感材料的权限
const canDownloadSensitive = computed(() => {
  return auth.hasGlobalPermission('enterprise.download_sensitive_material')
})

// ---------- 公司侧栏 ----------

const companies = ref<CompanyProfile[]>([])
const selectedCompanyId = ref<number | null>(null)

const selectedCompany = computed(() =>
  companies.value.find(c => c.id === selectedCompanyId.value) || null
)

const selectCompany = (id: number) => {
  if (id === selectedCompanyId.value) return
  selectedCompanyId.value = id
  page.value = 1
  loadMaterials()
}

// ---------- 材料列表 ----------

const materials = ref<CompanyMaterial[]>([])
const loading = ref(false)
const searchKeyword = ref('')
const typeFilter = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

// 页头统计
const expiredCount = ref(0)
const expiringCount = ref(0)

// ---------- 列宽拖拽持久化 ----------

const COL_WIDTHS_KEY = 'enterprise-material-col-widths'

const loadSavedColWidths = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(COL_WIDTHS_KEY) || '{}')
  } catch {
    return {}
  }
}

const colWidths = ref<Record<string, number | undefined>>(loadSavedColWidths())

const onHeaderDragend = (newWidth: number, _oldWidth: number, column: any) => {
  const label = column?.label
  if (!label) return
  colWidths.value = { ...colWidths.value, [label]: newWidth }
  localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(colWidths.value))
}

const loadCompanies = async () => {
  try {
    const res = await getCompanyList({ status: 'active', page_size: 100 })
    companies.value = res.data.results
    // 仅首次进入时自动选中：默认公司，否则第一家；后续刷新不打断用户当前选择
    if (!selectedCompanyId.value) {
      const defaultCompany = companies.value.find(c => c.is_default) || companies.value[0]
      if (defaultCompany) {
        selectedCompanyId.value = defaultCompany.id
        loadMaterials()
      }
    }
  } catch (e) {
    logError('加载公司列表失败', e)
  }
}

const loadMaterials = async () => {
  if (!selectedCompanyId.value) return
  loading.value = true
  try {
    const res = await getMaterialList({
      company_id: selectedCompanyId.value,
      material_type: typeFilter.value || undefined,
      search: searchKeyword.value.trim() || undefined,
      page: page.value,
      page_size: pageSize.value
    })
    materials.value = res.data.results
    total.value = res.data.count
  } catch (e) {
    logError('加载材料列表失败', e)
    ElMessage.error('加载材料列表失败')
  } finally {
    loading.value = false
  }
}

const loadExpiryStats = async () => {
  try {
    const res = await getExpiringMaterials(30)
    expiredCount.value = res.data.filter(m => m.is_expired).length
    expiringCount.value = res.data.filter(m => !m.is_expired).length
  } catch (e) {
    logError('加载到期统计失败', e)
  }
}

const onSearch = () => {
  page.value = 1
  loadMaterials()
}

const onPageSizeChange = () => {
  page.value = 1
  loadMaterials()
}

const resetFilters = () => {
  searchKeyword.value = ''
  typeFilter.value = ''
  onSearch()
}

// ---------- 上传 ----------

const uploadDialogVisible = ref(false)
const uploading = ref(false)
const uploadProgress = ref(0)
// 上传阶段：uploading=发送数据中 / confirming=等待 MinIO 写盘确认 / creating=创建材料记录
const uploadPhase = ref<'uploading' | 'confirming' | 'creating'>('uploading')
const selectedFile = ref<File | null>(null)

const uploadPhaseText = computed(() => {
  if (uploadPhase.value === 'creating') return '文件已确认，正在创建材料记录…'
  if (uploadPhase.value === 'confirming') return '已发送完毕，等待存储服务写入确认…'
  return '正在上传文件…'
})

const uploadForm = ref({
  material_type: '',
  title: '',
  valid_range: null as [string | null, string | null] | null,
  issuing_authority: '',
  certificate_no: '',
  tags: [] as string[]
})

const showUploadDialog = () => {
  uploadForm.value = {
    material_type: '',
    title: '',
    valid_range: null,
    issuing_authority: '',
    certificate_no: '',
    tags: []
  }
  selectedFile.value = null
  uploadProgress.value = 0
  uploadPhase.value = 'uploading'
  uploadDialogVisible.value = true
}

const onFileChange: UploadProps['onChange'] = (uploadFile) => {
  selectedFile.value = uploadFile.raw || null
  if (uploadFile.name && !uploadForm.value.title) {
    uploadForm.value.title = uploadFile.name.replace(/\.[^.]+$/, '')
  }
}

/** 预签名并直传文件到 MinIO（axios 以获取上传进度），返回 object_key 等信息 */
const uploadToStorage = async (
  companyId: number,
  materialType: string,
  file: File,
  onProgress?: (percent: number) => void
) => {
  const presignRes = await getMaterialUploadPresign({
    company_id: companyId,
    material_type: materialType,
    filename: file.name
  })
  const presign = presignRes.data

  const formData = new FormData()
  Object.entries(presign.fields).forEach(([key, value]) => {
    formData.append(key, value as string)
  })
  formData.append('file', file)

  // 独立 axios 实例：不带项目拦截器（JWT 头等），避免干扰 MinIO 预签名 POST
  await axios.post(presign.upload_url, formData, {
    onUploadProgress: (e) => {
      if (e.total) {
        onProgress?.(Math.round((e.loaded * 100) / e.total))
      }
    }
  })
  return { object_key: presign.object_key, file_size: file.size, content_type: file.type }
}

const uploadMaterial = async () => {
  if (!selectedCompanyId.value) return ElMessage.warning('请先选择公司')
  if (!uploadForm.value.material_type) return ElMessage.warning('请选择材料类型')
  if (!uploadForm.value.title) return ElMessage.warning('请输入材料名称')
  if (!selectedFile.value) return ElMessage.warning('请选择文件')

  uploading.value = true
  uploadProgress.value = 0
  uploadPhase.value = 'uploading'
  try {
    const file = selectedFile.value
    const uploaded = await uploadToStorage(
      selectedCompanyId.value,
      uploadForm.value.material_type,
      file,
      (p) => {
        uploadProgress.value = p
        if (p >= 100) uploadPhase.value = 'confirming'
      }
    )
    uploadPhase.value = 'creating'
    const [validFrom, validTo] = uploadForm.value.valid_range || [null, null]

    await createMaterial({
      company_id: selectedCompanyId.value,
      material_type: uploadForm.value.material_type,
      title: uploadForm.value.title,
      object_key: uploaded.object_key,
      file_size: uploaded.file_size,
      content_type: uploaded.content_type,
      valid_from: validFrom,
      valid_to: validTo,
      issuing_authority: uploadForm.value.issuing_authority,
      certificate_no: uploadForm.value.certificate_no,
      tags: uploadForm.value.tags
    })

    ElMessage.success('上传成功')
    uploadDialogVisible.value = false
    loadMaterials()
    loadCompanies()
    loadExpiryStats()
  } catch (e: any) {
    const detail = e?.response?.data?.detail || e?.message || '上传失败'
    ElMessage.error(detail)
    logError('上传材料失败', e)
  } finally {
    uploading.value = false
  }
}

// ---------- 编辑 ----------

const editDialogVisible = ref(false)
const saving = ref(false)
const editingMaterial = ref<CompanyMaterial | null>(null)
const editForm = ref({
  material_type: '',
  title: '',
  valid_range: null as [string | null, string | null] | null,
  issuing_authority: '',
  certificate_no: '',
  tags: [] as string[]
})

const showEditDialog = (material: CompanyMaterial) => {
  editingMaterial.value = material
  editForm.value = {
    material_type: material.material_type,
    title: material.title,
    valid_range: material.valid_from || material.valid_to
      ? [material.valid_from, material.valid_to]
      : null,
    issuing_authority: material.issuing_authority || '',
    certificate_no: material.certificate_no || '',
    tags: [...(material.tags || [])]
  }
  editDialogVisible.value = true
}

const saveEdit = async () => {
  if (!editingMaterial.value) return
  if (!editForm.value.title) return ElMessage.warning('请输入材料名称')
  if (!editForm.value.material_type) return ElMessage.warning('请选择材料类型')

  saving.value = true
  try {
    const [validFrom, validTo] = editForm.value.valid_range || [null, null]
    await updateMaterial(editingMaterial.value.id, {
      material_type: editForm.value.material_type,
      title: editForm.value.title,
      valid_from: validFrom || null,
      valid_to: validTo || null,
      issuing_authority: editForm.value.issuing_authority,
      certificate_no: editForm.value.certificate_no,
      tags: editForm.value.tags
    } as Partial<CompanyMaterial>)
    ElMessage.success('保存成功')
    editDialogVisible.value = false
    loadMaterials()
    loadExpiryStats()
  } catch (e: any) {
    const detail = e?.response?.data?.detail || e?.message || '保存失败'
    ElMessage.error(detail)
    logError('更新材料失败', e)
  } finally {
    saving.value = false
  }
}

// ---------- 替换文件 ----------

const replaceDialogVisible = ref(false)
const replacing = ref(false)
const replaceProgress = ref(0)
const replacePhase = ref<'uploading' | 'confirming' | 'creating'>('uploading')
const replacingMaterial = ref<CompanyMaterial | null>(null)
const replaceFile = ref<File | null>(null)

const replacePhaseText = computed(() => {
  if (replacePhase.value === 'creating') return '文件已确认，正在替换…'
  if (replacePhase.value === 'confirming') return '已发送完毕，等待存储服务写入确认…'
  return '正在上传文件…'
})

const showReplaceDialog = (material: CompanyMaterial) => {
  replacingMaterial.value = material
  replaceFile.value = null
  replaceProgress.value = 0
  replacePhase.value = 'uploading'
  replaceDialogVisible.value = true
}

const onReplaceFileChange: UploadProps['onChange'] = (uploadFile) => {
  replaceFile.value = uploadFile.raw || null
}

const submitReplace = async () => {
  if (!replacingMaterial.value || !replaceFile.value) return
  replacing.value = true
  replaceProgress.value = 0
  replacePhase.value = 'uploading'
  try {
    const uploaded = await uploadToStorage(
      replacingMaterial.value.company,
      replacingMaterial.value.material_type,
      replaceFile.value,
      (p) => {
        replaceProgress.value = p
        if (p >= 100) replacePhase.value = 'confirming'
      }
    )
    replacePhase.value = 'creating'
    await replaceMaterialFile(replacingMaterial.value.id, uploaded)
    ElMessage.success('文件已替换')
    replaceDialogVisible.value = false
    loadMaterials()
  } catch (e: any) {
    const detail = e?.response?.data?.detail || e?.message || '替换失败'
    ElMessage.error(detail)
    logError('替换材料文件失败', e)
  } finally {
    replacing.value = false
  }
}

// ---------- 预览 ----------

type PreviewKind = 'image' | 'pdf' | 'docx' | 'doc' | 'other'

const previewDialogVisible = ref(false)
const previewingMaterial = ref<CompanyMaterial | null>(null)
const previewLoading = ref(false)
const previewError = ref('')
const previewKind = ref<PreviewKind>('other')
const previewObjectUrl = ref('')
const previewDocxData = ref<ArrayBuffer | null>(null)

// 预览窗口尺寸：按内容类型给默认值，用户拖拽后按类型记忆
const PREVIEW_SIZE_KEY = 'material-preview-size'
const PREVIEW_SIZE_DEFAULTS: Record<PreviewKind, { w: number; h: number }> = {
  image: { w: 720, h: 520 },
  pdf: { w: 920, h: 650 },
  docx: { w: 880, h: 650 },
  doc: { w: 520, h: 260 },
  other: { w: 520, h: 260 }
}
const previewSize = ref({ ...PREVIEW_SIZE_DEFAULTS.other })

// 只有实际渲染内容的类型才允许拖拽调整
const resizablePreview = computed(() =>
  ['image', 'pdf', 'docx'].includes(previewKind.value)
)

const clampPreviewSize = (w: number, h: number) => ({
  w: Math.min(Math.max(w, 420), window.innerWidth - 32),
  h: Math.min(Math.max(h, 240), window.innerHeight - 120)
})

const loadPreviewSize = (kind: PreviewKind) => {
  let saved: { w: number; h: number } | undefined
  try {
    saved = JSON.parse(localStorage.getItem(PREVIEW_SIZE_KEY) || '{}')[kind]
  } catch {
    saved = undefined
  }
  previewSize.value = clampPreviewSize(
    saved?.w ?? PREVIEW_SIZE_DEFAULTS[kind].w,
    saved?.h ?? PREVIEW_SIZE_DEFAULTS[kind].h
  )
}

const savePreviewSize = () => {
  try {
    const all = JSON.parse(localStorage.getItem(PREVIEW_SIZE_KEY) || '{}')
    all[previewKind.value] = previewSize.value
    localStorage.setItem(PREVIEW_SIZE_KEY, JSON.stringify(all))
  } catch {
    // 忽略存储失败
  }
}

// 对话框水平居中，拖动右下角时宽度两侧对称变化，故增量按 2 倍跟随鼠标
const onPreviewResizeStart = (e: MouseEvent) => {
  e.preventDefault()
  const startX = e.clientX
  const startY = e.clientY
  const startW = previewSize.value.w
  const startH = previewSize.value.h

  const onMove = (ev: MouseEvent) => {
    previewSize.value = clampPreviewSize(
      startW + (ev.clientX - startX) * 2,
      startH + (ev.clientY - startY) * 2
    )
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    savePreviewSize()
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

const detectPreviewKind = (material: CompanyMaterial): PreviewKind => {
  const ct = material.content_type || ''
  if (ct.startsWith('image/')) return 'image'
  if (ct === 'application/pdf') return 'pdf'
  if (ct === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
  if (ct === 'application/msword') return 'doc'
  // content_type 缺失时按扩展名兜底
  const ext = material.object_key?.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (ext === 'doc') return 'doc'
  return 'other'
}

const previewMaterial = async (material: CompanyMaterial) => {
  previewingMaterial.value = material
  previewDialogVisible.value = true
  previewKind.value = detectPreviewKind(material)
  previewError.value = ''
  previewObjectUrl.value = ''
  previewDocxData.value = null
  loadPreviewSize(previewKind.value)

  if (previewKind.value === 'other' || previewKind.value === 'doc') return

  previewLoading.value = true
  try {
    const res = await getMaterialPreviewBlob(material.id)
    const blob = res.data
    if (previewKind.value === 'docx') {
      previewDocxData.value = await blob.arrayBuffer()
    } else {
      previewObjectUrl.value = URL.createObjectURL(blob)
    }
  } catch (e: any) {
    previewError.value = await parseBlobError(e, '文件加载失败，请尝试下载查看')
    logError('预览材料失败', e)
  } finally {
    previewLoading.value = false
  }
}

const onDocxRendered = () => {
  previewLoading.value = false
}

const onPreviewError = () => {
  previewError.value = '文件解析失败，请下载后查看'
}

const resetPreview = () => {
  if (previewObjectUrl.value) {
    URL.revokeObjectURL(previewObjectUrl.value)
  }
  previewObjectUrl.value = ''
  previewDocxData.value = null
  previewError.value = ''
  previewingMaterial.value = null
}

// ---------- 其他操作 ----------

/** blob 错误响应中提取后端 detail 信息 */
const parseBlobError = async (e: any, fallback: string) => {
  const data = e?.response?.data
  if (data instanceof Blob) {
    try {
      const text = JSON.parse(await data.text())
      return text?.detail || fallback
    } catch {
      return fallback
    }
  }
  return data?.detail || e?.message || fallback
}

/** 材料标题 + 原始扩展名作为下载文件名 */
const materialFileName = (material: CompanyMaterial) => {
  const ext = material.object_key?.includes('.')
    ? '.' + material.object_key.split('.').pop()!.toLowerCase()
    : ''
  return `${material.title}${ext}`
}

const downloadMaterial = async (material: CompanyMaterial) => {
  if (material.is_sensitive && !canDownloadSensitive.value) {
    ElMessage.warning('您没有下载敏感材料的权限')
    return
  }
  try {
    const res = await downloadMaterialFile(material.id)
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = materialFileName(material)
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (e: any) {
    ElMessage.error(await parseBlobError(e, '下载失败'))
  }
}

const removeMaterial = async (material: CompanyMaterial) => {
  try {
    await ElMessageBox.confirm(
      `删除后文件将从存储中移除且不可恢复，确认删除「${material.title}」？`,
      '删除材料',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' }
    )
  } catch {
    return
  }
  try {
    await deleteMaterial(material.id)
    ElMessage.success('删除成功')
    if (materials.value.length === 1 && page.value > 1) {
      page.value -= 1
    }
    loadMaterials()
    loadCompanies()
    loadExpiryStats()
  } catch (e: any) {
    const detail = e?.response?.data?.detail
    ElMessage.error(Array.isArray(detail) ? detail.join('; ') : detail || '删除失败')
  }
}

// ---------- 展示辅助 ----------

const formatFileSize = (size: number) => {
  if (!size) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

const isImageType = (ct: string) => ct?.startsWith('image/')
const isPdfType = (ct: string) => ct === 'application/pdf'

const fileIcon = (row: CompanyMaterial) => {
  if (isImageType(row.content_type)) return Picture
  if (isPdfType(row.content_type)) return Document
  if (row.content_type?.includes('word') || row.content_type?.includes('msword')) return Files
  return Folder
}

const fileIconClass = (row: CompanyMaterial) => {
  if (isImageType(row.content_type)) return 'file-icon-image'
  if (isPdfType(row.content_type)) return 'file-icon-pdf'
  return 'file-icon-doc'
}

/** 有效期展示：起止日期 / 仅截止日期 / 长期 */
const validityText = (row: CompanyMaterial) => {
  if (row.valid_from && row.valid_to) return `${row.valid_from} 至 ${row.valid_to}`
  if (row.valid_to) return `至 ${row.valid_to}`
  if (row.valid_from) return `${row.valid_from} 起`
  return '长期'
}

onMounted(() => {
  loadCompanies()
  loadExpiryStats()
})
</script>

<style scoped>
.material-page {
  padding: 20px;
  background: var(--app-bg, #f6f8fb);
  min-height: calc(100vh - 60px);
}

/* 页头 */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 18px 22px;
  background: var(--app-card, #fff);
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: var(--app-radius, 16px);
  margin-bottom: 16px;
}

.page-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
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

.page-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 主体两栏 */
.page-body {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.panel {
  background: var(--app-card, #fff);
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: var(--app-radius, 16px);
  overflow: hidden;
}

/* 公司侧栏 */
.company-panel {
  width: 250px;
  flex-shrink: 0;
  position: sticky;
  top: 20px;
}

.company-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--app-border, #e5e7eb);
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text-primary, #111827);
}

.company-list {
  max-height: calc(100vh - 220px);
  overflow-y: auto;
  padding: 8px;
}

.company-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;
}

.company-item:hover {
  background: var(--app-bg, #f6f8fb);
}

.company-item.active {
  background: #eff6ff;
}

.company-item.active .company-item-name {
  color: var(--app-primary, #2563eb);
  font-weight: 600;
}

.company-item-main {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.company-item-name {
  font-size: 13px;
  color: var(--app-text-primary, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.company-item-count {
  font-size: 12px;
  color: var(--app-text-secondary, #9ca3af);
  background: var(--app-bg, #f3f4f6);
  border-radius: 999px;
  padding: 1px 8px;
  flex-shrink: 0;
}

.company-item.active .company-item-count {
  background: #dbeafe;
  color: var(--app-primary, #2563eb);
}

/* 材料主区 */
.material-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.filter-panel {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 18px;
}

.filter-search {
  width: 240px;
}

.filter-item {
  width: 160px;
}

.filter-spacer {
  flex: 1;
}

/* 表格内容 */
.material-name {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.file-icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.file-icon-image {
  background: #ecfdf5;
  color: #10b981;
}

.file-icon-pdf {
  background: #fef2f2;
  color: #ef4444;
}

.file-icon-doc {
  background: #eff6ff;
  color: #2563eb;
}

.material-name-text {
  min-width: 0;
}

.material-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}

.material-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--app-text-secondary, #9ca3af);
  flex-wrap: wrap;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  padding: 14px 18px;
  border-top: 1px solid var(--app-border, #e5e7eb);
}

.validity-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 13px;
}

/* 操作列图标按钮 */
.action-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.action-btn {
  margin: 0;
  padding: 6px;
  height: auto;
  border-radius: 6px;
  font-size: 16px;
  color: var(--app-text-secondary, #6b7280);
  transition: color 0.15s, background 0.15s;
}

.action-btn:hover:not(:disabled) {
  color: var(--el-color-primary);
  background: #eff6ff;
}

.action-btn:disabled {
  color: var(--el-disabled-text-color);
  background: transparent;
}

.action-btn-danger:hover:not(:disabled) {
  color: var(--el-color-danger);
  background: #fef2f2;
}

.empty-panel {
  padding: 40px 0;
}

/* 上传 / 替换 */
.upload-selected {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  width: 100%;
  box-sizing: border-box;
}

.upload-selected-text {
  min-width: 0;
  text-align: left;
}

.upload-selected-name {
  font-size: 13px;
  color: var(--app-text-primary, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 340px;
}

.replace-tip {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--app-text-secondary, #6b7280);
}

.upload-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

/* 预览 */
.preview-wrap {
  position: relative;
}

.preview-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.preview-body {
  min-height: 200px;
}

.preview-media {
  width: 100%;
}

.preview-iframe {
  border: none;
}

.preview-docx {
  overflow-y: auto;
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: 8px;
}

.preview-docx :deep(.docx-wrapper) {
  background: #fff;
  padding: 12px 0;
}

.preview-resize-handle {
  position: absolute;
  right: -6px;
  bottom: -6px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-secondary, #9ca3af);
  cursor: nwse-resize;
  user-select: none;
  transform: rotate(90deg);
}

.preview-resize-handle:hover {
  color: var(--el-color-primary);
}

.preview-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 50px 0;
}

.text-danger {
  color: var(--el-color-danger);
}

.text-muted {
  color: var(--app-text-secondary, #9ca3af);
  font-size: 12px;
}

/* 响应式 */
@media (max-width: 900px) {
  .page-body {
    flex-direction: column;
  }

  .company-panel {
    width: 100%;
    position: static;
  }

  .company-list {
    max-height: 240px;
  }
}
</style>
