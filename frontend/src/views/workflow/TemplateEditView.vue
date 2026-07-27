<!-- frontend/src/views/workflow/TemplateEditView.vue -->
<template>
  <div class="template-edit" v-loading="loading">
    <div class="edit-header">
      <div class="header-left">
        <el-button link @click="router.back()">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <h2>{{ template?.name }}</h2>
        <el-tag v-if="template?.is_builtin" size="small" type="primary">内置模板</el-tag>
        <el-tag v-if="!template?.is_active" size="small" type="danger">已禁用</el-tag>
      </div>
      <div class="header-right">
        <template v-if="!template?.is_builtin">
          <el-button @click="showEditDialog = true">编辑信息</el-button>
          <el-button type="primary" @click="handleSave">保存</el-button>
        </template>
        <template v-else>
          <el-button type="primary" @click="handleCopy">克隆为新模板</el-button>
        </template>
      </div>
    </div>

    <div class="edit-content">
      <!-- 左侧节点列表 -->
      <div class="node-panel">
        <div class="panel-header">
          <h3>节点列表</h3>
          <el-button
            v-if="!template?.is_builtin"
            type="primary"
            size="small"
            @click="showAddNodeDialog = true"
          >
            <el-icon><Plus /></el-icon>
            添加节点
          </el-button>
        </div>
        <div class="node-list">
          <el-menu :default-active="String(selectedNodeId)" @select="handleSelectNode">
            <el-menu-item
              v-for="node in nodes"
              :key="node.id"
              :index="String(node.id)"
            >
              <div class="node-item">
                <div class="node-info">
                  <el-tag :type="getNodeTypeTag(node.visual_type)" size="small">
                    {{ getNodeTypeLabel(node.visual_type) }}
                  </el-tag>
                  <span class="node-name">{{ node.name }}</span>
                </div>
                <div class="node-actions" v-if="!template?.is_builtin" @click.stop>
                  <el-button
                    v-if="node.order > 1"
                    type="primary"
                    link
                    size="small"
                    @click="handleMoveNode(node, 'up')"
                  >
                    <el-icon><ArrowUp /></el-icon>
                  </el-button>
                  <el-button
                    v-if="node.order < nodes.length"
                    type="primary"
                    link
                    size="small"
                    @click="handleMoveNode(node, 'down')"
                  >
                    <el-icon><ArrowDown /></el-icon>
                  </el-button>
                  <el-button
                    type="danger"
                    link
                    size="small"
                    @click="handleDeleteNode(node)"
                  >
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
            </el-menu-item>
          </el-menu>
        </div>
      </div>

      <!-- 中间画布预览 -->
      <div class="canvas-panel">
        <h3>流程预览</h3>
        <div class="canvas-container">
          <div class="flow-preview">
            <div
              v-for="(node, index) in nodes"
              :key="node.id"
              class="flow-node"
              :class="{ active: selectedNodeId === node.id }"
              @click="selectedNodeId = node.id"
            >
              <div class="node-icon" :class="node.visual_type">
                <el-icon v-if="node.visual_type === 'manual'"><Edit /></el-icon>
                <el-icon v-else-if="node.visual_type === 'data'"><DataLine /></el-icon>
                <el-icon v-else-if="node.visual_type === 'ai'"><MagicStick /></el-icon>
                <el-icon v-else-if="node.visual_type === 'approval'"><CircleCheck /></el-icon>
                <el-icon v-else><Setting /></el-icon>
              </div>
              <div class="node-content">
                <span class="node-title">{{ node.name }}</span>
                <span class="node-type">{{ getNodeTypeLabel(node.visual_type) }}</span>
              </div>
              <div v-if="index < nodes.length - 1" class="node-arrow">
                <el-icon><ArrowRight /></el-icon>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧节点配置 -->
      <div class="config-panel">
        <h3>节点配置</h3>
        <div v-if="selectedNode" class="node-config">
          <el-form label-width="100px">
            <el-form-item label="节点名称">
              <el-input
                v-model="selectedNode.name"
                :disabled="template?.is_builtin"
                @change="handleNodeChange"
              />
            </el-form-item>
            <el-form-item label="节点类型">
              <el-select
                v-model="selectedNode.visual_type"
                :disabled="template?.is_builtin"
                @change="handleNodeTypeChange"
              >
                <el-option label="手动节点" value="manual" />
                <el-option label="数据节点" value="data" />
                <el-option label="AI 节点" value="ai" />
                <el-option label="审批节点" value="approval" />
                <el-option label="系统节点" value="system" />
              </el-select>
            </el-form-item>
            <el-form-item label="负责人类型">
              <el-select
                v-model="selectedNode.default_assignee_type"
                :disabled="template?.is_builtin"
                @change="handleNodeChange"
              >
                <el-option label="系统" value="system" />
                <el-option label="角色" value="role" />
                <el-option label="用户" value="user" />
              </el-select>
            </el-form-item>
            <el-form-item label="负责人角色" v-if="selectedNode.default_assignee_type === 'role'">
              <el-input
                v-model="selectedNode.default_assignee_role"
                :disabled="template?.is_builtin"
                @change="handleNodeChange"
                placeholder="角色编码"
              />
            </el-form-item>
            <el-form-item label="需要审批">
              <el-switch
                v-model="selectedNode.requires_approval"
                :disabled="template?.is_builtin"
                @change="handleNodeChange"
              />
            </el-form-item>
            <el-form-item label="预估工时">
              <el-input-number
                v-model="selectedNode.estimated_hours"
                :disabled="template?.is_builtin"
                :min="0"
                :step="0.5"
                @change="handleNodeChange"
              />
            </el-form-item>
            <el-form-item label="节点说明">
              <el-input
                v-model="selectedNode.description"
                type="textarea"
                :rows="3"
                :disabled="template?.is_builtin"
                @change="handleNodeChange"
              />
            </el-form-item>
          </el-form>
        </div>
        <el-empty v-else description="请选择节点" />
      </div>
    </div>

    <!-- 编辑模板信息弹窗 -->
    <el-dialog v-model="showEditDialog" title="编辑模板信息" width="500px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="模板名称">
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item label="模板描述">
          <el-input v-model="editForm.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleUpdateInfo">保存</el-button>
      </template>
    </el-dialog>

    <!-- 添加节点弹窗 -->
    <el-dialog v-model="showAddNodeDialog" title="添加节点" width="500px">
      <el-form ref="nodeFormRef" :model="nodeForm" :rules="nodeFormRules" label-width="100px">
        <el-form-item label="节点名称" prop="name">
          <el-input v-model="nodeForm.name" />
        </el-form-item>
        <el-form-item label="节点类型" prop="visual_type">
          <el-select v-model="nodeForm.visual_type">
            <el-option label="手动节点" value="manual" />
            <el-option label="数据节点" value="data" />
            <el-option label="AI 节点" value="ai" />
            <el-option label="审批节点" value="approval" />
            <el-option label="系统节点" value="system" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人类型">
          <el-select v-model="nodeForm.default_assignee_type">
            <el-option label="系统" value="system" />
            <el-option label="角色" value="role" />
            <el-option label="用户" value="user" />
          </el-select>
        </el-form-item>
        <el-form-item label="需要审批">
          <el-switch v-model="nodeForm.requires_approval" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddNodeDialog = false">取消</el-button>
        <el-button type="primary" :loading="addingNode" @click="handleAddNode">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft, Plus, ArrowUp, ArrowDown, Delete, Edit, DataLine,
  MagicStick, CircleCheck, Setting, ArrowRight
} from '@element-plus/icons-vue'
import { workflowApi, type WorkflowTemplate, type WorkflowNodeTemplate } from '@/api/workflow'
import type { FormInstance, FormRules } from 'element-plus'

