'use client';

import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText,
  Copy,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Hash,
  Info,
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
 * 
 * 优化：
 * 1. <br/> 预处理：将 HTML 换行符转换为 Markdown 标准换行
 * 2. 表格自适应：设置 w-full 和 border-collapse
 * 3. Flexbox 布局：严格划分头部和滚动区
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
  const getScoreConfig = (score: number) => {
    if (score >= 0.85) return { label: '高度相关', colorClass: 'text-green-700 bg-green-50 border-green-200', barColor: 'bg-green-500' };
    if (score >= 0.7) return { label: '较为相关', colorClass: 'text-blue-700 bg-blue-50 border-blue-200', barColor: 'bg-blue-500' };
    if (score >= 0.5) return { label: '部分相关', colorClass: 'text-amber-700 bg-amber-50 border-amber-200', barColor: 'bg-amber-500' };
    return { label: '弱相关', colorClass: 'text-slate-600 bg-slate-50 border-slate-200', barColor: 'bg-slate-400' };
  };

  const scoreConfig = getScoreConfig(score);

  // 🌟 核心优化 1：<br/> 预处理 - 将 HTML 换行符转换为 Markdown 标准换行
  const processedContent = useMemo(() => {
    if (!content) return '';
    return content
      .replace(/<br\/>/gi, '\n\n')  // 将 <br/> 替换为 Markdown 换行
      .replace(/<br>/gi, '\n\n')    // 同时处理 <br>
      .replace(/<br \/>/gi, '\n\n'); // 处理 <br />
  }, [content]);

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
          'p-0 gap-0 overflow-hidden bg-white shadow-xl border-slate-200 transition-all duration-300 flex flex-col',
          isFullscreen
            ? 'w-screen h-screen max-w-none m-0 rounded-none'
            : 'max-w-4xl max-h-[90vh] rounded-xl'
        )}
      >
        {/* ========== 头部区域 (固定高度，不滚动) ========== */}
        <DialogHeader className="shrink-0 px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50/50 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-lg shadow-sm">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                {documentName}
                {chunkIndex !== undefined && (
                  <Badge variant="outline" className="text-xs font-mono text-slate-500 bg-white">
                    <Hash className="w-3 h-3 mr-1" />
                    #{chunkIndex + 1}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                <span>RAG 向量检索片段</span>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <Badge variant="outline" className={cn('text-xs font-mono', scoreConfig.colorClass)}>
                  相关度: {formattedScore}
                </Badge>
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

        {/* ========== 相关度进度条 ========== */}
        <div className="shrink-0 px-6 py-3 border-b border-slate-100 bg-white">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-600">匹配度</span>
            <Badge variant="outline" className={cn('text-xs', scoreConfig.colorClass)}>
              {scoreConfig.label}
            </Badge>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', scoreConfig.barColor)}
              style={{ width: `${score * 100}%` }}
            />
          </div>
        </div>

        {/* ========== 元数据展示区 ========== */}
        {metadata && Object.keys(metadata).length > 0 && (
          <div className="shrink-0 px-6 py-2 border-b border-slate-100 bg-slate-50/50">
            <div className="flex flex-wrap gap-4 text-xs text-slate-500">
              {metadata.word_count && (
                <span className="flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  <span className="font-medium">字数:</span> {metadata.word_count}
                </span>
              )}
              {metadata.char_count && (
                <span className="flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  <span className="font-medium">字符:</span> {metadata.char_count}
                </span>
              )}
              {metadata.section_title && (
                <span className="flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  <span className="font-medium">章节:</span> {metadata.section_title}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ========== 内容渲染区 (flex-1 可滚动) ========== */}
        <div
          className={cn(
            'flex-1 min-h-0 overflow-y-auto bg-white p-6',
            'custom-scrollbar'
          )}
        >
          {/* 🌟 核心优化 2：终极 CSS Prosemaker 打磨 - 表格自适应 + 边框合并 */}
          <div
            className="prose prose-sm md:prose-base prose-slate max-w-none
            prose-headings:text-slate-800 prose-headings:font-bold
            prose-h1:text-2xl prose-h1:pb-3 prose-h1:border-b prose-h1:border-slate-200
            prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-slate-100
            prose-h3:text-base prose-h3:mt-6 prose-h3:mb-3
            prose-p:text-slate-700 prose-p:leading-relaxed prose-p:my-3
            prose-ul:my-4 prose-ol:my-4
            prose-li:my-1.5 prose-li:text-slate-700
            prose-li:marker:text-blue-500
            prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:bg-blue-50/50 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:my-4 prose-blockquote:not-italic prose-blockquote:text-slate-700
            prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:text-blue-600 prose-code:before:content-none prose-code:after:content-none
            
            /* 🌟 终极优化：表格自动适应容器宽度并设置专业样式 🌟 */
            prose-table:w-full prose-table:border-collapse prose-table:my-4 prose-table:border prose-table:border-slate-200 prose-table:rounded-lg prose-table:overflow-hidden
            prose-thead:bg-slate-50
            prose-th:bg-slate-50 prose-th:text-slate-700 prose-th:text-xs prose-th:font-semibold prose-th:p-4 prose-th:text-left prose-th:border prose-th:border-slate-200
            prose-td:p-4 prose-td:border prose-td:border-slate-200 prose-td:align-top prose-td:text-slate-600 prose-td:text-sm prose-td:leading-relaxed
            prose-tr:hover:bg-slate-50/50
            
            prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
            prose-hr:border-slate-200 prose-hr:my-6
          "
          >
            {processedContent ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // 自定义表格渲染 - 确保宽度自适应
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-4 rounded-lg border border-slate-200">
                      <table className="min-w-full w-full border-collapse">{children}</table>
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
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="px-4 py-3 text-sm text-slate-600 border-b border-slate-100 align-top">
                      {children}
                    </td>
                  ),
                }}
              >
                {processedContent}
              </ReactMarkdown>
            ) : (
              <p className="text-slate-400 italic">暂无内容片段...</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
