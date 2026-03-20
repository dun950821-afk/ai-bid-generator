'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  FileText, Loader2, Download, 
  ChevronLeft, ChevronRight,
  FileSearch, Layers, Hash, Clock, ExternalLink, RefreshCw, AlertTriangle
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChunkData {
  text: string;
  score: number;
  metadata: {
    file_path?: string;
    image_url?: string[];
    title?: string;
    doc_name?: string;
    doc_id?: string;
    content?: string;
  };
}

interface FilePreviewWorkspaceProps {
  categoryName?: string;
  documentName?: string;
  fileExtension?: string;
  previewUrl?: string;
  documentId?: string;
  downloadUrl?: string;
  indexId?: string;
}

export default function FilePreviewWorkspace({
  categoryName = '默认类目',
  documentName = '文档预览',
  fileExtension = 'pdf',
  previewUrl,
  documentId,
  downloadUrl,
  indexId,
}: FilePreviewWorkspaceProps) {
  const [downloading, setDownloading] = useState(false);
  const [chunks, setChunks] = useState<ChunkData[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [chunksError, setChunksError] = useState<string>('');
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [pageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  // 获取文档分块数据
  const fetchChunks = useCallback(async (page: number = 1) => {
    if (!indexId || !documentId) {
      setChunksError('缺少知识库ID或文档ID');
      return;
    }
    
    setChunksLoading(true);
    setChunksError('');
    setImageErrors(new Set()); // 清除之前的图片错误
    
    try {
      const response = await fetch(
        `/api/bailian/test-chunks?indexId=${indexId}&fileId=${documentId}&pageSize=${pageSize}&pageNum=${page}`
      );
      const data = await response.json();
      
      if (data.success && data.result?.data) {
        setChunks(data.result.data.nodes || []);
        setTotalChunks(data.result.data.total || 0);
        setCurrentPage(page);
        setCurrentChunkIndex(0); // 重置到第一个分块
      } else {
        setChunksError(data.error || '获取分块数据失败');
      }
    } catch (error: any) {
      setChunksError(error.message || '获取分块数据失败');
    } finally {
      setChunksLoading(false);
    }
  }, [indexId, documentId, pageSize]);

  // 当组件加载时获取分块数据
  useEffect(() => {
    if (indexId && documentId) {
      fetchChunks(1);
    }
  }, [indexId, documentId, fetchChunks]);

  // 处理下载
  const handleDownload = async () => {
    try {
      setDownloading(true);
      
      let downloadLink = downloadUrl;
      
      if (!downloadLink && documentId) {
        const res = await fetch(`/api/bailian/files/${documentId}/download`);
        const data = await res.json();
        
        if (data.success && data.data?.parseResultDownloadUrl) {
          downloadLink = data.data.parseResultDownloadUrl;
        }
      }
      
      if (downloadLink) {
        const response = await fetch(downloadLink);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = documentName || 'document';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      } else {
        alert('暂无下载链接');
      }
    } catch (error) {
      console.error('下载失败:', error);
      alert('下载失败，请稍后重试');
    } finally {
      setDownloading(false);
    }
  };

  // 分块导航
  const handlePrevChunk = () => {
    if (currentChunkIndex > 0) {
      setCurrentChunkIndex(currentChunkIndex - 1);
    }
  };

  const handleNextChunk = () => {
    if (currentChunkIndex < chunks.length - 1) {
      setCurrentChunkIndex(currentChunkIndex + 1);
    }
  };

  // 图片加载错误处理
  const handleImageError = (url: string) => {
    setImageErrors(prev => new Set(prev).add(url));
  };

  // 当前分块
  const currentChunk = chunks[currentChunkIndex];

  // 文件类型配置
  const fileConfig = useMemo(() => {
    return {
      icon: <FileText className="w-3.5 h-3.5 text-blue-500" />,
      badgeClass: "bg-blue-50/50 text-blue-600 border-blue-100",
    };
  }, []);

  return (
    <div className="flex w-full h-full bg-white overflow-hidden">
      
      {/* 全宽分块预览区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* 顶部 Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-base text-slate-800">文档分块预览</h3>
            </div>
            
            <div className="h-4 w-px bg-slate-200" />
            
            <nav className="flex items-center text-sm text-slate-500 whitespace-nowrap">
              <span>{categoryName}</span>
              <ChevronRight className="w-4 h-4 mx-1 text-slate-400" />
              <span className="font-medium text-slate-800 truncate max-w-[200px]" title={documentName}>
                {documentName}
              </span>
            </nav>
            
            <Badge 
              variant="outline" 
              className={cn("flex items-center gap-1.5 px-2 py-0.5 font-normal rounded-md", fileConfig.badgeClass)}
            >
              {fileConfig.icon}
              <span className="text-xs uppercase tracking-wider">{fileExtension}</span>
            </Badge>

            {totalChunks > 0 && (
              <Badge variant="outline" className="text-xs bg-white">
                共 {totalChunks} 个分块
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
             {/* 刷新按钮 - 重新获取分块数据以刷新过期的图片URL */}
             <Button 
               variant="outline" 
               size="sm" 
               className="h-8 text-slate-600 hover:text-slate-800"
               onClick={() => fetchChunks(currentPage)}
               disabled={chunksLoading}
               title="刷新分块数据（图片URL可能已过期）"
             >
               {chunksLoading ? (
                 <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
               ) : (
                 <RefreshCw className="w-4 h-4 mr-1.5" />
               )}
               刷新
             </Button>
             <Button 
               variant="outline" 
               size="sm" 
               className="h-8 text-slate-600 hover:text-slate-800"
               onClick={handleDownload}
               disabled={downloading}
             >
               {downloading ? (
                 <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
               ) : (
                 <Download className="w-4 h-4 mr-1.5" />
               )}
               {downloading ? '下载中...' : '下载'}
             </Button>
          </div>
        </div>

        {/* 分块内容区域 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* 加载状态 */}
          {chunksLoading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <p className="text-sm text-slate-500">正在加载分块数据...</p>
              </div>
            </div>
          )}

          {/* 错误状态 */}
          {chunksError && !chunksLoading && (
            <div className="flex-1 flex items-center justify-center px-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <FileSearch className="w-12 h-12 text-slate-300" />
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-1">加载失败</p>
                  <p className="text-sm text-red-500">{chunksError}</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => fetchChunks(currentPage)}
                >
                  重试
                </Button>
              </div>
            </div>
          )}

          {/* 无数据状态 */}
          {!chunksLoading && !chunksError && chunks.length === 0 && (
            <div className="flex-1 flex items-center justify-center px-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <FileText className="w-12 h-12 text-slate-300" />
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-1">暂无分块数据</p>
                  <p className="text-xs text-slate-400">文档可能尚未完成解析</p>
                </div>
              </div>
            </div>
          )}

          {/* 分块内容展示 */}
          {!chunksLoading && !chunksError && chunks.length > 0 && (
            <>
              {/* 分块导航栏 */}
              <div className="px-6 py-3 border-b border-slate-100 bg-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <Hash className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">
                    分块 {currentChunkIndex + 1} / {chunks.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3"
                    onClick={handlePrevChunk}
                    disabled={currentChunkIndex === 0}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    上一块
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3"
                    onClick={handleNextChunk}
                    disabled={currentChunkIndex === chunks.length - 1}
                  >
                    下一块
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>

              {/* 当前分块内容 */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {currentChunk && (
                  <div className="max-w-4xl mx-auto space-y-6">
                    
                    {/* 分块标题 */}
                    {currentChunk.metadata?.title && (
                      <div className="pb-4 border-b border-slate-200">
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">章节标题</p>
                        <h4 className="text-lg font-semibold text-slate-800">
                          {currentChunk.metadata.title}
                        </h4>
                      </div>
                    )}

                    {/* 分块文本内容 */}
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">文本内容</p>
                      <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                          {currentChunk.text || currentChunk.metadata?.content || '暂无内容'}
                        </p>
                      </div>
                    </div>

                    {/* 图片预览 */}
                    {currentChunk.metadata?.image_url && currentChunk.metadata.image_url.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs text-slate-500 uppercase tracking-wider">
                            相关图片 ({currentChunk.metadata.image_url.length})
                          </p>
                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            图片链接有时效限制，如无法显示请点击刷新
                          </p>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                          {currentChunk.metadata.image_url.map((url, idx) => {
                            const hasError = imageErrors.has(url);
                            return (
                              <div 
                                key={idx}
                                className="group relative aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200 hover:border-blue-300 transition-colors"
                              >
                                {hasError ? (
                                  <div className="w-full h-full flex flex-col items-center justify-center text-center p-4 bg-amber-50">
                                    <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
                                    <p className="text-xs text-amber-600 font-medium">图片链接已过期</p>
                                    <p className="text-xs text-slate-400 mt-1">请点击顶部"刷新"按钮</p>
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="mt-2 h-auto p-0 text-blue-600"
                                      onClick={() => fetchChunks(currentPage)}
                                    >
                                      立即刷新
                                    </Button>
                                  </div>
                                ) : (
                                  <>
                                    <img 
                                      src={url} 
                                      alt={`图片 ${idx + 1}`}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                      onError={() => handleImageError(url)}
                                      loading="lazy"
                                      referrerPolicy="no-referrer"
                                    />
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="absolute inset-0 cursor-pointer"
                                      title="点击在新窗口查看大图"
                                    />
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <span className="bg-black/60 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                                        <ExternalLink className="w-3 h-3" />
                                        打开
                                      </span>
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {currentChunk.metadata.image_url.length > 6 && (
                          <p className="text-xs text-slate-400 mt-3 text-center">
                            还有 {currentChunk.metadata.image_url.length - 6} 张图片...
                          </p>
                        )}
                      </div>
                    )}

                    {/* 元数据 */}
                    <div className="pt-4 border-t border-slate-200">
                      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                        {currentChunk.metadata?.doc_name && (
                          <div className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" />
                            <span>来源：</span>
                            <span className="text-slate-700 font-medium">{currentChunk.metadata.doc_name}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span>文档ID：</span>
                          <span className="text-slate-700 font-mono">
                            {documentId?.substring(0, 24)}...
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 分块快速导航 */}
              {chunks.length > 1 && (
                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/50 shrink-0">
                  <p className="text-xs text-slate-500 mb-3">快速跳转</p>
                  <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto custom-scrollbar">
                    {chunks.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentChunkIndex(idx)}
                        className={cn(
                          "min-w-[32px] h-8 px-2 rounded-md text-xs font-medium transition-all",
                          idx === currentChunkIndex
                            ? "bg-blue-600 text-white shadow-sm"
                            : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                        )}
                      >
                        {idx + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
