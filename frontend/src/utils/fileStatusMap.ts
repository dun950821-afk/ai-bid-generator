/** 文件展示状态（spec §6，4 态简化）。 */
export type DisplayStatus = 'uploading' | 'parsing' | 'ready' | 'failed'

/** 展示状态对应的中文标签。 */
export const DISPLAY_STATUS_LABEL: Record<DisplayStatus, string> = {
  uploading: '上传中',
  parsing: '解析中',
  ready: '已就绪',
  failed: '解析失败',
}

/** 展示状态对应的 Element Plus tag type。 */
export const DISPLAY_STATUS_TAG_TYPE: Record<DisplayStatus, string> = {
  uploading: 'info',
  parsing: 'warning',
  ready: 'success',
  failed: 'danger',
}

const STATUS_MAP: Record<string, DisplayStatus> = {
  uploading: 'uploading',
  parse_pending: 'parsing',
  parsing: 'parsing',
  chunking: 'parsing',
  chunked: 'parsing',
  processing: 'parsing',
  parsed: 'ready',
  requirement_extracted: 'ready',
  ready: 'ready',
  indexed: 'ready',
  parse_failed: 'failed',
  rejected: 'failed',
  archived: 'failed',
  upload_expired: 'failed',
}

/** 后端文件状态 → 前端展示状态。 */
export function mapFileDisplayStatus(status: string): DisplayStatus {
  return STATUS_MAP[status] ?? 'parsing'
}
