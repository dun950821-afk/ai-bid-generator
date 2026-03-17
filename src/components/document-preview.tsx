'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Download, FileText } from 'lucide-react';

interface DocumentPreviewProps {
  documentId: string;
  knowledgeBaseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Document {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  status: string;
  knowledge_chunks?: Array<{
    id: string;
    chunk_index: number;
    content: string;
  }>;
}

export function DocumentPreview({
  documentId,
  knowledgeBaseId,
  open,
  onOpenChange,
}: DocumentPreviewProps) {
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (open && documentId) {
      fetchDocument();
    }
  }, [open, documentId]);

  const fetchDocument = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/knowledge-bases/${knowledgeBaseId}/documents/${documentId}`
      );
      const data = await res.json();
      if (data.success) {
        setDocument(data.data);
      }
    } catch (error) {
      console.error('获取文档失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!document) return;

    try {
      const res = await fetch(
        `/api/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/download`
      );
      const data = await res.json();
      if (data.success && data.data.url) {
        window.open(data.data.url, '_blank');
      }
    } catch (error) {
      console.error('下载失败:', error);
    }
  };

  const renderContent = () => {
    if (!document) return null;

    // PDF 预览
    if (document.file_type === 'application/pdf') {
      return (
        <div className="text-center py-8">
          <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500 mb-4">PDF 文件需下载后查看</p>
          <Button onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            下载文件
          </Button>
        </div>
      );
    }

    // 文本类文件直接显示内容
    if (document.knowledge_chunks && document.knowledge_chunks.length > 0) {
      return (
        <div className="space-y-4">
          <div className="text-sm text-gray-500 mb-2">
            共 {document.knowledge_chunks.length} 个知识块
          </div>
          {document.knowledge_chunks.map((chunk) => (
            <div
              key={chunk.id}
              className="p-3 rounded-lg border border-gray-200 bg-gray-50"
            >
              <div className="text-xs text-gray-400 mb-1">
                块 #{chunk.chunk_index + 1}
              </div>
              <p className="text-sm whitespace-pre-wrap">{chunk.content}</p>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="text-center py-8 text-gray-500">
        暂无预览内容
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>
              {document?.file_name || '文档预览'}
            </DialogTitle>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              下载
            </Button>
          </div>
        </DialogHeader>
        <div className="overflow-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            renderContent()
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
