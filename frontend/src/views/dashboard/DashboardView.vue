<!-- frontend/src/views/dashboard/DashboardView.vue -->
<template>
  <div class="dashboard" v-loading="loading">
    <!-- 顶部标题栏 -->
    <div class="dashboard-header">
      <div class="header-left">
        <h1 class="dashboard-title">AI 投标生成平台 · 数据大屏</h1>
        <p class="dashboard-subtitle">实时洞察项目进度、AI 调用与知识库健康度</p>
      </div>
      <div class="header-right">
        <span class="refresh-time" v-if="overview">
          数据更新于 {{ formatTime(overview.refreshed_at) }}
        </span>
        <el-button :icon="Refresh" :loading="loading" @click="loadOverview">刷新</el-button>
      </div>
    </div>

    <template v-if="overview">
      <!-- 第一行：KPI 顶栏（7 个核心指标） -->
      <div class="kpi-row">
        <div class="kpi-card kpi-projects clickable" @click="goTo('/projects')">
          <div class="kpi-icon">📊</div>
          <div class="kpi-body">
            <div class="kpi-value">{{ overview.kpi.projects }}</div>
            <div class="kpi-label">项目数</div>
            <div class="kpi-extra">{{ overview.kpi.lots }} 个标段</div>
          </div>
        </div>
        <div class="kpi-card kpi-outlines clickable" @click="openOutlinesDialog">
          <div class="kpi-icon">📝</div>
          <div class="kpi-body">
            <div class="kpi-value">{{ overview.kpi.outlines }}</div>
            <div class="kpi-label">大纲数</div>
            <div class="kpi-extra">{{ overview.kpi.bid_documents }} 份标书</div>
          </div>
        </div>
        <div class="kpi-card kpi-kb clickable" @click="goTo('/knowledge')">
          <div class="kpi-icon">📚</div>
          <div class="kpi-body">
            <div class="kpi-value">{{ overview.kpi.knowledge_documents }}</div>
            <div class="kpi-label">知识库文档</div>
            <div class="kpi-extra">{{ overview.kpi.knowledge_chunks }} 个分块</div>
          </div>
        </div>
        <div class="kpi-card kpi-ai">
          <div class="kpi-icon">🤖</div>
          <div class="kpi-body">
            <div class="kpi-value">{{ formatNumber(overview.kpi.ai_runs_total) }}</div>
            <div class="kpi-label">AI 调用次数</div>
            <div class="kpi-extra">{{ formatTokens(overview.system_health.total_tokens) }} tokens</div>
          </div>
        </div>
        <div class="kpi-card kpi-retrieval">
          <div class="kpi-icon">🔍</div>
          <div class="kpi-body">
            <div class="kpi-value">{{ formatNumber(overview.kpi.retrieval_total) }}</div>
            <div class="kpi-label">检索次数</div>
            <div class="kpi-extra">平均 {{ overview.system_health.avg_retrieval_latency_ms }}ms</div>
          </div>
        </div>
        <div class="kpi-card kpi-tasks">
          <div class="kpi-icon">⚙️</div>
          <div class="kpi-body">
            <div class="kpi-value">{{ formatNumber(overview.kpi.tasks_total) }}</div>
            <div class="kpi-label">累计任务</div>
            <div class="kpi-extra">{{ overview.kpi.tasks_pending }} 待执行</div>
          </div>
        </div>
        <div class="kpi-card kpi-users">
          <div class="kpi-icon">👥</div>
          <div class="kpi-body">
            <div class="kpi-value">{{ overview.kpi.users }}</div>
            <div class="kpi-label">用户数</div>
            <div class="kpi-extra">{{ overview.kpi.tender_files }} 个招标文件</div>
          </div>
        </div>
      </div>

      <!-- 第二行：今日重点 + 系统健康 -->
      <div class="row-today-health">
        <el-card shadow="never" class="panel-card today-card">
          <template #header>
            <div class="panel-header">
              <span>📅 今日重点</span>
            </div>
          </template>
          <div class="today-grid">
            <div class="today-item">
              <div class="today-value">{{ overview.today.ai_runs }}</div>
              <div class="today-label">AI 调用</div>
              <div class="today-sub success">成功 {{ overview.today.ai_succeeded }}</div>
            </div>
            <div class="today-item">
              <div class="today-value">{{ formatNumber(overview.today.ai_tokens) }}</div>
              <div class="today-label">消耗 tokens</div>
              <div class="today-sub">{{ overview.today.ai_failed }} 次失败</div>
            </div>
            <div class="today-item">
              <div class="today-value">{{ overview.today.retrievals }}</div>
              <div class="today-label">检索次数</div>
              <div class="today-sub">{{ overview.today.retrieval_avg_latency_ms }}ms 均延迟</div>
            </div>
            <div class="today-item">
              <div class="today-value">{{ overview.today.new_kb_documents }}</div>
              <div class="today-label">新增文档</div>
              <div class="today-sub">{{ overview.today.new_kb_chunks }} 个分块</div>
            </div>
            <div class="today-item">
              <div class="today-value">{{ overview.today.new_projects }}</div>
              <div class="today-label">新项目</div>
              <div class="today-sub">{{ overview.today.new_outlines }} 个大纲</div>
            </div>
          </div>
        </el-card>

        <el-card shadow="never" class="panel-card health-card">
          <template #header>
            <div class="panel-header">
              <span>💚 系统健康度</span>
            </div>
          </template>
          <div class="health-grid">
            <div class="health-item">
              <el-progress
                type="dashboard"
                :percentage="Math.round(overview.system_health.ai_success_rate * 100)"
                :width="100"
                :color="healthColor(overview.system_health.ai_success_rate)"
              />
              <div class="health-label">AI 成功率</div>
              <div class="health-detail">
                {{ overview.system_health.ai_succeeded }} / {{ overview.system_health.ai_total }}
              </div>
            </div>
            <div class="health-info">
              <div class="info-row">
                <span class="info-label">AI 失败数</span>
                <span class="info-value danger">{{ overview.system_health.ai_failed }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">检索平均延迟</span>
                <span class="info-value" :class="latencyClass(overview.system_health.avg_retrieval_latency_ms)">
                  {{ overview.system_health.avg_retrieval_latency_ms }} ms
                </span>
              </div>
              <div class="info-row">
                <span class="info-label">Token 总消耗</span>
                <span class="info-value">{{ formatTokens(overview.system_health.total_tokens) }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">待执行任务</span>
                <span class="info-value warning">{{ overview.kpi.tasks_pending }}</span>
              </div>
            </div>
          </div>
        </el-card>
      </div>

      <!-- 第三行：AI 趋势 + 标书漏斗 -->
      <div class="row-trend-status">
        <el-card shadow="never" class="panel-card trend-card">
          <template #header>
            <div class="panel-header">
              <span>📈 近 14 天 AI 调用趋势</span>
            </div>
          </template>
          <EChart :option="aiTrendOption" height="320px" />
        </el-card>

        <el-card shadow="never" class="panel-card status-card">
          <template #header>
            <div class="panel-header">
              <span>📄 标书生成漏斗</span>
            </div>
          </template>
          <EChart :option="bidFunnelOption" height="320px" />
        </el-card>
      </div>

      <!-- 第四行：AI 场景 + 项目 Token 排行 -->
      <div class="row-scenario-retrieval">
        <el-card shadow="never" class="panel-card scenario-card">
          <template #header>
            <div class="panel-header">
              <span>🎯 近 14 天 AI 场景调用分布</span>
            </div>
          </template>
          <EChart :option="aiScenarioOption" height="320px" />
        </el-card>

        <el-card shadow="never" class="panel-card retrieval-card">
          <template #header>
            <div class="panel-header">
              <span>📊 项目 Token 消耗排行</span>
            </div>
          </template>
          <EChart :option="projectTokenOption" height="320px" />
        </el-card>
      </div>

      <!-- 第五行：知识库分布 + 最近活动 -->
      <div class="row-kb-activity">
        <el-card shadow="never" class="panel-card kb-card">
          <template #header>
            <div class="panel-header">
              <span>📚 知识库文档分布</span>
            </div>
          </template>
          <EChart :option="kbDocOption" height="320px" />
        </el-card>

        <el-card shadow="never" class="panel-card activity-card">
          <template #header>
            <div class="panel-header">
              <span>⚡ 最近活动</span>
            </div>
          </template>
          <div class="activity-list">
            <div
              v-for="act in overview.recent_activities"
              :key="act.id"
              class="activity-item"
            >
              <div class="activity-dot" :class="activityClass(act.action)"></div>
              <div class="activity-content">
                <div class="activity-summary">{{ act.summary || act.action }}</div>
                <div class="activity-meta">
                  <span class="activity-actor">{{ act.actor }}</span>
                  <span class="activity-action">{{ act.action }}</span>
                  <span class="activity-time">{{ formatRelativeTime(act.created_at) }}</span>
                </div>
              </div>
            </div>
          </div>
        </el-card>
      </div>
    </template>

    <!-- 项目→标段 快速跳转弹窗 -->
    <el-dialog
      v-model="jumpDialogVisible"
      title="选择项目跳转"
      width="640px"
      :close-on-click-modal="false"
    >
      <div v-loading="projectsLoading" class="jump-list">
        <div v-if="!projectsLoading && projectItems.length === 0" class="empty-hint">
          暂无项目
        </div>
        <div
          v-for="proj in projectItems"
          :key="proj.id"
          class="project-group"
        >
          <div
            class="project-row"
            :class="{ expanded: expandedProjectId === proj.id }"
            @click="toggleProject(proj)"
          >
            <div class="proj-main">
              <div class="proj-name">{{ proj.name }}</div>
              <div class="proj-meta">
                <span>{{ proj.lot_count }} 个标段</span>
                <span class="proj-status">{{ proj.status === 'active' ? '进行中' : proj.status }}</span>
              </div>
            </div>
            <el-icon class="proj-arrow" :class="{ rotated: expandedProjectId === proj.id }">
              <ArrowRight />
            </el-icon>
          </div>
          <div v-if="expandedProjectId === proj.id" class="lot-list">
            <div v-if="lotLoading" class="lot-hint">加载中...</div>
            <div v-else-if="lotItems.length === 0" class="lot-hint">该项目暂无标段</div>
            <div
              v-for="lot in lotItems"
              :key="lot.id"
              class="lot-row"
              @click="jumpToLot(proj, lot)"
            >
              <span class="lot-name">{{ lot.name }}</span>
              <el-icon class="lot-arrow"><ArrowRight /></el-icon>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="jumpDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, ArrowRight } from '@element-plus/icons-vue'
import * as echarts from 'echarts/core'
import { getDashboardOverview, type DashboardOverview } from '@/api/dashboard'
import { extractApiError } from '@/utils/errors'
import { http } from '@/api/http'
import EChart from './components/EChart.vue'

const router = useRouter()

function goTo(path: string) {
  router.push(path)
}

interface ProjectItem {
  id: number
  name: string
  status: string
  lot_count: number
}

interface LotItem {
  id: number
  name: string
  project: number
}

const jumpDialogVisible = ref(false)
const projectsLoading = ref(false)
const projectItems = ref<ProjectItem[]>([])
const expandedProjectId = ref<number | null>(null)
const lotLoading = ref(false)
const lotItems = ref<LotItem[]>([])

async function openOutlinesDialog() {
  jumpDialogVisible.value = true
  expandedProjectId.value = null
  lotItems.value = []
  projectsLoading.value = true
  try {
    const res = await http.get<{ results: ProjectItem[] } | ProjectItem[]>('/api/projects/', {
      params: { page_size: 100 },
    })
    const data: any = res.data
    projectItems.value = Array.isArray(data) ? data : (data.results || [])
  } catch (err) {
    ElMessage.error(extractApiError(err, '加载项目列表失败'))
  } finally {
    projectsLoading.value = false
  }
}

async function toggleProject(proj: ProjectItem) {
  if (expandedProjectId.value === proj.id) {
    expandedProjectId.value = null
    lotItems.value = []
    return
  }
  expandedProjectId.value = proj.id
  lotItems.value = []
  lotLoading.value = true
  try {
    const res = await http.get<LotItem[] | { results: LotItem[] }>(`/api/projects/${proj.id}/lots/`)
    const data: any = res.data
    lotItems.value = Array.isArray(data) ? data : (data?.results || [])
  } catch (err) {
    ElMessage.error(extractApiError(err, '加载标段列表失败'))
  } finally {
    lotLoading.value = false
  }
}

function jumpToLot(proj: ProjectItem, lot: LotItem) {
  jumpDialogVisible.value = false
  router.push(`/projects/${proj.id}/lots/${lot.id}`)
}

const loading = ref(false)
const overview = ref<DashboardOverview | null>(null)

const loadOverview = async () => {
  loading.value = true
  try {
    const res = await getDashboardOverview()
    overview.value = res.data
  } catch (e) {
    ElMessage.error(extractApiError(e, '获取大屏数据失败'))
  } finally {
    loading.value = false
  }
}

// ===== 图表配置 =====

const aiTrendOption = computed<echarts.EChartsCoreOption>(() => {
  const trend = overview.value?.ai_trend_14d || []
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
    },
    legend: {
      data: ['AI 调用次数', 'Token 消耗'],
      top: 0,
    },
    grid: { left: 50, right: 50, bottom: 30, top: 40 },
    xAxis: {
      type: 'category',
      data: trend.map((t) => t.date.slice(5)),
      axisLine: { lineStyle: { color: '#999' } },
    },
    yAxis: [
      {
        type: 'value',
        name: '调用次数',
        position: 'left',
        axisLine: { show: true, lineStyle: { color: '#409eff' } },
        axisLabel: { formatter: '{value}' },
      },
      {
        type: 'value',
        name: 'Token 数',
        position: 'right',
        axisLine: { show: true, lineStyle: { color: '#67c23a' } },
        axisLabel: { formatter: (val: number) => formatK(val) },
      },
    ],
    series: [
      {
        name: 'AI 调用次数',
        type: 'bar',
        data: trend.map((t) => t.runs),
        itemStyle: { color: '#409eff', borderRadius: [4, 4, 0, 0] },
        barWidth: '40%',
      },
      {
        name: 'Token 消耗',
        type: 'line',
        yAxisIndex: 1,
        data: trend.map((t) => t.tokens),
        smooth: true,
        itemStyle: { color: '#67c23a' },
        lineStyle: { width: 3 },
        areaStyle: { opacity: 0.1 },
      },
    ],
  }
})

