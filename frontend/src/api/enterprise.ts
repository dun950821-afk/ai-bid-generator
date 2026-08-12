// frontend/src/api/enterprise.ts
/** 企业资料中心 API */

import { http } from './http'

// ========== 通用类型 ==========

/** 分页响应格式 */
export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// ========== 公司主体 API ==========

export interface CompanyProfile {
  id: number
  name: string
  short_name: string
  unified_social_credit_code: string
  legal_representative: string
  registered_capital: string
  established_date: string | null
  registered_address: string
  business_scope: string
  company_intro: string
  official_phone: string
  official_email: string
  website: string
  contact_person: string
  bank_name: string
  bank_account: string
  status: string
  status_display: string
  version: number
  is_default: boolean
  created_by_name: string
  material_count: number
  created_at: string
  updated_at: string
}

export interface CompanyProfileCreate {
  name: string
  short_name?: string
  unified_social_credit_code?: string
  legal_representative?: string
  registered_capital?: string
  established_date?: string | null
  registered_address?: string
  business_scope?: string
  company_intro?: string
  official_phone?: string
  official_email?: string
  website?: string
  contact_person?: string
  bank_name?: string
  bank_account?: string
}

/** 获取公司列表 */
export function getCompanyList(params?: { status?: string; search?: string; page?: number; page_size?: number }) {
  return http.get<PaginatedResponse<CompanyProfile>>('/api/enterprise/companies/', { params })
}

/** 获取公司详情 */
export function getCompanyDetail(id: number) {
  return http.get<CompanyProfile>(`/api/enterprise/companies/${id}/`)
}

/** 创建公司 */
export function createCompany(data: CompanyProfileCreate) {
  return http.post<CompanyProfile>('/api/enterprise/companies/', data)
}

/** 更新公司 */
export function updateCompany(id: number, data: Partial<CompanyProfileCreate>) {
  return http.put<CompanyProfile>(`/api/enterprise/companies/${id}/`, data)
}

/** 删除公司 */
export function deleteCompany(id: number) {
  return http.delete(`/api/enterprise/companies/${id}/`)
}

/** 设为默认公司 */
export function setDefaultCompany(id: number) {
  return http.post<CompanyProfile>(`/api/enterprise/companies/${id}/set_default/`)
}

/** 获取默认公司 */
export function getDefaultCompany() {
  return http.get<CompanyProfile>('/api/enterprise/companies/default/')
}

// ========== 企业材料 API ==========

export interface CompanyMaterial {
  id: number
  company: number
  company_name: string
  material_type: string
  material_type_display: string
  title: string
  object_key: string
  file_size: number
  content_type: string
  valid_from: string | null
  valid_to: string | null
  issuing_authority: string
  certificate_no: string
  extracted_text: string
  tags: string[]
  is_sensitive: boolean
  status: string
  status_display: string
  uploaded_by_name: string
  file_url: string
  is_expired: boolean
  days_to_expire: number | null
  created_at: string
  updated_at: string
}

export interface MaterialUploadPresign {
  object_key: string
  upload_url: string
  fields: Record<string, string>
}

/** 获取材料列表 */
export function getMaterialList(params?: {
  company_id?: number
  material_type?: string
  status?: string
  search?: string
  page?: number
  page_size?: number
}) {
  return http.get<PaginatedResponse<CompanyMaterial>>('/api/enterprise/materials/', { params })
}

/** 获取材料详情 */
export function getMaterialDetail(id: number) {
  return http.get<CompanyMaterial>(`/api/enterprise/materials/${id}/`)
}

/** 获取上传预签名 */
export function getMaterialUploadPresign(data: {
  company_id: number
  material_type: string
  filename: string
}) {
  return http.post<MaterialUploadPresign>('/api/enterprise/materials/presign_upload/', data)
}

/** 创建材料记录 */
export function createMaterial(data: {
  company_id: number
  material_type: string
  title: string
  object_key: string
  file_size?: number
  content_type?: string
  valid_from?: string | null
  valid_to?: string | null
  issuing_authority?: string
  certificate_no?: string
  tags?: string[]
}) {
  return http.post<CompanyMaterial>('/api/enterprise/materials/', data)
}

/** 更新材料元信息（PATCH 部分更新） */
export function updateMaterial(id: number, data: Partial<CompanyMaterial>) {
  return http.patch<CompanyMaterial>(`/api/enterprise/materials/${id}/`, data)
}

/** 删除材料 */
export function deleteMaterial(id: number) {
  return http.delete(`/api/enterprise/materials/${id}/`)
}

/** 下载材料文件（同源文件流，带 JWT；后端记录审计日志） */
export function downloadMaterialFile(id: number) {
  return http.get<Blob>(`/api/enterprise/materials/${id}/download/`, {
    responseType: 'blob',
    timeout: 120000
  })
}

/** 拉取材料预览内容（同源代理，带 JWT；返回 Blob 供前端渲染） */
export function getMaterialPreviewBlob(id: number) {
  return http.get<Blob>(`/api/enterprise/materials/${id}/preview/`, {
    responseType: 'blob',
    timeout: 120000
  })
}

/** 把材料图片复制到编辑器公开图床，返回可持久引用的 URL */
export function copyMaterialToEditor(id: number) {
  return http.post<{ url: string }>(`/api/enterprise/materials/${id}/copy_to_editor/`)
}

/** 获取即将过期材料 */
export function getExpiringMaterials(days?: number) {
  return http.get<CompanyMaterial[]>('/api/enterprise/materials/expiring/', {
    params: { days }
  })
}

/** 归档材料 */
export function archiveMaterial(id: number) {
  return http.post(`/api/enterprise/materials/${id}/archive/`)
}

