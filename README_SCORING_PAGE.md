# 招投标评分细则总览页面

## 项目说明

本项目是基于用户提供的UI设计图片，实现的招标文档评分细则总览页面。

## 技术栈

- **框架**: Next.js 16 (App Router)
- **语言**: TypeScript
- **UI组件**: shadcn/ui
- **样式**: Tailwind CSS
- **图标**: Lucide React

## 项目结构

```
src/
├── app/
│   ├── globals.css          # 全局样式
│   ├── layout.tsx           # 根布局
│   └── page.tsx             # 主页面（评分细则总览）
│
├── components/
│   └── scoring/
│       ├── ScoringOverviewCards.tsx  # 评分概览卡片组件
│       └── ScoringModuleCard.tsx     # 评分模块卡片组件
│
└── types/
    └── scoring.ts           # 评分标准类型定义
```

## 核心功能

### 1. 评分概览卡片

展示三大评分类别的权重和分值：

- **技术标** (蓝色)：显示总分和权重占比
- **商务标** (绿色)：显示总分和权重占比
- **价格标** (橙色)：显示总分和权重占比

每个卡片包含：
- 类别名称
- 总分值
- 权重百分比
- 进度条可视化

### 2. 评分模块卡片

按模块展示详细评分项：

- **模块头部**：显示类别标签、模块名称、总分
- **模块描述**：说明模块包含的评分项数量
- **评分项列表**：
  - 勾选框（必填项为红色勾选状态）
  - 评分项内容
  - 必须标签（红色）
  - 分值标注

### 3. Mock数据示例

```typescript
const mockScoringData: ScoringStandard = {
  totalScore: 80,
  categoryOverviews: [
    {
      category: 'technical',
      categoryName: '技术标',
      totalScore: 50,
      weight: 63,
    },
    // ...
  ],
  modules: [
    {
      id: '1',
      category: 'technical',
      moduleName: '资格要求',
      totalScore: 20,
      scoringItems: [
        {
          id: '1-1',
          itemName: '注册时间≥3年，注册资金≥300万元',
          maxScore: 5,
          isRequired: true,
          isChecked: true,
        },
        // ...
      ],
    },
    // ...
  ],
};
```

## 设计亮点

### 1. 颜色编码

使用蓝、绿、橙三色区分不同评分类别，提升视觉识别度：

- **蓝色** (#3b82f6)：技术标
- **绿色** (#22c55e)：商务标
- **橙色** (#f97316)：价格标

### 2. 状态标识

- **红色勾选**：必填项已满足
- **灰色空心**：待评估项
- **必须标签**：醒目的红色标签

### 3. 信息层级

采用卡片式布局，层级分明：

- 顶层：评分概览（快速了解分布）
- 中层：评分模块（分类查看）
- 底层：评分项（详细内容）

## 类型系统

### 核心类型定义

```typescript
// 评分项
interface ScoringItem {
  id: string;
  itemName: string;
  maxScore: number;
  scoreDetails: string[];
  isRequired?: boolean;
  isChecked?: boolean;
}

// 评分模块
interface ScoringModule {
  id: string;
  category: 'technical' | 'business' | 'price';
  moduleName: string;
  totalScore: number;
  scoringItems: ScoringItem[];
}

// 评分标准
interface ScoringStandard {
  totalScore: number;
  categoryOverviews: ScoringCategoryOverview[];
  modules: ScoringModule[];
}
```

## 使用方式

### 开发模式

```bash
pnpm dev
```

访问 http://localhost:5000 查看页面

### 构建生产版本

```bash
pnpm build
pnpm start
```

## 后续扩展

### 1. 数据集成

- 对接后端API获取真实评分数据
- 支持评分项的实时更新
- 添加评分结果的保存功能

### 2. 交互增强

- 支持评分项的勾选/取消勾选
- 添加评分项的展开/收起功能
- 实现评分项的筛选和搜索

### 3. 功能扩展

- 导出评分报表
- 对比多个项目的评分标准
- 评分标准的版本管理

## 与AI-Bid系统集成

本页面是 AI-Bid 智能标书生成系统的一部分，展示从招标文档中提取的评分标准。

数据来源：
- `tender_analysis` 表：存储招标文档解析结果
- `scoring_criteria` 字段：存储评分标准JSON

API集成：
```typescript
// 获取评分标准
GET /api/projects/{projectId}/scoring-standard

// 更新评分项状态
PUT /api/projects/{projectId}/scoring-items/{itemId}
```

## 许可证

Copyright © 2026 AI-Bid Team