const bidFunnelOption = computed<echarts.EChartsCoreOption>(() => {
  const funnel = overview.value?.bid_funnel?.funnel || []
  const bidStatus = overview.value?.bid_funnel?.bid_status_distribution || []
  // 漏斗各层用渐变色，转化率写在 label
  const colors = ['#5470c6', '#91cc75', '#fac858', '#ee6666']
  return {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c}',
    },
    series: [
      {
        type: 'funnel',
        left: '10%',
        right: '10%',
        top: 10,
        bottom: 10,
        width: '80%',
        minSize: '30%',
        gap: 4,
        sort: 'descending',
        label: {
          show: true,
          formatter: '{b}\n{c}',
          fontSize: 12,
          color: '#303133',
        },
        labelLine: { show: false },
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 1,
        },
        emphasis: {
          label: { fontSize: 14, fontWeight: 'bold' },
        },
        data: funnel.map((d, i) => ({
          name: d.name,
          value: d.value,
          itemStyle: { color: colors[i % colors.length] },
        })),
      },
    ],
    // 在右侧加一个标书状态分布的副图表（用 graphic 文字模拟，避免双图复杂）
    graphic: bidStatus.length > 0 ? [
      {
        type: 'text',
        left: '70%',
        top: 10,
        style: {
          text: '标书状态分布',
          fontSize: 12,
          fill: '#909399',
        },
      },
      ...bidStatus.map((d, i) => ({
        type: 'text',
        left: '70%',
        top: 35 + i * 22,
        style: {
          text: `${d.name}：${d.value}`,
          fontSize: 12,
          fill: colors[i % colors.length],
          fontWeight: 'bold',
        },
      })),
    ] : [],
  }
})

