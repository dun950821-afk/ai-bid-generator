# 标书制作说明对话框 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/projects` 列表页"新建项目"按钮旁新增"标书制作说明"按钮，点击弹出对话框，详细展示 5 阶段标书制作流程（含文件解析 4 个子阶段），并提示流程模板等功能暂未启用。

**Architecture:** 仅前端改动。新增一个独立的 `BidInstructionsDialog.vue` 组件，承载全部静态文案与渲染逻辑；`ProjectListView.vue` 仅新增一个按钮、一个 ref 和组件引用。文案作为静态常量在组件内，无 API 调用。用 vitest + @vue/test-utils 做组件测试，验证按钮触发与对话框渲染。

**Tech Stack:** Vue 3 + TypeScript + Element Plus + @vue/test-utils + vitest + jsdom

## Global Constraints

- 不新增任何 npm 依赖
- 不修改后端、不修改数据库、不修改其他视图
- `QuestionFilled` 图标从 `@element-plus/icons-vue` 导入
- 文案与 `docs/superpowers/specs/2026-07-24-bid-instructions-dialog-design.md` 第 "步骤文案（详细版，定稿）" 一节逐字一致
- 不写 i18n、不写 localStorage"已读"记忆
- 遵循现有代码风格：`<script setup lang="ts">`、SFC scoped 样式

## File Structure

- **Create** `frontend/src/views/projects/components/BidInstructionsDialog.vue` — 对话框组件，全部文案与渲染逻辑
- **Create** `frontend/src/views/projects/components/__tests__/BidInstructionsDialog.spec.ts` — 组件单元测试
- **Modify** `frontend/src/views/projects/ProjectListView.vue` — 新增按钮、ref、组件引用

文案常量内联在组件文件中，避免拆出额外的数据文件增加跳转。

---

## Task 1: 创建 BidInstructionsDialog 组件

**Files:**
- Create: `frontend/src/views/projects/components/BidInstructionsDialog.vue`

**Interfaces:**
- Consumes: 无
- Produces: `BidInstructionsDialog` Vue 组件
  - Props: `{ modelValue: boolean }`
  - Emits: `'update:modelValue': [value: boolean]`
  - 通过 `v-model` 控制显示/隐藏

**Why this task first:** 组件是按钮的依赖，必须先存在；组件自包含、可独立测试。

- [ ] **Step 1: 创建组件文件**

Create `frontend/src/views/projects/components/BidInstructionsDialog.vue`:

```vue
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
```

- [ ] **Step 2: 验证类型与构建**

Run: `cd frontend && npx vue-tsc --noEmit 2>&1 | grep -E "BidInstructionsDialog|error" | head -20`
Expected: 无 BidInstructionsDialog 相关错误（或命令无输出）

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/projects/components/BidInstructionsDialog.vue
git commit -m "feat(projects): 新增标书制作说明对话框组件

静态文案承载 5 阶段流程，含文件解析 4 个子阶段（文档解析/
语义分块/条款抽取/向量嵌入）与底部流程模板提示。v-model 控制
显隐，无 API 调用。"
```

---

## Task 2: 为 BidInstructionsDialog 写组件测试

**Files:**
- Create: `frontend/src/views/projects/components/__tests__/BidInstructionsDialog.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `BidInstructionsDialog` 组件
- Produces: 测试覆盖以下行为：
  - `modelValue=false` 时对话框不显示
  - `modelValue=true` 时对话框显示，且渲染 5 个步骤标题
  - 第 2 步渲染 4 个编号子阶段（含「文档解析」「语义分块」「条款抽取」「向量嵌入」）
  - 渲染底部 hint 文案「流程模板」
  - 点击「我知道了」emit `update:modelValue` 为 `false`

**Why this task:** 验证组件文案与交互行为符合 spec，给后续 ProjectListView 集成提供信心。

- [ ] **Step 1: 创建测试文件**

