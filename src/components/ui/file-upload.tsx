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
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  response?: any;
}

export interface FileUploadProps {
  /**
   * 上传地址
   */
  uploadUrl: string;
  
  /**
   * 接受的文件类型，如 ".pdf,.doc,.docx"
   */
  accept?: string;
  
  /**
   * 是否支持多文件
   */
  multiple?: boolean;
  
  /**
   * 最大文件大小（MB）
   */
  maxSize?: number;
  
  /**
   * 最大文件数量
   */
  maxFiles?: number;
  
  /**
   * 上传时的额外数据
   */
  extraData?: Record<string, string>;
  
  /**
   * 文件字段名，默认 'file'
   */
  fieldName?: string;
  
  /**
   * 上传成功回调
   */
  onSuccess?: (file: UploadFile) => void;
  
  /**
   * 所有文件上传完成回调
   */
  onComplete?: (files: UploadFile[]) => void;
  
  /**
   * 上传失败回调
   */
  onError?: (file: UploadFile, error: string) => void;
  
  /**
   * 自定义类名
   */
  className?: string;
  
  /**
   * 提示文本
   */
  hint?: string;
}

/**
 * 获取文件图标
 */
function getFileIcon(file: File) {
  const type = file.type;
  const name = file.name.toLowerCase();
  
  if (type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name)) {
    return <FileImage className="h-5 w-5 text-blue-500" />;
  }
  if (type.includes('spreadsheet') || /\.(xls|xlsx|csv)$/i.test(name)) {
    return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
  }
  if (type.includes('pdf') || name.endsWith('.pdf')) {
    return <FileText className="h-5 w-5 text-red-500" />;
  }
  if (/\.(doc|docx)$/i.test(name)) {
    return <FileText className="h-5 w-5 text-blue-600" />;
  }
  return <File className="h-5 w-5 text-gray-500" />;
}

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 生成唯一ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function FileUpload({
  uploadUrl,
  accept = '*',
  multiple = false,
  maxSize = 50,
  maxFiles = 10,
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
  const inputRef = useRef<HTMLInputElement>(null);

  // 更新文件状态
  const updateFile = useCallback((id: string, updates: Partial<UploadFile>) => {
    setFiles(prev => 
      prev.map(f => f.id === id ? { ...f, ...updates } : f)
    );
  }, []);

  // 上传单个文件
  const uploadFile = useCallback(async (uploadFile: UploadFile) => {
    const formData = new FormData();
    formData.append(fieldName, uploadFile.file);
    
    // 添加额外数据
    Object.entries(extraData).forEach(([key, value]) => {
      formData.append(key, value);
    });

    updateFile(uploadFile.id, { status: 'uploading', progress: 0 });

    try {
      const xhr = new XMLHttpRequest();
      
      // 监听上传进度
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          updateFile(uploadFile.id, { progress });
        }
      });

      // 创建Promise处理响应
      const response = await new Promise<any>((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              resolve(data);
            } catch {
              reject(new Error('响应解析失败'));
            }
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText);
              reject(new Error(errorData.error || `上传失败: ${xhr.status}`));
            } catch {
              reject(new Error(`上传失败: ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('网络错误，请检查网络连接'));
        });

        xhr.addEventListener('abort', () => {
          reject(new Error('上传已取消'));
        });

        xhr.open('POST', uploadUrl);
        xhr.send(formData);
      });

      // 上传成功
      if (response.success) {
        updateFile(uploadFile.id, { 
          status: 'success', 
          progress: 100,
          response: response.data 
        });
        onSuccess?.({ ...uploadFile, status: 'success', progress: 100, response: response.data });
      } else {
        throw new Error(response.error || '上传失败');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '上传失败';
      updateFile(uploadFile.id, { 
        status: 'error', 
        error: errorMessage 
      });
      onError?.({ ...uploadFile, status: 'error', error: errorMessage }, errorMessage);
    }
  }, [uploadUrl, extraData, fieldName, updateFile, onSuccess, onError]);

  // 处理文件选择
  const handleFiles = useCallback(async (selectedFiles: FileList | File[]) => {
    const fileArray = Array.from(selectedFiles);
    
    // 检查文件数量
    const currentCount = files.length;
    const newCount = fileArray.length;
    if (currentCount + newCount > maxFiles) {
      alert(`最多只能上传 ${maxFiles} 个文件`);
      return;
    }

    // 创建上传文件对象
    const newFiles: UploadFile[] = [];
    
    for (const file of fileArray) {
      // 检查文件大小
      if (file.size > maxSize * 1024 * 1024) {
        alert(`文件 "${file.name}" 超过 ${maxSize}MB 限制`);
        continue;
      }

      newFiles.push({
        id: generateId(),
        file,
        status: 'pending',
        progress: 0,
      });
    }

    if (newFiles.length === 0) return;

    // 添加到文件列表
    setFiles(prev => [...prev, ...newFiles]);

    // 逐个上传文件
    for (const uploadFileObj of newFiles) {
      await uploadFile(uploadFileObj);
    }

    // 检查是否全部完成
    setFiles(prev => {
      const allDone = prev.every(f => f.status === 'success' || f.status === 'error');
      if (allDone) {
        onComplete?.(prev);
      }
      return prev;
    });
  }, [files, maxFiles, maxSize, uploadFile, onComplete]);

  // 拖拽事件处理
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      handleFiles(droppedFiles);
    }
  }, [handleFiles]);

  // 点击选择文件
  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      // 重置input以允许重复选择同一文件
      e.target.value = '';
    }
  }, [handleFiles]);

  // 移除文件
  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  // 清空所有文件
  const clearFiles = useCallback(() => {
    setFiles([]);
  }, []);

  // 获取状态图标
  const getStatusIcon = (file: UploadFile) => {
    switch (file.status) {
      case 'uploading':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  // 计算总体进度
  const totalProgress = files.length > 0
    ? Math.round(files.reduce((sum, f) => sum + f.progress, 0) / files.length)
    : 0;

  const hasUploading = files.some(f => f.status === 'uploading');
  const hasError = files.some(f => f.status === 'error');
  const allSuccess = files.length > 0 && files.every(f => f.status === 'success');

  return (
    <div className={cn('space-y-4', className)}>
      {/* 拖拽区域 */}
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragging 
            ? 'border-primary bg-primary/5' 
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50',
          hasUploading && 'pointer-events-none opacity-60'
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={handleInputChange}
          disabled={hasUploading}
        />
        
        <UploadIcon className={cn(
          'h-10 w-10 mx-auto mb-3',
          isDragging ? 'text-primary' : 'text-gray-400'
        )} />
        
        <p className="text-sm text-gray-600 mb-2">{hint}</p>
        
        <p className="text-xs text-gray-400">
          支持格式: {accept.replace(/\./g, '').toUpperCase()} · 
          最大 {maxSize}MB · 
          最多 {maxFiles} 个文件
        </p>
        
        {hasUploading && (
          <div className="mt-4">
            <Progress value={totalProgress} className="h-2" />
            <p className="text-sm text-blue-600 mt-2">上传中... {totalProgress}%</p>
          </div>
        )}
      </div>

      {/* 文件列表 */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              文件列表 ({files.length})
            </span>
            {!hasUploading && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearFiles}
                className="text-gray-500"
              >
                清空
              </Button>
            )}
          </div>
          
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.id}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border',
                  file.status === 'error' 
                    ? 'border-red-200 bg-red-50' 
                    : file.status === 'success'
                    ? 'border-green-200 bg-green-50'
                    : 'border-gray-200 bg-white'
                )}
              >
                {/* 文件图标 */}
                {getFileIcon(file.file)}
                
                {/* 文件信息 */}
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate flex-1">
                      {file.file.name}
                    </p>
                    {getStatusIcon(file)}
                  </div>
                  
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-gray-500 shrink-0">
                      {formatSize(file.file.size)}
                    </span>
                    
                    {file.status === 'uploading' && (
                      <>
                        <span className="text-xs text-gray-400 shrink-0">·</span>
                        <div className="flex-1 min-w-[60px] max-w-[120px]">
                          <Progress value={file.progress} className="h-1" />
                        </div>
                        <span className="text-xs text-blue-600 shrink-0">{file.progress}%</span>
                      </>
                    )}
                    
                    {file.status === 'error' && file.error && (
                      <span className="text-xs text-red-600">{file.error}</span>
                    )}
                    
                    {file.status === 'success' && (
                      <span className="text-xs text-green-600">上传成功</span>
                    )}
                  </div>
                </div>
                
                {/* 删除按钮 */}
                {!hasUploading && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-400 hover:text-red-500"
                    onClick={() => removeFile(file.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          
          {/* 状态提示 */}
          {allSuccess && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 text-green-700">
              <CheckCircle2 className="h-5 w-5" />
              <span>所有文件上传成功！</span>
            </div>
          )}
          
          {hasError && !hasUploading && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700">
              <AlertCircle className="h-5 w-5" />
              <span>部分文件上传失败，请重试</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FileUpload;
