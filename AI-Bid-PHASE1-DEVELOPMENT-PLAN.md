# AI-Bid系统 Phase 1 开发计划

## 开发目标

基于优化方案，实现 Phase 1 的核心功能：
1. ✅ 评分项结构化提取
2. ✅ 废标风险识别与标记
3. ✅ 评分项管理API
4. ✅ 废标风险管理API
5. ✅ 评分驱动的LLM生成Prompt优化

## 开发环境准备

### 技能依赖
- ✅ LLM技能（已内置）- 用于内容生成
- ✅ 知识库技能 - 用于RAG检索
- ✅ 存储技能 - 用于文件存储
- ✅ 数据库技能（Supabase）- 用于数据持久化

### 技术栈
- 前端：Next.js 16 + React 19 + TypeScript
- 后端：Next.js API Routes
- 数据库：PostgreSQL (Supabase)
- 存储：S3兼容存储
- AI服务：LLM API

## 开发任务分解

### Task 1: 数据库Schema扩展 (1天)

**目标**：创建评分项、废标风险、校验结果相关表

**内容**：
1. 创建 `scoring_items` 表
2. 创建 `disqualification_risks` 表
3. 创建 `validation_results` 表
4. 创建相关索引和约束
5. 编写迁移脚本

**验收标准**：
- ✅ 表结构正确创建
- ✅ 索引性能优化
- ✅ 外键关联正确

### Task 2: 招标文档解析优化 (2天)

**目标**：增加评分项结构化提取和废标风险识别

**内容**：
1. 扩展提取Schema，增加评分项字段
2. 实现评分项结构化提取逻辑
3. 实现废标风险识别逻辑
4. 创建提取结果存储API
5. 编写单元测试

**验收标准**：
- ✅ 能提取所有评分项及分值
- ✅ 能识别废标风险条款
- ✅ 提取结果正确存储

### Task 3: 评分项管理API (2天)

**目标**：实现评分项的CRUD操作和查询

**内容**：
1. GET /api/projects/{id}/scoring-items - 获取评分项列表
2. GET /api/projects/{id}/scoring-items/{itemId} - 获取单个评分项
3. PUT /api/projects/{id}/scoring-items/{itemId} - 更新评分项状态
4. GET /api/projects/{id}/scoring-items/coverage-report - 获取覆盖率报告
5. 前端评分项管理界面

**验收标准**：
- ✅ API正确响应
- ✅ 数据一致性保证
- ✅ 前端界面可用

### Task 4: 废标风险管理API (2天)

**目标**：实现废标风险的识别、管理和响应

**内容**：
1. GET /api/projects/{id}/disqualification-risks - 获取风险列表
2. PUT /api/projects/{id}/disqualification-risks/{riskId} - 更新风险响应
3. POST /api/projects/{id}/disqualification-risks/validate - 校验风险响应
4. 前端废标风险管理界面
5. 风险提示组件

**验收标准**：
- ✅ 风险识别准确率>=90%
- ✅ 风险响应流程完整
- ✅ 界面交互友好

### Task 5: LLM生成Prompt优化 (2天)

**目标**：实现评分驱动的Prompt框架

**内容**：
1. 设计通用Prompt框架模板
2. 实现评分项Prompt插件
3. 实现行业适配Prompt插件
4. 修改LLM生成服务，集成新Prompt
5. 测试生成效果

**验收标准**：
- ✅ Prompt包含评分项信息
- ✅ 生成内容响应评分细则
- ✅ 量化指标明确

### Task 6: 校验引擎初版 (1天)

**目标**：实现基础的校验功能

**内容**：
1. 合规校验：检查废标风险响应
2. 评分项覆盖校验：检查响应状态
3. 校验报告生成
4. 前端校验报告展示

**验收标准**：
- ✅ 能识别未响应的风险项
- ✅ 能计算评分项覆盖率
- ✅ 报告清晰易懂

## 开发时间线

```
Week 1:
  Day 1-2: 数据库Schema + 招标文档解析优化
  Day 3-4: 评分项管理API + 前端界面
  Day 5: 废标风险管理API

Week 2:
  Day 1-2: 废标风险管理前端 + 风险提示
  Day 3-4: LLM生成Prompt优化 + 测试
  Day 5: 校验引擎 + 集成测试
```

## 技术实现要点

### 1. 评分项提取Prompt

```typescript
const SCORING_EXTRACTION_PROMPT = `
你是专业的招标文档分析专家。请从招标文档中提取所有评分项信息。

## 提取规则

1. **评分项分类**
   - 技术评分：技术方案、技术能力、技术创新等
   - 商务评分：商务响应、价格评分、企业资质等
   - 价格评分：价格分值和计算方法

2. **必填字段**
   - 评分项名称
   - 分值
   - 权重（百分比）
   - 评分细则

3. **层级关系**
   - 大项包含子项
   - 子项包含评分细则
   - 标注关键评分项（高权重）

请按照以下JSON Schema输出：
${scoringItemSchema}
`;
```

### 2. 废标风险识别规则

```typescript
const DISQUALIFICATION_RULES = [
  {
    type: '否决条款',
    keywords: ['否决', '废标', '无效投标', '不予受理'],
    severity: 'critical'
  },
  {
    type: '资格要求',
    keywords: ['必须具备', '应当具有', '须持有', '资格条件'],
    severity: 'high'
  },
  {
    type: '格式要求',
    keywords: ['格式要求', '签字盖章', '密封', '递交'],
    severity: 'medium'
  }
];
```

### 3. 评分驱动Prompt框架

```typescript
const SCORE_DRIVEN_PROMPT = `
## 评分项驱动生成

本章对应评分项：
${scoringItems.map(item => `
### ${item.name}（${item.maxScore}分，权重${item.weight}%）
评分细则：
${item.rules.map(rule => `- ${rule}`).join('\n')}
`).join('\n')}

## 内容要求

1. **完整性要求**
   - 必须逐条响应每个评分细则
   - 不得遗漏任何评分项

2. **量化要求**
   - 每项承诺需有具体数字
   - 不得使用"丰富经验"等模糊表述

3. **支撑要求**
   - 每项能力需引用案例或资质
   - 引用格式：[案例：XX项目]

## 输出格式

请按照评分细则逐条组织内容...
`;
```

## 风险控制

### 技术风险
- ⚠️ LLM生成质量不稳定 → 增加约束Prompt + 人工审核
- ⚠️ 评分项提取准确率 → 多轮验证 + 规则辅助
- ⚠️ 性能问题 → 异步处理 + 缓存优化

### 进度风险
- ⚠️ 开发时间不足 → 优先核心功能，次要功能后移
- ⚠️ 需求变更 → 预留buffer时间

## 验收标准

### 功能验收
- ✅ 评分项提取准确率>=90%
- ✅ 废标风险识别准确率>=90%
- ✅ API响应时间<500ms
- ✅ 前端交互流畅

### 质量验收
- ✅ 代码测试覆盖率>=70%
- ✅ 无严重bug
- ✅ 代码review通过

## 下一步行动

立即开始开发：
1. 创建数据库表结构
2. 实现评分项提取逻辑
3. 实现废标风险识别逻辑

预计2周内完成Phase 1全部功能。