Create `frontend/src/views/projects/components/__tests__/BidInstructionsDialog.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BidInstructionsDialog from '../BidInstructionsDialog.vue'

describe('BidInstructionsDialog', () => {
  function mountWith(modelValue: boolean) {
    return mount(BidInstructionsDialog, {
      props: { modelValue },
      global: {
        stubs: {
          // 让 el-dialog 透传 default/footer slot 到 DOM，便于断言
          ElDialog: {
            name: 'ElDialog',
            props: ['modelValue'],
            template: `
              <div v-if="modelValue" class="el-dialog-stub">
                <div class="el-dialog__body"><slot /></div>
                <div class="el-dialog__footer"><slot name="footer" /></div>
              </div>
            `,
          },
          ElAlert: { template: '<div class="el-alert-stub"><slot /></div>' },
          ElButton: {
            name: 'ElButton',
            emits: ['click'],
            template: '<button @click="$emit(\'click\')"><slot /></button>',
          },
        },
      },
    })
  }

  it('modelValue=false 时不渲染对话框', () => {
    const wrapper = mountWith(false)
    expect(wrapper.find('.el-dialog-stub').exists()).toBe(false)
  })

  it('modelValue=true 时渲染 5 个步骤', () => {
    const wrapper = mountWith(true)
    const titles = wrapper.findAll('.step-title').map(w => w.text())
    expect(titles).toEqual([
      '招标文件上传',
      'AI 解析文件（核心，最耗时）',
      '大纲生成',
      '内容编辑（最核心写作环节）',
      '导出',
    ])
  })

  it('第 2 步渲染 4 个编号子阶段', () => {
    const wrapper = mountWith(true)
    const orderedItems = wrapper.findAll('.step-card')[1].findAll('.step-ordered li')
    expect(orderedItems).toHaveLength(4)
    const texts = orderedItems.map(li => li.text())
    expect(texts[0]).toContain('文档解析')
    expect(texts[1]).toContain('语义分块')
    expect(texts[2]).toContain('条款抽取')
    expect(texts[3]).toContain('向量嵌入')
  })

  it('渲染底部流程模板提示', () => {
    const wrapper = mountWith(true)
    expect(wrapper.find('.el-alert-stub').text()).toContain('流程模板')
  })

  it('点击「我知道了」emit update:modelValue 为 false', async () => {
    const wrapper = mountWith(true)
    await wrapper.find('.el-dialog__footer button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
  })
})
```

- [ ] **Step 2: 运行测试验证通过**

Run: `cd frontend && npx vitest run src/views/projects/components/__tests__/BidInstructionsDialog.spec.ts`
Expected: 5 passed

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/projects/components/__tests__/BidInstructionsDialog.spec.ts
git commit -m "test(projects): 标书制作说明对话框组件测试

覆盖 5 阶段渲染、文件解析 4 子阶段、底部流程模板提示、
「我知道了」关闭事件。"
```

---

## Task 3: 在 ProjectListView 集成按钮与对话框

**Files:**
- Modify: `frontend/src/views/projects/ProjectListView.vue`

**Interfaces:**
- Consumes: Task 1 的 `BidInstructionsDialog` 组件
- Produces: `/projects` 页 toolbar 出现"标书制作说明"按钮，点击弹出对话框

**Why this task last:** 组件与其测试已就绪，集成只改一处模板与少量脚本，最小破坏面。

- [ ] **Step 1: 修改 template — 在 toolbar-right 新增按钮**

在 `frontend/src/views/projects/ProjectListView.vue` 中找到：

```vue
      <div class="toolbar-right">
        <el-button type="primary" @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon>
          新建项目
        </el-button>
      </div>
```

替换为：

```vue
      <div class="toolbar-right">
        <el-button @click="showInstructions = true">
          <el-icon><QuestionFilled /></el-icon>
          标书制作说明
        </el-button>
        <el-button type="primary" @click="showCreateDialog = true">
          <el-icon><Plus /></el-icon>
          新建项目
        </el-button>
      </div>
```

- [ ] **Step 2: 修改 template — 在新建项目 el-dialog 后追加 BidInstructionsDialog**

在文件中找到新建项目 `el-dialog` 的闭合标签（`</el-dialog>`，约 141 行），在其后追加：

```vue
    <!-- 标书制作说明对话框 -->
    <BidInstructionsDialog v-model="showInstructions" />
