'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  X,
  Target,
  AlertTriangle,
  FileText,
  Lightbulb,
  Database,
  Search,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import type { Section, ScoringItem, Risk, ContentGuide } from '../../types';

interface DetailPanelProps {
  // 面板状态
  isOpen: boolean;
  onClose: () => void;
  
  // 当前显示内容
  selectedSection: Section | null;
  scoringItems: ScoringItem[];
  risks: Risk[];
  
  // 操作
  onViewSection?: (sectionId: string) => void;
}

/**
 * 详情面板组件
 * 右侧滑出面板，显示选中章节的详细信息
 */
export function DetailPanel({
  isOpen,
  onClose,
  selectedSection,
  scoringItems,
  risks,
  onViewSection,
}: DetailPanelProps) {
  // 获取关联的评分项
  const relatedScoringItems = selectedSection?.scoring_item_ids
    ? scoringItems.filter(item => selectedSection.scoring_item_ids?.includes(item.id))
    : [];

  // 获取关联的风险项
  const relatedRisks = selectedSection?.riskIds
    ? risks.filter(risk => selectedSection.riskIds?.includes(risk.id))
    : [];

  return (
    <div
      className={cn(
        "fixed right-0 top-0 h-full w-80 bg-card border-l shadow-lg transition-transform duration-300 z-20",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">详情面板</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* 内容 */}
      <ScrollArea className="h-[calc(100vh-60px)]">
        <div className="p-4 space-y-4">
          {!selectedSection ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">选择章节查看详情</p>
            </div>
          ) : (
            <>
              {/* 章节信息 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    章节 {selectedSection.order}
                  </Badge>
                  {selectedSection.sectionType && (
                    <Badge variant="secondary" className="text-xs">
                      {selectedSection.sectionType === 'technical' ? '技术' :
                       selectedSection.sectionType === 'business' ? '商务' :
                       selectedSection.sectionType === 'price' ? '报价' : '基础'}
                    </Badge>
                  )}
                </div>
                <h4 className="font-medium">{selectedSection.title}</h4>
                {selectedSection.content && (
                  <p className="text-xs text-muted-foreground">
                    已生成 {selectedSection.content.length} 字
                  </p>
                )}
              </div>

              {/* 操作按钮 */}
              {selectedSection.content && onViewSection && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => onViewSection(selectedSection.id)}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  查看完整内容
                </Button>
              )}

              {/* 编写要点 */}
              {selectedSection.contentGuide?.mainPoints && selectedSection.contentGuide.mainPoints.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    编写要点
                  </div>
                  <ul className="space-y-1 pl-6">
                    {selectedSection.contentGuide.mainPoints.map((point: string, idx: number) => (
                      <li key={idx} className="text-sm text-muted-foreground list-disc">
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 素材建议 */}
              {selectedSection.contentGuide?.materialSuggestions && selectedSection.contentGuide.materialSuggestions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Database className="h-4 w-4 text-blue-500" />
                    素材建议
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedSection.contentGuide.materialSuggestions.map((suggestion: string, idx: number) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {suggestion}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* 知识库检索关键词 */}
              {selectedSection.contentGuide?.knowledgeBaseQueries && selectedSection.contentGuide.knowledgeBaseQueries.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Search className="h-4 w-4 text-green-500" />
                    检索关键词
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedSection.contentGuide.knowledgeBaseQueries.map((query: string, idx: number) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {query}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* AI配置 */}
              {selectedSection.aiConfig && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="text-sm font-medium">AI生成配置</div>
                  <div className="space-y-1.5">
                    {selectedSection.aiConfig.wordCount > 0 && (
                      <div className="text-xs text-muted-foreground">
                        预计字数：约 {selectedSection.aiConfig.wordCount} 字
                      </div>
                    )}
                    {selectedSection.aiConfig.requirements && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">生成要点：</span>
                        <p className="mt-0.5">{selectedSection.aiConfig.requirements}</p>
                      </div>
                    )}
                    {selectedSection.aiConfig.precautions && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">注意事项：</span>
                        <p className="mt-0.5">{selectedSection.aiConfig.precautions}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 关联评分项 */}
              {relatedScoringItems.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Target className="h-4 w-4 text-primary" />
                    关联评分项 ({relatedScoringItems.length})
                  </div>
                  <div className="space-y-2">
                    {relatedScoringItems.map((item) => (
                      <div key={item.id} className="p-2 rounded border text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate flex-1">{item.item_name}</span>
                          <Badge variant="outline" className="text-xs ml-2">
                            {item.max_score}分
                          </Badge>
                        </div>
                        {item.scoring_rules && item.scoring_rules.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {typeof item.scoring_rules[0] === 'string' 
                              ? item.scoring_rules[0] 
                              : item.scoring_rules[0]?.rule || item.scoring_rules[0]?.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 关联风险项 */}
              {relatedRisks.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    关联风险 ({relatedRisks.length})
                  </div>
                  <div className="space-y-2">
                    {relatedRisks.map((risk) => (
                      <div key={risk.id} className="p-2 rounded border text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            variant={
                              risk.severity === 'critical' ? 'destructive' :
                              risk.severity === 'high' ? 'default' : 'secondary'
                            }
                            className="text-xs"
                          >
                            {risk.severity === 'critical' ? '致命' :
                             risk.severity === 'high' ? '高' :
                             risk.severity === 'medium' ? '中' : '低'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{risk.risk_type}</span>
                        </div>
                        <p className="text-xs">{risk.risk_description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default DetailPanel;
