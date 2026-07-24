<template>
  <el-dialog
    :model-value="modelValue"
    title="标书制作流程说明"
    width="640px"
    destroy-on-close
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="bid-instructions">
      <p class="subtitle">从上传招标文件到导出标书正文，共 5 个阶段</p>

      <div v-for="step in STEPS" :key="step.no" class="step-card">
        <div class="step-head">
          <span class="step-no">{{ step.no }}</span>
          <span class="step-title">{{ step.title }}</span>
        </div>
        <p v-if="step.summary" class="step-summary">{{ step.summary }}</p>

        <ol v-if="step.ordered?.length" class="step-ordered">
          <li v-for="(line, idx) in step.ordered" :key="idx" v-html="line" />
        </ol>

        <ul v-if="step.bullets?.length" class="step-bullets">
          <li v-for="(line, idx) in step.bullets" :key="idx" v-html="line" />
        </ul>
      </div>

      <el-alert
        class="hint"
        type="warning"
        :closable="false"
        show-icon
      >
        <template #default>
          当前「流程模板」「企业材料」「知识库」等功能尚在完善，创建项目时<strong>流程模板可任选一个内置模板</strong>，不影响上述标书制作流程。
        </template>
      </el-alert>
    </div>

    <template #footer>
      <el-button type="primary" @click="emit('update:modelValue', false)">
        我知道了
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
interface Step {
  no: number
  title: string
  summary?: string
  bullets?: string[]
  ordered?: string[]
}

const STEPS: Step[] = [
  {
    no: 1,
    title: '招标文件上传',
    summary: '把招标文件（PDF / Word）传到对应标段下。',
    bullets: [
      '在标段工作台第 1 步点击上传，支持多文件',
      '上传后会自动进入“文件解析”阶段，无需手动触发',
      '若同一标段有多份招标文件（澄清、补遗），全部上传即可',
    ],
  },
  {
    no: 2,
    title: 'AI 解析文件（核心，最耗时）',
    summary: '系统会自动对每份招标文件依次执行 4 个子阶段，每完成一个会实时刷新状态：',
    ordered: [
      '<strong>文档解析</strong>：把 PDF/Word 转为可读文本与结构（约 0–35%）',
      '<strong>语义分块</strong>：把长文档切成可检索的语义段落（35–65%）',
      '<strong>条款抽取</strong>：自动识别 6 类关键条款——评分项、废标项、资质要求、商务要求、技术要求、投标文件要求（65–95%）',
      '<strong>向量嵌入</strong>：把分块写入向量库，供后续生成时检索引用（95–100%）',
    ],
    bullets: [
      '整个过程通常需要 1–3 分钟，取决于文件大小',
      '任一子阶段失败可点「重试」，无需重新上传',
      '解析进度条会实时显示当前阶段与百分比',
    ],
  },
  {
    no: 3,
    title: '大纲生成',
    summary: '基于解析出的条款，生成投标文件大纲骨架。',
    bullets: [
      '进入标段工作台第 3 步，选择「AI 解析大纲」模式',
      '选择已解析的招标文件，点击「创建大纲」',
      '系统调用 AI 生成章节目录（可后续手动增删、调整）',
      '一个标段可创建多个版本大纲，需点「设为当前」指定主版本',
    ],
  },
  {
    no: 4,
    title: '内容编辑（最核心写作环节）',
    summary: '进入大纲详情页，逐章生成并打磨正文。',
    bullets: [
      '<strong>生成准备</strong>（弹窗内完成）：创建材料包、关联知识库、触发「全局事实变量」抽取——这一步决定 AI 生成内容的准确性，<strong>必须先做</strong>',
      '<strong>生成内容责任矩阵</strong>：为每个章节定义写作边界与生成策略',
      '<strong>批量生成 / 单章生成</strong>：AI 按矩阵生成正文，可单章「AI 生成」或一键「批量生成」',
      '<strong>废标检查</strong>：扫描正文是否触犯废标条款（投标方必做）',
      '<strong>一致性审计</strong>：检查全文术语、数据、口径一致性',
      '全部章节就绪后点「生成 Word」产出投标文件',
    ],
  },
  {
    no: 5,
    title: '导出',
    summary: '在标段工作台第 5 步查看与下载投标文件。',
    bullets: [
      '点击「打开编辑器」用 ONLYOFFICE 在线编辑/复核',
      '满意后下载最终 Word 文档',
    ],
  },
]
</script>

<style scoped>
.bid-instructions {
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 4px;
}

.subtitle {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.step-card {
  background: var(--el-bg-color-page);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
}

.step-card:last-of-type {
  margin-bottom: 16px;
}

.step-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.step-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.step-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.step-summary {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
}

.step-ordered,
.step-bullets {
  margin: 4px 0 0;
  padding-left: 20px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.8;
}

.step-ordered {
  list-style: decimal;
}

.step-bullets {
  list-style: disc;
}

.step-ordered li,
.step-bullets li {
  margin-bottom: 2px;
}

.step-ordered :deep(strong),
.step-bullets :deep(strong) {
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.hint {
  margin-top: 4px;
}
</style>
