'use client';

import React, { useState, useMemo } from 'react';
import { ChevronRight, FileText, Image as ImageIcon, Loader2, Download, Maximize2, ZoomIn } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FilePreviewWorkspaceProps {
  categoryName?: string;
  documentName?: string;
  fileExtension?: string; // e.g., 'docx', 'jpg', 'pdf'
  previewUrl: string;     // OSS 签名链接 或 WebOffice 链接
  documentId?: string;    // 文档ID，用于下载
  downloadUrl?: string;   // 下载链接（可选，优先使用）
}

export default function FilePreviewWorkspace({
  categoryName = '默认类目',
  documentName = '营业执照扫描件',
  fileExtension = 'jpg',
  previewUrl,
  documentId,
  downloadUrl,
}: FilePreviewWorkspaceProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  // 1. 智能判断文件类型组
  const isImage = useMemo(() => {
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(fileExtension.toLowerCase());
  }, [fileExtension]);

  // 处理下载
  const handleDownload = async () => {
    try {
      setDownloading(true);
      
      // 如果有直接的下载链接，使用它
      let downloadLink = downloadUrl;
      
      // 否则通过 API 获取下载链接
      if (!downloadLink && documentId) {
        const res = await fetch(`/api/bailian/files/${documentId}/download`);
        const data = await res.json();
        
        if (data.success && data.data?.parseResultDownloadUrl) {
          downloadLink = data.data.parseResultDownloadUrl;
        }
      }
      
      if (downloadLink) {
        // 使用 fetch + blob 方式下载（避免跨域问题）
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

  // 2. 根据文件类型动态获取 UI 配置 (精准复刻原版配色)
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
            
            {/* 动态渲染文件类型 Tag */}
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

        {/* 核心 Content Area：根据文件类型动态分发渲染器 */}
        <div className="flex-1 relative bg-[#f5f6f7] overflow-hidden flex items-center justify-center">
          
          {/* 加载动画 */}
          {isLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#f5f6f7]">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
              <p className="text-sm text-slate-500 font-medium animate-pulse">正在加载文件内容...</p>
            </div>
          )}

          {isImage ? (
            /* 📷 图片渲染模式：使用 object-contain 确保大图不被拉伸，且自动居中 */
            <div className="w-full h-full p-8 flex items-center justify-center overflow-auto custom-scrollbar">
              <img 
                src={previewUrl} 
                alt={documentName}
                onLoad={() => setIsLoading(false)}
                className="max-w-full max-h-full object-contain rounded-md shadow-sm border border-slate-200/60 bg-white"
              />
            </div>
          ) : (
            /* 📄 文档渲染模式：使用 Iframe 嵌入 Office 引擎 */
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
          )}

        </div>
      </div>

      {/* 🔴 右侧：预留的 RAG / 解析侧边栏 */}
      <div className="w-[320px] shrink-0 bg-slate-50 flex flex-col hidden lg:flex">
         <div className="px-5 py-4 border-b border-slate-200 bg-white shrink-0">
            <h3 className="font-semibold text-sm text-slate-800">OCR / 文件解析结果</h3>
         </div>
         <div className="flex-1 p-5 overflow-y-auto custom-scrollbar flex items-center justify-center">
            <p className="text-sm text-slate-400 text-center leading-relaxed">
              如果是图片，这里可以展示 OCR 提取的文本；<br/>如果是标书文档，这里可以展示 RAG 检索分块。
            </p>
         </div>
      </div>

    </div>
  );
}
