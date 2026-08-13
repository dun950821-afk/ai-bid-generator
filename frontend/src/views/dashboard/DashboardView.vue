<!-- frontend/src/views/dashboard/DashboardView.vue -->
<template>
  <div class="dashboard">
    <!-- 页头 -->
    <header class="page-header">
      <div class="page-header-text">
        <h1 class="page-title">数据总览</h1>
        <p class="page-subtitle">项目进度、AI 调用与知识库运行态势一览</p>
      </div>
      <div class="page-header-actions">
        <span class="refresh-time" v-if="overview">
          更新于 {{ formatTime(overview.refreshed_at) }}
        </span>
        <el-button :icon="Refresh" :loading="loading" @click="loadOverview">刷新</el-button>
      </div>
    </header>

    <!-- 首次加载: 与真实布局一致的骨架屏 -->
    <div v-if="!overview && loading" class="dash-skeleton">
      <el-skeleton animated>
        <template #template>
          <div class="sk-kpi-row">
            <el-skeleton-item v-for="i in 6" :key="i" variant="rect" class="sk-kpi-card" />
          </div>
          <div class="sk-grid">
            <el-skeleton-item variant="rect" class="sk-panel-wide" />
            <el-skeleton-item variant="rect" class="sk-panel-tall" />
            <el-skeleton-item variant="rect" class="sk-panel-wide" />
          </div>
        </template>
      </el-skeleton>
    </div>
    <el-empty
      v-else-if="!overview"
      description="数据加载失败, 请点右上角「刷新」重试"
      :image-size="100"
    />

    <template v-else>
      <!-- KPI 指标卡：点击快捷跳转 -->
      <section class="kpi-grid">
        <div
          v-for="card in kpiCards"
          :key="card.label"
          class="kpi-card"
          :title="card.hint"
          @click="card.onClick"
        >
          <div class="kpi-icon" :style="{ background: card.bg, color: card.color }">
            <el-icon :size="22"><component :is="card.icon" /></el-icon>
          </div>
          <div class="kpi-info">
            <div class="kpi-value">{{ card.value }}</div>
            <div class="kpi-label">{{ card.label }}</div>
            <div class="kpi-sub">{{ card.sub }}</div>
          </div>
          <el-icon class="kpi-go"><ArrowRight /></el-icon>
        </div>
      </section>

      <!-- 图表区 -->
      <section class="dash-grid">
        <!-- 近 14 天 AI 调用趋势 -->
        <div class="panel span-8">
          <div class="panel-header">
            <span class="panel-title">AI 调用趋势</span>
            <span class="panel-desc">近 14 天</span>
          </div>
          <div class="panel-body">
            <EChart :option="aiTrendOption" height="220px" />
          </div>
        </div>

        <!-- 最近活动（纵向跨两行） -->
        <div class="panel span-4 row-span-2 activity-panel">
          <div class="panel-header">
            <span class="panel-title">最近活动</span>
            <span class="panel-desc">最近 8 条</span>
          </div>
          <div class="panel-body activity-body">
            <el-timeline v-if="recentActivities.length">
              <el-timeline-item
                v-for="act in recentActivities"
                :key="act.id"
                :type="activityClass(act.action)"
                :timestamp="formatRelativeTime(act.created_at)"
                placement="top"
              >
                <div class="activity-summary">{{ act.summary || act.action }}</div>
                <div class="activity-meta">
                  <span class="activity-actor">{{ act.actor }}</span>
                  <span class="activity-action">{{ act.action }}</span>
                </div>
              </el-timeline-item>
            </el-timeline>
            <el-empty v-else description="暂无活动" :image-size="80" />
          </div>
        </div>

        <!-- 项目 Token 消耗排行：点击条形跳转项目 -->
        <div class="panel span-8">
          <div class="panel-header">
            <span class="panel-title">项目 Token 消耗排行</span>
            <span class="panel-desc">点击条形可跳转项目</span>
          </div>
          <div class="panel-body">
            <EChart :option="projectTokenOption" :height="tokenRankHeight" @select="onTokenRankSelect" />
          </div>
        </div>

        <!-- 今日概览 -->
        <div class="panel span-4">
          <div class="panel-header">
            <span class="panel-title">今日概览</span>
          </div>
          <div class="panel-body today-list">
            <div class="today-row">
              <div class="today-main">
                <span class="today-label">AI 调用</span>
                <span class="today-sub">成功 {{ overview.today.ai_succeeded }} · 失败 {{ overview.today.ai_failed }}</span>
              </div>
              <span class="today-value">{{ overview.today.ai_runs }}</span>
            </div>
            <div class="today-row">
              <div class="today-main">
                <span class="today-label">Token 消耗</span>
                <span class="today-sub">{{ overview.today.ai_runs }} 次调用</span>
              </div>
              <span class="today-value">{{ formatNumber(overview.today.ai_tokens) }}</span>
            </div>
            <div class="today-row">
              <div class="today-main">
                <span class="today-label">检索次数</span>
                <span class="today-sub">均延迟 {{ overview.today.retrieval_avg_latency_ms }}ms</span>
              </div>
              <span class="today-value">{{ overview.today.retrievals }}</span>
            </div>
            <div class="today-row">
              <div class="today-main">
                <span class="today-label">新增知识库文档</span>
                <span class="today-sub">{{ overview.today.new_kb_chunks }} 个分块</span>
              </div>
              <span class="today-value">{{ overview.today.new_kb_documents }}</span>
            </div>
            <div class="today-row">
              <div class="today-main">
                <span class="today-label">新增项目</span>
                <span class="today-sub">{{ overview.today.new_outlines }} 个大纲</span>
              </div>
              <span class="today-value">{{ overview.today.new_projects }}</span>
            </div>
          </div>
        </div>

        <!-- 系统健康度 -->
        <div class="panel span-4">
          <div class="panel-header">
            <span class="panel-title">系统健康度</span>
          </div>
          <div class="panel-body health-body">
            <div class="health-gauge">
              <el-progress
                type="dashboard"
                :percentage="Math.round(overview.system_health.ai_success_rate * 100)"
                :width="110"
                :color="healthColor(overview.system_health.ai_success_rate)"
              />
              <div class="health-gauge-label">AI 成功率</div>
              <div class="health-gauge-detail">
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
        </div>

        <!-- 标书与章节生成状态 -->
        <div class="panel span-4">
          <div class="panel-header">
            <span class="panel-title">标书与章节状态</span>
          </div>
          <div class="panel-body">
            <template v-if="bidStatusList.length">
              <EChart :option="bidStatusOption" height="170px" />
            </template>
            <el-empty v-else description="暂无标书" :image-size="60" />
            <div class="gen-status" v-if="sectionGenList.length">
              <div class="gen-status-title">章节生成状态</div>
              <div v-for="(d, i) in sectionGenList" :key="d.name" class="gen-row">
                <span class="gen-label">{{ d.name }}</span>
                <div class="gen-track">
                  <div
                    class="gen-bar"
                    :style="{ width: genPercent(d.value) + '%', background: statusColors[i % statusColors.length] }"
                  ></div>
                </div>
                <span class="gen-count">{{ d.value }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- AI 场景调用分布 -->
        <div class="panel span-6">
          <div class="panel-header">
            <span class="panel-title">AI 场景调用分布</span>
            <span class="panel-desc">近 14 天</span>
          </div>
          <div class="panel-body">
            <EChart :option="aiScenarioOption" height="280px" />
          </div>
        </div>

        <!-- 知识库文档分布 -->
        <div class="panel span-6">
          <div class="panel-header">
            <span class="panel-title">知识库文档分布</span>
          </div>
          <div class="panel-body">
            <EChart :option="kbDocOption" height="280px" />
          </div>
        </div>
      </section>
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
import { ref, computed, onMounted, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Refresh,
  ArrowRight,
  Folder,
  Document,
  Reading,
  Cpu,
  List,
  User,
} from '@element-plus/icons-vue'
import * as echarts from 'echarts/core'
import { getDashboardOverview, type DashboardOverview } from '@/api/dashboard'
import { extractApiError } from '@/utils/errors'
import { http } from '@/api/http'
import EChart from './components/EChart.vue'

const router = useRouter()

function goTo(path: string) {
  router.push(path)
}

// ===== 项目→标段 快速跳转弹窗 =====

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

// ===== 数据加载 =====

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

// ===== KPI 指标卡（点击快捷跳转） =====

interface KpiCard {
  label: string
  value: string
  sub: string
  icon: Component
  color: string
  bg: string
  hint: string
  onClick: () => void
}

const kpiCards = computed<KpiCard[]>(() => {
  const kpi = overview.value!.kpi
  const health = overview.value!.system_health
  return [
    {
      label: '项目数',
      value: String(kpi.projects),
      sub: `${kpi.lots} 个标段`,
      icon: Folder,
      color: '#2563eb',
      bg: '#dbeafe',
      hint: '进入项目列表',
      onClick: () => goTo('/projects'),
    },
    {
      label: '大纲数',
      value: String(kpi.outlines),
      sub: `${kpi.bid_documents} 份标书`,
      icon: Document,
      color: '#10b981',
      bg: '#d1fae5',
      hint: '选择项目 / 标段快捷跳转',
      onClick: openOutlinesDialog,
    },
    {
      label: '知识库文档',
      value: String(kpi.knowledge_documents),
      sub: `${kpi.knowledge_chunks} 个分块`,
      icon: Reading,
      color: '#f59e0b',
      bg: '#fef3c7',
      hint: '进入知识库',
      onClick: () => goTo('/knowledge'),
    },
    {
      label: 'AI 调用次数',
      value: formatNumber(kpi.ai_runs_total),
      sub: `${formatTokens(health.total_tokens)} tokens · 检索 ${formatNumber(kpi.retrieval_total)} 次`,
      icon: Cpu,
      color: '#8b5cf6',
      bg: '#ede9fe',
      hint: '查看 AI 调用记录',
      onClick: () => goTo('/playground/runs'),
    },
    {
      label: '累计任务',
      value: formatNumber(kpi.tasks_total),
      sub: `${kpi.tasks_pending} 待执行`,
      icon: List,
      color: '#0ea5e9',
      bg: '#e0f2fe',
      hint: '查看任务队列',
      onClick: () => goTo('/admin/queue'),
    },
    {
      label: '用户数',
      value: String(kpi.users),
      sub: `${kpi.tender_files} 个招标文件`,
      icon: User,
      color: '#64748b',
      bg: '#f1f5f9',
      hint: '进入用户管理',
      onClick: () => goTo('/admin/users'),
    },
  ]
})

// ===== 图表配置 =====

const chartText = '#6b7280'
const chartAxis = '#e5e7eb'

const aiTrendOption = computed<echarts.EChartsCoreOption>(() => {
  const trend = overview.value?.ai_trend_14d || []
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    legend: {
      data: ['AI 调用次数', 'Token 消耗'],
      top: 0,
      textStyle: { color: chartText },
    },
    grid: { left: 50, right: 56, bottom: 30, top: 40 },
    xAxis: {
      type: 'category',
      data: trend.map((t) => t.date.slice(5)),
      axisLine: { lineStyle: { color: chartAxis } },
      axisLabel: { color: chartText },
    },
    yAxis: [
      {
        type: 'value',
        name: '调用次数',
        position: 'left',
        axisLabel: { color: chartText },
        splitLine: { lineStyle: { color: chartAxis, type: 'dashed' } },
      },
      {
        type: 'value',
        name: 'Token 数',
        position: 'right',
        axisLabel: { color: chartText, formatter: (val: number) => formatK(val) },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'AI 调用次数',
        type: 'bar',
        data: trend.map((t) => t.runs),
        itemStyle: { color: '#2563eb', borderRadius: [4, 4, 0, 0] },
        barWidth: '40%',
      },
      {
        name: 'Token 消耗',
        type: 'line',
        yAxisIndex: 1,
        data: trend.map((t) => t.tokens),
        smooth: true,
        itemStyle: { color: '#10b981' },
        lineStyle: { width: 3 },
        areaStyle: { opacity: 0.08 },
      },
    ],
  }
})

