/**
 * AI章节生成中心面板
 * @description 提供可视化的章节生成管理界面
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  Sparkles,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Play,
  Pause,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Eye,
  BarChart3,
  Zap,
  FileSearch,
  Timer,
  Database,
  Plus,
} from 'lucide-react';

// =====================================================
// 类型定义
// =====================================================

export type SectionStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface SectionItem {
  id: string;
  title: string;
  level?: number;
  order: number;
  status: SectionStatus;
  hasContent: boolean;
  wordCount?: number;
  content?: string;
  children?: SectionItem[];
  error?: string;
  metadata?: GenerationMetadata;
}

export interface GenerationMetadata {
  queryCount: number;
  retrievedChunks: number;
  contextTokens: number;
  elapsed: number;
}

export interface GenerationStats {
  totalGenerated: number;
  totalTokens: number;
  totalRetrieved: number;
  totalElapsed: number;
}

export interface AIGenerationPanelProps {
  projectId: string;
  knowledgeBaseId: string | null;
  sections: SectionItem[];
  onSectionsUpdate: () => void;
  onViewSection: (sectionId: string) => void;
  onSelectKnowledgeBase?: () => void;
}

// =====================================================
// 状态徽章组件
// =====================================================

const StatusBadge: React.FC<{ status: SectionStatus; progress?: number }> = ({ status, progress }) => {
  const config = {
    pending: {
      icon: Clock,
      label: '待生成',
      className: 'bg-muted/50 text-muted-foreground border-muted',
    },
    generating: {
      icon: Loader2,
      label: '生成中',
      className: 'bg-primary/10 text-primary border-primary/30 animate-pulse',
    },
    completed: {
      icon: CheckCircle2,
      label: '已完成',
      className: 'bg-green-500/10 text-green-600 border-green-500/30',
    },
    failed: {
      icon: AlertCircle,
      label: '失败',
      className: 'bg-red-500/10 text-red-600 border-red-500/30',
    },
  };

  const { icon: Icon, label, className } = config[status];

  return (
    <Badge variant="outline" className={cn('gap-1.5 font-normal', className)}>
      <Icon className={cn('h-3 w-3', status === 'generating' && 'animate-spin')} />
      {status === 'generating' && progress !== undefined ? `${progress}%` : label}
    </Badge>
  );
};

// =====================================================
// 章节列表项组件
// =====================================================

interface SectionListItemProps {
  section: SectionItem;
  depth?: number;
  selectedSectionId: string | null;
  generatingId: string | null;
  onSelect: (id: string) => void;
  onGenerate: (id: string) => void;
  onRetry: (id: string) => void;
}

const SectionListItem: React.FC<SectionListItemProps> = ({
  section,
  depth = 0,
  selectedSectionId,
  generatingId,
  onSelect,
  onGenerate,
  onRetry,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = section.children && section.children.length > 0;
  const isGenerating = generatingId === section.id;
  const isSelected = selectedSectionId === section.id;

  return (
    <>
      <div
        className={cn(
          'group relative flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200',
          'hover:bg-accent/50',
          isSelected && 'bg-primary/5 border-primary/20 border',
          depth > 0 && 'ml-6 border-l-2 border-muted pl-4'
        )}
        onClick={() => onSelect(section.id)}
      >
        {/* 展开/折叠按钮 */}
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-0.5 hover:bg-muted rounded transition-colors"
          >
            <ChevronRight
              className={cn('h-4 w-4 text-muted-foreground transition-transform', isExpanded && 'rotate-90')}
            />
          </button>
        )}
        {!hasChildren && <div className="w-5" />}

        {/* 图标 */}
        {section.level && section.level > 1 ? (
          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <FolderOpen className="h-4 w-4 text-primary flex-shrink-0" />
        )}

        {/* 标题和状态 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('truncate', depth === 0 ? 'font-semibold' : 'font-medium')}>
              {section.order}. {section.title}
            </span>
          </div>
          {section.hasContent && section.wordCount && (
            <span className="text-xs text-muted-foreground">{section.wordCount} 字</span>
          )}
        </div>

        {/* 状态徽章 */}
        <StatusBadge status={section.status} progress={section.status === 'generating' ? 50 : undefined} />

        {/* 操作按钮 */}
        {section.status === 'pending' && !isGenerating && (
          <Button
            size="sm"
            variant="ghost"
            className="opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2"
            onClick={(e) => {
              e.stopPropagation();
              onGenerate(section.id);
            }}
          >
            <Play className="h-3 w-3" />
          </Button>
        )}
        {section.status === 'failed' && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={(e) => {
              e.stopPropagation();
              onRetry(section.id);
            }}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* 子章节 */}
      {hasChildren && isExpanded && (
        <div className="space-y-1">
          {section.children!.map((child) => (
            <SectionListItem
              key={child.id}
              section={child}
              depth={depth + 1}
              selectedSectionId={selectedSectionId}
              generatingId={generatingId}
              onSelect={onSelect}
              onGenerate={onGenerate}
              onRetry={onRetry}
            />
          ))}
        </div>
      )}
    </>
  );
};

