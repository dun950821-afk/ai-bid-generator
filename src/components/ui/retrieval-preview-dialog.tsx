'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText,
  Copy,
  Maximize2,
  Minimize2,
  ExternalLink,
  CheckCircle2,
  Hash,
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
import { cn } from '@/lib/utils';

export interface RetrievalPreviewProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  documentName: string;
  score: number; // 例如 0.8
  content: string; // Markdown 格式的内容
  chunkIndex?: number; // 分块索引
  metadata?: Record<string, any>; // 元数据
}

/**
 * RAG 向量检索预览对话框
 * 专门用于展示检索结果，支持 Markdown 渲染
 */
export default function RetrievalPreviewDialog({
  isOpen,
  onOpenChange,
  documentName,
  score,
  content,
  chunkIndex,
  metadata,
}: RetrievalPreviewProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 格式化相关度得分 (0.8 -> 80.0%)
  const formattedScore = (score * 100).toFixed(1) + '%';

  // 根据分数获取颜色
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-700 bg-green-50 border-green-200 hover:bg-green-50';
    if (score >= 0.6) return 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-50';
    if (score >= 0.4) return 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-50';
    return 'text-slate-600 bg-slate-50 border-slate-200 hover:bg-slate-50';
  };

  // 复制内容到剪贴板
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'p-0 gap-0 overflow-hidden bg-white shadow-xl border-slate-200 transition-all duration-300',
          isFullscreen
            ? 'w-screen h-screen max-w-none m-0 rounded-none'
            : 'max-w-3xl max-h-[85vh] rounded-xl'
        )}
      >
        {/* 精致的头部区域 */}
        <DialogHeader className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 text-blue-600 rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                {documentName}
                {chunkIndex !== undefined && (
                  <Badge variant="outline" className="text-xs font-normal text-slate-500 bg-white">
                    <Hash className="w-3 h-3 mr-1" />
                    分块 #{chunkIndex + 1}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                <span>RAG 向量检索片段</span>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                {/* 用精美的 Badge 展示匹配度 */}
                <Badge
                  variant="outline"
                  className={cn(
                    'px-1.5 h-5 font-mono text-xs',
                    getScoreColor(score)
                  )}
                >
                  相关度: {formattedScore}
                </Badge>
              </DialogDescription>
            </div>
          </div>

          {/* 右侧操作按钮 */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="h-8 w-8 text-slate-400 hover:text-slate-600"
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
              className="h-8 w-8 text-slate-400 hover:text-blue-600"
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

        {/* 内容渲染区：使用 Tailwind Typography (Prose) */}
        <div
          className={cn(
            'p-6 overflow-y-auto bg-white',
            isFullscreen ? 'max-h-[calc(100vh-80px)]' : 'max-h-[60vh]',
            'custom-scrollbar'
          )}
        >
          <div
            className="prose prose-sm md:prose-base prose-slate max-w-none
            prose-headings:font-bold prose-headings:text-slate-800
            prose-p:text-slate-600 prose-p:leading-relaxed
            prose-a:text-blue-600 hover:prose-a:text-blue-500
            /* 表格优化 */
            prose-table:w-full prose-table:border-collapse prose-table:my-2
            prose-th:bg-slate-50 prose-th:text-slate-700 prose-th:font-semibold prose-th:p-3 prose-th:text-left prose-th:border prose-th:border-slate-200
            prose-td:p-3 prose-td:border prose-td:border-slate-200 prose-td:align-top prose-td:text-slate-600
            /* 列表优化 */
            prose-li:marker:text-slate-400
            /* 代码优化 */
            prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:text-blue-600 prose-code:before:content-none prose-code:after:content-none
            /* 引用优化 */
            prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:bg-blue-50/50 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:my-4 prose-blockquote:not-italic prose-blockquote:text-slate-700
          "
          >
            {content ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // 自定义表格渲染
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-4 rounded-lg border border-slate-200">
                      <table className="min-w-full divide-y divide-slate-200">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
                  tbody: ({ children }) => (
                    <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>
                  ),
                  tr: ({ children }) => (
                    <tr className="hover:bg-slate-50/50 transition-colors">{children}</tr>
                  ),
                  th: ({ children }) => (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="px-4 py-3 text-sm text-slate-600">{children}</td>
                  ),
                  // 自定义链接
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-1"
                    >
                      {children}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            ) : (
              <p className="text-slate-400 italic">暂无内容片段...</p>
            )}
          </div>
        </div>

        {/* 元数据展示（如果有） */}
        {metadata && Object.keys(metadata).length > 0 && (
          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              {metadata.word_count && (
                <span className="flex items-center gap-1">
                  <span className="font-medium">字数:</span> {metadata.word_count}
                </span>
              )}
              {metadata.char_count && (
                <span className="flex items-center gap-1">
                  <span className="font-medium">字符:</span> {metadata.char_count}
                </span>
              )}
              {metadata.section_title && (
                <span className="flex items-center gap-1">
                  <span className="font-medium">章节:</span> {metadata.section_title}
                </span>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
