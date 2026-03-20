'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import FilePreviewWorkspace from './file-preview-workspace';

export interface FilePreviewDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  categoryName?: string;
  documentName?: string;
  fileExtension?: string;
  previewUrl?: string;
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
}: FilePreviewDialogProps) {
  // 如果没有预览链接，显示占位内容
  const effectivePreviewUrl = previewUrl || '';

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
