<!-- frontend/src/views/outline/components/GenerationPrepChecklist.vue -->
<!-- 生成准备检查清单：全局事实 / 材料包 / 知识库 三步 -->
<template>
  <div class="prep-checklist" v-loading="loading">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      class="prep-tip"
    >
      <template #title>章节生成前请完成以下准备，确保正文质量与一致性</template>
    </el-alert>

    <div
      v-for="(step, idx) in steps"
      :key="idx"
      :class="['step-item', step.done ? 'done' : 'pending']"
    >
      <div class="step-index">
        <el-icon v-if="step.done" class="done-icon"><CircleCheckFilled /></el-icon>
        <span v-else class="pending-num">{{ idx + 1 }}</span>
      </div>
      <div class="step-content">
        <div class="step-header">
          <span class="step-title">{{ step.title }}</span>
          <el-tag :type="step.done ? 'success' : 'warning'" size="small">
            {{ step.done ? '已完成' : '未完成' }}
          </el-tag>
        </div>
        <div class="step-desc">{{ step.desc }}</div>
        <div v-if="step.detail" class="step-detail">{{ step.detail }}</div>
      </div>
      <div class="step-action">
        <el-button size="small" @click="step.open()">
          {{ step.done ? (step.doneLabel || '查看/修改') : '去完成' }}
        </el-button>
      </div>
    </div>

    <div class="prep-summary">
      <el-tag :type="allDone ? 'success' : 'warning'" size="default">
        {{ doneCount }} / {{ steps.length }} 已完成
      </el-tag>
      <el-button v-if="allDone" type="primary" size="small" @click="$emit('start-generate')">
        开始批量生成
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { CircleCheckFilled } from '@element-plus/icons-vue'
import { listGlobalFacts } from '@/api/globalFact'
import { getOutlineMaterialPackage } from '@/api/enterprise'
import { http } from '@/api/http'

const props = defineProps<{
  outlineId: number
  lotId?: number
  /** 矩阵状态，由父组件传入 */
  matrixStatus?: {
    total?: number
    generated?: number
    pending?: number
    generating?: number
    edited?: number
    failed?: number
    is_generating?: boolean
  }
}>()

const emit = defineEmits<{
  'open-global-facts': []
  'open-material-package': []
  'open-kb-binding': []
  'generate-matrix': []
  'start-generate': []
  'close': []
}>()

const loading = ref(false)
const factCount = ref(0)
const hasMaterialPackage = ref(false)
const kbCount = ref(0)

async function loadStatus(): Promise<number> {
  loading.value = true
  try {
    const [factRes, kbRes, pkgRes] = await Promise.all([
      listGlobalFacts(props.outlineId).catch(() => null),
      http.get<any[]>(`/api/outlines/${props.outlineId}/knowledge-bases/`).catch(() => null),
      getOutlineMaterialPackage(props.outlineId).catch(() => null),
    ])
    factCount.value = factRes?.data?.count || 0
    hasMaterialPackage.value = !!pkgRes?.data
    // 知识库接口直接返回数组（不是 {results:[]}）
    const kbData: any = kbRes?.data
    kbCount.value = Array.isArray(kbData) ? kbData.length : (kbData?.results?.length || 0)
    return doneCount.value
  } finally {
    loading.value = false
  }
}

const matrixDetail = computed(() => {
  const mx = props.matrixStatus || {}
  if (mx.is_generating) return '生成中...'
  const parts: string[] = []
  if (mx.total) parts.push(`共 ${mx.total} 章`)
  if (mx.pending) parts.push(`待生成 ${mx.pending}`)
  if (mx.generating) parts.push(`生成中 ${mx.generating}`)
  if (mx.generated) parts.push(`已生成 ${mx.generated}`)
  if (mx.edited) parts.push(`已编辑 ${mx.edited}`)
  if (mx.failed) parts.push(`失败 ${mx.failed}`)
  return parts.length ? parts.join(' · ') : '尚未生成'
})

const steps = computed(() => {
  const mx = props.matrixStatus || {}
  const matrixGenerated = (mx.generated || 0) > 0
  return [
    {
      title: '全局事实提取',
      desc: '从招标文件提取项目名、工期、人员、设备等会影响全文一致性的变量',
      detail: factCount.value ? `已提取 ${factCount.value} 项事实变量` : '尚未提取',
      done: factCount.value > 0,
      open: () => emit('open-global-facts'),
    },
    {
      title: '创建材料包',
      desc: '关联企业材料包，为正文生成提供公司资质、业绩、人员等素材',
      detail: hasMaterialPackage.value ? '已关联材料包' : '尚未创建',
      done: hasMaterialPackage.value,
      open: () => emit('open-material-package'),
    },
    {
      title: '关联知识库',
      desc: '绑定项目知识库，RAG 检索历史标书与素材供正文引用',
      detail: kbCount.value ? `已关联 ${kbCount.value} 个知识库` : '尚未关联',
      done: kbCount.value > 0,
      open: () => emit('open-kb-binding'),
    },
    {
      title: '生成内容责任矩阵',
      desc: '为每个章节划分写作边界，确保正文不重复、不遗漏、前后连贯',
      detail: matrixDetail.value,
      done: matrixGenerated,
      doneLabel: '重新生成',
      open: async () => {
        if (matrixGenerated) {
          try {
            await ElMessageBox.confirm(
              '重新生成将覆盖现有矩阵，是否继续？',
              '确认重新生成',
              { type: 'warning', confirmButtonText: '重新生成', cancelButtonText: '取消' },
            )
          } catch {
            return
          }
        }
        emit('generate-matrix')
        emit('close')
      },
    },
  ]
})

const doneCount = computed(() => steps.value.filter(s => s.done).length)
const allDone = computed(() => doneCount.value === steps.value.length)

defineExpose({ refresh: loadStatus, doneCount, allDone })

onMounted(loadStatus)
</script>

<style scoped>
.prep-checklist {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.prep-tip {
  margin-bottom: 4px;
}
.step-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  transition: background 0.2s;
}
.step-item.done {
  background: var(--el-color-success-light-9);
  border-color: var(--el-color-success-light-7);
}
.step-index {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.done-icon {
  font-size: 24px;
  color: var(--el-color-success);
}
.pending-num {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  border: 2px solid var(--el-border-color);
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.step-content {
  flex: 1;
}
.step-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.step-title {
  font-weight: 600;
}
.step-desc {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.step-detail {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-color-primary);
}
.step-action {
  flex-shrink: 0;
}
.prep-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