const route = useRoute()
const router = useRouter()

const templateId = computed(() => Number(route.params.id))
const loading = ref(false)
const saving = ref(false)
const template = ref<WorkflowTemplate | null>(null)
const nodes = ref<WorkflowNodeTemplate[]>([])
const selectedNodeId = ref<number | null>(null)
const hasChanges = ref(false)

const showEditDialog = ref(false)
const editForm = ref({ name: '', description: '' })

const showAddNodeDialog = ref(false)
const addingNode = ref(false)
const nodeFormRef = ref<FormInstance>()
const nodeForm = ref({
  name: '',
  visual_type: 'data',
  default_assignee_type: 'system',
  requires_approval: false,
})

const nodeFormRules: FormRules = {
  name: [{ required: true, message: '请输入节点名称', trigger: 'blur' }],
  visual_type: [{ required: true, message: '请选择节点类型', trigger: 'change' }],
}

const selectedNode = computed(() => {
  return nodes.value.find(n => n.id === selectedNodeId.value) || null
})

async function loadTemplate() {
  loading.value = true
  try {
    const res = await workflowApi.getTemplate(templateId.value)
    template.value = res.data
    nodes.value = res.data.nodes || []
    if (nodes.value.length > 0 && !selectedNodeId.value) {
      selectedNodeId.value = nodes.value[0].id
    }
    editForm.value = {
      name: template.value.name,
      description: template.value.description || '',
    }
  } catch (err: any) {
    ElMessage.error('加载模板失败')
    router.push('/workflows/templates')
  } finally {
    loading.value = false
  }
}

