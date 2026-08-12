<!-- frontend/src/views/enterprise/EnterpriseCenterView.vue -->
<template>
  <div class="enterprise-center">
    <!-- 页头 -->
    <header class="page-header">
      <div class="page-header-text">
        <h1 class="page-title">企业资料中心</h1>
        <p class="page-subtitle">公司主数据、企业材料与标书材料包的统一管理入口</p>
      </div>
      <el-tag v-if="expiredMaterials.length" type="danger" effect="light" round>
        {{ expiredMaterials.length }} 项材料已过期
      </el-tag>
      <el-tag v-else-if="expiringMaterials.length" type="warning" effect="light" round>
        {{ expiringMaterials.length }} 项材料即将过期
      </el-tag>
    </header>

    <!-- 功能入口 -->
    <section class="nav-grid">
      <div
        v-for="entry in navEntries"
        :key="entry.title"
        class="nav-card"
        @click="router.push(entry.route)"
      >
        <div class="nav-icon" :style="{ background: entry.bg, color: entry.color }">
          <el-icon :size="24"><component :is="entry.icon" /></el-icon>
        </div>
        <div class="nav-info">
          <div class="nav-title">{{ entry.title }}</div>
          <div class="nav-desc">{{ entry.desc }}</div>
        </div>
        <el-icon class="nav-go"><ArrowRight /></el-icon>
      </div>
    </section>

    <!-- 默认公司信息 -->
    <section class="panel" v-if="defaultCompany">
      <div class="panel-header">
        <span class="panel-title">默认公司信息</span>
        <el-button type="primary" link @click="router.push('/enterprise/companies')">
          管理公司
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
      <div class="panel-body">
        <el-descriptions :column="3" border>
          <el-descriptions-item label="公司名称">{{ defaultCompany.name }}</el-descriptions-item>
          <el-descriptions-item label="简称">{{ defaultCompany.short_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="统一社会信用代码">{{ defaultCompany.unified_social_credit_code || '-' }}</el-descriptions-item>
          <el-descriptions-item label="法定代表人">{{ defaultCompany.legal_representative || '-' }}</el-descriptions-item>
          <el-descriptions-item label="注册资本">{{ defaultCompany.registered_capital || '-' }}</el-descriptions-item>
          <el-descriptions-item label="联系电话">{{ defaultCompany.official_phone || '-' }}</el-descriptions-item>
        </el-descriptions>
      </div>
    </section>

    <!-- 已过期材料 -->
    <section class="panel" v-if="expiredMaterials.length > 0">
      <div class="panel-header">
        <span class="panel-title">已过期材料</span>
        <el-tag type="danger" effect="light" round>{{ expiredMaterials.length }} 项</el-tag>
      </div>
      <el-table :data="expiredMaterials" style="width: 100%">
        <el-table-column prop="title" label="材料名称" />
        <el-table-column prop="material_type_display" label="材料类型" width="140" />
        <el-table-column prop="valid_to" label="有效期至" width="140">
          <template #default="{ row }">
            <span class="text-danger">{{ row.valid_to }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center">
          <template #default>
            <el-button type="primary" link @click="router.push('/enterprise/materials')">
              处理
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <!-- 即将过期材料 -->
    <section class="panel" v-if="expiringMaterials.length > 0">
      <div class="panel-header">
        <span class="panel-title">即将过期材料</span>
        <el-tag type="warning" effect="light" round>{{ expiringMaterials.length }} 项</el-tag>
      </div>
      <el-table :data="expiringMaterials" style="width: 100%">
        <el-table-column prop="title" label="材料名称" />
        <el-table-column prop="material_type_display" label="材料类型" width="140" />
        <el-table-column prop="valid_to" label="有效期至" width="140">
          <template #default="{ row }">
            <span :class="{ 'text-danger': row.days_to_expire <= 7 }">
              {{ row.valid_to }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="days_to_expire" label="剩余天数" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.days_to_expire <= 7 ? 'danger' : 'warning'" effect="light" round>
              {{ row.days_to_expire }} 天
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center">
          <template #default>
            <el-button type="primary" link @click="router.push('/enterprise/materials')">
              更新
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <!-- 全部健康时的空态提示 -->
    <section
      class="panel empty-panel"
      v-if="!defaultCompany && !expiredMaterials.length && !expiringMaterials.length"
    >
      <el-empty description="暂无默认公司与到期提醒，可从上方入口开始维护企业资料" :image-size="90" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { OfficeBuilding, FolderOpened, Document, Trophy, ArrowRight } from '@element-plus/icons-vue'
import { getDefaultCompany, getExpiringMaterials, type CompanyProfile, type CompanyMaterial } from '@/api/enterprise'
import { logError } from '@/utils/logger'

const router = useRouter()

interface NavEntry {
  title: string
  desc: string
  route: string
  icon: Component
  color: string
  bg: string
}

const navEntries: NavEntry[] = [
  {
    title: '公司信息管理',
    desc: '维护公司基础信息、银行账户等主数据',
    route: '/enterprise/companies',
    icon: OfficeBuilding,
    color: '#2563eb',
    bg: '#dbeafe',
  },
  {
    title: '企业材料库',
    desc: '管理营业执照、身份证、资质证书等材料',
    route: '/enterprise/materials',
    icon: FolderOpened,
    color: '#f59e0b',
    bg: '#fef3c7',
  },
  {
    title: '标书材料包',
    desc: '管理所有标书的材料包',
    route: '/enterprise/packages',
    icon: Document,
    color: '#10b981',
    bg: '#d1fae5',
  },
  {
    title: '项目案例',
    desc: '管理过往项目案例, 用于响应文件案例表自动填充',
    route: '/enterprise/cases',
    icon: Trophy,
    color: '#8b5cf6',
    bg: '#ede9fe',
  },
]

const defaultCompany = ref<CompanyProfile | null>(null)
const expiredMaterials = ref<CompanyMaterial[]>([])
const expiringMaterials = ref<CompanyMaterial[]>([])

onMounted(async () => {
  // 并行加载，但分别处理错误
  const companyPromise = getDefaultCompany()
    .then(res => res.data)
    .catch(e => {
      // 404 = 尚未设置默认公司，属全新用户的预期空状态，不记错误日志
      if (e.response?.status !== 404) {
        logError('加载默认公司失败', e)
      }
      return null
    })

  // 拉取已过期 + 即将过期（含已过期）
  const materialsPromise = getExpiringMaterials(30)
    .then(res => res.data)
    .catch(e => {
      logError('加载过期材料失败', e)
      return []
    })

  const [company, materials] = await Promise.all([companyPromise, materialsPromise])
  defaultCompany.value = company
  // 已过期：is_expired=true（valid_to < today）
  expiredMaterials.value = materials.filter(m => m.is_expired)
  // 即将过期：未过期但 30 天内到期
  expiringMaterials.value = materials.filter(m => !m.is_expired)
})
</script>

<style scoped>
.enterprise-center {
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

/* 功能入口 */
.nav-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.nav-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  background: var(--app-card, #fff);
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: var(--app-radius, 16px);
  cursor: pointer;
  transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
}

.nav-card:hover {
  transform: translateY(-2px);
  border-color: var(--app-primary, #2563eb);
  box-shadow: var(--app-shadow, 0 16px 40px rgba(15, 23, 42, 0.08));
}

.nav-card:hover .nav-go {
  opacity: 1;
  transform: translateX(0);
}

.nav-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.nav-info {
  flex: 1;
  min-width: 0;
}

.nav-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text-primary, #111827);
  margin-bottom: 4px;
}

.nav-desc {
  font-size: 12px;
  color: var(--app-text-secondary, #6b7280);
  line-height: 1.5;
}

.nav-go {
  color: var(--app-primary, #2563eb);
  opacity: 0;
  transform: translateX(-4px);
  transition: opacity 0.18s, transform 0.18s;
  flex-shrink: 0;
}

/* 通用面板 */
.panel {
  background: var(--app-card, #fff);
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: var(--app-radius, 16px);
  overflow: hidden;
  margin-bottom: 16px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid var(--app-border, #e5e7eb);
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text-primary, #111827);
}

.panel-body {
  padding: 16px 18px;
}

.panel :deep(.el-table::before) {
  display: none;
}

.empty-panel {
  padding: 24px 0;
}

.text-danger {
  color: var(--app-danger, #ef4444);
}

/* 响应式 */
@media (max-width: 900px) {
  .nav-grid {
    grid-template-columns: 1fr;
  }
}
</style>
