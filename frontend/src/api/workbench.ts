import { http } from '@/api/http'

/** 文件展示状态。 */
export type DisplayStatus = 'uploading' | 'parsing' | 'ready' | 'failed'

/** 工作台步骤状态。 */
export type StepStatus = 'pending' | 'doing' | 'done' | 'failed'

/** 工作台步骤 key。 */
export type StepKey = 'tender_file' | 'file_parsing' | 'outline_generation' | 'content_editing' | 'export'

/** 聚合状态中的文件项。 */
export interface WorkbenchFile {
  id: number
  name: string
  status: string
  display_status: DisplayStatus
  error_message: string
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
}

/** 聚合状态中的文档项。 */
export interface WorkbenchDocument {
  id: number
  title: string
  status: string
  created_at: string | null
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