// =====================================================
// 内容预览面板
// =====================================================

interface ContentPreviewProps {
  section: SectionItem | null;
  streamingContent: string;
  isStreaming: boolean;
}

const ContentPreview: React.FC<ContentPreviewProps> = ({ section, streamingContent, isStreaming }) => {
  const content = streamingContent || section?.content;

  if (!section && !isStreaming) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>选择一个章节查看内容</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="prose prose-sm max-w-none p-4">
        {/* 标题 */}
        <h3 className="text-lg font-semibold mb-4">
          {section?.order}. {section?.title}
        </h3>

        {/* 内容 */}
        {isStreaming && !content ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>正在生成内容...</span>
          </div>
        ) : (
          <div className="whitespace-pre-wrap leading-relaxed">
            {content}
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
            )}
          </div>
        )}

        {/* 生成信息 */}
        {section?.metadata && !isStreaming && (
          <div className="mt-6 pt-4 border-t">
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <FileSearch className="h-3 w-3" />
                {section.metadata.queryCount} 个查询
              </span>
              <span className="flex items-center gap-1">
                <Database className="h-3 w-3" />
                {section.metadata.retrievedChunks} 条文档
              </span>
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {section.metadata.contextTokens.toLocaleString()} tokens
              </span>
              <span className="flex items-center gap-1">
                <Timer className="h-3 w-3" />
                {(section.metadata.elapsed / 1000).toFixed(1)}s
              </span>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
};

// =====================================================
// 统计栏组件
// =====================================================

interface StatsBarProps {
  stats: GenerationStats;
  totalSections: number;
  completedSections: number;
}

const StatsBar: React.FC<StatsBarProps> = ({ stats, totalSections, completedSections }) => {
  const progress = totalSections > 0 ? (completedSections / totalSections) * 100 : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-card/50 rounded-lg border">
      <div className="text-center">
        <div className="text-2xl font-bold text-foreground">
          {completedSections}/{totalSections}
        </div>
        <div className="text-xs text-muted-foreground">已生成章节</div>
        <Progress value={progress} className="h-1 mt-2" />
      </div>

      <div className="text-center">
        <div className="text-2xl font-bold text-primary">
          {(stats.totalTokens / 1000).toFixed(1)}K
        </div>
        <div className="text-xs text-muted-foreground">总Tokens</div>
      </div>

      <div className="text-center">
        <div className="text-2xl font-bold text-green-600">{stats.totalRetrieved}</div>
        <div className="text-xs text-muted-foreground">检索文档</div>
      </div>

      <div className="text-center">
        <div className="text-2xl font-bold text-orange-600">
          {(stats.totalElapsed / 60000).toFixed(1)}m
        </div>
        <div className="text-xs text-muted-foreground">总耗时</div>
      </div>
    </div>
  );
};

// =====================================================
// 主面板组件
// =====================================================

