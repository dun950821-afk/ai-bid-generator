import { http } from '@/api/http'

/** 文件展示状态。 */
export type DisplayStatus = 'uploading' | 'parsing' | 'ready' | 'failed'

/** 工作台步骤状态。 */
export type StepStatus = 'pending' | 'doing' | 'done' | 'failed'

/** 工作台步骤 key。 */
export type StepKey = 'tender_file' | 'file_parsing' | 'outline_generation' | 'content_editing' | 'export'

/** 流水线阶段状态。 */
export type PipelineStageStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'

/** 文件解析流水线阶段项。 */
export interface FilePipelineStage {
  stage: string
  stage_display: string
  status: PipelineStageStatus
  status_display: string
  error_message: string
}

/** 文件关联的解析异步任务（parse→chunk→extract 共用）。 */
export interface FileAsyncTask {
  id: number
  status: string
  progress: number
  current_step: string
}

/** 聚合状态中的文件项。 */
export interface WorkbenchFile {
  id: number
  name: string
  status: string
  display_status: DisplayStatus
  error_message: string
  requirement_count: number
  outline_count: number
  pipeline: FilePipelineStage[]
  async_task: FileAsyncTask | null
}

/** 聚合状态中的大纲项。 */
export interface WorkbenchOutline {
  id: number
  name: string
  status: string
  is_current: boolean
}

/** 聚合状态中的生成任务。 */
export interface WorkbenchTask {
  id: number
  status: string
  progress: number
  current_step: string
}

/** 聚合状态中的文档项。 */
export interface WorkbenchDocument {
  id: number
  title: string
  status: string
  created_at: string | null
  outline_id: number | null
  outline_name: string
  outline_is_current: boolean
}

/** 聚合状态响应。 */
export interface WorkbenchStatus {
  lot: { id: number; name: string; status: string }
  current_step: StepKey
  steps: {
    tender_file: {
      status: StepStatus
      file_count: number
      files: WorkbenchFile[]
    }
    file_parsing: { status: StepStatus }
    outline_generation: {
      status: StepStatus
      outlines: WorkbenchOutline[]
      tasks: WorkbenchTask[]
    }
    content_editing: {
      status: StepStatus
      current_outline_id: number | null
    }
    export: {
      status: StepStatus
      documents: WorkbenchDocument[]
    }
  }
}

/** 获取标段工作台聚合状态。 */
export async function getWorkbenchStatus(lotId: number): Promise<WorkbenchStatus> {
  const res = await http.get<WorkbenchStatus>(`/api/lots/${lotId}/workbench_status/`)
  return res.data
}

/** 标段列表项（含工作台进度，概览看板用）。 */
export interface LotWithProgress {
  id: number
  name: string
  code: string
  project: number
  status: string
  workflow_status: string
  created_at: string
  current_step: StepKey
  step_summary: Record<StepKey, StepStatus>
}

/** 步骤顺序（用于缩略进度展示）。 */
export const STEP_ORDER: StepKey[] = [
  'tender_file',
  'file_parsing',
  'outline_generation',
  'content_editing',
  'export',
]

/** 步骤中文短名（缩略进度用）。 */
export const STEP_SHORT_LABEL: Record<StepKey, string> = {
  tender_file: '文件',
  file_parsing: '解析',
  outline_generation: '大纲',
  content_editing: '编辑',
  export: '导出',
}
