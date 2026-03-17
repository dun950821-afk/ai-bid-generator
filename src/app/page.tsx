'use client';

import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScoringOverviewCards } from '@/components/scoring/ScoringOverviewCards';
import { ScoringModuleCard } from '@/components/scoring/ScoringModuleCard';
import { ScoringStandard } from '@/types/scoring';

// Mock数据
const mockScoringData: ScoringStandard = {
  totalScore: 80,
  
  categoryOverviews: [
    {
      category: 'technical',
      categoryName: '技术标',
      totalScore: 50,
      weight: 63,
      color: '#3b82f6',
      bgColor: '#eff6ff',
    },
    {
      category: 'business',
      categoryName: '商务标',
      totalScore: 30,
      weight: 38,
      color: '#22c55e',
      bgColor: '#f0fdf4',
    },
    {
      category: 'price',
      categoryName: '价格标',
      totalScore: 0,
      weight: 0,
      color: '#f97316',
      bgColor: '#fff7ed',
    },
  ],
  
  modules: [
    {
      id: '1',
      category: 'technical',
      moduleName: '资格要求',
      totalScore: 20,
      itemCount: 3,
      description: '资格要求相关评分，共3项要求',
      scoringItems: [
        {
          id: '1-1',
          itemName: '注册时间≥3年，注册资金≥300万元',
          weight: '25%',
          maxScore: 5,
          scoreDetails: ['注册时间满3年得2.5分', '注册资金≥300万元得2.5分'],
          isRequired: true,
          isChecked: true,
        },
        {
          id: '1-2',
          itemName: '近三年无重大违法违规记录，信用中国无失信记录',
          weight: '25%',
          maxScore: 5,
          scoreDetails: ['无重大违法违规记录得2.5分', '无失信记录得2.5分'],
          isRequired: true,
          isChecked: true,
        },
        {
          id: '1-3',
          itemName: '至少1个开发安全/信息系统安全/安全测试同类项目案例',
          weight: '25%',
          maxScore: 5,
          scoreDetails: ['提供1个同类项目案例得5分'],
          isRequired: true,
          isChecked: true,
        },
      ],
    },
    {
      id: '2',
      category: 'business',
      moduleName: '商务要求',
      totalScore: 30,
      itemCount: 1,
      description: '商务要求相关评分，共1项要求',
      scoringItems: [
        {
          id: '2-1',
          itemName: '服务期限3年，地点北京/合肥，不允许分包转包',
          weight: '100%',
          maxScore: 5,
          scoreDetails: ['满足服务期限得2分', '服务地点符合得2分', '承诺不分包转包得1分'],
          isRequired: true,
          isChecked: true,
        },
      ],
    },
    {
      id: '3',
      category: 'technical',
      moduleName: '技术要求',
      totalScore: 30,
      itemCount: 1,
      description: '技术要求相关评分，共1项要求',
      scoringItems: [
        {
          id: '3-1',
          itemName: '具备开发安全体系管控、安全测试自动化等实施能力',
          weight: '100%',
          maxScore: 5,
          scoreDetails: ['提供技术方案证明材料'],
          isRequired: false,
          isChecked: false,
        },
      ],
    },
  ],
  
  priceScoring: {
    totalScore: 0,
    scoringMethod: '价格评分采用基准价法',
  },
  
  comprehensiveScoringNote: '综合得分=技术得分+商务得分+价格得分',
};

export default function ScoringStandardPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* 顶部标题 */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">评分细则总览</h1>
            <p className="text-gray-500 mt-1">总分: {mockScoringData.totalScore}分</p>
          </div>
        </div>
        
        {/* 评分概览卡片 */}
        <ScoringOverviewCards overviews={mockScoringData.categoryOverviews} />
        
        {/* 评分模块列表 */}
        <div className="space-y-4">
          {mockScoringData.modules.map((module) => (
            <ScoringModuleCard key={module.id} module={module} />
          ))}
        </div>
      </div>
    </div>
  );
}
