'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AIGenerationPanel } from '@/components/ai-generation/AIGenerationPanel';
import type { SectionItem as AISectionItem } from '@/components/ai-generation/AIGenerationPanel';
import { cn } from '@/lib/utils';
import {
  Sparkles,
  Loader2,
  ChevronRight,
  CheckCircle,
  Clock,
  FileText,
  FolderOpen,
} from 'lucide-react';
import type { Section } from '../../types';

interface GenerateStageProps {
  projectId: string;
  knowledgeBaseId: string | null;
  sections: Section[];
  hasOutline: boolean;
  generating: boolean;
  generatingSectionId: string | null;
  onSectionGenerated: (sectionId: string, data: { content: string; wordCount: number; metadata: any }) => void;
  onViewSection: (sectionId: string) => void;
  onSelectKnowledgeBase: () => void;
  onNext: () => void;
}

/**
 * 将 Section 数据转换为 AIGenerationPanel 所需的格式
 */
function convertToSectionItems(sections: Section[]): AISectionItem[] {
  return sections.map((section) => ({
    id: section.id,
    title: section.title,
    level: section.level,
    order: section.order,
    status: section.content ? 'completed' : 'pending',
    hasContent: !!section.content,
    wordCount: section.content?.length || 0,
    content: section.content,
    children: section.children ? convertToSectionItems(section.children) : undefined,
  }));
}

/**
 * AI生成阶段组件
 */
export function GenerateStage({
  projectId,
  knowledgeBaseId,
  sections,
  hasOutline,
  generating,
  generatingSectionId,
  onSectionGenerated,
  onViewSection,
  onSelectKnowledgeBase,
  onNext,
}: GenerateStageProps) {
  // 转换章节数据
  const aiSections = useMemo(() => convertToSectionItems(sections), [sections]);

  // 计算生成进度
  const completedCount = sections.filter(s => s.content).length;
  const totalCount = sections.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* 进度概览 */}
      <Card>
        <CardHeader className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <CardTitle className="text-base">AI生成内容</CardTitle>
                <CardDescription>
                  已完成 {completedCount}/{totalCount} 个章节
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Progress value={progress} className="w-24 h-2" />
                <span className="text-sm text-muted-foreground">{progress}%</span>
              </div>
            </div>
            <div className="flex gap-2">
              {completedCount > 0 && completedCount === totalCount && (
                <Button onClick={onNext}>
                  下一步：校验导出
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* 生成面板 */}
      {!hasOutline ? (
        <Card className="border-dashed">
          <CardContent className="py-12">
            <div className="text-center">
              <Sparkles className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-2">请先生成标书大纲</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <AIGenerationPanel
          projectId={projectId}
          knowledgeBaseId={knowledgeBaseId}
          sections={aiSections}
          onSectionGenerated={onSectionGenerated}
          onViewSection={onViewSection}
          onSelectKnowledgeBase={onSelectKnowledgeBase}
        />
      )}
    </div>
  );
}

export default GenerateStage;
