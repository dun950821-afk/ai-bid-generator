<template>
  <el-card shadow="never">
    <el-form :model="localSettings" label-width="160px">
      <el-form-item label="操作审计">
        <el-switch v-model="localSettings.enable_audit_log" />
        <div class="form-tip">记录用户操作、配置变更等审计日志</div>
      </el-form-item>

      <el-form-item label="Prompt 日志">
        <el-switch v-model="localSettings.enable_prompt_log" />
        <div class="form-tip">记录 Prompt 输入输出，用于调试和分析</div>
      </el-form-item>

      <el-form-item label="RAG 检索日志">
        <el-switch v-model="localSettings.enable_rag_log" />
        <div class="form-tip">记录知识库检索日志，用于检索效果分析</div>
      </el-form-item>

      <el-form-item label="密钥脱敏">
        <el-switch v-model="localSettings.mask_secrets" />
        <div class="form-tip">前端显示密钥时只显示最后几位</div>
      </el-form-item>

      <el-form-item label="登录失败锁定">
        <el-input-number v-model="localSettings.login_fail_lock_count" :min="3" :max="10" />
        <span style="margin-left: 8px">次</span>
        <div class="form-tip">连续登录失败超过次数后锁定账户</div>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="handleSave">保存配置</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { SystemSettings } from '@/api/systemConfig'

const props = defineProps<{
  modelValue: SystemSettings
}>()

const emit = defineEmits<{
  'update:modelValue': [value: SystemSettings]
  save: []
}>()

const localSettings = ref({ ...props.modelValue })

watch(() => props.modelValue, (val) => {
  localSettings.value = { ...val }
}, { deep: true })

function handleSave() {
  emit('update:modelValue', localSettings.value)
  emit('save')
}
</script>

<style scoped>
.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
</style>