<template>
  <el-drawer
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="条款详情"
    size="50%"
  >
    <div v-if="requirement" class="detail-content">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="ID">{{ requirement.id }}</el-descriptions-item>
        <el-descriptions-item label="编号">
          {{ requirement.requirement_no || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="类型">
          {{ requirement.requirement_type_display }}
        </el-descriptions-item>
        <el-descriptions-item label="强制程度">
          <el-tag size="small" :type="getMandatoryTag(requirement.mandatory_level)">
            {{ requirement.mandatory_level_display }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="风险等级">
          <el-tag size="small" :type="getRiskTag(requirement.risk_level)">
            {{ requirement.risk_level_display }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="响应策略">
          {{ requirement.response_strategy_display }}
        </el-descriptions-item>
        <el-descriptions-item label="负责人">
          {{ requirement.owner_role_display }}
        </el-descriptions-item>
        <el-descriptions-item label="审核状态">
          {{ requirement.review_status_display }}
        </el-descriptions-item>

        <!-- 来源追踪字段 -->
        <el-descriptions-item label="提示词版本">
          {{ requirement.prompt_version_id || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="来源 PromptRun">
          {{ requirement.source_prompt_run_id || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="来源 Chunk">
          {{ requirement.source_chunk_id || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="来源页码">
          {{ formatPageRange(requirement) }}
        </el-descriptions-item>
        <el-descriptions-item label="来源章节" :span="2">
          {{ requirement.source_section_path || '-' }}
        </el-descriptions-item>

        <el-descriptions-item label="抽取方式">
          {{ requirement.extraction_method }}
        </el-descriptions-item>
        <el-descriptions-item label="置信度">
          {{ requirement.confidence?.toFixed(2) || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">
          {{ formatDateTime(requirement.created_at) }}
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag size="small" :type="requirement.is_active ? 'success' : 'info'">
            {{ requirement.is_active ? '活跃' : '已停用' }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>

      <div class="section" v-if="requirement.title">
        <h4>标题</h4>
        <p>{{ requirement.title }}</p>
      </div>

      <div class="section">
        <h4>内容</h4>
        <pre class="content-text">{{ requirement.content }}</pre>
      </div>

      <div class="section" v-if="requirement.summary">
        <h4>摘要</h4>
        <p>{{ requirement.summary }}</p>
      </div>

      <!-- 原始抽取结果 -->
      <div class="section" v-if="requirement.raw_extracted && Object.keys(requirement.raw_extracted).length">
        <h4>原始抽取结果</h4>
        <pre class="content-text">{{ JSON.stringify(requirement.raw_extracted, null, 2) }}</pre>
      </div>

      <div class="section" v-if="hasFeatureInfo()">
        <h4>结构化信息</h4>
        <div class="feature-info">
          <div v-if="requirement.score_info && Object.keys(requirement.score_info).length">
            <strong>评分信息：</strong>
            <pre>{{ JSON.stringify(requirement.score_info, null, 2) }}</pre>
          </div>
          <div v-if="requirement.deadline_info && Object.keys(requirement.deadline_info).length">
            <strong>截止时间：</strong>
            <pre>{{ JSON.stringify(requirement.deadline_info, null, 2) }}</pre>
          </div>
          <div v-if="requirement.amount_info && Object.keys(requirement.amount_info).length">
            <strong>金额信息：</strong>
            <pre>{{ JSON.stringify(requirement.amount_info, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>

    <!-- 加载中状态 -->
    <div v-if="loading" class="loading-container" v-loading="loading" element-loading-text="加载中..."></div>
  </el-drawer>
</template>

<script setup lang="ts">
import type { RequirementDetail } from '@/api/requirements'

const props = defineProps<{
  modelValue: boolean
  requirement: RequirementDetail | null
  loading?: boolean
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function hasFeatureInfo(): boolean {
  if (!props.requirement) return false
  const r = props.requirement
  return (
    (r.score_info && Object.keys(r.score_info).length > 0) ||
    (r.deadline_info && Object.keys(r.deadline_info).length > 0) ||
    (r.amount_info && Object.keys(r.amount_info).length > 0)
  )
}

function formatPageRange(r: RequirementDetail): string {
  if (r.source_page_start && r.source_page_end) {
    return `${r.source_page_start} - ${r.source_page_end}`
  }
  if (r.source_page_start) {
    return String(r.source_page_start)
  }
  return '-'
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getMandatoryTag(level: string): string {
  const map: Record<string, string> = {
    mandatory: 'danger',
    important: 'warning',
    optional: '',
    unknown: 'info',
  }
  return map[level] || 'info'
}

function getRiskTag(level: string): string {
  const map: Record<string, string> = {
    high: 'danger',
    medium: 'warning',
    low: 'success',
    unknown: 'info',
  }
  return map[level] || 'info'
}
</script>

<style scoped>
.detail-content {
  padding: 0 16px;
}

.loading-container {
  padding: 40px 16px;
}

.section {
  margin-top: 20px;
}

.section h4 {
  margin-bottom: 8px;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.section p {
  font-size: 13px;
  line-height: 1.6;
}

.content-text {
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: monospace;
  font-size: 13px;
  line-height: 1.6;
  max-height: 300px;
  overflow: auto;
}

.feature-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.feature-info pre {
  background: var(--el-fill-color-light);
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  margin: 4px 0 0 0;
}
</style>