// 开始解析统一交互：招标文件上传面板（批量）与文件解析面板（单文件/批量）共用一套逻辑
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { smartReparse } from '@/api/tender'
import type { WorkbenchFile } from '@/api/workbench'

export function useStartParse(onUploaded?: () => void) {
  const startingParse = ref(false)

  async function startParse(files: WorkbenchFile[]): Promise<number> {
    // 只处理招标文件：未在解析中的都可触发（待解析/失败/已就绪后补传附件需合并解析）
    const targets = files.filter(f => f.file_category === 'tender_file' && f.display_status !== 'parsing')
    if (!targets.length) return 0

    try {
      await ElMessageBox.confirm(
        `将对 ${targets.length} 个招标文件开始解析（有关联附件时自动合并解析）。是否继续？`,
        '开始解析',
        { type: 'warning', confirmButtonText: '开始解析', cancelButtonText: '再检查一下' }
      )
    } catch {
      return 0
    }

    startingParse.value = true
    let failed = 0
    for (const file of targets) {
      try {
        await smartReparse(file.id)
      } catch {
        failed += 1
      }
    }
    startingParse.value = false

    if (failed) {
      ElMessage.warning(`已触发 ${targets.length - failed} 个文件解析，${failed} 个触发失败`)
    } else {
      ElMessage.success(`已触发 ${targets.length} 个文件解析`)
    }
    onUploaded?.()
    return targets.length - failed
  }

  return { startingParse, startParse }
}
