<!-- frontend/src/views/workflow/WorkflowCanvas.vue -->
<template>
  <div class="workflow-canvas">
    <VueFlow
      v-model:nodes="flowNodes"
      v-model:edges="flowEdges"
      :node-types="nodeTypes"
      :default-viewport="{ zoom: 1, x: 0, y: 0 }"
      :min-zoom="0.5"
      :max-zoom="2"
      fit-view-on-init
      @node-click="onNodeClick"
    >
      <Background />
      <Controls />
      <MiniMap />
    </VueFlow>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw } from 'vue'
import { VueFlow, type Node, type Edge } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

import DataNode from './components/nodes/DataNode.vue'
import ApprovalNode from './components/nodes/ApprovalNode.vue'
import AINode from './components/nodes/AINode.vue'
import ManualNode from './components/nodes/ManualNode.vue'
import SystemNode from './components/nodes/SystemNode.vue'
import type { WorkflowNodeInstance } from '@/api/workflow'

const props = defineProps<{
  nodes: WorkflowNodeInstance[]
  selectedNodeId: number | null
}>()

const emit = defineEmits<{
  (e: 'select', nodeId: number): void
}>()

// 节点类型映射
const nodeTypes = {
  data: markRaw(DataNode),
  approval: markRaw(ApprovalNode),
  ai: markRaw(AINode),
  manual: markRaw(ManualNode),
  system: markRaw(SystemNode),
}

// 转换为 Vue Flow 节点
const flowNodes = computed<Node[]>(() => {
  return props.nodes.map((node, index) => ({
    id: String(node.id),
    type: node.visual_type || 'data',
    position: { x: 100, y: index * 120 },
    data: {
      label: node.name,
      status: node.status,
      progress: node.progress,
      approval_status: node.approval_status,
    },
    selected: props.selectedNodeId === node.id,
  }))
})

// 生成边（按顺序连接）
const flowEdges = computed<Edge[]>(() => {
  const edges: Edge[] = []
  for (let i = 0; i < props.nodes.length - 1; i++) {
    edges.push({
      id: `e-${props.nodes[i].id}-${props.nodes[i + 1].id}`,
      source: String(props.nodes[i].id),
      target: String(props.nodes[i + 1].id),
      animated: props.nodes[i].status === 'in_progress',
      style: getEdgeStyle(props.nodes[i].status),
    })
  }
  return edges
})

function getEdgeStyle(status: string) {
  if (status === 'completed') {
    return { stroke: '#67c23a', strokeWidth: 2 }
  }
  if (status === 'failed') {
    return { stroke: '#f56c6c', strokeWidth: 2 }
  }
  return { stroke: '#c0c4cc', strokeWidth: 2 }
}

function onNodeClick(_: MouseEvent, node: Node) {
  emit('select', Number(node.id))
}
</script>

<style scoped>
.workflow-canvas {
  width: 100%;
  height: 100%;
}

:deep(.vue-flow) {
  background: #f5f7fa;
}
</style>