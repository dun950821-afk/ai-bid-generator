'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import FilePreviewWorkspace from './file-preview-workspace';
import { Loader2, FileSearch, AlertCircle } from 'lucide-react';

export interface FilePreviewDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  categoryName?: string;
  documentName?: string;
  fileExtension?: string;
  previewUrl?: string;
  documentId?: string; // 百炼文档ID
  indexId?: string;    // 知识库ID，用于获取分块数据
}

/**
 * 文件预览对话框
 * 包装 FilePreviewWorkspace 组件，提供对话框容器
 * 支持百炼文档分块预览
 */
export default function FilePreviewDialog({
  isOpen,
  onOpenChange,
  categoryName = '知识库文档',
  documentName = '文件预览',
  fileExtension = 'pdf',
  previewUrl,
  documentId,
  indexId,
}: FilePreviewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [fetchedPreviewUrl, setFetchedPreviewUrl] = useState<string>('');
  const [error, setError] = useState<string>('');

  // 如果提供了 documentId 但没有 previewUrl，则从 API 获取预览 URL
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
            // 预览链接获取失败，但不影响分块预览
            console.log('预览链接获取失败，将使用分块预览模式');
          }
        })
        .catch(err => {
          console.error('获取预览链接失败:', err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
    
    // 重置状态
    if (!isOpen) {
      setFetchedPreviewUrl('');
      setError('');
    }
  }, [isOpen, documentId, previewUrl]);

  // 确定使用哪个预览 URL
  const effectivePreviewUrl = previewUrl || fetchedPreviewUrl;

  // 加载中状态
  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] p-0 gap-0 overflow-hidden">
          <div className="flex items-center justify-center h-full bg-slate-50">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-muted-foreground">正在加载文档预览...</p>
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
          documentId={documentId}
          indexId={indexId}
        />
      </DialogContent>
    </Dialog>
  );
}
