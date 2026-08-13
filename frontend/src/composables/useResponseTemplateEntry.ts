/** 响应模板入口逻辑(幂等复用)。
 *
 * 同一份招标文件只对应一个响应模板(后端幂等):
 * - 已有模板 → 直接进入工作台
 * - 无模板   → 创建并进入(重复点击不会重复创建)
 *
 * 使用方: 招标文件详情页 / 标段工作台文件解析面板。
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  createResponseTemplate,
  listResponseTemplates,
  type ResponseTemplate,
} from '@/api/responseTemplate'

export function useResponseTemplateEntry() {
  const router = useRouter()
  /** source_file_id → 模板 映射 */
  const templatesByFile = ref<Record<number, ResponseTemplate>>({})
  const loading = ref(false)

  /** 查询单个招标文件的响应模板 */
  async function loadByFile(fileId: number) {
    try {
      const { data } = await listResponseTemplates({ source_file_id: fileId })
      const tpl = (data.results || [])[0]
      if (tpl) {
        templatesByFile.value = { ...templatesByFile.value, [fileId]: tpl }
      }
    } catch {
      // 静默: 查询失败不影响页面
    }
  }

  /** 查询整个标段的响应模板(列表页/工作台面板用) */
  async function loadByLot(lotId: number) {
    try {
      const { data } = await listResponseTemplates({ lot_id: lotId })
      const map = { ...templatesByFile.value }
      for (const t of data.results || []) {
        map[t.source_file] = t
      }
      templatesByFile.value = map
    } catch {
      // 静默
    }
  }

  function templateOf(fileId: number): ResponseTemplate | null {
    return templatesByFile.value[fileId] || null
  }

  /** 入口动作: 有模板直接进, 无模板创建后进 */
  async function enter(fileId: number) {
    loading.value = true
    try {
      const existing = templateOf(fileId)
      if (existing) {
        router.push(`/response-templates/${existing.id}`)
        return
      }
      const { data } = await createResponseTemplate(fileId)
      templatesByFile.value = { ...templatesByFile.value, [fileId]: data }
      router.push(`/response-templates/${data.id}`)
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.detail || '创建响应模板失败')
    } finally {
      loading.value = false
    }
  }

  /** 模板状态 → 标签颜色(与响应模板工作台一致) */
  function statusType(status?: string): 'success' | 'info' | 'warning' | 'danger' | 'primary' {
    if (status === 'generated') return 'success'
    if (status === 'failed') return 'danger'
    if (status === 'confirmed') return 'warning'
    if (status === 'analyzed') return 'primary'
    return 'info'
  }

  return { templatesByFile, loading, loadByFile, loadByLot, templateOf, enter, statusType }
}
