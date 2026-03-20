'use client';

import React, { useState, useEffect } from 'react';
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
import {
  FileText,
  File,
  FileImage,
  FileSpreadsheet,
  Settings,
  Clock,
  HardDrive,
  Layers,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Database,
  FolderOpen,
  Gauge,
  Slash,
  Table,
  Info,
} from 'lucide-react';

/**
 * 文件详情接口
 */
export interface FileDetailData {
  id: string;
  name: string;
  document_type?: string;
  file_size?: number;
  vector_status: string;
  // 分块配置
  chunk_mode?: string;
  chunk_size?: string;
  overlap_size?: string;
  separator?: string;
  enable_headers?: string;
  // 来源信息
  source_id?: string;
  // 状态信息
  code?: string;
  message?: string;
  // 时间
  updated_at?: string;
}

export interface FileDetailDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string | null;
  knowledgeBaseId: string;
}

// 获取文件图标
function getFileIcon(fileType?: string) {
  if (!fileType) return <FileText className="w-5 h-5 text-slate-500" />;
  if (fileType.includes('pdf')) return <File className="w-5 h-5 text-red-500" />;
  if (fileType.includes('image')) return <FileImage className="w-5 h-5 text-blue-500" />;
  if (fileType.includes('spreadsheet') || fileType.includes('excel') || fileType.includes('xls'))
    return <FileSpreadsheet className="w-5 h-5 text-green-500" />;
  return <FileText className="w-5 h-5 text-slate-500" />;
}

