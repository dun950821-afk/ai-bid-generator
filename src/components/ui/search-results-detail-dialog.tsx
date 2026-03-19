'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Search,
  Copy,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Hash,
  FileText,
  Calendar,
  Tag,
  Layers,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface SearchDetail {
  id?: string;
  documentName: string;
  documentId?: string;
  score: number;
  content: string;
  chunkIndex?: number;
  metadata?: {
    section_title?: string;
    word_count?: number;
    char_count?: number;
    created_at?: string;
    tags?: Array<{ id: string; name: string; color: string }>;
  };
}

export interface SearchResultsDetailDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  results: SearchDetail[];
  currentIndex: number;
  onNavigate: (index: number) => void;
}

// 根据分数获取颜色配置
function getScoreConfig(score: number) {
  if (score >= 0.85) return { label: '高度相关', colorClass: 'text-green-700 bg-green-50 border-green-200', barColor: 'bg-green-500' };
  if (score >= 0.7) return { label: '较为相关', colorClass: 'text-blue-700 bg-blue-50 border-blue-200', barColor: 'bg-blue-500' };
  if (score >= 0.5) return { label: '部分相关', colorClass: 'text-amber-700 bg-amber-50 border-amber-200', barColor: 'bg-amber-500' };
  return { label: '弱相关', colorClass: 'text-slate-600 bg-slate-50 border-slate-200', barColor: 'bg-slate-400' };
}

/**
 * 搜索结果详细展示对话框
 * 支持导航浏览所有搜索结果
 */
export default function SearchResultsDetailDialog({
  isOpen,
  onOpenChange,
  results,
  currentIndex,
  onNavigate,
}: SearchResultsDetailDialogProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const currentResult = results[currentIndex];
  const totalResults = results.length;

  // 复制内容
  const handleCopy = async () => {
    if (!currentResult) return;
    try {
      await navigator.clipboard.writeText(currentResult.content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  if (!currentResult) return null;

  const scoreConfig = getScoreConfig(currentResult.score);
  const formattedScore = (currentResult.score * 100).toFixed(1);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'p-0 gap-0 overflow-hidden bg-white shadow-xl border-slate-200 transition-all duration-300',
          isFullscreen
            ? 'w-screen h-screen max-w-none m-0 rounded-none'
            : 'max-w-3xl max-h-[90vh] rounded-xl'
        )}
      >
        {/* 头部区域 */}
        <DialogHeader className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50/50 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-lg shadow-sm">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                搜索结果详情
                <Badge variant="outline" className="font-mono text-xs bg-white">
                  {currentIndex + 1} / {totalResults}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                知识库语义检索匹配结果
              </DialogDescription>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="h-8 w-8 text-slate-400 hover:text-slate-600 bg-white/50"
              title="复制内容"
            >
              {isCopied ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="h-8 w-8 text-slate-400 hover:text-blue-600 bg-white/50"
              title={isFullscreen ? '退出全屏' : '全屏查看'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </Button>
          </div>
        </DialogHeader>

        {/* 相关度进度条 */}
        <div className="px-6 py-3 border-b border-slate-100 bg-white">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600">匹配度</span>
              <Badge variant="outline" className={cn('text-xs font-mono', scoreConfig.colorClass)}>
                {formattedScore}%
              </Badge>
              <Badge variant="outline" className={cn('text-xs', scoreConfig.colorClass)}>
                {scoreConfig.label}
              </Badge>
            </div>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', scoreConfig.barColor)}
              style={{ width: `${currentResult.score * 100}%` }}
            />
          </div>
        </div>

        {/* 文档信息栏 */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-800">
              {currentResult.documentName}
            </span>
            {currentResult.chunkIndex !== undefined && (
              <Badge variant="outline" className="text-xs font-mono">
                <Hash className="w-3 h-3 mr-1" />
                分块 #{currentResult.chunkIndex + 1}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-slate-500">
            {currentResult.metadata?.section_title && (
              <span className="flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" />
                <span className="font-medium">章节:</span> {currentResult.metadata.section_title}
              </span>
            )}
            {currentResult.metadata?.char_count && (
              <span className="flex items-center gap-1">
                <span className="font-medium">字符:</span> {currentResult.metadata.char_count}
              </span>
            )}
            {currentResult.metadata?.created_at && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span className="font-medium">创建:</span>{' '}
                {new Date(currentResult.metadata.created_at).toLocaleDateString()}
              </span>
            )}
          </div>
          {/* 标签展示 */}
          {currentResult.metadata?.tags && currentResult.metadata.tags.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <Tag className="w-3.5 h-3.5 text-slate-400" />
              <div className="flex flex-wrap gap-1.5">
                {currentResult.metadata.tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="outline"
                    style={{
                      backgroundColor: tag.color + '15',
                      color: tag.color,
                      borderColor: tag.color,
                    }}
                    className="text-xs"
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 内容区域 */}
        <ScrollArea className={cn(isFullscreen ? 'h-[calc(100vh-320px)]' : 'h-[45vh]')}>
          <div className="p-6">
            <div className="prose prose-sm prose-slate max-w-none prose-headings:font-bold prose-p:text-slate-700 prose-p:leading-relaxed prose-table:border-collapse prose-th:bg-slate-50 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-slate-200">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-4 rounded-lg border border-slate-200">
                      <table className="min-w-full">{children}</table>
                    </div>
                  ),
                }}
              >
                {currentResult.content}
              </ReactMarkdown>
            </div>
          </div>
        </ScrollArea>

        {/* 底部导航 */}
        {totalResults > 1 && (
          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate(currentIndex - 1)}
              disabled={currentIndex === 0}
              className="gap-1"
            >
              ← 上一个
            </Button>
            <div className="flex items-center gap-1">
              {results.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => onNavigate(idx)}
                  className={cn(
                    'w-2 h-2 rounded-full transition-all',
                    idx === currentIndex ? 'bg-blue-600 w-4' : 'bg-slate-300 hover:bg-slate-400'
                  )}
                />
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate(currentIndex + 1)}
              disabled={currentIndex === totalResults - 1}
              className="gap-1"
            >
              下一个 →
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