/** 替换材料文件 */
export function replaceMaterialFile(id: number, data: {
  object_key: string
  file_size?: number
  content_type?: string
}) {
  return http.post<CompanyMaterial>(`/api/enterprise/materials/${id}/replace/`, data)
}

// ========== 标书材料包 API ==========

export interface BidMaterialPackage {
  id: number
  outline: number
  outline_name: string
  company: number
  company_name: string
  name: string
  status: string
  status_display: string
  company_snapshot: Record<string, unknown>
  items: BidMaterialPackageItem[]
  is_editable: boolean
  created_by: number | null
  locked_at: string | null
  created_at: string
  updated_at: string
}

export interface BidMaterialPackageItem {
  id: number
  material: CompanyMaterial
  material_id: number
  usage_key: string
  display_order: number
  required: boolean
  notes: string
}

export interface MaterialCheckResult {
  pass_status: boolean
  missing_materials: Array<{
    section_id: number
    section_title: string
    usage_key: string
    material_type: string
    description: string
  }>
  expired_materials: Array<{
    material_id: number
    title: string
    material_type: string
    valid_to: string | null
    days_expired: number
  }>
  warnings: Array<{
    type: string
    message: string
  }>
}

/** 获取大纲材料包 */
export function getOutlineMaterialPackage(outlineId: number) {
  return http.get<BidMaterialPackage>(
    `/api/enterprise/outlines/${outlineId}/material-package/`
  )
}

/** 创建材料包 */
export function createMaterialPackage(outlineId: number, data: {
  company_id: number
  name?: string
  auto_fill?: boolean
}) {
  return http.post<BidMaterialPackage>(
    `/api/enterprise/outlines/${outlineId}/material-package/`,
    data
  )
}

/** 更新材料包 */
export function updateMaterialPackage(outlineId: number, data: {
  name?: string
  items?: Array<{
    material_id: number
    usage_key: string
    required?: boolean
    notes?: string
  }>
}) {
  return http.put<BidMaterialPackage>(
    `/api/enterprise/outlines/${outlineId}/material-package/`,
    data
  )
}

/** 锁定材料包 */
export function lockMaterialPackage(outlineId: number) {
  return http.post<BidMaterialPackage>(
    `/api/enterprise/outlines/${outlineId}/material-package/lock/`
  )
}

/** 检查材料完整性 */
export function checkMaterialPackage(outlineId: number) {
  return http.get<MaterialCheckResult>(
    `/api/enterprise/outlines/${outlineId}/material-package/check/`
  )
}

/** 自动填充材料 */
export function autoFillMaterialPackage(outlineId: number) {
  return http.post<BidMaterialPackage>(
    `/api/enterprise/outlines/${outlineId}/material-package/auto_fill/`
  )
}

/** 顶层路由：列出材料包（支持 outline/company/status 过滤） */
export function listMaterialPackages(params?: {
  outline?: number
  company?: number
  status?: string
}) {
  return http.get<{ results: BidMaterialPackage[]; count: number }>(
    '/api/enterprise/material-packages/',
    { params }
  )
}

/** 顶层路由：获取材料包详情 */
export function getMaterialPackageDetail(id: number) {
  return http.get<BidMaterialPackage>(`/api/enterprise/material-packages/${id}/`)
}

/** 顶层路由：更新材料包 */
export function updateMaterialPackageById(id: number, data: {
  name?: string
  items?: Array<{
    material_id: number
    usage_key: string
    required?: boolean
    notes?: string
  }>
}) {
  return http.patch<BidMaterialPackage>(
    `/api/enterprise/material-packages/${id}/`,
    data
  )
}

/** 顶层路由：删除材料包 */
export function deleteMaterialPackageById(id: number) {
  return http.delete(`/api/enterprise/material-packages/${id}/`)
}

// ============================================================================
// 企业项目案例
// ============================================================================

export interface CompanyCase {
  id: number
  company: number
  company_name: string
  project_name: string
  client_name: string
  client_contact: string
  amount: number | null
  amount_text: string
  start_date: string | null
  end_date: string | null
  period_text: string
  scope: string
  remark: string
  source: string
  created_at: string
  updated_at: string
}

/** 案例列表(按公司/关键词过滤) */
export function getCaseList(params?: { company_id?: number; keyword?: string }) {
  return http.get<CompanyCase[]>('/api/enterprise/cases/', { params })
}

/** 创建案例 */
export function createCase(data: Partial<CompanyCase>) {
  return http.post<CompanyCase>('/api/enterprise/cases/', data)
}

/** 更新案例 */
export function updateCase(id: number, data: Partial<CompanyCase>) {
  return http.patch<CompanyCase>(`/api/enterprise/cases/${id}/`, data)
}

/** 删除案例 */
export function deleteCase(id: number) {
  return http.delete(`/api/enterprise/cases/${id}/`)
}

// ============================================================================
// 企业项目人员
// ============================================================================

export interface ProjectMember {
  id: number
  company: number
  company_name: string
  name: string
  role: string
  title: string
  experience_years: number | null
  certificates: string
  projects: string
  material: number | null
  created_at: string
  updated_at: string
}

/** 人员列表(按公司/关键词过滤) */
export function getMemberList(params?: { company_id?: number; keyword?: string }) {
  return http.get<ProjectMember[]>('/api/enterprise/members/', { params })
}

/** 创建人员 */
export function createMember(data: Partial<ProjectMember>) {
  return http.post<ProjectMember>('/api/enterprise/members/', data)
}

/** 更新人员 */
export function updateMember(id: number, data: Partial<ProjectMember>) {
  return http.patch<ProjectMember>(`/api/enterprise/members/${id}/`, data)
}

/** 删除人员 */
export function deleteMember(id: number) {
  return http.delete(`/api/enterprise/members/${id}/`)
}