// 格式化文件大小
function formatFileSize(bytes?: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// 获取状态配置
function getStatusConfig(status: string) {
  const configs: Record<string, { label: string; colorClass: string; icon: React.ReactNode }> = {
    completed: { 
      label: '已完成', 
      colorClass: 'text-green-700 bg-green-50 border-green-200',
      icon: <CheckCircle2 className="w-4 h-4" />
    },
    processing: { 
      label: '处理中', 
      colorClass: 'text-blue-700 bg-blue-50 border-blue-200',
      icon: <RefreshCw className="w-4 h-4 animate-spin" />
    },
    pending: { 
      label: '待处理', 
      colorClass: 'text-amber-700 bg-amber-50 border-amber-200',
      icon: <Clock className="w-4 h-4" />
    },
    failed: { 
      label: '处理失败', 
      colorClass: 'text-red-700 bg-red-50 border-red-200',
      icon: <XCircle className="w-4 h-4" />
    },
  };
  return configs[status] || { 
    label: status, 
    colorClass: 'text-slate-600 bg-slate-50 border-slate-200',
    icon: <AlertCircle className="w-4 h-4" />
  };
}

// 获取分块模式名称
function getChunkModeLabel(mode?: string): string {
  const modeMap: Record<string, string> = {
    'length': '按长度分块',
    'page': '按页分块',
    'h1': '按H1标题分块',
    'h2': '按H2标题分块',
    'regex': '自定义分隔符',
    'DashSplitter': '智能分块',
  };
  return modeMap[mode || ''] || mode || '-';
}

/**
 * 文件详情对话框
 * 展示文件的详细信息，包括分块配置、来源信息等
 */
export default function FileDetailDialog({
  isOpen,
  onOpenChange,
  documentId,
  knowledgeBaseId,
}: FileDetailDialogProps) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<FileDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 加载文件详情
  useEffect(() => {
    if (isOpen && documentId) {
      loadFileDetail();
    } else {
      setDetail(null);
      setError(null);
    }
  }, [isOpen, documentId]);

  const loadFileDetail = async () => {
    if (!documentId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(
        `/api/bailian/knowledge-bases/${knowledgeBaseId}/documents/${documentId}`
      );
      const data = await res.json();
      
      if (data.success && data.data) {
        setDetail(data.data);
      } else {
        setError(data.error || '获取文件详情失败');
      }
    } catch (err: any) {
      console.error('加载文件详情失败:', err);
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  // 信息项组件
  const InfoItem = ({ 
    icon: Icon, 
    label, 
    value, 
    unit 
  }: { 
    icon: React.ElementType; 
    label: string; 
    value?: string | number | null; 
    unit?: string;
  }) => (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50/50 border border-slate-100">
      <div className="p-2 bg-white rounded-md border border-slate-100 shadow-sm">
        <Icon className="w-4 h-4 text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-medium text-slate-800 truncate">
          {value ?? '-'}{unit && value ? ` ${unit}` : ''}
        </p>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 gap-0 overflow-hidden bg-white shadow-xl">
        {/* 头部 */}
        <DialogHeader className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-purple-50 to-blue-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-600 text-white rounded-lg shadow-sm">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-slate-800">
                文件详情
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                查看文件的详细信息和分块配置
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              <span className="ml-3 text-sm text-slate-500">加载中...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <AlertCircle className="h-12 w-12 mb-3" />
              <p className="text-sm">{error}</p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={loadFileDetail}
                className="mt-4"
              >
                重试
              </Button>
            </div>
          ) : detail ? (
            <div className="p-6 space-y-6">
              {/* 基本信息 */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  基本信息
                </h3>
                
                {/* 文件名称 */}
                <div className="p-4 rounded-lg border border-slate-200 bg-gradient-to-r from-slate-50 to-white">
                  <div className="flex items-center gap-3">
                    {getFileIcon(detail.document_type)}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate" title={detail.name}>
                        {detail.name}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        ID: {detail.id}
                      </p>
                    </div>
                    {(() => {
                      const statusConfig = getStatusConfig(detail.vector_status);
                      return (
                        <Badge variant="outline" className={cn('flex items-center gap-1', statusConfig.colorClass)}>
                          {statusConfig.icon}
                          {statusConfig.label}
                        </Badge>
                      );
                    })()}
                  </div>
                </div>

                {/* 信息网格 */}
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem 
                    icon={File} 
                    label="文档类型" 
                    value={detail.document_type?.toUpperCase()} 
                  />
                  <InfoItem 
                    icon={HardDrive} 
                    label="文件大小" 
                    value={formatFileSize(detail.file_size)} 
                  />
                  <InfoItem 
                    icon={FolderOpen} 
                    label="来源ID" 
                    value={detail.source_id} 
                  />
                  <InfoItem 
                    icon={Clock} 
                    label="更新时间" 
                    value={detail.updated_at ? new Date(detail.updated_at).toLocaleString('zh-CN') : undefined} 
                  />
                </div>
              </div>

              {/* 分块配置 */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  分块配置
                </h3>
                
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem 
                    icon={Layers} 
                    label="分块模式" 
                    value={getChunkModeLabel(detail.chunk_mode)} 
                  />
                  <InfoItem 
                    icon={Gauge} 
                    label="分块大小" 
                    value={detail.chunk_size} 
                    unit="字符"
                  />
                  <InfoItem 
                    icon={RefreshCw} 
                    label="重叠大小" 
                    value={detail.overlap_size} 
                    unit="字符"
                  />
                  <InfoItem 
                    icon={Slash} 
                    label="分隔符" 
                    value={detail.separator ? `"${detail.separator}"` : '-'} 
                  />
                  <InfoItem 
                    icon={Table} 
                    label="启用表头" 
                    value={detail.enable_headers === 'true' ? '是' : detail.enable_headers === 'false' ? '否' : '-'} 
                  />
                </div>
              </div>

              {/* 状态信息 */}
              {(detail.code || detail.message) && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    状态信息
                  </h3>
                  
                  <div className="p-4 rounded-lg border border-amber-200 bg-amber-50/50">
                    {detail.code && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-amber-700">状态码:</span>
                        <Badge variant="outline" className="text-xs font-mono">
                          {detail.code}
                        </Badge>
                      </div>
                    )}
                    {detail.message && (
                      <p className="text-sm text-amber-800">
                        {detail.message}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <p className="text-sm">请选择一个文件查看详情</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
