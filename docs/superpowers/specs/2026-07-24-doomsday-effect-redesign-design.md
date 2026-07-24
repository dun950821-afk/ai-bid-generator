# 「累了毁灭吧」动效重构 Spec

**日期：** 2026-07-24
**状态：** 待审查

## 1. 背景与动机

`DoomsdayButton.vue` + `doomsdayEffect.ts` 当前实现存在以下问题导致"low"观感：

1. **粒子质感差**：DOM span 文字粒子 + CSS transition，700 个粒子超过 1500 即卡顿，无法实现真实「像素级分解」
2. **编排节奏乱**：5 阶段时间线过渡硬切，该慢的不慢该快的不快，缺乏电影级镜头感
3. **不够震撼**：DOM 粒子无法覆盖非文字元素（图片/按钮/卡片），冲击波过小，缺奇点吸积与坍缩视觉
4. **视觉风格单一**：红色警告 + 火烬过于卡通，与电影级"灭霸响指"目标差距大

本 spec 描述如何用 html2canvas + Canvas 2D 粒子系统完全重构，实现电影级坍缩效果。

## 2. 目标

- 用 html2canvas 截图整个 `#app`，把位图切成 8×8 像素方块
- Canvas 2D 粒子系统驱动 32k 粒子沿弧线吸入按钮位置奇点
- 7 阶段电影级编排，总时长 15s，节奏"慢→快→爆→缓"
- 固定 Tier 1 性能档（无降级），高端机流畅运行
- 完整错误处理 + 幂等 cleanup，任何路径都不卡住用户工作流
- 完整单元测试覆盖

## 3. 范围

**包含：**

- 重写 `DoomsdayButton.vue` 与 `doomsdayEffect.ts`
- 新增 `html2canvas` 依赖
- 7 阶段时间线 + Canvas 粒子系统
- 完整 vitest 单测

**不包含：**

- 性能降级策略（固定 Tier 1，不检测设备性能）
- WebGL/Three.js 实现（Canvas 2D 已够）
- 音效与触觉反馈（纯视觉）
- 移动端适配（按钮在桌面端 header）
- 用户手动选择性能档
- 国际化（沿用现有中文）

## 4. 关键决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 渲染技术 | A. html2canvas + Canvas 2D | 电影级效果 + 中等依赖 + 跨设备稳定 |
| 像素粒度 | A. 8×8 px 固定 | 32k 粒子 Canvas 甜蜜区，视觉细腻 |
| 中心点定位 | A. 按钮位置 | 触发点与坍缩点因果一致 |
| 编排节奏 | A. 7 阶段电影级，15s | 慢→快→爆→缓三幕结构 |
| 用户体验收尾 | A. 自动还原 + 重启按钮 | 戏剧感 + 用户控制权平衡 |
| 截图范围 | A. 全 #app | 视觉完整性最高 |
| 降级策略 | B. 固定 Tier 1 | 简化实现，所有设备一致 |
| 错误处理 | A. 防御性边界 | 彩蛋不能破坏工作流 |

## 5. 架构与文件结构

```
frontend/src/components/fun/
├── DoomsdayButton.vue          # 按钮 UI + 触发器（重写）
├── doomsdayEffect.ts           # 删除（被 doomsday/ 目录替代）
└── doomsday/
    ├── index.ts                # createDoomsdayEffect 公共入口
    ├── types.ts                # DoomsdayOptions / DoomsdayController 类型
    ├── screenshot.ts           # html2canvas 截图 + DOM 冻结/解冻
    ├── particleCanvas.ts      # Canvas 2D 粒子系统（绘制 + 物理）
    ├── stages.ts               # 7 阶段时间线编排（timer 调度）
    ├── visuals.ts              # 警告横幅 / 吸积盘 / 闪屏 / 余烬 DOM 节点
    └── cleanup.ts              # 幂等 cleanup（timer/DOM/事件监听全清理）
```

**依赖**：

- 新增 `html2canvas`：~50KB gzip
- 现有 `element-plus` 的 `ElMessage` 复用

**公共接口**：

