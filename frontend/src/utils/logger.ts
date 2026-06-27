// frontend/src/utils/logger.ts
/**
 * 统一日志服务
 * 生产环境禁用 console.log，开发环境保留
 */

const isProduction = import.meta.env.PROD

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  data?: unknown
  timestamp: string
}

// 存储日志用于调试（最多保留 100 条）
const logBuffer: LogEntry[] = []
const MAX_LOG_BUFFER = 100

function addToBuffer(entry: LogEntry) {
  logBuffer.push(entry)
  if (logBuffer.length > MAX_LOG_BUFFER) {
    logBuffer.shift()
  }
}

export const logger = {
  debug(message: string, data?: unknown) {
    const entry: LogEntry = { level: 'debug', message, data, timestamp: new Date().toISOString() }
    addToBuffer(entry)
    if (!isProduction) {
      console.log(`[DEBUG] ${message}`, data ?? '')
    }
  },

  info(message: string, data?: unknown) {
    const entry: LogEntry = { level: 'info', message, data, timestamp: new Date().toISOString() }
    addToBuffer(entry)
    if (!isProduction) {
      console.log(`[INFO] ${message}`, data ?? '')
    }
  },

  warn(message: string, data?: unknown) {
    const entry: LogEntry = { level: 'warn', message, data, timestamp: new Date().toISOString() }
    addToBuffer(entry)
    console.warn(`[WARN] ${message}`, data ?? '')
  },

  error(message: string, error?: unknown) {
    const entry: LogEntry = { level: 'error', message, data: error, timestamp: new Date().toISOString() }
    addToBuffer(entry)
    console.error(`[ERROR] ${message}`, error ?? '')
  },

  // 获取日志缓冲区（用于调试）
  getBuffer(): LogEntry[] {
    return [...logBuffer]
  },

  // 清空缓冲区
  clearBuffer() {
    logBuffer.length = 0
  },
}

// 导出便捷方法
export const logError = (message: string, error?: unknown) => logger.error(message, error)
export const logWarn = (message: string, data?: unknown) => logger.warn(message, data)
export const logInfo = (message: string, data?: unknown) => logger.info(message, data)
export const logDebug = (message: string, data?: unknown) => logger.debug(message, data)