function handleSelectNode(id: string) {
  selectedNodeId.value = Number(id)
}

function getNodeTypeLabel(type: string) {
  const map: Record<string, string> = {
    manual: '手动',
    data: '数据',
    ai: 'AI',
    approval: '审批',
    system: '系统',
  }
  return map[type] || type
}

function getNodeTypeTag(type: string) {
  const map: Record<string, string> = {
    manual: 'warning',
    data: 'info',
    ai: 'success',
    approval: 'danger',
    system: '',
  }
  return map[type] || 'info'
}

function handleNodeChange() {
  hasChanges.value = true
}

async function handleNodeTypeChange() {
  // 根据节点类型自动设置负责人类型
  if (selectedNode.value) {
    const type = selectedNode.value.visual_type
    if (type === 'manual') {
      selectedNode.value.default_assignee_type = 'user'
    } else if (type === 'approval') {
      selectedNode.value.default_assignee_type = 'user'
      selectedNode.value.requires_approval = true
    } else {
      selectedNode.value.default_assignee_type = 'system'
    }
  }
  hasChanges.value = true
}

async function handleSave() {
  if (!hasChanges.value) {
    ElMessage.info('没有需要保存的更改')
    return
  }

  saving.value = true
  try {
    // 保存所有节点更改
    for (const node of nodes.value) {
      await workflowApi.updateNode(templateId.value, node.id, {
        name: node.name,
        default_assignee_type: node.default_assignee_type,
        default_assignee_role: node.default_assignee_role,
        requires_approval: node.requires_approval,
        estimated_hours: node.estimated_hours,
        description: node.description,
      })
    }
    ElMessage.success('保存成功')
    hasChanges.value = false
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleUpdateInfo() {
  saving.value = true
  try {
    await workflowApi.updateTemplate(templateId.value, editForm.value)
    if (template.value) {
      template.value.name = editForm.value.name
      template.value.description = editForm.value.description
    }
    ElMessage.success('模板信息已更新')
    showEditDialog.value = false
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '更新失败')
  } finally {
    saving.value = false
  }
}

async function handleCopy() {
  try {
    const res = await workflowApi.copyTemplate(templateId.value)
    ElMessage.success('模板已克隆')
    router.push(`/workflows/templates/${res.data.id}`)
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '克隆失败')
  }
}

async function handleMoveNode(node: WorkflowNodeTemplate, direction: 'up' | 'down') {
  const index = nodes.value.findIndex(n => n.id === node.id)
  if (index === -1) return

  const swapIndex = direction === 'up' ? index - 1 : index + 1
  if (swapIndex < 0 || swapIndex >= nodes.value.length) return

  // 交换顺序
  const reorderData = [
    { id: node.id, order: nodes.value[swapIndex].order },
    { id: nodes.value[swapIndex].id, order: node.order },
  ]

  try {
    await workflowApi.reorderNodes(templateId.value, reorderData)
    // 本地交换
    const temp = nodes.value[index].order
    nodes.value[index].order = nodes.value[swapIndex].order
    nodes.value[swapIndex].order = temp
    nodes.value.sort((a, b) => a.order - b.order)
    ElMessage.success('节点顺序已调整')
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '调整失败')
  }
}