```typescript
// doomsday/index.ts
export interface DoomsdayOptions {
  rootSelector?: string         // 默认 '#app'
  duration?: number             // 默认 15000
  originX?: number              // 默认按钮中心
  originY?: number
  onStageChange?: (stage: number) => void  // 可选，调试/埋点
}

export interface DoomsdayController {
  run(): Promise<void>           // 返回 Promise，动画完成时 resolve
  cancel(): void                 // 立即取消并还原
  cleanup(): void                // 幂等清理
}

export function createDoomsdayEffect(options: DoomsdayOptions): DoomsdayController
```

**职责分离**：

- `screenshot.ts` 只负责截图与 DOM 冻结，不知道后续阶段
- `particleCanvas.ts` 只负责粒子绘制与物理，不知道整体编排
- `stages.ts` 只负责调度 timer，不实现具体视觉
- `visuals.ts` 只创建/销毁视觉 DOM 节点
- `cleanup.ts` 收集所有可清理资源做幂等清理

每个文件 100-200 行，可独立测试。

## 6. 7 阶段时间线

**总时长 15s，固定 7 阶段**：

```
阶段 0  冻结       [0       - 200ms  ]    200ms
阶段 1  警告       [200     - 2500ms ]   2300ms（酝酿 dread）
阶段 2  奇点诞生   [2500    - 3500ms ]   1000ms（缓慢成形）
阶段 3  像素分解   [3500    - 4500ms ]   1000ms（淡入出现）
阶段 4  坍缩吸入   [4500    - 12000ms]   7500ms（主菜，慢动作）
阶段 5  闪屏       [12000   - 12100ms]    100ms（爆闪）
阶段 6  黑屏余烬   [12100   - 15000ms]   2900ms（缓收尾）
```

### 阶段 0：冻结 (0-200ms)

- 显示屏幕中心 loading 光圈（CSS 旋转圆环）
- 调用 `html2canvas(#app, { backgroundColor: null, scale: 1, useCORS: true, logging: false })`
- 截图完成后立即把 `#app` 设为 `visibility: hidden`（保留布局，避免重排）
- 截图失败 → catch → 跳到阶段 5（简化路径）

### 阶段 1：警告 (200-2500ms)

- 按钮位置出现红色脉冲圆环（半径从 0 扩张到 80px，循环 3 次）
- 全屏轻微震动（translate 1px，6Hz 频率）
- 顶部黄色警告横幅滑入：「⚠ 毁灭程序已启动，倒计时 2.3s」
- 横幅每 100ms 更新倒计时数字（戏剧化焦虑感）

### 阶段 2：奇点诞生 (2500-3500ms)

- 按钮位置出现白色亮点（10ms 内 opacity 0→1）
- 亮点扩张为紫色吸积盘（径向渐变：白→紫→深蓝→透明）
- 吸积盘缓慢旋转（10s/圈，逆时针）
- 周围出现微弱引力扭曲（CSS filter: blur + radial-gradient 模拟）
- 警告横幅淡出

### 阶段 3：像素分解 (3500-4500ms)

- Canvas 元素全屏覆盖，z-index: 999999
- 把截图切成 8×8 像素方块（1920×1080 ≈ 32,400 块）
- 每个方块记录原始位置 (x, y) 和颜色 (r, g, b, a)
- 500ms 内方块从透明渐现到完整不透明（淡入式出现）
- 同时全屏轻微缩放（scale 1 → 0.98，营造"被吸引"感）

### 阶段 4：坍缩吸入 (4500-12000ms，7.5s 主菜)

- 每个粒子沿**弧线轨迹**飞向奇点（不是直线，弧线更有美感）
- 物理参数：
  - 初始速度：朝奇点方向 + 随机偏角 ±30°，速度降低 30%
  - 加速度：随距离奇点减小而增大（引力模拟），曲线更平缓（前期慢、后期快）
  - 旋转：每粒子自旋 3-12 圈，方向随机
  - 缩放：接近奇点时缩小到 0.05（被压得更碎）
  - 透明度：距离奇点 < 50px 时快速淡出
- 粒子到达奇点时触发"吸收"特效：奇点短暂亮一下 + 微小冲击环
- 奇点本身缓慢扩张（半径 30px → 120px），颜色从白→紫→黑
- 7.5s 内约 95% 粒子被吸入，剩余 5% 在阶段 5 闪屏时强制清空

