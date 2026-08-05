import {
  UploadFilled,
  Document,
  Connection,
  Edit,
  Files,
} from '@element-plus/icons-vue'
import type { Component } from 'vue'
import type { StepKey, StepStatus } from '@/api/workbench'
import { STEP_ORDER } from '@/api/workbench'

export { STEP_ORDER }

export interface StepTheme {
  color: string
  bgColor: string
  icon: Component
  label: string
  desc: string
}

/** 步骤主题：使用 Element Plus CSS 变量，保持全局一致。 */
export const STEP_THEME: Record<StepKey, StepTheme> = {
  tender_file: {
    color: 'var(--el-color-primary)',
    bgColor: 'var(--el-color-primary-light-9)',
    icon: UploadFilled,
    label: '招标文件',
    desc: '上传招标文件',
  },
  file_parsing: {
    color: 'var(--el-color-primary-dark-2)',
    bgColor: 'var(--el-color-primary-light-8)',
    icon: Document,
    label: '文件解析',
    desc: '解析招标文件内容',
  },
  outline_generation: {
    color: 'var(--el-color-success-dark-2)',
    bgColor: 'var(--el-color-success-light-9)',
    icon: Connection,
    label: '大纲生成',
    desc: '生成投标文件大纲',
  },
  content_editing: {
    color: 'var(--el-color-warning-dark-2)',
    bgColor: 'var(--el-color-warning-light-9)',
    icon: Edit,
    label: '内容编辑',
    desc: '编辑章节正文',
  },
  export: {
    color: 'var(--el-color-success)',
    bgColor: 'var(--el-color-success-light-8)',
    icon: Files,
    label: '导出',
    desc: '导出 Word 文档',
  },
}

/** 步骤状态元信息。 */
export interface StepStatusMeta {
  label: string
  color: string
  bgColor: string
}

export const STEP_STATUS_META: Record<StepStatus, StepStatusMeta> = {
  pending: {
    label: '待开始',
    color: 'var(--el-text-color-placeholder)',
    bgColor: 'var(--el-fill-color-light)',
  },
  doing: {
    label: '进行中',
    color: 'var(--el-color-warning)',
    bgColor: 'var(--el-color-warning-light-9)',
  },
  done: {
    label: '已完成',
    color: 'var(--el-color-success)',
    bgColor: 'var(--el-color-success-light-9)',
  },
  failed: {
    label: '失败',
    color: 'var(--el-color-danger)',
    bgColor: 'var(--el-color-danger-light-9)',
  },
}

/** 步骤中文短名（概览看板缩略进度用）。 */
export const STEP_SHORT_LABEL: Record<StepKey, string> = {
  tender_file: '文件',
  file_parsing: '解析',
  outline_generation: '大纲',
  content_editing: '编辑',
  export: '导出',
}