const statusColors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9']

const bidStatusList = computed(() => overview.value?.bid_funnel?.bid_status_distribution || [])

// 最近活动只展示最近 8 条
const recentActivities = computed(() => (overview.value?.recent_activities || []).slice(0, 8))

// 章节生成状态分布及占比
const sectionGenList = computed(
  () => overview.value?.bid_funnel?.section_generation_distribution || []
)
const sectionGenTotal = computed(() =>
  sectionGenList.value.reduce((sum, d) => sum + d.value, 0)
)
const genPercent = (v: number) =>
  sectionGenTotal.value > 0 ? Math.round((v / sectionGenTotal.value) * 100) : 0

// 标书状态分布（环形图）
const bidStatusOption = computed<echarts.EChartsCoreOption>(() => {
  const data = bidStatusList.value
  return {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
    },
    legend: {
      bottom: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: chartText, fontSize: 11 },
    },
    series: [
      {
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['50%', '42%'],
        avoidLabelOverlap: true,
        label: { show: false },
        emphasis: {
          label: {
            show: true,
            fontSize: 13,
            fontWeight: 'bold',
            color: '#111827',
            formatter: '{b}\n{c}',
          },
        },
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 2,
        },
        data: data.map((d, i) => ({
          name: d.name,
          value: d.value,
          itemStyle: { color: statusColors[i % statusColors.length] },
        })),
      },
    ],
  }
})

