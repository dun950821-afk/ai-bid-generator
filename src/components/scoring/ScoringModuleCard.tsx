'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScoringModule, ScoringItem } from '@/types/scoring';

interface ScoringModuleCardProps {
  module: ScoringModule;
}

/**
 * 评分模块卡片组件
 */
export function ScoringModuleCard({ module }: ScoringModuleCardProps) {
  const categoryConfig = {
    technical: {
      label: '技术标',
      badgeColor: 'bg-blue-100 text-blue-700',
      scoreColor: 'text-blue-600',
      bgColor: 'bg-blue-50/30',
    },
    business: {
      label: '商务标',
      badgeColor: 'bg-green-100 text-green-700',
      scoreColor: 'text-green-600',
      bgColor: 'bg-green-50/30',
    },
    price: {
      label: '价格标',
      badgeColor: 'bg-orange-100 text-orange-700',
      scoreColor: 'text-orange-600',
      bgColor: 'bg-orange-50/30',
    },
  };

  const config = categoryConfig[module.category];

  return (
    <Card className={`${config.bgColor} border-0 p-6`}>
      {/* 模块头部 */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <Badge className={config.badgeColor}>
            {config.label}
          </Badge>
          <h3 className="text-lg font-semibold">{module.moduleName}</h3>
        </div>
        <div className="text-right">
          <p className={`text-xl font-bold ${config.scoreColor}`}>
            {module.totalScore}分
          </p>
        </div>
      </div>
      
      {/* 模块描述 */}
      {module.description && (
        <p className="text-sm text-gray-500 mb-4">{module.description}</p>
      )}
      
      {/* 评分项列表 */}
      <div className="space-y-3">
        {module.scoringItems.map((item) => (
          <ScoringItemRow key={item.id} item={item} scoreColor={config.scoreColor} />
        ))}
      </div>
    </Card>
  );
}

/**
 * 评分项行组件
 */
interface ScoringItemRowProps {
  item: ScoringItem;
  scoreColor: string;
}

function ScoringItemRow({ item, scoreColor }: ScoringItemRowProps) {
  return (
    <div className="bg-white rounded-lg p-4 flex items-start gap-3">
      {/* 勾选框 */}
      <Checkbox 
        checked={item.isChecked || item.isRequired}
        className="mt-1 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
        disabled={item.isRequired}
      />
      
      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm leading-relaxed">
              {item.itemName}
            </p>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* 必须标签 */}
            {item.isRequired && (
              <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                必须
              </Badge>
            )}
            
            {/* 分值 */}
            <span className={`text-sm font-semibold ${scoreColor}`}>
              {item.maxScore}分
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