### 阶段 5：闪屏 (12000-12100ms，100ms)

- 白色全屏闪光（opacity 0→1→0，各 30ms + 40ms 间隔）
- 同时全屏强震（translate 8px，随机方向，10Hz）
- 奇点最终爆发：紫色光球半径从 120px 扩张到全屏，再瞬间消失
- 所有剩余粒子瞬间消失（不是淡出，是"湮灭"）
- 截图 Canvas 移除

### 阶段 6：黑屏余烬 (12100-15000ms，2.9s)

- 全屏纯黑覆盖
- 中心残留紫色光晕（半径 200px，opacity 0.4 → 0，2.3s 缓慢淡出）
- 4-6 个橙色火星从中心向上飘出（精致质感）
- 1s 后中心出现「重启世界」按钮（el-button，圆形，紫色光晕）
- 按钮可点击立即还原
- 2.9s 超时自动还原（即总时长 15s）

### 阶段 6 结束（15000ms）

- 黑屏淡出（500ms）→ `#app` 恢复 `visibility: visible`
- `ElMessage.success('已重启世界')`
- 所有 overlay/timer 清理

### 节奏设计原则

- **慢→快→爆→缓**：阶段 1 慢酝酿 → 阶段 4 长坍缩 → 阶段 5 爆闪 → 阶段 6 缓收尾
- 每个阶段转场用 50ms 缓动，杜绝硬切
- 阶段 4 占总时长 50%，是视觉主菜
- 阶段 5 刻意短促（100ms），制造冲击

## 7. 截图与粒子系统

### screenshot.ts

```typescript
export interface ScreenshotResult {
  canvas: HTMLCanvasElement
  width: number
  height: number
  imageData: ImageData
}

export async function captureApp(
  rootSelector: string,
  options: {
    onBeforeCapture?: () => void
    onAfterCapture?: () => void
  }
): Promise<ScreenshotResult>
```

**截图流程**：

1. 临时隐藏所有 `.el-message`、`.el-dialog`、`.el-drawer`、`.el-tooltip__popper`（避免重叠错位）
2. 调用 `html2canvas(root, { backgroundColor: null, scale: 1, useCORS: true, logging: false, allowTaint: false })`
3. 把 canvas 转为 ImageData（供粒子系统逐像素采样）
4. 恢复隐藏的浮层
5. 把原 `#app` 设为 `visibility: hidden`（保留布局，避免重排）
6. 超时保护：1s 未完成 → throw Error → 触发 fallback 简化路径

### particleCanvas.ts

```typescript
export interface Particle {
  x: number
  y: number
  startX: number
  startY: number
  vx: number
  vy: number
  rotation: number
  rotationSpeed: number
  scale: number
  color: string
  alive: boolean
}

export class ParticleCanvas {
  constructor(
    canvas: HTMLCanvasElement,
    imageData: ImageData,
    originX: number,
    originY: number,
    particleSize: number  // 默认 8
  )
  start(durationMs: number)
  stop()
  destroy()
}
```

**粒子生成**：

- 遍历 ImageData，每 8×8 像素采样一次
- 计算该 8×8 区域的平均颜色（避免单像素颜色噪点）
- 跳过完全透明的方块（alpha = 0）
- 1920×1080 屏幕约生成 32,400 粒子，过滤透明后实际约 20,000-25,000

**物理更新（每帧 16ms）**：

```typescript
const dx = originX - particle.startX
const dy = originY - particle.startY
const dist = Math.sqrt(dx * dx + dy * dy)

// 加速度：距离越近，加速度越大（引力模拟）
const gravity = 1 / Math.max(dist, 50) * 5000
particle.vx += (dx / dist) * gravity * dt
particle.vy += (dy / dist) * gravity * dt

// 弧线偏移：垂直于运动方向的偏移力
const perpX = -dy / dist
const perpY = dx / dist
const curve = Math.sin(time * 0.5 + particle.phase) * 30
particle.vx += perpX * curve * dt
particle.vy += perpY * curve * dt

particle.rotation += particle.rotationSpeed * dt

if (dist < 30) {
  particle.alive = false
}

particle.scale = Math.max(0.05, dist / 500)
```

