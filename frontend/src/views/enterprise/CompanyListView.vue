<template>
  <div class="company-list">
    <el-card>
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <el-button type="default" @click="$router.push('/enterprise')">
              <el-icon><ArrowLeft /></el-icon>
              返回
            </el-button>
            <span class="header-title">公司信息管理</span>
          </div>
          <el-button type="primary" @click="showCreateDialog">
            新增公司
          </el-button>
        </div>
      </template>

      <!-- 搜索栏 -->
      <el-form :inline="true" class="search-form">
        <el-form-item label="搜索">
          <el-input v-model="searchText" placeholder="公司名称" clearable @keyup.enter="loadCompanies" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="statusFilter" clearable placeholder="全部">
            <el-option label="草稿" value="draft" />
            <el-option label="启用" value="active" />
            <el-option label="归档" value="archived" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadCompanies">查询</el-button>
        </el-form-item>
      </el-form>

      <!-- 公司列表 -->
      <el-table :data="companies" v-loading="loading" style="width: 100%">
        <el-table-column prop="name" label="公司名称" min-width="200">
          <template #default="{ row }">
            <div>
              <span>{{ row.name }}</span>
              <el-tag v-if="row.is_default" type="success" size="small" style="margin-left: 5px">默认</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="unified_social_credit_code" label="统一社会信用代码" width="180" />
        <el-table-column prop="legal_representative" label="法定代表人" width="100" />
        <el-table-column prop="registered_capital" label="注册资本" width="100" />
        <el-table-column prop="official_phone" label="联系电话" width="120" />
        <el-table-column prop="status_display" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : row.status === 'draft' ? 'info' : 'warning'">
              {{ row.status_display }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="material_count" label="材料数" width="80" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="showEditDialog(row)">编辑</el-button>
            <el-button type="primary" link @click="setDefault(row)" v-if="!row.is_default && row.status === 'active'">
              设为默认
            </el-button>
            <el-button type="danger" link @click="deleteCompany(row)" v-if="!row.is_default">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 创建/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingCompany ? '编辑公司' : '新增公司'" width="600px">
      <el-form :model="formData" label-width="120px">
        <el-form-item label="公司名称" required>
          <el-input v-model="formData.name" />
        </el-form-item>
        <el-form-item label="公司简称">
          <el-input v-model="formData.short_name" />
        </el-form-item>
        <el-form-item label="统一社会信用代码">
          <el-input v-model="formData.unified_social_credit_code" />
        </el-form-item>
        <el-form-item label="法定代表人">
          <el-input v-model="formData.legal_representative" />
        </el-form-item>
        <el-form-item label="注册资本">
          <el-input v-model="formData.registered_capital" />
        </el-form-item>
        <el-form-item label="成立日期">
          <el-date-picker v-model="formData.established_date" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="注册地址">
          <el-input v-model="formData.registered_address" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="经营范围">
          <el-input v-model="formData.business_scope" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="公司简介">
          <el-input v-model="formData.company_intro" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="formData.official_phone" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="formData.official_email" />
        </el-form-item>
        <el-form-item label="官网">
          <el-input v-model="formData.website" />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="formData.contact_person" />
        </el-form-item>
        <el-form-item label="开户银行">
          <el-input v-model="formData.bank_name" />
        </el-form-item>
        <el-form-item label="银行账号">
          <el-input v-model="formData.bank_account" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveCompany" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import {
  getCompanyList,
  getCompanyDetail,
  createCompany,
  updateCompany,
  deleteCompany as deleteCompanyApi,
  setDefaultCompany,
  type CompanyProfile,
  type CompanyProfileCreate
} from '@/api/enterprise'

const companies = ref<CompanyProfile[]>([])
const loading = ref(false)
const searchText = ref('')
const statusFilter = ref('')

const dialogVisible = ref(false)
const editingCompany = ref<CompanyProfile | null>(null)
const saving = ref(false)

const formData = ref<CompanyProfileCreate>({
  name: '',
  short_name: '',
  unified_social_credit_code: '',
  legal_representative: '',
  registered_capital: '',
  established_date: null,
  registered_address: '',
  business_scope: '',
  company_intro: '',
  official_phone: '',
  official_email: '',
  website: '',
  contact_person: '',
  bank_name: '',
  bank_account: ''
})

const loadCompanies = async () => {
  loading.value = true
  try {
    const res = await getCompanyList({
      search: searchText.value,
      status: statusFilter.value
    })
    companies.value = res.data.results
  } catch (e) {
    console.error('加载公司列表失败', e)
  } finally {
    loading.value = false
  }
}

const showCreateDialog = () => {
  editingCompany.value = null
  formData.value = {
    name: '',
    short_name: '',
    unified_social_credit_code: '',
    legal_representative: '',
    registered_capital: '',
    established_date: null,
    registered_address: '',
    business_scope: '',
    company_intro: '',
    official_phone: '',
    official_email: '',
    website: '',
    contact_person: '',
    bank_name: '',
    bank_account: ''
  }
  dialogVisible.value = true
}

const showEditDialog = async (company: CompanyProfile) => {
  // 获取完整数据
  try {
    const res = await getCompanyDetail(company.id)
    const fullCompany = res.data
    editingCompany.value = fullCompany
    formData.value = {
      name: fullCompany.name,
      short_name: fullCompany.short_name,
      unified_social_credit_code: fullCompany.unified_social_credit_code,
      legal_representative: fullCompany.legal_representative,
      registered_capital: fullCompany.registered_capital,
      established_date: fullCompany.established_date,
      registered_address: fullCompany.registered_address,
      business_scope: fullCompany.business_scope,
      company_intro: fullCompany.company_intro,
      official_phone: fullCompany.official_phone,
      official_email: fullCompany.official_email,
      website: fullCompany.website,
      contact_person: fullCompany.contact_person,
      bank_name: fullCompany.bank_name,
      bank_account: fullCompany.bank_account
    }
    dialogVisible.value = true
  } catch (e) {
    ElMessage.error('获取公司详情失败')
  }
}

const saveCompany = async () => {
  if (!formData.value.name) {
    ElMessage.warning('请输入公司名称')
    return
  }

  saving.value = true
  try {
    if (editingCompany.value) {
      await updateCompany(editingCompany.value.id, formData.value)
      ElMessage.success('更新成功')
    } else {
      await createCompany(formData.value)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    loadCompanies()
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

const setDefault = async (company: CompanyProfile) => {
  try {
    await ElMessageBox.confirm(`确定将 "${company.name}" 设为默认公司？`, '确认')
    await setDefaultCompany(company.id)
    ElMessage.success('设置成功')
    loadCompanies()
  } catch (e) {
    // 用户取消
  }
}

const deleteCompany = async (company: CompanyProfile) => {
  try {
    await ElMessageBox.confirm(`确定删除公司 "${company.name}"？此操作不可恢复。`, '确认删除', {
      type: 'warning'
    })
    await deleteCompanyApi(company.id)
    ElMessage.success('删除成功')
    loadCompanies()
  } catch (e) {
    // 用户取消
  }
}

onMounted(() => {
  loadCompanies()
})
</script>

<style scoped>
.company-list {
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