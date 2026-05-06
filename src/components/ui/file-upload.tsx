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
  const [dragCounter, setDragCounter] = useState(0);
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
      } else {
        throw new Error(response.error || '上传失败');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : '上传失败';
      updateFile(uploadFileObj.id, { status: 'error', error: msg });
      onError?.({ ...uploadFileObj, status: 'error', error: msg }, msg);
    }
  }, [uploadUrl, extraData, fieldName, updateFile, onSuccess, onError]);

  // 使用 useEffect 检测所有文件上传完成，避免在 setFiles 回调中直接调用 onComplete
  useEffect(() => {
    // 只在有文件且全部完成时触发回调
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
      className={cn('relative flex flex-col w-full', className)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 全局拖拽感应遮罩层 */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-blue-50/95 backdrop-blur-[2px] border-2 border-blue-500 border-dashed rounded-xl animate-in fade-in duration-200">
          <UploadIcon className="h-12 w-12 text-blue-600 mb-4 animate-bounce pointer-events-none" />
          <p className="text-lg font-semibold text-blue-700 pointer-events-none">松手即可上传文件</p>
        </div>
      )}

      {/* 拖拽上传区域 */}
      <div
        className={cn(
          'relative border-2 border-dashed rounded-xl transition-all duration-300 group',
          'border-gray-200 hover:border-gray-300 bg-gray-50/50',
          files.length > 0 ? 'py-3 opacity-80 cursor-default' : 'py-10 cursor-pointer hover:bg-gray-50',
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
          disabled={isUploadingAny}
        />
        
        <div className="flex flex-col items-center justify-center text-center px-4 w-full">
          {files.length === 0 && (
            <div className="p-3 rounded-full bg-white shadow-sm mb-3 group-hover:scale-110 transition-transform">
              <UploadIcon className="h-6 w-6 text-gray-400" />
            </div>
          )}
          <p className="font-medium text-gray-500 text-sm">
            {files.length > 0 ? "支持继续拖拽文件至此区域" : hint}
          </p>
          {files.length === 0 && (
            <p className="text-xs text-gray-400 mt-1.5">
              支持格式: {accept.replace(/\./g, '').toUpperCase()} · 单文件最大 {maxSize}MB
            </p>
          )}
        </div>

        {/* 多文件时显示总体进度 */}
        {isUploadingAny && multiple && files.length > 1 && (
          <div className="absolute bottom-0 left-0 w-full px-4 translate-y-1/2 z-10">
            <Progress value={totalProgress} className="h-1.5 bg-white shadow-sm" />
          </div>
        )}
      </div>

      {/* 文件列表区域 - 使用 gap 控制间距，紧凑布局 */}
      {files.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">上传列表</p>
          
          <div className="flex flex-col gap-2">
            {files.map((file) => (
              <div
                key={file.id}
                className={cn(
                  'flex flex-col p-3 rounded-xl border bg-white shadow-sm transition-all',
                  file.status === 'error' ? 'border-red-200 bg-red-50/50' : 'border-gray-200 hover:border-blue-100 hover:shadow-md'
                )}
              >
                {/* 保证父级 min-w-0，使得子元素的 truncate 能够生效 */}
                <div className="flex items-center gap-3 w-full min-w-0">
                  <div className="p-1.5 bg-gray-50 rounded-lg shrink-0">{getFileIcon(file.file)}</div>
                  
                  {/* min-w-0 强制宽度不会撑开父元素 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 w-full">
                      {/* 标题截断 */}
                      <p className="text-sm font-semibold text-gray-800 truncate flex-1" title={file.file.name}>
                        {file.file.name}
                      </p>
                      {/* 状态图标 */}
                      <div className="shrink-0">
                        {file.status === 'success' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                        {file.status === 'error' && <AlertCircle className="h-5 w-5 text-red-500" />}
                        {(file.status === 'uploading' || file.status === 'parsing') && (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 mt-1 w-full min-w-0">
                      <span className="text-xs text-gray-400 shrink-0">{formatSize(file.file.size)}</span>
                      <span className="text-gray-200 text-xs shrink-0">|</span>
                      
                      <span className={cn(
                        'text-xs font-medium truncate',
                        file.status === 'uploading' && 'text-blue-500',
                        file.status === 'parsing' && 'text-amber-600 animate-pulse',
                        file.status === 'success' && 'text-green-600',
                        file.status === 'error' && 'text-red-500'
                      )}>
                        {file.status === 'uploading' && `正在上传 ${file.progress}%`}
                        {file.status === 'parsing' && '正在提取评分项和废标风险...'}
                        {file.status === 'success' && '上传成功'}
                        {file.status === 'error' && (file.error || '上传失败')}
                      </span>
                    </div>
                  </div>

                  {/* 删除按钮 - 始终可见 */}
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 shrink-0 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors" 
                    onClick={() => removeFile(file.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* 上传进度条 */}
                {file.status === 'uploading' && (
                  <div className="mt-2 w-full">
                    <Progress value={file.progress} className="h-1.5 bg-gray-100" />
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
