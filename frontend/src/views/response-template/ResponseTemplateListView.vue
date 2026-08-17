<template>
  <div class="rt-list-page">
    <div class="rt-list-header">
      <div>
        <h2 class="rt-list-title">
          招标响应模板
          <el-button
            size="small"
            text
            type="primary"
            class="rt-help-btn"
            @click="helpVisible = true"
          >
            <el-icon><QuestionFilled /></el-icon>使用说明
          </el-button>
        </h2>
        <p class="rt-list-sub">招标文件 → 响应文件: 识别格式 → 确认 → 生成 → 校对</p>
      </div>
      <div class="rt-list-filters">
        <el-input
          v-model="keyword"
          placeholder="搜索模板 / 项目 / 招标文件"
          clearable
          class="rt-list-search"
          @input="page = 1"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 130px" @change="page = 1">
          <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
      </div>
    </div>

    <div v-loading="loading">
      <el-empty v-if="!pagedTemplates.length && !loading" description="暂无响应模板, 请在招标文件详情页发起识别" />
      <div v-else class="rt-card-grid">
        <div
          v-for="t in pagedTemplates"
          :key="t.id"
          class="rt-card"
          @click="goDetail(t.id)"
        >
          <div class="rt-card-head">
            <span class="rt-card-name" :title="t.name">{{ t.name }}</span>
            <el-tag :type="statusType(t.status)" size="small" effect="dark">{{ t.status_display }}</el-tag>
          </div>
          <div class="rt-card-meta">
            <div class="rt-card-line" :title="t.project_name">
              <el-icon><Folder /></el-icon>{{ t.project_name || `项目 #${t.project}` }}
              <template v-if="t.lot_name"> · {{ t.lot_name }}</template>
            </div>
            <div class="rt-card-line" :title="t.source_file_name">
              <el-icon><Document /></el-icon>{{ t.source_file_name }}
            </div>
          </div>
          <div class="rt-card-foot">
            <el-progress
              :percentage="progressOf(t)"
              :stroke-width="6"
              :show-text="false"
              :status="t.status === 'failed' ? 'exception' : t.status === 'generated' ? 'success' : undefined"
              class="rt-card-progress"
            />
            <div class="rt-card-foot-text">
              <span>{{ stepText(t) }}</span>
              <span>{{ formatTime(t.updated_at) }}</span>
            </div>
          </div>
        </div>
      </div>
      <div v-if="filteredTemplates.length > pageSize" class="rt-list-pager">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="filteredTemplates.length"
          layout="total, prev, pager, next"
          background
        />
      </div>
    </div>

    <!-- 使用说明弹窗 -->
    <el-dialog v-model="helpVisible" title="响应模板使用说明" width="680px" class="rt-help-dialog">
      <el-scrollbar max-height="62vh">
        <div class="help-body">
          <section>
            <h3>这是什么</h3>
            <p>
              把招标文件里的「响应/应答/投标文件格式」章节变成一份填好的响应文件：
              AI 识别出每个附件里需要填写的位置（块），系统自动填企业资料、案例、材料和 AI 内容，
              你只需确认、补报价、下载校对。
            </p>
          </section>

          <section>
            <h3>从哪里触发（两个入口，同一文件只会创建一份模板）</h3>
            <ol>
              <li><b>招标文件详情页</b>：文件解析完成后，右上角「识别响应模板」按钮。</li>
              <li><b>标段工作台 → 文件解析阶段</b>：文件组「已就绪」后，行内「识别响应模板」按钮。</li>
            </ol>
            <p class="help-tip">已有模板时按钮自动变为「进入响应模板」，重复点击不会重复创建。</p>
          </section>

          <section>
            <h3>使用流程</h3>
            <ol>
              <li><b>识别</b>（1~2 分钟）：AI 逐附件识别填充位置，页面自动刷新。</li>
              <li><b>确认</b>：检查左侧块列表——可按「待复核」筛选、按附件分组、改类型；
                签字/盖章类自动折叠不用管；点「原文」可与招标文件原文对照（支持缩放）。
                确认前会弹出<b>生成前检查</b>，列出缺的企业字段、材料、报价等。</li>
              <li><b>生成</b>：系统在原始 docx 上原位填充，保留招标方格式；
                主文件只含响应格式部分，「单独密封」附件（如报价表）单独出一份文件。</li>
              <li><b>待办</b>：「产物与待办」页签列出还需人工的项——填报价（行内直接填）、
                补材料（跳材料包上传）、复核 AI 应答表等，逐项点击可定位。</li>
              <li><b>下载 / 在线校对</b>：产物卡片支持直接下载，或 ONLYOFFICE 在线校对
                （新标签页打开，保存即回写系统，下载永远是最新版）。</li>
            </ol>
          </section>

          <section>
            <h3>自动填充的数据来源（提前维护好，填得越全）</h3>
            <ul>
              <li><b>企业资料中心</b>：公司名称、地址、电话、邮箱、法人、注册资本、开户行、账号等。</li>
              <li><b>材料包</b>：营业执照、资质证书、社保证明、法人身份证等图片，自动贴入材料粘贴处。</li>
              <li><b>项目人员</b>：人员简历类重复块自动按人员库填充。</li>
              <li><b>案例库</b>：案例表格按项目关键词自动匹配填充。</li>
            </ul>
          </section>

          <section>
            <h3>小提示</h3>
            <ul>
              <li>报价填数字即可，「大写」金额行自动转中文大写（如 5000 → 伍仟元整）。</li>
              <li>签字、盖章处系统不会代劳——打印后人工完成。</li>
              <li>识别不满意可点右上角「⋯」→ 重新识别（会清空当前块）。</li>
              <li>改了报价/类型/份数后，在「已生成」状态点「重新生成」即可覆盖旧产物。</li>
            </ul>
          </section>
        </div>
      </el-scrollbar>
      <template #footer>
        <el-button type="primary" @click="helpVisible = false">知道了</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Document, Folder, QuestionFilled, Search } from '@element-plus/icons-vue'
