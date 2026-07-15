<!-- frontend/src/views/dashboard/components/EChart.vue -->
<!-- 通用 ECharts 容器：传入 option 即可，自动处理 resize -->
<template>
  <div ref="chartRef" :style="{ width: '100%', height: height }"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, FunnelChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  GraphicComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  LineChart,
  FunnelChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  GraphicComponent,
  CanvasRenderer,
])

const props = defineProps<{
  option: echarts.EChartsCoreOption
  height?: string
}>()

const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null

const renderChart = () => {
  if (!chartRef.value) return
  if (!chart) {
    chart = echarts.init(chartRef.value)
  }
  chart.setOption(props.option, true)
}

const handleResize = () => {
  chart?.resize()
}

onMounted(() => {
  nextTick(() => {
    renderChart()
    window.addEventListener('resize', handleResize)
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chart = null
})

watch(
  () => props.option,
  () => renderChart(),
  { deep: true }
)
</script>
