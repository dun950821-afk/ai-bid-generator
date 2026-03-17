/**
 * 评分项
 */
export interface ScoringItem {
  id: string;
  itemName: string;                    // 评分项名称
  itemCode?: string;                   // 评分项编码
  weight: string;                      // 权重（百分比或分值）
  maxScore: number;                    // 满分值
  scoreDetails: string[];              // 评分细则
  scoringMethod?: string;              // 评分方法
  isRequired?: boolean;                // 是否必须满足
  isChecked?: boolean;                 // 是否已满足
}

/**
 * 评分模块
 */
export interface ScoringModule {
  id: string;
  category: 'technical' | 'business' | 'price'; // 所属类别
  moduleName: string;                  // 模块名称
  totalScore: number;                  // 模块总分
  itemCount: number;                   // 评分项数量
  description?: string;                // 模块描述
  scoringItems: ScoringItem[];         // 评分项列表
}

/**
 * 评分大类概览
 */
export interface ScoringCategoryOverview {
  category: 'technical' | 'business' | 'price';
  categoryName: string;                // 类别名称
  totalScore: number;                  // 总分
  weight: number;                      // 权重百分比
  color: string;                       // 主题色
  bgColor: string;                     // 背景色
}

/**
 * 评分标准完整数据
 */
export interface ScoringStandard {
  // 总分
  totalScore: number;
  
  // 评分大类概览
  categoryOverviews: ScoringCategoryOverview[];
  
  // 评分模块列表
  modules: ScoringModule[];
  
  // 价格评分
  priceScoring: {
    totalScore: number;
    scoringMethod: string;
    formula?: string;
  };
  
  // 综合评分说明
  comprehensiveScoringNote?: string;
}

/**
 * 评分项状态
 */
export type ScoringItemStatus = 'required' | 'optional' | 'completed' | 'pending';

/**
 * 获取评分项状态的辅助函数
 */
export function getScoringItemStatus(item: ScoringItem): ScoringItemStatus {
  if (item.isChecked) return 'completed';
  if (item.isRequired) return 'required';
  return 'optional';
}