```

- [ ] **Step 3: 修改 script — 新增图标导入**

找到：

```ts
import { Search, Plus, User, Folder, Star, Stamp, MoreFilled, View, FolderOpened, Delete } from '@element-plus/icons-vue'
```

替换为：

```ts
import { Search, Plus, User, Folder, Star, Stamp, MoreFilled, View, FolderOpened, Delete, QuestionFilled } from '@element-plus/icons-vue'
```

- [ ] **Step 4: 修改 script — 导入组件**

找到：

```ts
import { useProjectStore } from '@/stores/project'
```

在其上方（import 区块内，紧跟其他组件/接口 import）新增：

```ts
import BidInstructionsDialog from './components/BidInstructionsDialog.vue'
```

- [ ] **Step 5: 修改 script — 新增 ref**

找到：

```ts
// 新建项目
const showCreateDialog = ref(false)
```

在其上方新增：

```ts
// 标书制作说明
const showInstructions = ref(false)
```

- [ ] **Step 6: 验证类型检查**

Run: `cd frontend && npx vue-tsc --noEmit 2>&1 | grep -E "ProjectListView|error" | head -20`
Expected: 无 ProjectListView 相关错误

- [ ] **Step 7: 运行现有测试确保无回归**

Run: `cd frontend && npx vitest run 2>&1 | tail -20`
Expected: 全部测试通过（含 Task 2 新增的 5 个）

- [ ] **Step 8: 验证前端构建**

Run: `cd frontend && npm run build 2>&1 | tail -10`
Expected: 构建成功，无报错

- [ ] **Step 9: Commit**

```bash
git add frontend/src/views/projects/ProjectListView.vue
git commit -m "feat(projects): 项目列表页集成标书制作说明按钮

在「新建项目」按钮左侧新增「标书制作说明」按钮，
点击弹出对话框展示 5 阶段流程与流程模板提示。"
```

---

## Task 4: 手动验证（部署前）

**Why this task:** UI 改动需在真实浏览器验证，类型检查与单元测试无法覆盖视觉与交互细节。

- [ ] **Step 1: 启动 dev server**

Run: `cd frontend && npm run dev`
Expected: Vite 启动，监听默认端口（通常 5173）

- [ ] **Step 2: 浏览器验证清单**

打开浏览器访问 dev server URL，登录后访问 `/projects`，逐项确认：

- "新建项目"按钮**左侧**出现"标书制作说明"按钮（带问号图标）
- 点击"标书制作说明"弹出对话框，标题为"标书制作流程说明"
- 对话框内 5 个步骤卡按顺序显示：① 招标文件上传 / ② AI 解析文件（核心，最耗时）/ ③ 大纲生成 / ④ 内容编辑（最核心写作环节）/ ⑤ 导出
- 第 2 步含 4 项编号列表：文档解析 / 语义分块 / 条款抽取 / 向量嵌入，且每项有加粗的子阶段名
- 第 4 步含 6 项圆点列表，包括"生成准备""生成内容责任矩阵""批量生成 / 单章生成""废标检查""一致性审计"与"生成 Word"
- 底部黄色 alert 显示提示文案，包含"流程模板""企业材料""知识库"
- 点击底部"我知道了"按钮关闭对话框
- 再次点击"标书制作说明"按钮可重新打开
- 点击"新建项目"按钮仍正常弹出新建项目对话框（无回归）
- 浏览器控制台无报错

- [ ] **Step 3: 关闭 dev server**

停止 dev server（Ctrl+C）。

（本任务无 commit，手动验证步骤。）

---

## Self-Review 结果

**1. Spec coverage:**
- ✅ 按钮位置在"新建项目"左侧 → Task 3 Step 1
- ✅ 对话框标题、副标题、5 步骤卡 → Task 1
- ✅ 第 2 步 4 个编号子阶段 → Task 1 STEPS[1].ordered
- ✅ 第 4 步 6 项 bullet（生成准备/矩阵/批量生成/废标检查/一致性审计/生成 Word）→ Task 1 STEPS[3].bullets
- ✅ 底部流程模板 hint → Task 1 el-alert
- ✅ "我知道了"按钮关闭 → Task 1 footer + Task 2 测试
- ✅ 视觉细节（圆形序号徽章、卡片背景、编号/圆点列表、max-height 70vh）→ Task 1 样式
- ✅ 不做 localStorage、不做 i18n、不新增依赖 → Global Constraints

**2. Placeholder scan:** 无 TODO/TBD，每个步骤都有完整代码或具体命令。

**3. Type consistency:**
- 组件 props `modelValue: boolean`、emits `update:modelValue` → Task 2 测试用 `modelValue` 与监听 `update:modelValue`，一致
- `Step` 接口字段 `no/title/summary/bullets/ordered` → Task 1 模板使用一致
- `v-model="showInstructions"` → ref 在 Task 3 Step 5 定义为 `const showInstructions = ref(false)`，命名一致

无问题，计划可执行。
