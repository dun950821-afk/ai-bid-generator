// frontend/src/api/bidDocument.ts
import { http } from './http'

// 类型定义

export interface BidDocument {
  id: number
  outline: number
  title: string
  version: number
  status: string
  file_key: string
  saved_at: string | null
  force_saved_at: string | null
  created_at: string
  updated_at: string
}

export interface BuildDocxResponse {
  document_id: number
  title: string
  version: number
  file_key: string
  file_url: string
  warnings: Array<{
    type: string
    message: string
  }>
}

export interface LatestBidDocument {
  exists: boolean
  document_id?: number
  title?: string
  version?: number
  status?: string
  updated_at?: string
}

export interface OnlyofficeConfig {
  documentServerUrl: string
  config: {
    document: {
      fileType: string
      key: string
      title: string
      url: string
    }
    documentType: string
    editorConfig: {
      mode: string
      lang: string
      callbackUrl: string
      user: {
        id: string
        name: string
      }
      customization: {
        forcesave: boolean
        chat: boolean
        comments: boolean
        spellcheck: boolean
        plugins: boolean
      }
    }
    token: string
  }
}

// API 函数

/**
 * 生成 Word 草稿
 */
export function buildDocx(outlineId: number) {
  return http.post<BuildDocxResponse>(`/api/outlines/${outlineId}/build_docx/`)
}

/**
 * 获取最新 Word 文档状态
 */
export function getLatestBidDocument(outlineId: number) {
  return http.get<LatestBidDocument>(`/api/outlines/${outlineId}/latest_bid_document/`)
}

/**
 * 获取 ONLYOFFICE 编辑器配置
 */
export function getOnlyofficeConfig(documentId: number) {
  return http.get<OnlyofficeConfig>(`/api/bid-documents/${documentId}/onlyoffice_config/`)
}

/**
 * 获取 Word 文件下载 URL
 */
export function getBidDocumentDownloadUrl(documentId: number) {
  return `/api/bid-documents/${documentId}/download/`
}

/**
 * 带 Bearer token 下载 Word（blob 方式）。
 * 不能 window.open 导航：浏览器导航不带 Authorization header，后端会以
 * AnonymousUser 走 get_queryset 过滤抛 TypeError 500。
 */
export function downloadBidDocument(documentId: number) {
  return http.get(`/api/bid-documents/${documentId}/download/`, {
    responseType: 'blob',
    timeout: 120000,
  })
}
