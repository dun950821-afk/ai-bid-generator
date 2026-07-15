<template>
  <div class="material-list">
    <el-card>
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <el-button type="default" @click="$router.push('/enterprise')">
              <el-icon><ArrowLeft /></el-icon>
              返回
            </el-button>
            <span class="header-title">企业材料库</span>
          </div>
          <el-button type="primary" @click="showUploadDialog">
            上传材料
          </el-button>
        </div>
      </template>

      <!-- 搜索栏 -->
      <el-form :inline="true" class="search-form">
        <el-form-item label="公司">
          <el-select v-model="companyFilter" clearable placeholder="全部" @change="loadMaterials">
            <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="材料类型">
          <el-select v-model="typeFilter" clearable placeholder="全部" @change="loadMaterials">
            <el-option v-for="t in materialTypes" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="statusFilter" clearable placeholder="全部" @change="loadMaterials">
            <el-option label="启用" value="active" />
            <el-option label="已过期" value="expired" />
            <el-option label="归档" value="archived" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadMaterials">查询</el-button>
        </el-form-item>
      </el-form>

      <!-- 材料列表 -->
      <el-table :data="materials" v-loading="loading" style="width: 100%">
        <el-table-column prop="title" label="材料名称" min-width="200">
          <template #default="{ row }">
            <div>
              <span>{{ row.title }}</span>
              <el-tag v-if="row.is_sensitive" type="warning" size="small" style="margin-left: 5px">敏感</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="company_name" label="所属公司" width="150" />
        <el-table-column prop="material_type_display" label="材料类型" width="120" />
        <el-table-column prop="valid_to" label="有效期至" width="120">
          <template #default="{ row }">
            <span :class="{ 'text-danger': row.is_expired }">
              {{ row.valid_to || '长期' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="certificate_no" label="证书编号" width="150" />
        <el-table-column prop="status_display" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' && !row.is_expired ? 'success' : row.is_expired ? 'danger' : 'info'">
              {{ row.is_expired ? '已过期' : row.status_display }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="previewMaterial(row)">预览</el-button>
            <el-button
              type="primary"
              link
              @click="downloadMaterial(row)"
              :disabled="row.is_sensitive && !canDownloadSensitive"
            >
              下载
            </el-button>
            <el-button type="warning" link @click="archiveMaterial(row)" v-if="row.status === 'active'">
              归档
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 上传对话框 -->
    <el-dialog v-model="uploadDialogVisible" title="上传材料" width="500px">
      <el-form :model="uploadForm" label-width="100px">
        <el-form-item label="所属公司" required>
          <el-select v-model="uploadForm.company_id" @change="onCompanyChange">
            <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="材料类型" required>
          <el-select v-model="uploadForm.material_type">
            <el-option v-for="t in materialTypes" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="材料名称" required>
          <el-input v-model="uploadForm.title" />
        </el-form-item>
        <el-form-item label="有效期开始">
          <el-date-picker v-model="uploadForm.valid_from" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="有效期结束">
          <el-date-picker v-model="uploadForm.valid_to" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="发证机构">
          <el-input v-model="uploadForm.issuing_authority" />
        </el-form-item>
        <el-form-item label="证书编号">
          <el-input v-model="uploadForm.certificate_no" />
        </el-form-item>
        <el-form-item label="文件" required>
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :limit="1"
            :on-change="onFileChange"
            :show-file-list="true"
          >
            <el-button type="primary">选择文件</el-button>
            <template #tip>
              <div class="el-upload__tip">支持 PDF / JPG / PNG / GIF / WEBP / DOC / DOCX，最大 50MB</div>
            </template>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="uploadDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="uploadMaterial" :loading="uploading">上传</el-button>
      </template>
    </el-dialog>

    <!-- 预览对话框 -->
    <el-dialog v-model="previewDialogVisible" title="材料预览" width="600px">
      <div v-if="previewingMaterial">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="材料名称">{{ previewingMaterial.title }}</el-descriptions-item>
          <el-descriptions-item label="材料类型">{{ previewingMaterial.material_type_display }}</el-descriptions-item>
          <el-descriptions-item label="证书编号">{{ previewingMaterial.certificate_no || '-' }}</el-descriptions-item>
          <el-descriptions-item label="发证机构">{{ previewingMaterial.issuing_authority || '-' }}</el-descriptions-item>
          <el-descriptions-item label="有效期">{{ previewingMaterial.valid_from || '-' }} 至 {{ previewingMaterial.valid_to || '长期' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="previewingMaterial.is_expired ? 'danger' : 'success'">
              {{ previewingMaterial.is_expired ? '已过期' : '有效' }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
        <div class="preview-image" v-if="previewingMaterial.file_url && isImageType(previewingMaterial.content_type)">
          <el-image :src="previewingMaterial.file_url" fit="contain" style="max-width: 100%; max-height: 400px" />
        </div>
        <div class="preview-pdf" v-else-if="previewingMaterial.file_url && isPdfType(previewingMaterial.content_type)">
          <iframe :src="previewingMaterial.file_url" style="width: 100%; height: 400px; border: none" />
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { UploadProps } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import {
  getCompanyList,
  getMaterialList,
  getMaterialUploadPresign,
  createMaterial,
  getMaterialDownloadUrl,
  archiveMaterial as archiveMaterialApi,
  type CompanyProfile,
  type CompanyMaterial
} from '@/api/enterprise'
import { logError } from '@/utils/logger'

const auth = useAuthStore()

// 检查是否有下载敏感材料的权限
const canDownloadSensitive = computed(() => {
  return auth.hasGlobalPermission('enterprise.download_sensitive_material')
})

const companies = ref<CompanyProfile[]>([])
const materials = ref<CompanyMaterial[]>([])
const loading = ref(false)
const companyFilter = ref<number | null>(null)
const typeFilter = ref('')
const statusFilter = ref('')

const uploadDialogVisible = ref(false)
const uploading = ref(false)
const selectedFile = ref<File | null>(null)

const uploadForm = ref({
  company_id: null as number | null,
  material_type: '',
  title: '',
  valid_from: null as string | null,
  valid_to: null as string | null,
  issuing_authority: '',
  certificate_no: ''
})

const previewDialogVisible = ref(false)
const previewingMaterial = ref<CompanyMaterial | null>(null)

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

const loadCompanies = async () => {
  try {
    const res = await getCompanyList({ status: 'active' })
    companies.value = res.data.results
  } catch (e) {
    logError('加载公司列表失败', e)
  }
}

const loadMaterials = async () => {
  loading.value = true
  try {
    const res = await getMaterialList({
      company_id: companyFilter.value || undefined,
      material_type: typeFilter.value || undefined,
      status: statusFilter.value || undefined
    })
    materials.value = res.data.results
  } catch (e) {
    logError('加载材料列表失败', e)
  } finally {
    loading.value = false
  }
}

const showUploadDialog = () => {
  uploadForm.value = {
    company_id: null,
    material_type: '',
    title: '',
    valid_from: null,
    valid_to: null,
    issuing_authority: '',
    certificate_no: ''
  }
  selectedFile.value = null
  uploadDialogVisible.value = true
}

const onCompanyChange = () => {
  // 可以根据公司自动推荐材料类型
}

const onFileChange: UploadProps['onChange'] = (uploadFile) => {
  selectedFile.value = uploadFile.raw || null
  if (uploadFile.name && !uploadForm.value.title) {
    // 自动填充材料名称
    uploadForm.value.title = uploadFile.name.replace(/\.[^.]+$/, '')
  }
}

const uploadMaterial = async () => {
  if (!uploadForm.value.company_id) {
    ElMessage.warning('请选择公司')
    return
  }
  if (!uploadForm.value.material_type) {
    ElMessage.warning('请选择材料类型')
    return
  }
  if (!uploadForm.value.title) {
    ElMessage.warning('请输入材料名称')
    return
  }
  if (!selectedFile.value) {
    ElMessage.warning('请选择文件')
    return
  }

  uploading.value = true
  try {
    // 1. 获取预签名 URL
    const presignRes = await getMaterialUploadPresign({
      company_id: uploadForm.value.company_id,
      material_type: uploadForm.value.material_type,
      filename: selectedFile.value.name
    })
    const presign = presignRes.data

    // 2. 上传文件到 MinIO
    const formData = new FormData()
    Object.entries(presign.fields).forEach(([key, value]) => {
      formData.append(key, value as string)
    })
    formData.append('file', selectedFile.value as Blob)

    await fetch(presign.upload_url, {
      method: 'POST',
      body: formData
    })

    // 3. 创建材料记录
    await createMaterial({
      company_id: uploadForm.value.company_id,
      material_type: uploadForm.value.material_type,
      title: uploadForm.value.title,
      object_key: presign.object_key,
      file_size: selectedFile.value.size,
      content_type: selectedFile.value.type,
      valid_from: uploadForm.value.valid_from,
      valid_to: uploadForm.value.valid_to,
      issuing_authority: uploadForm.value.issuing_authority,
      certificate_no: uploadForm.value.certificate_no
    })

    ElMessage.success('上传成功')
    uploadDialogVisible.value = false
    loadMaterials()
  } catch (e: any) {
    const detail = e?.response?.data?.detail || e?.message || '上传失败'
    ElMessage.error(detail)
    logError('上传材料失败', e)
  } finally {
    uploading.value = false
  }
}

const previewMaterial = (material: CompanyMaterial) => {
  previewingMaterial.value = material
  previewDialogVisible.value = true
}

const downloadMaterial = async (material: CompanyMaterial) => {
  // 敏感材料权限检查
  if (material.is_sensitive && !canDownloadSensitive.value) {
    ElMessage.warning('您没有下载敏感材料的权限')
    return
  }
  try {
    const res = await getMaterialDownloadUrl(material.id)
    window.open(res.data.url, '_blank')
  } catch (e) {
    ElMessage.error('下载失败')
  }
}

const archiveMaterial = async (material: CompanyMaterial) => {
  try {
    await archiveMaterialApi(material.id)
    ElMessage.success('归档成功')
    loadMaterials()
  } catch (e) {
    ElMessage.error('归档失败')
  }
}

const isImageType = (contentType: string) => {
  return contentType?.startsWith('image/')
}

const isPdfType = (contentType: string) => {
  return contentType === 'application/pdf'
}

onMounted(() => {
  loadCompanies()
  loadMaterials()
})
</script>

<style scoped>
.material-list {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title {
  font-size: 16px;
  font-weight: 500;
}

.search-form {
  margin-bottom: 15px;
}

.text-danger {
  color: var(--el-color-danger);
}

.preview-image, .preview-pdf {
  margin-top: 20px;
  text-align: center;
}
</style>