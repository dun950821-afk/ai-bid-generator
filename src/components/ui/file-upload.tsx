'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  Upload as UploadIcon,
  X,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  File,
  FileImage,
  FileSpreadsheet,
} from 'lucide-react';

export interface UploadFile {
  id: string;
  file: File;
  status: 'pending' | 'reading' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  extractedText?: string;
  response?: any;
}

export interface FileUploadProps {
  /** 自定义上传处理函数，接收文件和进度回调，返回上传结果 */
  onUpload?: (file: File, onProgress: (progress: number) => void) => Promise<{ success: boolean; error?: string; data?: any }>;
  /** 兼容旧模式：直接上传 URL（使用 FormData + XHR） */
  uploadUrl?: string;
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // 单位 MB
  maxFiles?: number;
  extraData?: Record<string, string>;
  fieldName?: string;
  onSuccess?: (file: UploadFile) => void;
  onComplete?: (files: UploadFile[]) => void;
  onError?: (file: UploadFile, error: string) => void;
  className?: string;
  hint?: string;
  /** 上传区域描述文字 */
  description?: string;
}

function getFileIcon(file: File) {
  const name = file.name.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name)) return <FileImage className="h-6 w-6 text-blue-500" />;
  if (/\.(xls|xlsx|csv)$/i.test(name)) return <FileSpreadsheet className="h-6 w-6 text-green-600" />;
  if (/\.(pdf)$/i.test(name)) return <FileText className="h-6 w-6 text-red-500" />;
  if (/\.(doc|docx)$/i.test(name)) return <FileText className="h-6 w-6 text-blue-600" />;
  return <File className="h-6 w-6 text-gray-400" />;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getStatusLabel(status: UploadFile['status'], progress: number, error?: string): string {
  switch (status) {
    case 'pending': return '等待上传';
    case 'reading': return '正在读取文件...';
    case 'uploading': return `正在上传 ${progress}%`;
    case 'success': return '上传成功';
    case 'error': return error || '上传失败';
  }
}

