// frontend/src/utils/onlyofficeConnector.ts
/**
 * ONLYOFFICE 内容控件命令层（模板设计器核心，方案 §6）。
 *
 * 通过 Automation API（editor.createConnector）向当前光标位置插入
 * Content Control，Tag 作为模板变量的机器标识（bid.<type>:<key>）。
 *
 * 该层与 UI 解耦：v1 由 Vue 变量面板直接调用；后续 OnlyOffice 插件
 * 只是 iframe 加载同一个面板的薄壳，命令层原样复用。
 */

export interface InsertControlPayload {
  /** 控件 Tag，如 bid.var:company.name */
  tag: string
  /** 面板显示名 / 文档中的显示文本，如 企业名称 */
  alias: string
  /** block 级控件（正文插槽用）；默认 inline */
  block?: boolean
}

/**
 * ContentControlLock：0=内容锁定但可删除（防止编辑破坏变量结构，允许移除）。
 * 枚举见 ONLYOFFICE 文档：0 only deleting / 1 disable deleting or editing /
 * 2 only editing / 3 full access。
 */
const VARIABLE_LOCK = 0

function getEditor(editorId: string): any {
  const editor = (window as any).DocEditor?.instances?.[editorId]
  if (!editor) {
    throw new Error('编辑器尚未就绪，请稍候再试')
  }
  return editor
}

/**
 * 刷新文档全部目录（UpdateAllTOC，Docs ≥ 7.2）。
 *
 * 用于模板渲染后首次打开时刷新页码。失败时调用方降级为提示用户手动更新。
 */
export function updateAllTOC(editorId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let editor: any
    try {
      editor = getEditor(editorId)
    } catch (err) {
      reject(err)
      return
    }
    try {
      const connector = editor.createConnector()
      connector.callCommand(
        function () {
          // @ts-ignore ONLYOFFICE Office API 全局对象
          Api.GetDocument().UpdateAllTOC(false)
        },
        () => resolve(),
      )
    } catch (err) {
      reject(err)
    }
  })
}

export function insertContentControl(
  editorId: string,
  payload: InsertControlPayload,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let editor: any
    try {
      editor = getEditor(editorId)
    } catch (err) {
      reject(err)
      return
    }

    const connector = editor.createConnector()
    connector.executeMethod(
      'AddContentControl',
      [
        payload.block ? 1 : 2,
        {
          Tag: payload.tag,
          Alias: payload.alias,
          Lock: VARIABLE_LOCK,
          PlaceHolderText: payload.alias,
        },
      ],
      () => {
        connector.executeMethod('PasteText', [payload.alias], () => resolve())
      },
    )
  })
}
