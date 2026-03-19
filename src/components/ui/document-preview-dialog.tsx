'use client';

import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText,
  Copy,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Hash,
  Download,
  File,
  FileImage,
  FileSpreadsheet,
  Clock,
  HardDrive,
  Layers,
  Loader2,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface Chunk {
  id: string;
  chunk_index: number;
  content: string;
  metadata?: {
    section_title?: string;
    word_count?: number;
    char_count?: number;
  };
}

export interface DocumentPreviewDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    id: string;
    name: string;
    originalName?: string;
    fileType: string;
    fileSize: number;
    status: string;
    chunkCount: number;
    tags?: Array<{ id: string; name: string; color: string }>;
    createdAt?: string;
  } | null;
  knowledgeBaseId: string;
}

// 获取文件图标
function getFileIcon(fileType: string) {
  if (fileType.includes('pdf')) return <File className="w-5 h-5 text-red-500" />;
  if (fileType.includes('image')) return <FileImage className="w-5 h-5 text-blue-500" />;
  if (fileType.includes('spreadsheet') || fileType.includes('excel'))
    return <FileSpreadsheet className="w-5 h-5 text-green-500" />;
  return <FileText className="w-5 h-5 text-slate-500" />;
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// 获取状态显示
function getStatusConfig(status: string) {
  const configs: Record<string, { label: string; colorClass: string }> = {
    completed: { label: '已完成', colorClass: 'text-green-700 bg-green-50 border-green-200' },
    processing: { label: '处理中', colorClass: 'text-blue-700 bg-blue-50 border-blue-200' },
    pending: { label: '待处理', colorClass: 'text-amber-700 bg-amber-50 border-amber-200' },
    failed: { label: '处理失败', colorClass: 'text-red-700 bg-red-50 border-red-200' },
  };
  return configs[status] || { label: status, colorClass: 'text-slate-600 bg-slate-50 border-slate-200' };
}

/**
 * 文档预览对话框
 * 用于展示文档详情和所有分块内容
 * 
 * 优化：
 * 1. <br/> 预处理：将 HTML 换行符转换为 Markdown 标准换行
 * 2. 表格自适应：设置 w-full 和 border-collapse
 * 3. Flexbox 布局：严格划分头部和滚动区
 */
export default function DocumentPreviewDialog({
  isOpen,
  onOpenChange,
  document,
  knowledgeBaseId,
}: DocumentPreviewDialogProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('content');

  // 加载文档分块
  useEffect(() => {
    if (isOpen && document?.id) {
      loadChunks();
    }
  }, [isOpen, document?.id]);

  const loadChunks = async () => {
    if (!document) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/knowledge-bases/${knowledgeBaseId}/documents/${document.id}/chunks`
      );
      const data = await res.json();
      if (data.success && data.chunks) {
        setChunks(data.chunks.sort((a: Chunk, b: Chunk) => a.chunk_index - b.chunk_index));
      }
    } catch (error) {
      console.error('加载分块失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 🌟 核心优化 1：<br/> 预处理
  const processedContent = useMemo(() => {
    const rawContent = chunks.map((c) => c.content).join('\n\n---\n\n');
    if (!rawContent) return '';
    return rawContent
      .replace(/<br\/>/gi, '\n\n')
      .replace(/<br>/gi, '\n\n')
      .replace(/<br \/>/gi, '\n\n');
  }, [chunks]);

  // 复制全部内容
  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(processedContent);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 下载文档
  const handleDownload = async () => {
    if (!document) return;
    try {
      const res = await fetch(
        `/api/knowledge-bases/${knowledgeBaseId}/documents/${document.id}/download`
      );
      const data = await res.json();
      if (data.success && data.data?.url) {
        window.open(data.data.url, '_blank');
      }
    } catch (error) {
      console.error('下载失败:', error);
    }
  };

  if (!document) return null;

  const statusConfig = getStatusConfig(document.status);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'p-0 gap-0 overflow-hidden bg-white shadow-xl border-slate-200 transition-all duration-300 flex flex-col',
          isFullscreen
            ? 'w-screen h-screen max-w-none m-0 rounded-none'
            : 'max-w-5xl max-h-[90vh] rounded-xl'
        )}
      >
        {/* ========== 头部区域 (固定高度) ========== */}
        <DialogHeader className="shrink-0 px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50/50 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-lg shadow-sm">
              {getFileIcon(document.fileType)}
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                {document.name || document.originalName || '文档预览'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                <span>文档详情</span>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <Badge variant="outline" className={cn('text-xs', statusConfig.colorClass)}>
                  {statusConfig.label}
                </Badge>
              </DialogDescription>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopyAll}
              className="h-8 w-8 text-slate-400 hover:text-slate-600 bg-white/50"
              title="复制全部内容"
              disabled={chunks.length === 0}
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
              onClick={handleDownload}
              className="h-8 w-8 text-slate-400 hover:text-slate-600 bg-white/50"
              title="下载文档"
            >
              <Download className="w-4 h-4" />
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

        {/* ========== 元数据栏 (固定高度) ========== */}
        <div className="shrink-0 px-6 py-3 border-b border-slate-100 bg-white">
          <div className="flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <HardDrive className="w-3.5 h-3.5" />
              <span className="font-medium">大小:</span> {formatFileSize(document.fileSize)}
            </span>
            <span className="flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />
              <span className="font-medium">类型:</span> {document.fileType}
            </span>
            <span className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
              <span className="font-medium">分块:</span> {document.chunkCount || chunks.length}
            </span>
            {document.createdAt && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span className="font-medium">创建:</span>{' '}
                {new Date(document.createdAt).toLocaleDateString()}
              </span>
            )}
          </div>
          {/* 标签展示 */}
          {document.tags && document.tags.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs font-medium text-slate-500">标签:</span>
              <div className="flex flex-wrap gap-1.5">
                {document.tags.map((tag) => (
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

        {/* ========== 内容区域 (flex-1 可滚动) ========== */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 min-h-0 flex flex-col"
        >
          <div className="shrink-0 px-6 pt-3 border-b border-slate-100 bg-white">
            <TabsList className="bg-slate-100/50">
              <TabsTrigger value="content" className="text-xs">
                全文预览
              </TabsTrigger>
              <TabsTrigger value="chunks" className="text-xs">
                分块列表 ({chunks.length})
              </TabsTrigger>
            </TabsList>
          </div>

          {/* 全文预览 Tab */}
          <TabsContent value="content" className="flex-1 min-h-0 m-0 overflow-hidden">
            <div className="h-full overflow-y-auto bg-white p-6 custom-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  <span className="ml-2 text-sm text-slate-500">加载中...</span>
                </div>
              ) : chunks.length > 0 ? (
                /* 🌟 核心优化 2：终极 CSS Prosemaker 打磨 🌟 */
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
                  
                  /* 🌟 终极优化：表格自动适应容器宽度 🌟 */
                  prose-table:w-full prose-table:border-collapse prose-table:my-4 prose-table:border prose-table:border-slate-200 prose-table:rounded-lg prose-table:overflow-hidden
                  prose-thead:bg-slate-50
                  prose-th:bg-slate-50 prose-th:text-slate-700 prose-th:text-xs prose-th:font-semibold prose-th:p-4 prose-th:text-left prose-th:border prose-th:border-slate-200
                  prose-td:p-4 prose-td:border prose-td:border-slate-200 prose-td:align-top prose-td:text-slate-600 prose-td:text-sm prose-td:leading-relaxed
                  prose-tr:hover:bg-slate-50/50
                  
                  prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
                  prose-hr:border-slate-200 prose-hr:my-6
                "
                >
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
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>文档暂无内容</p>
                  <p className="text-xs mt-1">请等待文档处理完成</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* 分块列表 Tab */}
          <TabsContent value="chunks" className="flex-1 min-h-0 m-0 overflow-hidden">
            <div className="h-full overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : chunks.length > 0 ? (
                chunks.map((chunk) => (
                  <div
                    key={chunk.id}
                    className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="text-xs font-mono">
                        <Hash className="w-3 h-3 mr-1" />
                        分块 {chunk.chunk_index + 1}
                      </Badge>
                      {chunk.metadata?.section_title && (
                        <span className="text-xs text-slate-500">
                          {chunk.metadata.section_title}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 line-clamp-4">{chunk.content}</p>
                    {chunk.metadata?.char_count && (
                      <p className="text-xs text-slate-400 mt-2">
                        {chunk.metadata.char_count} 字符
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <Layers className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>暂无分块数据</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
