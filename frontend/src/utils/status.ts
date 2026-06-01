// frontend/src/utils/status.ts
/** 状态相关工具函数。 */

export type RunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'schema_failed'

export const STATUS_CONFIG: Record<RunStatus, { label: string; type: 'primary' | 'success' | 'warning' | 'info' | 'danger' }> = {
  pending: { label: '等待中', type: 'info' },
  running: { label: '运行中', type: 'warning' },
  succeeded: { label: '成功', type: 'success' },
  failed: { label: '失败', type: 'danger' },
  schema_failed: { label: '校验失败', type: 'danger' },
}

export function getStatusLabel(status: RunStatus): string {
  return STATUS_CONFIG[status]?.label ?? status
}

export function getStatusType(status: RunStatus): 'primary' | 'success' | 'warning' | 'info' | 'danger' {
  return STATUS_CONFIG[status]?.type ?? 'info'
}

export function isTerminalStatus(status: RunStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'schema_failed'
}

export function isSuccessStatus(status: RunStatus): boolean {
  return status === 'succeeded'
}

export function isErrorStatus(status: RunStatus): boolean {
  return status === 'failed' || status === 'schema_failed'
}