const aiScenarioOption = computed<echarts.EChartsCoreOption>(() => {
  const data = overview.value?.ai_scenario_distribution || []
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 100, right: 30, bottom: 30, top: 20 },
    xAxis: { type: 'value', axisLabel: { formatter: '{value}' } },
    yAxis: {
      type: 'category',
      data: data.map((d) => d.name),
      inverse: true,
      axisLine: { lineStyle: { color: '#999' } },
    },
    series: [
      {
        type: 'bar',
        data: data.map((d) => d.value),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#409eff' },
            { offset: 1, color: '#67c23a' },
          ]),
          borderRadius: [0, 4, 4, 0],
        },
        label: { show: true, position: 'right', formatter: '{c}' },
        barWidth: '60%',
      },
    ],
  }
})

const projectTokenOption = computed<echarts.EChartsCoreOption>(() => {
  const data = (overview.value?.project_token_ranking || []).slice().reverse()
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params
        const item = data[p.dataIndex]
        if (!item) return p.name
        return `${item.name}<br/>Token: ${item.tokens.toLocaleString()}<br/>调用: ${item.runs} 次`
      },
    },
    grid: { left: 8, right: 60, top: 10, bottom: 10, containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: {
        formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`),
      },
      splitLine: { lineStyle: { type: 'dashed', color: '#e8e8e8' } },
    },
    yAxis: {
      type: 'category',
      data: data.map((d) => d.name),
      axisLabel: {
        formatter: (v: string) => (v.length > 12 ? `${v.slice(0, 12)}…` : v),
        width: 120,
        overflow: 'truncate',
      },
    },
    series: [
      {
        type: 'bar',
        data: data.map((d) => d.tokens),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#73c0de' },
            { offset: 1, color: '#5470c6' },
          ]),
          borderRadius: [0, 4, 4, 0],
        },
        label: {
          show: true,
          position: 'right',
          formatter: (p: any) => {
            const v = p.value as number
            return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`
          },
        },
        barWidth: '60%',
      } as any,
    ],
  }
})