async function handleDeleteNode(node: WorkflowNodeTemplate) {
  await ElMessageBox.confirm(`确定要删除节点 ${node.name} 吗？`, '删除确认', { type: 'warning' })

  try {
    await workflowApi.deleteNode(templateId.value, node.id)
    nodes.value = nodes.value.filter(n => n.id !== node.id)
    // 重新排序
    nodes.value.forEach((n, i) => { n.order = i + 1 })
    if (selectedNodeId.value === node.id) {
      selectedNodeId.value = nodes.value[0]?.id || null
    }
    ElMessage.success('节点已删除')
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '删除失败')
  }
}

async function handleAddNode() {
  if (!nodeFormRef.value) return
  const valid = await nodeFormRef.value.validate().catch(() => false)
  if (!valid) return

  addingNode.value = true
  try {
    const res = await workflowApi.addNode(templateId.value, {
      name: nodeForm.value.name,
      order: nodes.value.length + 1,
      visual_type: nodeForm.value.visual_type,
      default_assignee_type: nodeForm.value.default_assignee_type,
      requires_approval: nodeForm.value.requires_approval,
    })
    nodes.value.push(res.data)
    selectedNodeId.value = res.data.id
    showAddNodeDialog.value = false
    nodeForm.value = {
      name: '',
      visual_type: 'data',
      default_assignee_type: 'system',
      requires_approval: false,
    }
    ElMessage.success('节点已添加')
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '添加失败')
  } finally {
    addingNode.value = false
  }
}

onMounted(() => {
  loadTemplate()
})
</script>

<style scoped>
/* 页面容器禁止横向溢出 */
.template-edit {
  width: 100%;
  max-width: 100%;
  height: calc(100vh - 100px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 20px;
}

.edit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h2 {
  margin: 0;
}

.header-right {
  display: flex;
  gap: 8px;
}

/* 三栏 Grid 布局 */
.edit-content {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 320px;
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 左侧节点列表 */
.node-panel {
  background: #fff;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color);
  flex-shrink: 0;
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
}

.node-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.node-list .el-menu {
  border-right: none;
}

.node-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.node-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.node-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

/* 中间画布区域 */
.canvas-panel {
  background: #fff;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.canvas-panel h3 {
  margin: 0;
  padding: 12px 16px;
  font-size: 14px;
  border-bottom: 1px solid var(--el-border-color);
  flex-shrink: 0;
}

.canvas-container {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: #f5f7fb;
  border-radius: 8px;
  margin: 12px;
}

.flow-preview {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 16px;
  padding: 16px;
  min-width: min-content;
}

.flow-node {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  background: #fff;
  border: 2px solid var(--el-border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  width: 160px;
  min-width: 160px;
}

.flow-node:hover,
.flow-node.active {
  border-color: var(--el-color-primary);
}

.flow-node.active {
  box-shadow: 0 0 8px rgba(64, 158, 255, 0.3);
}

.node-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
  font-size: 16px;
  color: #fff;
  flex-shrink: 0;
}

.node-icon.manual { background: #e6a23c; }
.node-icon.data { background: #909399; }
.node-icon.ai { background: #67c23a; }
.node-icon.approval { background: #f56c6c; }
.node-icon.system { background: #409eff; }

.node-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.node-title {
  font-weight: 500;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-type {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.node-arrow {
  padding: 0 8px;
  color: var(--el-text-color-secondary);
}

/* 右侧配置面板 */
.config-panel {
  background: #fff;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.config-panel h3 {
  margin: 0;
  padding: 12px 16px;
  font-size: 14px;
  border-bottom: 1px solid var(--el-border-color);
  flex-shrink: 0;
}

.node-config {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.node-config :deep(.el-form-item) {
  margin-bottom: 16px;
}

.node-config :deep(.el-form-item__label) {
  font-size: 13px;
}

/* 小屏适配：隐藏右侧配置面板 */
@media (max-width: 1400px) {
  .edit-content {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .config-panel {
    display: none;
  }
}

@media (max-width: 900px) {
  .edit-content {
    grid-template-columns: 1fr;
  }

  .node-panel {
    display: none;
  }
}
</style>