**绘制（每帧）**：

- `ctx.clearRect` 清空 canvas
- 遍历存活粒子，save → translate → rotate → scale → fillStyle → fillRect → restore
- 批量绘制优化：按颜色分组，同色粒子一次 fillStyle 设置后批量 fillRect

**性能保护**：

- `requestAnimationFrame` 驱动，每帧 dt 自动计算
- 连续 3 帧 dt > 33ms（< 30fps）→ console.warn 但不降级（固定 Tier 1）
- 粒子总数硬上限 50,000（防止 4K 屏幕爆掉）

## 8. 视觉节点与阶段编排

### visuals.ts

```typescript
export interface VisualElements {
  overlay: HTMLDivElement
  warnBanner: HTMLDivElement
  warnCountdown: HTMLSpanElement
  singularity: HTMLDivElement
  flash: HTMLDivElement
  darkScreen: HTMLDivElement
  embers: HTMLSpanElement[]
  restartButton: HTMLButtonElement
  loadingRing: HTMLDivElement
}

export function createVisuals(originX: number, originY: number): VisualElements
export function destroyVisuals(visuals: VisualElements): void
```

**视觉节点细节**：

| 节点 | 样式 | 入场 | 出场 |
|------|------|------|------|
| overlay | fixed, inset:0, z-index:999999, pointer-events:none | 立即 | cleanup 时移除 |
| loadingRing | 中心 80px 旋转圆环，border 紫色 | opacity 0→1 (200ms) | opacity 1→0 (100ms) |
| warnBanner | 顶部 12% 黄色横幅，圆角，阴影 | translateY(-40px)→0 (500ms) | opacity→0 (300ms) |
| warnCountdown | 横幅内 span，每 100ms 更新文本 | 跟随横幅 | 跟随横幅 |
| singularity | 按钮 position absolute，80px 圆，径向渐变白→紫→透明，旋转动画 | scale 0→1 (1000ms) | scale 1→5 + opacity→0 (100ms) |
| flash | fixed inset:0，白色，pointer-events:none | opacity 0→1 (30ms) → 1→0 (50ms) | 移除 |
| darkScreen | fixed inset:0，黑色，opacity 0→1 | opacity 0→1 (200ms) | cleanup 时移除 |
| embers | 6 个 span，橙色，从中心向上飘 | 随机 delay 0-500ms | 自然消失 |
| restartButton | 中心圆形按钮，紫色光晕 | opacity 0→1 + scale 0.8→1 (300ms) | 点击后 scale 1→0 (200ms) |

### stages.ts

```typescript
export interface StageTimeline {
  stage0_freeze: number      // 0
  stage1_warn: number         // 200
  stage2_singularity: number // 2500
  stage3_decompose: number   // 3500
  stage4_collapse: number    // 4500
  stage5_flash: number        // 12000
  stage6_aftermath: number   // 12100
  end: number                 // 15000
}

export const TIMELINE: StageTimeline

export function runStages(
  controller: DoomsdayControllerInternal,
  onStageStart: (stage: number) => void
): ScheduledTimers
```

**调度逻辑**：

- 每个 `stageX_*` 时间点触发对应阶段的启动函数
- 阶段 0（冻结）是同步执行，无 timer
- 阶段 4 启动时调用 `particleCanvas.start(7500)`（坍缩时长）
- 阶段 5 启动时调用 `particleCanvas.stop()` + 移除 canvas
- 阶段 6 启动时延迟 1000ms 显示 restartButton，延迟 2900ms 触发 cleanup
- `end` 时间点触发最终 cleanup + resolve Promise

**resize 监听**：

- 在动画期间监听 `window.resize`
- 触发时立即 `controller.cancel()` + 还原 DOM + `ElMessage.info('窗口大小变化已取消毁灭')`

## 9. 错误处理与 cleanup

### cleanup.ts

