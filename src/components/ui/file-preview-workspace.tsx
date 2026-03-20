'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  ChevronRight, FileText, Image as ImageIcon, Loader2, Download, 
  Maximize2, ChevronLeft, ChevronRight as ChevronRightIcon,
  FileSearch, Layers, Hash, Clock
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
  indexId?: string;  // 知识库ID，用于获取分块数据
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
  const [isLoading, setIsLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [chunks, setChunks] = useState<ChunkData[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [chunksError, setChunksError] = useState<string>('');
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [pageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  // 1. 智能判断文件类型组
  const isImage = useMemo(() => {
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(fileExtension.toLowerCase());
  }, [fileExtension]);

  // 获取文档分块数据
  const fetchChunks = useCallback(async (page: number = 1) => {
    if (!indexId || !documentId) return;
    
    setChunksLoading(true);
    setChunksError('');
    
    try {
      const response = await fetch(
        `/api/bailian/test-chunks?indexId=${indexId}&fileId=${documentId}&pageSize=${pageSize}&pageNum=${page}`
      );
      const data = await response.json();
      
      if (data.success && data.result?.data) {
        setChunks(data.result.data.nodes || []);
        setTotalChunks(data.result.data.total || 0);
        setCurrentPage(page);
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

  // 2. 根据文件类型动态获取 UI 配置
  const fileConfig = useMemo(() => {
    if (isImage) {
      return {
        icon: <ImageIcon className="w-3.5 h-3.5 text-orange-500" />,
        badgeClass: "bg-orange-50/50 text-orange-600 border-orange-100",
      };
    }
    return {
      icon: <FileText className="w-3.5 h-3.5 text-blue-500" />,
      badgeClass: "bg-blue-50/50 text-blue-600 border-blue-100",
    };
  }, [isImage]);

  // 当前分块
  const currentChunk = chunks[currentChunkIndex];

  return (
    <div className="flex w-full h-full bg-slate-50 overflow-hidden">
      
      {/* 🟢 左侧：核心文件预览区 */}
      <div className="flex-1 flex flex-col min-w-0 bg-white border-r border-slate-200 shadow-sm z-10">
        
        {/* 顶部 Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <nav className="flex items-center text-sm text-slate-500 whitespace-nowrap">
              <span className="hover:text-slate-800 cursor-pointer transition-colors">{categoryName}</span>
              <ChevronRight className="w-4 h-4 mx-1 text-slate-400" />
              <span className="font-medium text-slate-800 truncate max-w-[200px]" title={documentName}>
                {documentName}
              </span>
            </nav>
            
            <Badge 
              variant="outline" 
              className={cn("ml-2 flex items-center gap-1.5 px-2 py-0.5 font-normal rounded-md", fileConfig.badgeClass)}
            >
              {fileConfig.icon}
              <span className="text-xs uppercase tracking-wider">{fileExtension}</span>
            </Badge>
          </div>

          <div className="flex items-center gap-2 shrink-0">
             <Button 
               variant="ghost" 
               size="sm" 
               className="h-8 text-slate-500 hover:text-slate-800"
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
             <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-blue-600">
               <Maximize2 className="w-4 h-4" />
             </Button>
          </div>
        </div>

        {/* 核心 Content Area */}
        <div className="flex-1 relative bg-[#f5f6f7] overflow-hidden flex items-center justify-center">
          
          {/* 加载动画 */}
          {isLoading && previewUrl && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#f5f6f7]">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
              <p className="text-sm text-slate-500 font-medium animate-pulse">正在加载文件内容...</p>
            </div>
          )}

          {previewUrl ? (
            isImage ? (
              <div className="w-full h-full p-8 flex items-center justify-center overflow-auto custom-scrollbar">
                <img 
                  src={previewUrl} 
                  alt={documentName}
                  onLoad={() => setIsLoading(false)}
                  className="max-w-full max-h-full object-contain rounded-md shadow-sm border border-slate-200/60 bg-white"
                />
              </div>
            ) : (
              <iframe
                className="w-full h-full border-0 absolute inset-0"
                src={previewUrl}
                onLoad={() => setIsLoading(false)}
                scrolling="no"
                frameBorder="0"
                allowFullScreen
                allow="clipboard-read; clipboard-write" 
                title="Document Preview"
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-8">
              <FileSearch className="w-12 h-12 text-slate-300 mb-4" />
              <p className="text-sm text-slate-400">暂无预览链接</p>
              <p className="text-xs text-slate-400 mt-1">请在右侧查看文档分块内容</p>
            </div>
          )}

        </div>
      </div>

      {/* 🔴 右侧：文档分块预览侧边栏 */}
      <div className="w-[380px] shrink-0 bg-white flex flex-col border-l border-slate-200">
        
        {/* 侧边栏 Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/50 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <h3 className="font-semibold text-sm text-slate-800">文档分块预览</h3>
            </div>
            {totalChunks > 0 && (
              <Badge variant="outline" className="text-xs bg-white">
                共 {totalChunks} 个分块
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">基于百炼智能解析的分块内容</p>
        </div>

        {/* 分块内容区域 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* 加载状态 */}
          {chunksLoading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                <p className="text-sm text-slate-500">正在加载分块数据...</p>
              </div>
            </div>
          )}

          {/* 错误状态 */}
          {chunksError && !chunksLoading && (
            <div className="flex-1 flex items-center justify-center px-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <FileSearch className="w-8 h-8 text-slate-300" />
                <p className="text-sm text-red-500">{chunksError}</p>
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
              <div className="flex flex-col items-center gap-3 text-center">
                <FileText className="w-8 h-8 text-slate-300" />
                <p className="text-sm text-slate-400">暂无分块数据</p>
                <p className="text-xs text-slate-400">文档可能尚未完成解析</p>
              </div>
            </div>
          )}

          {/* 分块内容展示 */}
          {!chunksLoading && !chunksError && chunks.length > 0 && (
            <>
              {/* 分块导航 */}
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs font-medium text-slate-600">
                    分块 {currentChunkIndex + 1} / {chunks.length}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handlePrevChunk}
                    disabled={currentChunkIndex === 0}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleNextChunk}
                    disabled={currentChunkIndex === chunks.length - 1}
                  >
                    <ChevronRightIcon className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* 当前分块内容 */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                {currentChunk && (
                  <div className="space-y-4">
                    {/* 分块标题 */}
                    {currentChunk.metadata?.title && (
                      <div className="pb-3 border-b border-slate-100">
                        <p className="text-xs text-slate-500 mb-1">章节标题</p>
                        <p className="text-sm font-medium text-slate-800">
                          {currentChunk.metadata.title}
                        </p>
                      </div>
                    )}

                    {/* 分块文本内容 */}
                    <div>
                      <p className="text-xs text-slate-500 mb-2">文本内容</p>
                      <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                          {currentChunk.text || currentChunk.metadata?.content || '暂无内容'}
                        </p>
                      </div>
                    </div>

                    {/* 图片预览 */}
                    {currentChunk.metadata?.image_url && currentChunk.metadata.image_url.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-500 mb-2">
                          相关图片 ({currentChunk.metadata.image_url.length})
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {currentChunk.metadata.image_url.slice(0, 4).map((url, idx) => (
                            <div 
                              key={idx}
                              className="aspect-square bg-slate-100 rounded-md overflow-hidden border border-slate-200"
                            >
                              <img 
                                src={url} 
                                alt={`图片 ${idx + 1}`}
                                className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                                onClick={() => window.open(url, '_blank')}
                              />
                            </div>
                          ))}
                        </div>
                        {currentChunk.metadata.image_url.length > 4 && (
                          <p className="text-xs text-slate-400 mt-2 text-center">
                            还有 {currentChunk.metadata.image_url.length - 4} 张图片...
                          </p>
                        )}
                      </div>
                    )}

                    {/* 元数据 */}
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      {currentChunk.metadata?.doc_name && (
                        <div className="flex items-center gap-2 text-xs">
                          <FileText className="w-3 h-3 text-slate-400" />
                          <span className="text-slate-500">来源文档：</span>
                          <span className="text-slate-700">{currentChunk.metadata.doc_name}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-xs">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span className="text-slate-500">分块ID：</span>
                        <span className="text-slate-700 font-mono text-[10px]">
                          {currentChunk.metadata?.doc_id?.substring(0, 20)}...
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 分块快速导航 */}
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/30">
                <p className="text-xs text-slate-500 mb-2">快速跳转</p>
                <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto custom-scrollbar">
                  {chunks.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentChunkIndex(idx)}
                      className={cn(
                        "w-7 h-7 rounded text-xs font-medium transition-all",
                        idx === currentChunkIndex
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