const aiScenarioOption = computed<echarts.EChartsCoreOption>(() => {
  const data = overview.value?.ai_scenario_distribution || []
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 40, bottom: 10, top: 10, containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { color: chartText },
      splitLine: { lineStyle: { color: chartAxis, type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: data.map((d) => d.name),
      inverse: true,
      axisLine: { lineStyle: { color: chartAxis } },
      axisLabel: { color: chartText },
    },
    series: [
      {
        type: 'bar',
        data: data.map((d) => d.value),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#2563eb' },
            { offset: 1, color: '#60a5fa' },
          ]),
          borderRadius: [0, 4, 4, 0],
        },
        label: { show: true, position: 'right', formatter: '{c}', color: chartText },
        barWidth: '55%',
      },
    ],
  }
})

// 排行数据（倒序用于横向条形图），点击跳转时按 dataIndex 取同一数据源
const projectTokenRanking = computed(() =>
  (overview.value?.project_token_ranking || []).slice().reverse()
)

// 图表高度按条形数量自适应，避免数据少时大量留白
const tokenRankHeight = computed(
  () => `${Math.max(150, projectTokenRanking.value.length * 38 + 40)}px`
)

const projectTokenOption = computed<echarts.EChartsCoreOption>(() => {
  const data = projectTokenRanking.value
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
        color: chartText,
        formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`),
      },
      splitLine: { lineStyle: { color: chartAxis, type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: data.map((d) => d.name),
      axisLine: { lineStyle: { color: chartAxis } },
      axisLabel: {
        color: chartText,
        formatter: (v: string) => (v.length > 12 ? `${v.slice(0, 12)}…` : v),
        width: 120,
        overflow: 'truncate',
      },
    },
    series: [
      {
        type: 'bar',
        cursor: 'pointer',
        data: data.map((d) => d.tokens),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#93c5fd' },
            { offset: 1, color: '#2563eb' },
          ]),
          borderRadius: [0, 4, 4, 0],
        },
        label: {
          show: true,
          position: 'right',
          color: chartText,
          formatter: (p: any) => {
            const v = p.value as number
            return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`
          },
        },
        barWidth: '55%',
      } as any,
    ],
  }
})