```typescript
export interface CleanupRegistry {
  registerTimer(id: number): void
  registerRaf(id: number): void
  registerEventListener(target: EventTarget, type: string, listener: any): void
  registerDomNode(node: HTMLElement | SVGElement): void
  registerRestore(fn: () => void): void
}

export function createCleanupRegistry(): CleanupRegistry
export function cleanup(registry: CleanupRegistry): void  // 幂等
```

**需要清理的资源**：

| 资源 | 来源 | 清理方式 |
|------|------|---------|
| setTimeout timer | stages.ts 各阶段调度 | clearTimeout |
| requestAnimationFrame | particleCanvas.ts 粒子动画循环 | cancelAnimationFrame |
| resize listener | stages.ts 窗口监听 | removeEventListener |
| overlay 及所有子节点 | visuals.ts 创建的 DOM | remove() |
| `#app` visibility:hidden | screenshot.ts 冻结 | 恢复 visibility:visible |
| 隐藏的浮层（el-message 等） | screenshot.ts 隐藏 | 恢复 display |
| body.doomsday-active | stages.ts 添加 | 移除 class |

**幂等实现**：

- cleanup 内部用 `cleaned` 标志位
- 所有清理函数调用前检查 `cleaned === false`
- 调用完成后设 `cleaned = true`
- 后续调用直接 return

### 错误处理路径

```
路径 1：正常流程
  阶段 0 截图成功 → 阶段 1-6 全跑 → 15s 后自动 cleanup → resolve Promise

路径 2：截图失败/超时
  阶段 0 catch → 跳过阶段 1-4 → 直接进入阶段 5（闪屏）+ 阶段 6（黑屏）
  → cleanup → resolve Promise
  → 不抛错（避免用户看到红色错误）

路径 3：粒子动画掉帧
  连续 3 帧 dt > 33ms → console.warn 但继续
  阶段 4 自然结束 → 阶段 5-6 正常

路径 4：用户 resize
  resize listener 触发 → controller.cancel()
  → 立即 cleanup + 还原 DOM
  → ElMessage.info('窗口大小变化已取消毁灭')
  → resolve Promise

路径 5：用户切换路由
  DoomsdayButton.vue onBeforeUnmount → controller.cleanup()
  → 立即清理 + 还原 DOM
  → 不 resolve（组件已卸载，Promise 无意义）

路径 6：用户点击"重启世界"按钮
  按钮点击 → controller.cancel()
  → 立即 cleanup + 还原 DOM
  → ElMessage.success('已重启世界')
  → resolve Promise

路径 7：超时自动重启
  阶段 6 开始后 2.9s（即总时长 15s）→ 自动 cleanup + 还原 DOM
  → ElMessage.success('已重启世界')
  → resolve Promise
```

### 关键约束

- 所有错误路径**必须**还原 DOM（`#app` visibility 恢复）
- cleanup 函数可被多次安全调用（幂等）
- `controller.run()` 返回的 Promise **永远 resolve，永不 reject**（避免 unhandled rejection）
- 截图失败时静默降级，不向用户暴露错误（彩蛋功能不应破坏工作流）

## 10. 测试策略

**测试框架**：vitest + @vue/test-utils（项目已用）

**测试文件结构**：

```
frontend/src/components/fun/__tests__/
├── doomsdayEffect.test.ts          # 集成测试：完整流程
├── screenshot.test.ts               # 截图模块单测
├── particleCanvas.test.ts           # 粒子系统单测
├── stages.test.ts                    # 阶段调度单测
├── visuals.test.ts                   # 视觉节点单测
└── cleanup.test.ts                   # 清理模块单测
```

### 关键测试用例

**screenshot.test.ts**：

- `captureApp 返回 ScreenshotResult 包含 imageData`
- `captureApp 隐藏 .el-message 等浮层并在截图后恢复`
- `captureApp 把 #app 设为 visibility: hidden`
- `captureApp 超时 1s 抛 Error`
- `html2canvas 抛错时 captureApp reject`

**particleCanvas.test.ts**：

- `粒子生成正确数量（32x32 区域 = 16 粒子）`
- `完全透明的方块被跳过`
- `start 启动 raf 循环`
- `stop 取消 raf`
- `粒子接近奇点时 alive 设为 false`
- `物理更新应用引力加速度`
- `批量绘制按颜色分组减少 fillStyle 调用`