import { listResponseTemplates, type ResponseTemplate } from '@/api/responseTemplate'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const templates = ref<ResponseTemplate[]>([])
const keyword = ref('')
const statusFilter = ref('')
const helpVisible = ref(false)
const page = ref(1)
const pageSize = 12

const statusOptions = [
  { value: 'analyzing', label: '识别中' },
  { value: 'analyzed', label: '待确认' },
  { value: 'confirmed', label: '已确认' },
  { value: 'generating', label: '生成中' },
  { value: 'generated', label: '已生成' },
  { value: 'failed', label: '失败' },
]

const projectIdQuery = (route.query.project_id as string) || ''

const filteredTemplates = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return templates.value.filter((t) => {
    if (statusFilter.value && t.status !== statusFilter.value) return false
    if (kw) {
      const hay = `${t.name} ${t.project_name} ${t.source_file_name}`.toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
})

const pagedTemplates = computed(() => {
  const start = (page.value - 1) * pageSize
  return filteredTemplates.value.slice(start, start + pageSize)
})

/** 流程进度: 状态机 → 百分比 */
function progressOf(t: ResponseTemplate): number {
  switch (t.status) {
    case 'pending':
      return 10
    case 'analyzing':
      return 30
    case 'analyzed':
      return 55
    case 'confirmed':
      return 70
    case 'generating':
      return 85
    case 'generated':
      return 100
    case 'failed':
      return 30
    default:
      return 0
  }
}

function stepText(t: ResponseTemplate): string {
  switch (t.status) {
    case 'pending':
    case 'analyzing':
      return '识别响应格式中'
    case 'analyzed':
      return '待确认填充位置'
    case 'confirmed':
      return '待生成'
    case 'generating':
      return '生成中'
    case 'generated':
      return `${t.documents.length} 个产物, 可下载/校对`
    case 'failed':
      return '失败, 可重试'
    default:
      return ''
  }
}

function statusType(status: string): 'success' | 'info' | 'warning' | 'danger' | 'primary' {
  if (status === 'generated') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'confirmed') return 'warning'
  if (status === 'analyzed') return 'primary'
  return 'info'
}

function formatTime(t: string): string {
  return t ? t.replace('T', ' ').slice(0, 16) : ''
}

function goDetail(id: number) {
  router.push(`/response-templates/${id}`)
}

async function load() {
  loading.value = true
  try {
    const { data } = await listResponseTemplates(
      projectIdQuery ? { project_id: projectIdQuery } : undefined,
    )
    templates.value = Array.isArray(data) ? data : (data.results || [])
  } catch (e) {
    ElMessage.error('加载响应模板列表失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.rt-list-page {
  padding: 16px 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.rt-list-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.rt-list-title {
  margin: 0;
  font-size: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.rt-help-btn {
  font-weight: 400;
}

/* 使用说明弹窗 */
.help-body section {
  margin-bottom: 18px;
}

.help-body h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--app-primary);
  border-left: 3px solid var(--app-primary);
  padding-left: 8px;
}

.help-body p,
.help-body li {
  font-size: 13px;
  line-height: 1.9;
  color: #374151;
}

.help-body ol,
.help-body ul {
  margin: 0;
  padding-left: 20px;
}

.help-tip {
  background: #f0f7ff;
  border-radius: 6px;
  padding: 6px 10px;
  color: #2563eb;
}

.rt-list-sub {
  margin: 4px 0 0;
  color: var(--app-text-secondary);
  font-size: 13px;
}

.rt-list-filters {
  display: flex;
  gap: 10px;
}

.rt-list-search {
  width: 260px;
}

.rt-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
}

.rt-card {
  background: var(--app-card);
  border: 1px solid var(--app-border);
  border-radius: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.rt-card:hover {
  border-color: var(--app-primary);
  box-shadow: var(--app-shadow);
}

.rt-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.rt-card-name {
  font-weight: 600;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rt-card-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.rt-card-line {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--app-text-secondary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rt-card-progress {
  flex: 1;
}

.rt-card-foot-text {
  display: flex;
  justify-content: space-between;
  color: var(--app-text-secondary);
  font-size: 12px;
  margin-top: 6px;
}

.rt-list-pager {
  display: flex;
  justify-content: center;
  margin-top: 18px;
}
</style>
