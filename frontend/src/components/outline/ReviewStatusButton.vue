<!-- frontend/src/components/outline/ReviewStatusButton.vue -->
<!-- 目录校验按钮：详情页顶部与操作流程指引共用同一显示逻辑（通过绿/未过黄/未校验蓝） -->
<template>
  <el-button size="small" :type="btnType" :loading="loading" @click="emit('click')">
    {{ label }}
  </el-button>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** 审核状态：passed / failed / 空（未校验） */
  reviewStatus?: string | null
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'click'): void
}>()

const btnType = computed(() => {
  if (props.reviewStatus === 'passed') return 'success'
  if (props.reviewStatus === 'failed') return 'warning'
  return 'primary'
})

const label = computed(() => {
  if (props.reviewStatus === 'passed') return '校验通过'
  if (props.reviewStatus === 'failed') return '校验未通过'
  return '目录校验'
})
</script>
