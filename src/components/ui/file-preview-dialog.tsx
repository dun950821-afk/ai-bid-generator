'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import FilePreviewWorkspace from './file-preview-workspace';
import { Loader2 } from 'lucide-react';

export interface FilePreviewDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  categoryName?: string;
  documentName?: string;
  fileExtension?: string;
  previewUrl?: string;
  documentId?: string; // 百炼文档ID，如果提供则从API获取预览URL
}

/**
 * 文件预览对话框
 * 包装 FilePreviewWorkspace 组件，提供对话框容器
 */
export default function FilePreviewDialog({
  isOpen,
  onOpenChange,
  categoryName = '知识库文档',
  documentName = '文件预览',
  fileExtension = 'pdf',
  previewUrl,
  documentId,
}: FilePreviewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [fetchedPreviewUrl, setFetchedPreviewUrl] = useState<string>('');
  const [error, setError] = useState<string>('');

  // 如果提供了 documentId，则从 API 获取预览 URL
  useEffect(() => {
    if (isOpen && documentId && !previewUrl) {
      setLoading(true);
      setError('');
      
      fetch(`/api/bailian/documents/${documentId}/preview`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data?.url) {
            setFetchedPreviewUrl(data.data.url);
          } else {
            setError(data.error || '获取预览链接失败');
          }
        })
        .catch(err => {
          setError(err.message || '获取预览链接失败');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, documentId, previewUrl]);

  // 确定使用哪个预览 URL
  const effectivePreviewUrl = previewUrl || fetchedPreviewUrl;

  // 加载中状态
  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] p-0 gap-0 overflow-hidden">
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-muted-foreground">正在获取预览链接...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // 错误状态
  if (error && !effectivePreviewUrl) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] p-0 gap-0 overflow-hidden">
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-4 text-center px-8">
              <p className="text-sm text-red-500">{error}</p>
              <p className="text-xs text-muted-foreground">无法加载文档预览</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] p-0 gap-0 overflow-hidden">
        <FilePreviewWorkspace
          categoryName={categoryName}
          documentName={documentName}
          fileExtension={fileExtension}
          previewUrl={effectivePreviewUrl}
        />
      </DialogContent>
    </Dialog>
  );
}