export const AIGenerationPanel: React.FC<AIGenerationPanelProps> = ({
  projectId,
  knowledgeBaseId,
  sections: initialSections,
  onSectionsUpdate,
  onViewSection,
  onSelectKnowledgeBase,
}) => {
  // 状态
  const [sections, setSections] = useState<SectionItem[]>(initialSections);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [stats, setStats] = useState<GenerationStats>({
    totalGenerated: 0,
    totalTokens: 0,
    totalRetrieved: 0,
    totalElapsed: 0,
  });

  // 同步外部sections
  useEffect(() => {
    setSections(initialSections);
  }, [initialSections]);

  // 计算统计
  const completedSections = sections.filter((s) => s.status === 'completed').length;
  const totalSections = sections.length;

  // 选中的章节
  const selectedSection = sections.find((s) => s.id === selectedSectionId) || null;

  // 生成单个章节
  const handleGenerate = useCallback(async (sectionId: string) => {
    if (!knowledgeBaseId) {
      alert('请先选择知识库');
      return;
    }

    setGeneratingId(sectionId);
    setSelectedSectionId(sectionId);
    setIsStreaming(true);
    setStreamingContent('');

    try {
      const response = await fetch(
        `/api/projects/${projectId}/sections/${sectionId}/generate/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            knowledgeBaseIds: [knowledgeBaseId],
          }),
        }
      );

      if (!response.ok) {
        throw new Error('生成请求失败');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'chunk') {
                setStreamingContent((prev) => prev + data.content);
              } else if (data.type === 'done') {
                // 更新章节状态
                setSections((prev) =>
                  prev.map((s) =>
                    s.id === sectionId
                      ? {
                          ...s,
                          status: 'completed' as SectionStatus,
                          hasContent: true,
                          wordCount: data.wordCount,
                          metadata: data.metadata,
                        }
                      : s
                  )
                );

                // 更新统计
                setStats((prev) => ({
                  totalGenerated: prev.totalGenerated + 1,
                  totalTokens: prev.totalTokens + (data.metadata?.contextTokens || 0),
                  totalRetrieved: prev.totalRetrieved + (data.metadata?.retrievedChunks || 0),
                  totalElapsed: prev.totalElapsed + (data.metadata?.elapsed || 0),
                }));
              } else if (data.type === 'error') {
                setSections((prev) =>
                  prev.map((s) =>
                    s.id === sectionId
                      ? { ...s, status: 'failed' as SectionStatus, error: data.error }
                      : s
                  )
                );
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error) {
      console.error('生成失败:', error);
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? {
                ...s,
                status: 'failed' as SectionStatus,
                error: error instanceof Error ? error.message : '生成失败',
              }
            : s
        )
      );
    } finally {
      setGeneratingId(null);
      setIsStreaming(false);
      onSectionsUpdate();
    }
  }, [projectId, knowledgeBaseId, onSectionsUpdate]);

  // 重试
  const handleRetry = useCallback((sectionId: string) => {
    handleGenerate(sectionId);
  }, [handleGenerate]);

  // 递归获取所有待生成的叶子章节（实际内容章节）
  const getPendingLeafSections = useCallback((items: SectionItem[]): SectionItem[] => {
    const result: SectionItem[] = [];
    
    function traverse(sections: SectionItem[]) {
      for (const section of sections) {
        const hasChildren = section.children && section.children.length > 0;
        
        if (!hasChildren) {
          // 叶子节点：没有子章节的实际内容章节
          if (section.status === 'pending') {
            result.push(section);
          }
        } else {
          // 非叶子节点：递归遍历子章节
          traverse(section.children!);
        }
      }
    }
    
    traverse(items);
    return result;
  }, []);

  // 批量生成
  const handleBatchGenerate = useCallback(async () => {
    // 递归获取所有待生成的叶子章节（包括二级、三级等子章节）
    const pendingSections = getPendingLeafSections(sections);
    
    if (pendingSections.length === 0) {
      alert('没有待生成的章节');
      return;
    }

    setBatchMode(true);

    for (const section of pendingSections) {
      await handleGenerate(section.id);
    }

    setBatchMode(false);
  }, [sections, handleGenerate, getPendingLeafSections]);

  // 查看详情
  const handleView = useCallback(() => {
    if (selectedSectionId) {
      onViewSection(selectedSectionId);
    }
  }, [selectedSectionId, onViewSection]);

  return (
    <div className="space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI章节生成
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            基于知识库智能生成标书章节内容
          </p>
        </div>
        <div className="flex gap-2">
          {selectedSection && selectedSection.hasContent && (
            <Button variant="outline" size="sm" onClick={handleView}>
              <Eye className="h-4 w-4 mr-2" />
              查看详情
            </Button>
          )}
          {!knowledgeBaseId ? (
            <Button
              onClick={onSelectKnowledgeBase}
              size="sm"
              variant="default"
            >
              <Database className="h-4 w-4 mr-2" />
              选择知识库
            </Button>
          ) : (
            <Button
              onClick={handleBatchGenerate}
              disabled={batchMode}
              size="sm"
            >
              {batchMode ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  批量生成中...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  一键生成全部
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* 统计栏 */}
      <StatsBar
        stats={stats}
        totalSections={totalSections}
        completedSections={completedSections}
      />

      {/* 主内容区 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 左侧：章节列表 */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              章节列表
            </CardTitle>
            <CardDescription>
              点击章节可预览内容，点击播放按钮开始生成
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[400px]">
              <div className="p-3 space-y-1">
                {sections.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p>暂无章节</p>
                  </div>
                ) : (
                  sections.map((section) => (
                    <SectionListItem
                      key={section.id}
                      section={section}
                      selectedSectionId={selectedSectionId}
                      generatingId={generatingId}
                      onSelect={setSelectedSectionId}
                      onGenerate={handleGenerate}
                      onRetry={handleRetry}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* 右侧：内容预览 */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                内容预览
              </CardTitle>
              {isStreaming && (
                <Badge variant="outline" className="text-primary border-primary/30 animate-pulse">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  生成中
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[400px]">
              <ContentPreview
                section={selectedSection}
                streamingContent={streamingContent}
                isStreaming={isStreaming}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 知识库提示 */}
      {!knowledgeBaseId && (
        <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertCircle className="h-5 w-5" />
            <span className="font-medium">请先选择知识库</span>
            <span className="text-sm opacity-80">AI生成需要从知识库中检索相关内容</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-300 text-amber-700 hover:bg-amber-100"
            onClick={onSelectKnowledgeBase}
          >
            <Plus className="h-4 w-4 mr-1" />
            选择知识库
          </Button>
        </div>
      )}
    </div>
  );
};

export default AIGenerationPanel;
