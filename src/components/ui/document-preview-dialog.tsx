'use client';

import React, { useState, useEffect } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
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

  // 复制全部内容
  const handleCopyAll = async () => {
    const allContent = chunks.map((c) => c.content).join('\n\n');
    try {
      await navigator.clipboard.writeText(allContent);
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
          'p-0 gap-0 overflow-hidden bg-white shadow-xl border-slate-200 transition-all duration-300',
          isFullscreen
            ? 'w-screen h-screen max-w-none m-0 rounded-none'
            : 'max-w-4xl max-h-[90vh] rounded-xl'
        )}
      >
        {/* 头部区域 */}
        <DialogHeader className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 text-blue-600 rounded-lg">
              {getFileIcon(document.fileType)}
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-slate-800">
                {document.name || document.originalName || '文档预览'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
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
              className="h-8 w-8 text-slate-400 hover:text-slate-600"
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
              className="h-8 w-8 text-slate-400 hover:text-slate-600"
              title="下载文档"
            >
              <Download className="w-4 h-4" />
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

        {/* 元数据栏 */}
        <div className="px-6 py-3 border-b border-slate-100 bg-white">
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

        {/* 内容区域 - 使用 Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className={cn('flex-1 flex flex-col', isFullscreen ? 'h-[calc(100vh-200px)]' : 'h-[55vh]')}
        >
          <div className="px-6 pt-3 border-b border-slate-100">
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
          <TabsContent value="content" className="flex-1 m-0 overflow-hidden">
            <ScrollArea className={cn('h-full', isFullscreen ? 'h-[calc(100vh-250px)]' : 'h-[50vh]')}>
              <div className="p-6">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                    <span className="ml-2 text-sm text-slate-500">加载中...</span>
                  </div>
                ) : chunks.length > 0 ? (
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
                      {chunks.map((c) => c.content).join('\n\n')}
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
            </ScrollArea>
          </TabsContent>

          {/* 分块列表 Tab */}
          <TabsContent value="chunks" className="flex-1 m-0 overflow-hidden">
            <ScrollArea className={cn('h-full', isFullscreen ? 'h-[calc(100vh-250px)]' : 'h-[50vh]')}>
              <div className="p-4 space-y-3">
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
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