function onTokenRankSelect(params: any) {
  const item = projectTokenRanking.value[params?.dataIndex]
  if (item?.project_id) {
    router.push(`/projects/${item.project_id}`)
  }
}

const kbDocOption = computed<echarts.EChartsCoreOption>(() => {
  const data = overview.value?.kb_doc_distribution || []
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['文档数', '分块数'], top: 0, textStyle: { color: chartText } },
    grid: { left: 50, right: 50, bottom: 30, top: 40 },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.name),
      axisLine: { lineStyle: { color: chartAxis } },
      axisLabel: { color: chartText, interval: 0, rotate: data.length > 4 ? 30 : 0 },
    },
    yAxis: [
      {
        type: 'value',
        name: '文档数',
        position: 'left',
        axisLabel: { color: chartText },
        splitLine: { lineStyle: { color: chartAxis, type: 'dashed' } },
      },
      {
        type: 'value',
        name: '分块数',
        position: 'right',
        axisLabel: { color: chartText },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '文档数',
        type: 'bar',
        data: data.map((d) => d.documents),
        itemStyle: { color: '#2563eb', borderRadius: [4, 4, 0, 0] },
        barGap: '20%',
      },
      {
        name: '分块数',
        type: 'bar',
        yAxisIndex: 1,
        data: data.map((d) => d.chunks),
        itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] },
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
  if (rate >= 0.99) return '#10b981'
  if (rate >= 0.95) return '#f59e0b'
  return '#ef4444'
}

const latencyClass = (ms: number) => {
  if (ms < 200) return 'success'
  if (ms < 1000) return ''
  if (ms < 3000) return 'warning'
  return 'danger'
}

