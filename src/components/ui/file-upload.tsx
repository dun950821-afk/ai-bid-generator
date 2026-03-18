'use client';

import { useState, useCallback, useRef } from 'react';
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
  status: 'pending' | 'uploading' | 'parsing' | 'success' | 'error';
  progress: number;
  error?: string;
  response?: any;
}

export interface FileUploadProps {
  uploadUrl: string;
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

export function FileUpload({
  uploadUrl,
  accept = '.pdf,.doc,.docx,.txt',
  multiple = false,
  maxSize = 50,
  maxFiles = 1,
  extraData = {},
  fieldName = 'file',
  onSuccess,
  onComplete,
  onError,
  className,
  hint = '拖拽文件到此处或点击选择',
}: FileUploadProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0); // 用于修复子元素拖拽闪烁问题
  const inputRef = useRef<HTMLInputElement>(null);

  const updateFile = useCallback((id: string, updates: Partial<UploadFile>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }, []);

  const uploadFile = useCallback(async (uploadFileObj: UploadFile) => {
    const formData = new FormData();
    formData.append(fieldName, uploadFileObj.file);
    Object.entries(extraData).forEach(([key, value]) => formData.append(key, value));

    updateFile(uploadFileObj.id, { status: 'uploading', progress: 0 });

    try {
      const xhr = new XMLHttpRequest();
      const response = await new Promise<any>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            updateFile(uploadFileObj.id, { progress });
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error('响应解析失败'));
            }
          } else {
            reject(new Error(`上传失败: ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('网络错误')));
        xhr.open('POST', uploadUrl);
        xhr.send(formData);
      });

      if (response.success) {
        updateFile(uploadFileObj.id, { status: 'success', progress: 100, response: response.data });
        onSuccess?.({ ...uploadFileObj, status: 'success', progress: 100, response: response.data });
        
        // 检查是否全部完成
        setFiles(prev => {
          const allDone = prev.every(f => f.status === 'success' || f.status === 'error');
          if (allDone) {
            onComplete?.(prev);
          }
          return prev;
        });
      } else {
        throw new Error(response.error || '上传失败');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : '上传失败';
      updateFile(uploadFileObj.id, { status: 'error', error: msg });
      onError?.({ ...uploadFileObj, status: 'error', error: msg }, msg);
    }
  }, [uploadUrl, extraData, fieldName, updateFile, onSuccess, onError, onComplete]);

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

  // 全局拖拽事件处理
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

  const isUploadingAny = files.some(f => f.status === 'uploading' || f.status === 'parsing');
  const totalProgress = files.length > 0 ? Math.round(files.reduce((s, f) => s + f.progress, 0) / files.length) : 0;

  return (
    <div 
      className={cn('relative w-full space-y-4 min-h-[280px] transition-all duration-500 rounded-xl', className)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 全局拖拽感应遮罩层。无论当前页面有多少元素，只要拖进来就覆盖全区域 */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-blue-50/90 backdrop-blur-[2px] border-2 border-blue-500 border-dashed rounded-xl animate-in fade-in duration-200">
          <UploadIcon className="h-12 w-12 text-blue-600 mb-4 animate-bounce pointer-events-none" />
          <p className="text-lg font-semibold text-blue-700 pointer-events-none">松手即可上传文件</p>
        </div>
      )}

      {/* 默认点击上传区域 */}
      <div
        className={cn(
          'relative border-2 border-dashed rounded-xl transition-all duration-300 group',
          'border-gray-200 hover:border-gray-300 bg-gray-50/50',
          files.length > 0 ? 'py-4 opacity-70 cursor-default' : 'py-12 cursor-pointer hover:bg-gray-50',
          isUploadingAny && 'pointer-events-none'
        )}
        onClick={() => files.length === 0 && inputRef.current?.click()}
      >
        <input 
          ref={inputRef} 
          type="file" 
          accept={accept} 
          multiple={multiple} 
          className="hidden" 
          onChange={(e) => e.target.files && handleFiles(e.target.files)} 
        />
        
        <div className="flex flex-col items-center justify-center text-center px-4">
          {files.length === 0 && (
            <div className="p-3 rounded-full bg-white shadow-sm mb-4 group-hover:scale-110 transition-transform">
              <UploadIcon className="h-7 w-7 text-gray-400" />
            </div>
          )}
          <p className={cn("font-medium text-gray-700", files.length > 0 ? "text-sm" : "text-base")}>
            {files.length > 0 ? "支持继续拖拽文件至此区域" : hint}
          </p>
          {files.length === 0 && (
            <p className="text-xs text-gray-400 mt-2">
              支持格式: {accept.replace(/\./g, '').toUpperCase()} · 单文件最大 {maxSize}MB
            </p>
          )}
        </div>

        {isUploadingAny && multiple && files.length > 1 && (
          <div className="absolute bottom-0 left-0 w-full px-8 translate-y-1/2">
            <Progress value={totalProgress} className="h-1.5 shadow-sm" />
          </div>
        )}
      </div>

      {/* 文件列表区域 */}
      {files.length > 0 && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">上传列表</p>
          </div>
          
          <div className="grid gap-3">
            {files.map((file) => (
              <div
                key={file.id}
                className={cn(
                  'flex flex-col p-4 rounded-xl border bg-white shadow-sm transition-all',
                  file.status === 'error' ? 'border-red-200 bg-red-50/50' : 'border-gray-200 hover:border-blue-100 hover:shadow-md'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-50 rounded-lg">{getFileIcon(file.file)}</div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-800 truncate pr-4">{file.file.name}</p>
                      {file.status === 'success' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                      {file.status === 'error' && <AlertCircle className="h-5 w-5 text-red-500" />}
                      {(file.status === 'uploading' || file.status === 'parsing') && (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-400">{formatSize(file.file.size)}</span>
                      <span className="text-gray-200 text-xs">|</span>
                      
                      <span className={cn(
                        'text-xs font-medium',
                        file.status === 'uploading' && 'text-blue-500',
                        file.status === 'parsing' && 'text-amber-600 animate-pulse',
                        file.status === 'success' && 'text-green-600',
                        file.status === 'error' && 'text-red-500'
                      )}>
                        {file.status === 'uploading' && `正在上传 ${file.progress}%`}
                        {file.status === 'parsing' && '正在提取评分项和废标风险...'}
                        {file.status === 'success' && '上传成功'}
                        {file.status === 'error' && file.error}
                      </span>
                    </div>
                  </div>

                  {/* 即使在上传/解析中，也允许用户删除（视为中断） */}
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors" 
                    onClick={() => removeFile(file.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {file.status === 'uploading' && (
                  <div className="mt-3">
                    <Progress value={file.progress} className="h-1.5" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default FileUpload;
