<!-- frontend/src/views/bid-template/TemplateEditorView.vue -->
<template>
  <div class="template-editor-page">
    <div class="editor-header">
      <el-button text @click="goBack">
        <el-icon><ArrowLeft /></el-icon>返回
      </el-button>
      <span class="title">{{ templateName || '模板设计' }}</span>
      <span class="tip">保存后关闭编辑器标签页即可，草稿会自动保存</span>
    </div>

    <div v-if="loading" class="loading-box">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>正在加载 Word 编辑器...</span>
    </div>

    <div v-else-if="error" class="error-box">
      <el-icon><WarningFilled /></el-icon>
      <div class="error-content">
        <h3>模板编辑器加载失败</h3>
        <p>{{ error }}</p>
        <el-button type="primary" @click="loadConfig">重新加载</el-button>
      </div>
    </div>

    <div v-else-if="editorConfig && docsApiReady" class="editor-body">
      <DocumentEditor
        id="onlyoffice-template-editor"
        class="onlyoffice-editor"
        :documentServerUrl="documentServerUrl"
        :config="editorConfig"
        :events_onDocumentReady="onDocumentReady"
        :events_onError="onError"
      />
      <aside v-show="sidebarVisible" class="variable-sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">模板设计指南</span>
          <el-button text size="small" @click="sidebarVisible = false" title="收起侧栏">
            <el-icon><DArrowRight /></el-icon>
          </el-button>
        </div>
        <TemplateVariablePanel
          v-if="connectorAvailable"
          editor-id="onlyoffice-template-editor"
          :editor-ready="editorReady"
        />
        <div v-else class="plugin-hint">
          <section class="hint-section">
            <h4>一、插入变量</h4>
            <ol>
              <li>点击编辑器工具栏的「<b>插件</b>」标签</li>
              <li>点击「<b>标书模板</b>」，编辑器左侧打开变量面板</li>
              <li>光标放到目标位置，点击变量即在光标处插入 <b>[占位控件]</b></li>
            </ol>
            <p>控件显示为灰底文字（如 <b>[企业名称]</b>），内容被锁定防止误改；点中控件按 Delete 可整体删除。材料类控件（营业执照等）插入时会要求填写用途标识（小写英文，如 business_license）。</p>
          </section>

          <section class="hint-section">
            <h4>二、变量类型</h4>
            <ul>
              <li><b>普通变量</b>：项目名称、企业名称、生成日期等，导出时自动替换为真实数据</li>
              <li><b>标书正文</b>：AI 生成的全部章节插入位置，<b>每个模板必须有且仅有一个</b>（或用分册插槽代替）</li>
              <li><b>分册插槽</b>：技术册/商务册/资格册等，只渲染对应角色的章节，用于分册装订</li>
              <li><b>企业材料</b>：营业执照、资质证书等图片，导出时从材料包自动取图</li>
              <li><b>企业 Logo</b>：正文中的 Logo 图片变量</li>
            </ul>
          </section>

          <section class="hint-section">
            <h4>三、页眉动态 Logo（可选）</h4>
            <p>页眉里的 Logo 不能直接插变量，操作如下：</p>
            <ol>
              <li>在页眉插入一张 PNG 占位图，调好位置尺寸</li>
              <li>选中图片 → 右键 → 图片高级设置 → 把「替代文本/说明」设为 <code>bid.image:company.logo</code></li>
              <li>导出时系统会把占位图替换为材料包中 company_logo 材料的真实 Logo</li>
            </ol>
          </section>

          <section class="hint-section">
            <h4>四、排版建议</h4>
            <ul>
              <li>封面、页眉页脚、页边距、字体直接在编辑器里排，导出时原样保留</li>
              <li>标题请用「标题 1/2/3」样式，目录才能识别；目录页码在打开文档后右键目录 →「更新域」刷新</li>
              <li>正文样式由模板控制，AI 内容会自动套用；样式名不一致时到模板详情页「格式规范」里做映射</li>
            </ul>
          </section>

          <section class="hint-section">
            <h4>五、保存与发布</h4>
            <ol>
              <li>编辑器里 Ctrl+S 或关闭页面即自动保存草稿</li>
              <li>回到模板详情页点「<b>校验</b>」：检查变量是否合法、插槽是否齐全，并做一次真实测试渲染</li>
              <li>校验通过后点「<b>发布新版本</b>」——发布会生成封面预览图，版本不可再改</li>
              <li>改错了可对历史版本点「回滚」，草稿恢复后再发布</li>
            </ol>
            <p class="hint-note">注意：没有「标书正文」或分册插槽的模板无法发布。</p>
          </section>
        </div>
      </aside>

      <div
        v-show="!sidebarVisible"
        class="sidebar-collapsed"
        title="展开设计指南"
        @click="sidebarVisible = true"
      >
        <el-icon><DArrowLeft /></el-icon>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Loading, WarningFilled, DArrowLeft, DArrowRight } from '@element-plus/icons-vue'
import { DocumentEditor } from '@onlyoffice/document-editor-vue'
import { getTemplate, getTemplateEditorConfig } from '@/api/bidTemplate'
import type { OnlyofficeConfig } from '@/api/bidDocument'
import TemplateVariablePanel from '@/components/bid-template/TemplateVariablePanel.vue'

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref('')
const templateName = ref('')
const documentServerUrl = ref('')
const editorConfig = ref<OnlyofficeConfig['config'] | null>(null)
const docsApiReady = ref(false)
const editorReady = ref(false)
const connectorAvailable = ref(false)
const sidebarVisible = ref(true)