const kbDocOption = computed<echarts.EChartsCoreOption>(() => {
  const data = overview.value?.kb_doc_distribution || []
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['文档数', '分块数'], top: 0 },
    grid: { left: 50, right: 50, bottom: 30, top: 40 },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.name),
      axisLine: { lineStyle: { color: '#999' } },
      axisLabel: { interval: 0, rotate: data.length > 4 ? 30 : 0 },
    },
    yAxis: [
      {
        type: 'value',
        name: '文档数',
        position: 'left',
        axisLine: { show: true, lineStyle: { color: '#409eff' } },
      },
      {
        type: 'value',
        name: '分块数',
        position: 'right',
        axisLine: { show: true, lineStyle: { color: '#67c23a' } },
      },
    ],
    series: [
      {
        name: '文档数',
        type: 'bar',
        data: data.map((d) => d.documents),
        itemStyle: { color: '#409eff', borderRadius: [4, 4, 0, 0] },
        barGap: '20%',
      },
      {
        name: '分块数',
        type: 'bar',
        yAxisIndex: 1,
        data: data.map((d) => d.chunks),
        itemStyle: { color: '#67c23a', borderRadius: [4, 4, 0, 0] },
      },
    ],
  }
})

// ===== 辅助函数 =====

const formatNumber = (n: number) => {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

const formatTokens = (n: number) => {
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

const formatK = (val: number) => {
  if (val >= 1000) return (val / 1000).toFixed(1) + 'k'
  return String(val)
}

const formatTime = (iso: string) => {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

const formatRelativeTime = (iso: string) => {
  const now = Date.now()
  const t = new Date(iso).getTime()
  const diff = Math.floor((now - t) / 1000)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前'
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前'
  return Math.floor(diff / 86400) + ' 天前'
}

const healthColor = (rate: number) => {
  if (rate >= 0.99) return '#67c23a'
  if (rate >= 0.95) return '#e6a23c'
  return '#f56c6c'
}

const latencyClass = (ms: number) => {
  if (ms < 200) return 'success'
  if (ms < 1000) return ''
  if (ms < 3000) return 'warning'
  return 'danger'
}

const activityClass = (action: string) => {
  if (action.includes('failed') || action.includes('error')) return 'danger'
  if (action.includes('delete')) return 'warning'
  if (action.includes('create') || action.includes('upload') || action.includes('success')) return 'success'
  return 'info'
}

onMounted(() => {
  loadOverview()
})
</script>

<style scoped>
.dashboard {
  padding: 20px;
  background: #f5f7fa;
  min-height: calc(100vh - 60px);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 20px 24px;
  background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
  border-radius: 16px;
  color: #fff;
  box-shadow: 0 4px 12px rgba(30, 58, 138, 0.3);
}

.header-left .dashboard-title {
  margin: 0 0 4px;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 1px;
}

.header-left .dashboard-subtitle {
  margin: 0;
  font-size: 13px;
  opacity: 0.85;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.refresh-time {
  font-size: 12px;
  opacity: 0.85;
}

/* KPI 顶栏 */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.kpi-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
  border-left: 4px solid #409eff;
}

.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
}

.kpi-card.kpi-projects { border-left-color: #409eff; }
.kpi-card.kpi-outlines { border-left-color: #67c23a; }
.kpi-card.kpi-kb { border-left-color: #e6a23c; }
.kpi-card.kpi-ai { border-left-color: #f56c6c; }
.kpi-card.kpi-retrieval { border-left-color: #909399; }
.kpi-card.kpi-tasks { border-left-color: #9c27b0; }
.kpi-card.kpi-users { border-left-color: #00bcd4; }

.kpi-card.clickable {
  cursor: pointer;
}

.kpi-card.clickable:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
}

.jump-list {
  max-height: 480px;
  overflow-y: auto;
  padding: 4px 0;
}

.jump-list .empty-hint {
  padding: 32px 0;
  text-align: center;
  color: var(--el-text-color-secondary);
}

.project-group {
  margin-bottom: 8px;
}

.project-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.project-row:hover {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-5);
}

.project-row.expanded {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-5);
}

.project-row .proj-main {
  flex: 1;
  min-width: 0;
}

.project-row .proj-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-row .proj-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.project-row .proj-arrow {
  color: var(--el-text-color-placeholder);
  transition: transform 0.2s;
}

.project-row .proj-arrow.rotated {
  transform: rotate(90deg);
}

.lot-list {
  border: 1px solid var(--el-color-primary-light-5);
  border-top: none;
  border-radius: 0 0 6px 6px;
  background: var(--el-fill-color-light);
}

.lot-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.15s;
}

.lot-row:hover {
  background: var(--el-color-primary-light-9);
}

.lot-row .lot-name {
  color: var(--el-text-color-primary);
}

.lot-row .lot-arrow {
  color: var(--el-text-color-placeholder);
}

.lot-hint {
  padding: 8px 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.kpi-icon {
  font-size: 32px;
  line-height: 1;
  flex-shrink: 0;
}

.kpi-body {
  min-width: 0;
  flex: 1;
}

.kpi-value {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
}

.kpi-label {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.kpi-extra {
  font-size: 11px;
  color: #c0c4cc;
  margin-top: 4px;
}

/* 通用面板卡片 */
.panel-card {
  border-radius: 12px;
  overflow: hidden;
}

.panel-card :deep(.el-card__header) {
  padding: 14px 18px;
  background: #fafbfc;
  border-bottom: 1px solid #ebeef5;
}

.panel-card :deep(.el-card__body) {
  padding: 16px;
}

.panel-header {
  font-weight: 600;
  color: #303133;
  font-size: 14px;
}

/* 今日 + 健康 行 */
.row-today-health {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.today-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

.today-item {
  text-align: center;
  padding: 12px 8px;
  background: #f5f7fa;
  border-radius: 8px;
}

.today-value {
  font-size: 22px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
}

.today-label {
  font-size: 12px;
  color: #606266;
  margin-top: 4px;
}

.today-sub {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}

.today-sub.success { color: #67c23a; }

.health-grid {
  display: flex;
  gap: 16px;
  align-items: center;
}

.health-item {
  text-align: center;
  flex-shrink: 0;
}

.health-label {
  font-size: 13px;
  color: #606266;
  margin-top: 8px;
}

.health-detail {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}

.health-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px dashed #ebeef5;
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 13px;
  color: #606266;
}

.info-value {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.info-value.success { color: #67c23a; }
.info-value.warning { color: #e6a23c; }
.info-value.danger { color: #f56c6c; }

/* 图表行 */
.row-trend-status,
.row-scenario-retrieval,
.row-kb-activity {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.row-scenario-retrieval {
  grid-template-columns: 1fr 1fr;
}

/* 活动流 */
.activity-list {
  max-height: 320px;
  overflow-y: auto;
}

.activity-item {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px dashed #ebeef5;
}

.activity-item:last-child {
  border-bottom: none;
}

.activity-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #909399;
  margin-top: 6px;
  flex-shrink: 0;
}

.activity-dot.success { background: #67c23a; }
.activity-dot.warning { background: #e6a23c; }
.activity-dot.danger { background: #f56c6c; }

.activity-content {
  flex: 1;
  min-width: 0;
}

.activity-summary {
  font-size: 13px;
  color: #303133;
  margin-bottom: 4px;
  word-break: break-all;
}

.activity-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: #909399;
}

.activity-actor {
  font-weight: 500;
  color: #606266;
}

.activity-action {
  font-family: monospace;
  background: #f5f7fa;
  padding: 0 4px;
  border-radius: 2px;
}

/* 响应式 */
@media (max-width: 1400px) {
  .kpi-row {
    grid-template-columns: repeat(4, 1fr);
  }
  .today-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 1024px) {
  .kpi-row {
    grid-template-columns: repeat(2, 1fr);
  }
  .row-today-health,
  .row-trend-status,
  .row-scenario-retrieval,
  .row-kb-activity {
    grid-template-columns: 1fr;
  }
}
</style>
