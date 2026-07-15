<template>
  <div class="package-list">
    <el-card>
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <el-button type="default" @click="$router.push('/enterprise')">
              <el-icon><ArrowLeft /></el-icon>
              返回
            </el-button>
            <span class="header-title">标书材料包</span>
          </div>
        </div>
      </template>

      <!-- 搜索栏 -->
      <el-form :inline="true" class="search-form">
        <el-form-item label="公司">
          <el-select v-model="companyFilter" clearable placeholder="全部" @change="loadPackages">
            <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="statusFilter" clearable placeholder="全部" @change="loadPackages">
            <el-option label="草稿" value="draft" />
            <el-option label="已确认" value="confirmed" />
            <el-option label="已锁定" value="locked" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadPackages">查询</el-button>
        </el-form-item>
      </el-form>

      <!-- 材料包列表 -->
      <el-table :data="packages" v-loading="loading" style="width: 100%">
        <el-table-column prop="name" label="材料包名称" min-width="200">
          <template #default="{ row }">
            <el-button type="primary" link @click="goOutline(row.outline)">
              {{ row.name || `材料包#${row.id}` }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="outline_name" label="所属大纲" min-width="180" />
        <el-table-column prop="company_name" label="公司" width="180" />
        <el-table-column label="材料数" width="80">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.items?.length || 0 }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status_display" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ row.status_display }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="locked_at" label="锁定时间" width="160">
          <template #default="{ row }">
            {{ row.locked_at ? formatDateTime(row.locked_at) : '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="goOutline(row.outline)">查看</el-button>
            <el-button
              type="danger"
              link
              :disabled="!row.is_editable"
              @click="deletePackage(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import {
  getCompanyList,
  listMaterialPackages,
  deleteMaterialPackageById,
  type CompanyProfile,
  type BidMaterialPackage,
} from '@/api/enterprise'
import { logError } from '@/utils/logger'

const router = useRouter()

const companies = ref<CompanyProfile[]>([])
const packages = ref<BidMaterialPackage[]>([])
const loading = ref(false)
const companyFilter = ref<number | null>(null)
const statusFilter = ref('')

async function loadCompanies() {
  try {
    const res = await getCompanyList({ status: 'active' })
    companies.value = res.data.results
  } catch (e) {
    logError('加载公司列表失败', e)
  }
}

async function loadPackages() {
  loading.value = true
  try {
    const params: Record<string, string | number> = {}
    if (companyFilter.value) params.company = companyFilter.value
    if (statusFilter.value) params.status = statusFilter.value
    const res = await listMaterialPackages(params)
    packages.value = res.data.results
  } catch (e) {
    logError('加载材料包列表失败', e)
  } finally {
    loading.value = false
  }
}

function goOutline(outlineId: number) {
  router.push(`/outlines/${outlineId}`)
}

async function deletePackage(pkg: BidMaterialPackage) {
  try {
    await ElMessageBox.confirm(
      `确定删除材料包 "${pkg.name || `#${pkg.id}`}"？此操作不可恢复。`,
      '确认删除',
      { type: 'warning' }
    )
  } catch {
    return
  }
  try {
    await deleteMaterialPackageById(pkg.id)
    ElMessage.success('删除成功')
    loadPackages()
  } catch (e: any) {
    const detail = e?.response?.data?.detail || e?.message || '删除失败'
    ElMessage.error(detail)
  }
}

function getStatusType(status: string): string {
  const map: Record<string, string> = { draft: 'info', confirmed: 'success', locked: 'warning' }
  return map[status] || 'info'
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

onMounted(() => {
  loadCompanies()
  loadPackages()
})
</script>

<style scoped>
.package-list {
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
</style>
