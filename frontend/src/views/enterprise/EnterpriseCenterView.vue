<template>
  <div class="enterprise-center">
    <el-row :gutter="20">
      <el-col :span="6">
        <el-card shadow="hover" class="nav-card" @click="$router.push('/enterprise/companies')">
          <div class="nav-icon">
            <el-icon :size="40"><OfficeBuilding /></el-icon>
          </div>
          <div class="nav-title">公司信息管理</div>
          <div class="nav-desc">维护公司基础信息、银行账户等主数据</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="nav-card" @click="$router.push('/enterprise/materials')">
          <div class="nav-icon">
            <el-icon :size="40"><FolderOpened /></el-icon>
          </div>
          <div class="nav-title">企业材料库</div>
          <div class="nav-desc">管理营业执照、身份证、资质证书等材料</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="nav-card" @click="$router.push('/outlines')">
          <div class="nav-icon">
            <el-icon :size="40"><Document /></el-icon>
          </div>
          <div class="nav-title">标书材料包</div>
          <div class="nav-desc">在标书详情中管理项目材料包</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 默认公司信息 -->
    <el-card class="section-card" v-if="defaultCompany">
      <template #header>
        <div class="card-header">
          <span>默认公司信息</span>
          <el-button type="primary" link @click="$router.push('/enterprise/companies')">
            管理公司
          </el-button>
        </div>
      </template>
      <el-descriptions :column="3" border>
        <el-descriptions-item label="公司名称">{{ defaultCompany.name }}</el-descriptions-item>
        <el-descriptions-item label="简称">{{ defaultCompany.short_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="统一社会信用代码">{{ defaultCompany.unified_social_credit_code || '-' }}</el-descriptions-item>
        <el-descriptions-item label="法定代表人">{{ defaultCompany.legal_representative || '-' }}</el-descriptions-item>
        <el-descriptions-item label="注册资本">{{ defaultCompany.registered_capital || '-' }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ defaultCompany.official_phone || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 即将过期材料 -->
    <el-card class="section-card" v-if="expiringMaterials.length > 0">
      <template #header>
        <div class="card-header">
          <span>即将过期材料</span>
          <el-tag type="warning">{{ expiringMaterials.length }} 项</el-tag>
        </div>
      </template>
      <el-table :data="expiringMaterials" style="width: 100%">
        <el-table-column prop="title" label="材料名称" />
        <el-table-column prop="material_type_display" label="材料类型" width="120" />
        <el-table-column prop="valid_to" label="有效期至" width="120">
          <template #default="{ row }">
            <span :class="{ 'text-danger': row.days_to_expire <= 7 }">
              {{ row.valid_to }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="days_to_expire" label="剩余天数" width="100">
          <template #default="{ row }">
            <el-tag :type="row.days_to_expire <= 7 ? 'danger' : 'warning'">
              {{ row.days_to_expire }} 天
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default>
            <el-button type="primary" link @click="$router.push('/enterprise/materials')">
              更新
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { OfficeBuilding, FolderOpened, Document } from '@element-plus/icons-vue'
import { getDefaultCompany, getExpiringMaterials, type CompanyProfile, type CompanyMaterial } from '@/api/enterprise'
import { logError } from '@/utils/logger'

const defaultCompany = ref<CompanyProfile | null>(null)
const expiringMaterials = ref<CompanyMaterial[]>([])

onMounted(async () => {
  // 并行加载，但分别处理错误
  const companyPromise = getDefaultCompany()
    .then(res => res.data)
    .catch(e => {
      logError('加载默认公司失败', e)
      return null
    })

  const materialsPromise = getExpiringMaterials(30)
    .then(res => res.data)
    .catch(e => {
      logError('加载过期材料失败', e)
      return []
    })

  const [company, materials] = await Promise.all([companyPromise, materialsPromise])
  defaultCompany.value = company
  expiringMaterials.value = materials
})
</script>

<style scoped>
.enterprise-center {
  padding: 20px;
}

.nav-card {
  cursor: pointer;
  text-align: center;
  padding: 20px;
  transition: all 0.3s;
}

.nav-card:hover {
  transform: translateY(-5px);
}

.nav-icon {
  margin-bottom: 15px;
  color: var(--el-color-primary);
}

.nav-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 10px;
}

.nav-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.section-card {
  margin-top: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.text-danger {
  color: var(--el-color-danger);
}
</style>
