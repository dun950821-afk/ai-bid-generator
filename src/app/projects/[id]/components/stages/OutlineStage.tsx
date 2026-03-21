'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SectionTree } from '../shared/SectionTree';
import { cn } from '@/lib/utils';
import {
  FolderOpen,
  Loader2,
  Plus,
  ChevronRight,
  Settings,
  Sparkles,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import type { Section } from '../../types';

interface OutlineStageProps {
  projectId: string;
  sections: Section[];
  hasUploadedDoc: boolean;
  generating: boolean;
  onGenerateOutline: () => Promise<void>;
  onEditSection: (section: Section) => void;
  onAddChild: (parentId: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onAddTopLevel: () => void;
  onSelectSection: (section: Section) => void;
  selectedSectionId: string | null;
  onNext: () => void;
}

/**
 * 大纲阶段组件
 */
export function OutlineStage({
  projectId,
  sections,
  hasUploadedDoc,
  generating,
  onGenerateOutline,
  onEditSection,
  onAddChild,
  onDeleteSection,
  onAddTopLevel,
  onSelectSection,
  selectedSectionId,
  onNext,
}: OutlineStageProps) {
  const hasOutline = sections.length > 0;

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <Card>
        <CardHeader className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">标书大纲</CardTitle>
              <CardDescription>
                {hasOutline 
                  ? `共 ${sections.length} 个一级章节` 
                  : '根据招标文档自动生成章节结构'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {!hasOutline && (
                <Button
                  onClick={onGenerateOutline}
                  disabled={!hasUploadedDoc || generating}
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FolderOpen className="h-4 w-4 mr-2" />
                  )}
                  生成大纲
                </Button>
              )}
              {hasOutline && (
                <Button onClick={onNext}>
                  下一步：AI生成
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* 大纲内容 */}
      {!hasUploadedDoc ? (
        <Card className="border-dashed">
          <CardContent className="py-12">
            <div className="text-center">
              <FolderOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-2">请先上传招标文档并完成提取</p>
            </div>
          </CardContent>
        </Card>
      ) : !hasOutline ? (
        <Card className="border-dashed">
          <CardContent className="py-12">
            <div className="text-center">
              <FolderOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-2">文档已提取完成</p>
              <p className="text-sm text-muted-foreground">点击上方按钮生成标书大纲</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4">
            <ScrollArea className="h-[400px]">
              <SectionTree
                sections={sections}
                selectedId={selectedSectionId}
                onSelect={onSelectSection}
                onEdit={onEditSection}
                onAddChild={onAddChild}
                onDelete={onDeleteSection}
                onAddTopLevel={onAddTopLevel}
              />
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default OutlineStage;
