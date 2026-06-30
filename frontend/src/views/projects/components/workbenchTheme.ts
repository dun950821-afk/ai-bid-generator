import {
  UploadFilled,
  Document,
  Connection,
  Edit,
  Files,
} from '@element-plus/icons-vue'
import type { Component } from 'vue'
import type { StepKey } from '@/api/workbench'

export interface StepTheme {
  color: string
  icon: Component
  label: string
  desc: string
}

export const STEP_THEME: Record<StepKey, StepTheme> = {
  tender_file: {
    color: '#409EFF',
    icon: UploadFilled,
    label: '招标文件',
    desc: '上传招标文件',
  },
  file_parsing: {
    color: '#722ED1',
    icon: Document,
    label: '文件解析',
    desc: '解析招标文件内容',
  },
  outline_generation: {
    color: '#13C2C2',
    icon: Connection,
    label: '大纲生成',
    desc: '生成投标文件大纲',
  },
  content_editing: {
    color: '#FA8C16',
    icon: Edit,
    label: '内容编辑',
    desc: '编辑章节正文',
  },
  export: {
    color: '#52C41A',
    icon: Files,
    label: '导出',
    desc: '导出 Word 文档',
  },
}

export const STEP_ORDER: StepKey[] = [
  'tender_file',
  'file_parsing',
  'outline_generation',
  'content_editing',
  'export',
]
