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
 * 递归计算章节总数
 */
function countTotalSections(sections: Section[]): number {
  let count = 0;
  for (const s of sections) {
    count++; // 当前章节
    if (s.children && s.children.length > 0) {
      count += countTotalSections(s.children);
    }
  }
  return count;
}

/**
 * 递归计算已生成的章节数
 * 父章节如果没有内容，但所有子章节都已生成，也算作已生成
 */
function countGeneratedSections(sections: Section[]): number {
  let count = 0;
  for (const s of sections) {
    const hasOwnContent = !!s.content;
    const hasChildren = s.children && s.children.length > 0;
    
    if (hasChildren) {
      // 有子章节的情况
      const childrenGenerated = countGeneratedSections(s.children!);
      const childrenTotal = countTotalSections(s.children!);
      
      if (hasOwnContent) {
        // 父章节有内容
        count += 1 + childrenGenerated;
      } else if (childrenGenerated === childrenTotal && childrenTotal > 0) {
        // 父章节无内容，但所有子章节都完成了，父章节也算完成
        count += 1 + childrenGenerated;
      } else {
        // 部分子章节完成
        count += childrenGenerated;
      }
    } else {
      // 无子章节，只看自己是否有内容
      if (hasOwnContent) {
        count++;
      }
    }
  }
  return count;
}

/**
 * 判断章节是否已完成
 * 父章节：自己有内容 或 所有子章节都完成
 * 叶子章节：自己有内容
 */
function isSectionComplete(section: Section): boolean {
  // 自己有内容
  if (section.content) {
    return true;
  }
  
  // 没有内容但有子章节，检查子章节是否都完成
  if (section.children && section.children.length > 0) {
    return section.children.every(child => isSectionComplete(child));
  }
  
  return false;
}

/**
 * 将 Section 数据转换为 AIGenerationPanel 所需的格式
 */
function convertToSectionItems(sections: Section[]): AISectionItem[] {
  return sections.map((section) => {
    const isComplete = isSectionComplete(section);
    const hasChildren = !!(section.children && section.children.length > 0);
    const hasContent = !!section.content || (hasChildren && isComplete);
    
    return {
      id: section.id,
      title: section.title,
      level: section.level,
      order: section.order,
      status: isComplete ? 'completed' : 'pending',
      hasContent: hasContent,
      wordCount: section.content?.length || 0,
      content: section.content,
      children: section.children ? convertToSectionItems(section.children) : undefined,
    };
  });
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

  // 计算生成进度（递归计算所有章节）
  const completedCount = useMemo(() => countGeneratedSections(sections), [sections]);
  const totalCount = useMemo(() => countTotalSections(sections), [sections]);
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  
  // 判断是否所有章节都已完成
  const allComplete = completedCount > 0 && completedCount >= totalCount;

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
              {allComplete && (
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