onMounted(() => {
  loadConfig()
})

function templateId(): number {
  return Number(route.params.id)
}

// 与 WordEditorView 相同：api.js 就绪前不挂载编辑器，失败重试 3 次
function loadDocsApiScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).DocsAPI) {
      resolve()
      return
    }
    document.getElementById('onlyoffice-api-script')?.remove()
    const script = document.createElement('script')
    script.id = 'onlyoffice-api-script'
    script.type = 'text/javascript'
    script.src = `${url}web-apps/apps/api/documents/api.js`
    script.async = true
    script.onload = () => {
      if ((window as any).DocsAPI) resolve()
      else reject(new Error('DocsAPI 未定义'))
    }
    script.onerror = () => reject(new Error('api.js 加载失败'))
    document.body.appendChild(script)
  })
}

async function ensureDocsApi(url: string) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await loadDocsApiScript(url)
      docsApiReady.value = true
      return
    } catch (err) {
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 1000 * attempt))
      } else {
        throw new Error(`ONLYOFFICE 服务（${url}）连接被中断，自动重试 3 次仍失败`)
      }
    }
  }
}

async function loadConfig() {
  loading.value = true
  error.value = ''

  try {
    const id = templateId()
    if (!id) {
      error.value = '缺少模板 ID'
      return
    }

    const [configRes, templateRes] = await Promise.all([
      getTemplateEditorConfig(id),
      getTemplate(id),
    ])
    const data = configRes.data
    templateName.value = templateRes.data.name

    await ensureDocsApi(data.documentServerUrl)

    documentServerUrl.value = data.documentServerUrl
    editorConfig.value = data.config
  } catch (err: unknown) {
    console.error('加载模板编辑器配置失败:', err)
    error.value = formatErrorMessage(err)
  } finally {
    loading.value = false
  }
}

function onDocumentReady() {
  console.log('ONLYOFFICE 模板编辑器加载完成')
  editorReady.value = true
  // Automation API（createConnector）仅商业版提供；社区版走插件面板
  const editor = (window as any).DocEditor?.instances?.['onlyoffice-template-editor']
  connectorAvailable.value = typeof editor?.createConnector === 'function'
}

function onError(errorCode: unknown, errorDescription: unknown) {
  console.error('ONLYOFFICE error:', errorCode, errorDescription)
  error.value = `编辑器错误 (${errorCode}): ${errorDescription}`
}

function goBack() {
  router.push(`/bid-templates/${templateId()}`)
}

function formatErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message
  }
  const e = err as { response?: { status?: number; data?: { error?: string; message?: string } } }
  if (e.response?.status === 404) {
    return '模板不存在或已被删除'
  }
  if (e.response?.status === 403) {
    return '没有模板管理权限'
  }
  if (e.response?.data?.error) {
    return e.response.data.error
  }
  if (e.response?.data?.message) {
    return e.response.data.message
  }
  return '请检查 ONLYOFFICE 服务是否可访问、JWT 密钥是否一致'
}
</script>

<style scoped>
.template-editor-page {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #fff;
  display: flex;
  flex-direction: column;
}

.editor-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  border-bottom: 1px solid #e4e7ed;
  flex-shrink: 0;
}

.editor-header .title {
  font-weight: 600;
}

.editor-header .tip {
  color: #909399;
  font-size: 12px;
}

.loading-box,
.error-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #606266;
}

.loading-box .is-loading {
  font-size: 24px;
  animation: rotate 1s linear infinite;
}

.error-box {
  color: #f56c6c;
}

.error-box .el-icon {
  font-size: 48px;
}

.error-content {
  text-align: center;
}

.error-content h3 {
  margin: 0 0 8px 0;
  color: #303133;
}

.error-content p {
  margin: 0 0 16px 0;
  white-space: pre-line;
  color: #909399;
  font-size: 13px;
  line-height: 1.6;
}

.onlyoffice-editor {
  flex: 1;
  min-height: 0;
}

.editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.editor-body .onlyoffice-editor {
  flex: 1;
  min-width: 0;
}

.variable-sidebar {
  width: 340px;
  flex-shrink: 0;
  border-left: 1px solid #e4e7ed;
  background: #fff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #e4e7ed;
  flex-shrink: 0;
}

.sidebar-title {
  font-weight: 600;
  font-size: 14px;
}

.sidebar-collapsed {
  width: 28px;
  flex-shrink: 0;
  border-left: 1px solid #e4e7ed;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #909399;
}

.sidebar-collapsed:hover {
  background: #ecf5ff;
  color: #409eff;
}

.plugin-hint {
  padding: 12px 16px;
  font-size: 13px;
  color: #606266;
  overflow-y: auto;
  flex: 1;
}

.hint-section {
  margin-bottom: 18px;
}

.hint-section h4 {
  margin: 0 0 8px 0;
  color: #303133;
  font-size: 13px;
}

.plugin-hint ol,
.plugin-hint ul {
  padding-left: 18px;
  line-height: 1.9;
}

.plugin-hint p {
  line-height: 1.8;
  margin-top: 6px;
}

.plugin-hint code {
  background: #f4f4f5;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
}

.hint-note {
  margin-top: 12px;
  padding: 8px;
  background: #fdf6ec;
  color: #e6a23c;
  font-size: 12px;
  border-radius: 4px;
  line-height: 1.6;
}

.template-editor-page :deep(iframe) {
  width: 100% !important;
  height: 100% !important;
  border: none;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