**stages.test.ts**：

- `TIMELINE 常量符合 15s 时间线`
- `阶段 0 立即执行（无 timer）`
- `阶段 1-6 按时间点调度`
- `阶段 4 启动 particleCanvas.start(7500)`
- `阶段 5 触发 particleCanvas.stop()`
- `resize 事件触发 controller.cancel()`

**visuals.test.ts**：

- `createVisuals 返回所有视觉节点`
- `singularity 定位在 originX, originY`
- `warnBanner 文本包含"毁灭程序已启动"`
- `restartButton 点击触发回调`
- `destroyVisuals 移除所有 DOM 节点`

**cleanup.test.ts**：

- `cleanup 清除所有 timer`
- `cleanup 取消所有 raf`
- `cleanup 移除所有事件监听`
- `cleanup 移除所有 DOM 节点`
- `cleanup 恢复 #app visibility`
- `cleanup 幂等：多次调用不报错`

**doomsdayEffect.test.ts（集成）**：

- `createDoomsdayEffect 返回 controller`
- `controller.run 返回 Promise`
- `完整流程后 DOM 还原`
- `controller.cancel 立即清理`
- `截图失败时走简化路径（闪屏 + 黑屏）`
- `15s 后自动 cleanup + resolve`

### Mock 策略

- `html2canvas` → mock 返回固定 ImageData（避免真实截图耗时）
- `requestAnimationFrame` → 用 vi.useFakeTimers 控制
- `window.resize` → 手动 dispatch
- DOM API → jsdom 真实环境

### 手动验收清单

用户测试时验证：

1. 点按钮 → 15s 完整流程跑完
2. 黑屏期间点"重启世界" → 立即还原
3. 黑屏期间不点 → 15s 自动还原
4. 动画期间 resize 窗口 → 立即取消 + 提示
5. 动画期间切路由 → 立即还原（无报错）
6. 高分辨率屏幕（4K）→ 流畅不卡顿
7. 浏览器控制台无 error/warning

## 11. 实施计划

| 阶段 | 内容 | 预估 |
|------|------|------|
| 1 | 安装 html2canvas 依赖 | 0.1 天 |
| 2 | 实现 screenshot.ts + 单测 | 0.5 天 |
| 3 | 实现 particleCanvas.ts + 单测 | 1 天 |
| 4 | 实现 visuals.ts + 单测 | 0.5 天 |
| 5 | 实现 stages.ts + 单测 | 0.5 天 |
| 6 | 实现 cleanup.ts + 单测 | 0.3 天 |
| 7 | 实现 index.ts 整合 + 集成测试 | 0.5 天 |
| 8 | 重写 DoomsdayButton.vue | 0.3 天 |
| 9 | 删除旧 doomsdayEffect.ts | 0.1 天 |
| 10 | 端到端手动验收 | 0.3 天 |
| **合计** | | **4 天** |

**提交策略**：

- 后端无改动，无需部署
- 前端按模块分 3-4 个 commit
- 最后一个 commit：端到端验收

## 12. 风险与缓解

| 风险 | 缓解 |
|------|------|
| html2canvas 截图对复杂 CSS 不准确 | 截图失败走 fallback 简化路径，不阻塞动画 |
| 32k 粒子在中端设备可能掉帧 | 固定 Tier 1，console.warn 监控，不降级 |
| 15s 动画期间用户焦虑 | 黑屏 1s 后显示"重启世界"按钮，可随时退出 |
| iframe/ONLYOFFICE 等跨域元素截图失败 | useCORS: true + 截图前隐藏浮层 |
| html2canvas 加载延迟 | 用 CDN 预加载或动态 import |
| Canvas 内存占用高（32k 粒子） | 阶段 5 后立即 destroy canvas 释放内存 |
| resize 导致坐标错乱 | 监听 resize 立即取消 + 提示 |

## 13. 不在范围内

- 性能降级策略（固定 Tier 1）
- WebGL/Three.js 实现
- 音效与触觉反馈
- 移动端适配
- 用户手动选择性能档
- 国际化
- 后端改动
- 持久化设置（用户下次访问仍是默认效果）