const activityClass = (action: string): 'success' | 'warning' | 'danger' | 'info' => {
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

/* 首屏骨架屏(布局与真实内容一致, 减少加载跳变感) */
.dash-skeleton {
  padding-top: 2px;
}

.sk-kpi-row {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.sk-kpi-card {
  height: 96px;
  border-radius: var(--app-radius, 16px);
}

.sk-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 16px;
}

.sk-panel-wide {
  grid-column: span 8;
  height: 280px;
  border-radius: var(--app-radius, 16px);
}

.sk-panel-tall {
  grid-column: span 4;
  grid-row: span 2;
  height: 576px;
  border-radius: var(--app-radius, 16px);
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

.page-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.refresh-time {
  font-size: 12px;
  color: var(--app-text-secondary, #6b7280);
}

/* KPI 指标卡 */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.kpi-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--app-card, #fff);
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: var(--app-radius, 16px);
  cursor: pointer;
  transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
}

.kpi-card:hover {
  transform: translateY(-2px);
  border-color: var(--app-primary, #2563eb);
  box-shadow: var(--app-shadow, 0 16px 40px rgba(15, 23, 42, 0.08));
}

.kpi-card:hover .kpi-go {
  opacity: 1;
  transform: translateX(0);
}

.kpi-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.kpi-info {
  flex: 1;
  min-width: 0;
}

.kpi-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--app-text-primary, #111827);
  line-height: 1.2;
}

.kpi-label {
  font-size: 12px;
  color: var(--app-text-secondary, #6b7280);
  margin-top: 2px;
}

.kpi-sub {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kpi-go {
  color: var(--app-primary, #2563eb);
  opacity: 0;
  transform: translateX(-4px);
  transition: opacity 0.18s, transform 0.18s;
  flex-shrink: 0;
}

/* 图表网格 */
.dash-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 16px;
}

.span-4 { grid-column: span 4; }
.span-6 { grid-column: span 6; }
.span-8 { grid-column: span 8; }
.row-span-2 { grid-row: span 2; }

/* 通用面板 */
.panel {
  background: var(--app-card, #fff);
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: var(--app-radius, 16px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 14px 18px;
  border-bottom: 1px solid var(--app-border, #e5e7eb);
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text-primary, #111827);
}

.panel-desc {
  font-size: 12px;
  color: var(--app-text-secondary, #6b7280);
}

.panel-body {
  padding: 16px;
  flex: 1;
  min-height: 0;
}

/* 最近活动 */
.activity-body {
  overflow-y: auto;
  padding: 16px 18px;
}

.activity-body :deep(.el-timeline) {
  padding-left: 4px;
}

.activity-summary {
  font-size: 13px;
  color: var(--app-text-primary, #111827);
  word-break: break-all;
  line-height: 1.5;
}

.activity-meta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--app-text-secondary, #6b7280);
}

.activity-actor {
  font-weight: 500;
}

.activity-action {
  font-family: monospace;
  background: var(--app-bg, #f6f8fb);
  padding: 0 4px;
  border-radius: 4px;
}

/* 今日概览 */
.today-list {
  display: flex;
  flex-direction: column;
}

.today-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--app-border, #e5e7eb);
}

.today-row:last-child {
  border-bottom: none;
}

.today-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.today-label {
  font-size: 13px;
  color: var(--app-text-primary, #111827);
}

.today-sub {
  font-size: 11px;
  color: var(--app-text-secondary, #6b7280);
  margin-top: 2px;
}

.today-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--app-text-primary, #111827);
  flex-shrink: 0;
}

/* 系统健康度 */
.health-body {
  display: flex;
  gap: 18px;
  align-items: center;
}

.health-gauge {
  text-align: center;
  flex-shrink: 0;
}

.health-gauge-label {
  font-size: 13px;
  color: var(--app-text-primary, #111827);
  margin-top: 4px;
}

.health-gauge-detail {
  font-size: 11px;
  color: var(--app-text-secondary, #6b7280);
  margin-top: 2px;
}

.health-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 0;
  border-bottom: 1px dashed var(--app-border, #e5e7eb);
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 13px;
  color: var(--app-text-secondary, #6b7280);
}

.info-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text-primary, #111827);
}

.info-value.success { color: var(--app-success, #10b981); }
.info-value.warning { color: var(--app-warning, #f59e0b); }
.info-value.danger { color: var(--app-danger, #ef4444); }

/* 章节生成状态 */
.gen-status {
  margin-top: 12px;
}

.gen-status-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-secondary, #6b7280);
  margin-bottom: 8px;
}

.gen-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
}

.gen-label {
  width: 64px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--app-text-primary, #111827);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gen-track {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: var(--app-bg, #f6f8fb);
  overflow: hidden;
}

.gen-bar {
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s;
}

.gen-count {
  width: 36px;
  flex-shrink: 0;
  text-align: right;
  font-size: 12px;
  font-weight: 600;
  color: var(--app-text-primary, #111827);
}

/* 跳转弹窗 */
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
  border-radius: 8px;
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
  border-radius: 0 0 8px 8px;
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

/* 响应式 */
@media (max-width: 1400px) {
  .kpi-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 1200px) {
  .span-8,
  .span-6,
  .span-4 {
    grid-column: span 6;
  }
  .row-span-2 {
    grid-row: auto;
  }
  .activity-body {
    max-height: 420px;
  }
}

@media (max-width: 900px) {
  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .span-8,
  .span-6,
  .span-4 {
    grid-column: span 12;
  }
}
</style>
