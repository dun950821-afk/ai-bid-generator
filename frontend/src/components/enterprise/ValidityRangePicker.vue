<!-- frontend/src/components/enterprise/ValidityRangePicker.vue -->
<template>
  <div class="validity-picker">
    <el-radio-group v-model="mode">
      <el-radio-button value="longterm">长期有效</el-radio-button>
      <el-radio-button value="range">设置有效期</el-radio-button>
    </el-radio-group>
    <div v-if="mode === 'range'" class="validity-dates">
      <el-date-picker
        v-model="startDate"
        type="date"
        placeholder="开始日期"
        value-format="YYYY-MM-DD"
        clearable
        class="validity-date"
      />
      <span class="validity-sep">至</span>
      <el-date-picker
        v-model="endDate"
        type="date"
        placeholder="结束日期"
        value-format="YYYY-MM-DD"
        clearable
        :disabled-date="disableEndBeforeStart"
        class="validity-date"
      />
    </div>
    <div v-if="mode === 'range'" class="validity-tip">结束日期留空表示自开始日期起长期有效</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

/**
 * 有效期选择器：长期有效 / 日期区间 二选一。
 * v-model 为 [valid_from, valid_to]；长期有效时为 null。
 */
const model = defineModel<[string | null, string | null] | null>({ default: null })

const mode = ref<'longterm' | 'range'>(model.value ? 'range' : 'longterm')
const startDate = ref<string | null>(model.value?.[0] || null)
const endDate = ref<string | null>(model.value?.[1] || null)

const disableEndBeforeStart = (date: Date) => {
  if (!startDate.value) return false
  return date.getTime() < new Date(startDate.value + 'T00:00:00').getTime()
}

// 内部状态 → v-model
watch([mode, startDate, endDate], () => {
  if (mode.value === 'longterm') {
    model.value = null
  } else {
    model.value = [startDate.value || null, endDate.value || null]
  }
})

// 外部重置（如对话框重新打开）→ 内部状态
watch(model, (val) => {
  const from = val?.[0] || null
  const to = val?.[1] || null
  if (from !== startDate.value || to !== endDate.value) {
    startDate.value = from
    endDate.value = to
  }
  mode.value = val ? 'range' : 'longterm'
})
</script>

<style scoped>
.validity-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.validity-dates {
  display: flex;
  align-items: center;
  gap: 8px;
}

.validity-date {
  flex: 1;
}

.validity-sep {
  color: var(--app-text-secondary, #9ca3af);
  flex-shrink: 0;
}

.validity-tip {
  font-size: 12px;
  color: var(--app-text-secondary, #9ca3af);
}
</style>