export function FileUpload({
  onUpload,
  uploadUrl,
  accept = '.pdf,.doc,.docx,.txt,.md,.csv',
  multiple = false,
  maxSize = 50,
  maxFiles = 5,
  extraData = {},
  fieldName = 'file',
  onSuccess,
  onComplete,
  onError,
  className,
  hint = '拖拽文件到此处或点击选择',
  description,
}: FileUploadProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateFile = useCallback((id: string, updates: Partial<UploadFile>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }, []);

  const uploadFile = useCallback(async (uploadFileObj: UploadFile) => {
    try {
      let result: { success: boolean; error?: string; data?: any };

      if (onUpload) {
        // 自定义上传模式（如浏览器提取文本后 JSON 提交）
        updateFile(uploadFileObj.id, { status: 'reading', progress: 0 });
        result = await onUpload(uploadFileObj.file, (progress: number) => {
          updateFile(uploadFileObj.id, { status: 'uploading', progress });
        });
      } else if (uploadUrl) {
        // 传统 FormData + XHR 上传模式
        updateFile(uploadFileObj.id, { status: 'uploading', progress: 0 });

        const formData = new FormData();
        formData.append(fieldName, uploadFileObj.file);
        Object.entries(extraData).forEach(([key, value]) => formData.append(key, value));

        result = await new Promise<{ success: boolean; error?: string; data?: any }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const progress = Math.round((e.loaded / e.total) * 100);
              updateFile(uploadFileObj.id, { progress });
            }
          });
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const response = JSON.parse(xhr.responseText);
                resolve(response);
              } catch {
                reject(new Error('响应解析失败'));
              }
            } else if (xhr.status === 413) {
              reject(new Error('文件过大，服务器拒绝接收 (413)'));
            } else {
              reject(new Error(`上传失败: HTTP ${xhr.status}`));
            }
          });
          xhr.addEventListener('error', () => reject(new Error('网络错误')));
          xhr.addEventListener('timeout', () => reject(new Error('上传超时')));
          xhr.timeout = 120000; // 2 分钟超时
          xhr.open('POST', uploadUrl);
          xhr.send(formData);
        });
      } else {
        throw new Error('未配置上传方式');
      }

      if (result.success) {
        updateFile(uploadFileObj.id, { status: 'success', progress: 100, response: result.data });
        onSuccess?.({ ...uploadFileObj, status: 'success', progress: 100, response: result.data });
      } else {
        throw new Error(result.error || '上传失败');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : '上传失败';
      updateFile(uploadFileObj.id, { status: 'error', error: msg });
      onError?.({ ...uploadFileObj, status: 'error', error: msg }, msg);
    }
  }, [onUpload, uploadUrl, extraData, fieldName, updateFile, onSuccess, onError]);

  // 检测所有文件上传完成
  useEffect(() => {
    if (files.length > 0 && files.every(f => f.status === 'success' || f.status === 'error')) {
      onComplete?.(files);
    }
  }, [files, onComplete]);

  const handleFiles = useCallback(async (selectedFiles: FileList | File[]) => {
    const fileArray = Array.from(selectedFiles);
    if (files.length + fileArray.length > maxFiles) {
      alert(`最多只能上传 ${maxFiles} 个文件`);
      return;
    }

    const newFiles: UploadFile[] = fileArray
      .filter(f => {
        if (f.size > maxSize * 1024 * 1024) {
          alert(`文件 "${f.name}" 超过 ${maxSize}MB 限制，请重新选择`);
          return false;
        }
        return true;
      })
      .map(f => ({ id: generateId(), file: f, status: 'pending', progress: 0 }));

    if (newFiles.length === 0) return;

    setFiles(prev => [...prev, ...newFiles]);
    for (const f of newFiles) {
      await uploadFile(f);
    }
  }, [files, maxFiles, maxSize, uploadFile]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev + 1);
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev - 1);
    if (dragCounter - 1 === 0) {
      setIsDragging(false);
    }
  }, [dragCounter]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(0);
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const isProcessing = files.some(f => f.status === 'reading' || f.status === 'uploading');
  const totalProgress = files.length > 0 ? Math.round(files.reduce((s, f) => s + f.progress, 0) / files.length) : 0;
  const successCount = files.filter(f => f.status === 'success').length;
  const errorCount = files.filter(f => f.status === 'error').length;

  return (
    <div
      className={cn('relative flex flex-col w-full', className)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 拖拽感应遮罩层 */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-primary/5 backdrop-blur-[2px] border-2 border-primary/40 border-dashed rounded-xl animate-in fade-in duration-200">
          <UploadIcon className="h-12 w-12 text-primary mb-4 animate-bounce pointer-events-none" />
          <p className="text-lg font-semibold text-primary pointer-events-none">松手即可上传文件</p>
        </div>
      )}

      {/* 上传区域 */}
      <div
        className={cn(
          'relative border-2 border-dashed rounded-xl transition-all duration-300 group',
          'border-muted hover:border-primary/30 bg-muted/30',
          files.length > 0 ? 'py-4 opacity-80 cursor-default' : 'py-10 cursor-pointer hover:bg-muted/50',
          isProcessing && 'pointer-events-none'
        )}
        onClick={() => files.length === 0 && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = ''; // 重置，允许重复选择同文件
          }}
          disabled={isProcessing}
        />

        <div className="flex flex-col items-center justify-center text-center px-4 w-full">
          {files.length === 0 && (
            <>
              <div className="p-3 rounded-full bg-background shadow-sm mb-3 group-hover:scale-110 transition-transform">
                <UploadIcon className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium text-muted-foreground text-sm">{hint}</p>
              <p className="text-xs text-muted-foreground/60 mt-1.5">
                {description || `支持格式: ${accept.replace(/\./g, '').toUpperCase()} · 单文件最大 ${maxSize}MB`}
              </p>
            </>
          )}
          {files.length > 0 && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>已选择 {files.length} 个文件</span>
              {successCount > 0 && <span className="text-green-600 font-medium">{successCount} 成功</span>}
              {errorCount > 0 && <span className="text-destructive font-medium">{errorCount} 失败</span>}
              {!isProcessing && <span className="text-primary cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>继续添加</span>}
            </div>
          )}
        </div>

        {/* 多文件总体进度 */}
        {isProcessing && multiple && files.length > 1 && (
          <div className="absolute bottom-0 left-0 w-full px-4 translate-y-1/2 z-10">
            <Progress value={totalProgress} className="h-1.5 bg-background shadow-sm" />
          </div>
        )}
      </div>

      {/* 文件列表 */}
      {files.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {files.map((file) => (
            <div
              key={file.id}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border transition-all',
                file.status === 'error' ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card hover:shadow-sm'
              )}
            >
              {/* 文件图标 */}
              <div className="p-1.5 bg-muted rounded-lg shrink-0">{getFileIcon(file.file)}</div>

              {/* 文件信息 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground truncate" title={file.file.name}>
                    {file.file.name}
                  </p>
                  <div className="shrink-0 flex items-center gap-1">
                    {file.status === 'success' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {file.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
                    {(file.status === 'reading' || file.status === 'uploading') && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground shrink-0">{formatSize(file.file.size)}</span>
                  <span className="text-border text-xs shrink-0">·</span>
                  <span className={cn(
                    'text-xs font-medium',
                    file.status === 'reading' && 'text-amber-600 animate-pulse',
                    file.status === 'uploading' && 'text-primary',
                    file.status === 'success' && 'text-green-600',
                    file.status === 'error' && 'text-destructive',
                    file.status === 'pending' && 'text-muted-foreground',
                  )}>
                    {getStatusLabel(file.status, file.progress, file.error)}
                  </span>
                </div>

                {/* 进度条 */}
                {(file.status === 'reading' || file.status === 'uploading') && (
                  <div className="mt-1.5 w-full">
                    <Progress value={file.progress} className="h-1" />
                  </div>
                )}
              </div>

              {/* 删除按钮 */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full"
                onClick={() => removeFile(file.id)}
                disabled={file.status === 'reading' || file.status === 'uploading'}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FileUpload;
