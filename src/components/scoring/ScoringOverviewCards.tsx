'use client';

import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScoringCategoryOverview } from '@/types/scoring';

interface ScoringOverviewCardsProps {
  overviews: ScoringCategoryOverview[];
}

/**
 * 评分概览卡片组件
 * 展示三大评分类别的权重和分值
 */
export function ScoringOverviewCards({ overviews }: ScoringOverviewCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {overviews.map((overview) => (
        <ScoringOverviewCard key={overview.category} overview={overview} />
      ))}
    </div>
  );
}

/**
 * 单个评分概览卡片
 */
function ScoringOverviewCard({ overview }: { overview: ScoringCategoryOverview }) {
  const colorMap = {
    technical: {
      text: 'text-blue-600',
      bg: 'bg-blue-50',
      progress: 'bg-blue-500',
    },
    business: {
      text: 'text-green-600',
      bg: 'bg-green-50',
      progress: 'bg-green-500',
    },
    price: {
      text: 'text-orange-600',
      bg: 'bg-orange-50',
      progress: 'bg-orange-500',
    },
  };

  const colors = colorMap[overview.category];

  return (
    <Card className={`${colors.bg} border-0 p-4`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className={`font-medium ${colors.text}`}>{overview.categoryName}</p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-bold ${colors.text}`}>
            {overview.totalScore}分
          </p>
        </div>
      </div>
      
      <div className="flex justify-between items-center mb-2">
        <p className={`text-sm ${colors.text}`}>
          {overview.weight}% 权重
        </p>
      </div>
      
      <Progress 
        value={overview.weight} 
        className="h-2 bg-white/50"
      />
    </Card>
  );
}
