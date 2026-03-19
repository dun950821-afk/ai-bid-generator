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
  Pause,
  Play,
} from 'lucide-react';

export interface ChunkUploadFile {
  id: string;
  file: File;
  status: 'pending' | 'initializing' | 'uploading' | 'completing' | 'success' | 'error' | 'paused';
  progress: number; // 0-100
  uploadedSize: number; // 已上传字节数
  speed?: number; // 当前上传速度 (bytes/s)
  error?: string;
  response?: any;
  uploadId?: string;
  totalParts?: number;
  uploadedParts?: number;
  // 断点续传相关
  uploadedPartNumbers?: number[]; // 已上传的分片编号
  isResuming?: boolean; // 是否是断点续传
}

export interface ChunkUploadProps {
  knowledgeBaseId?: string;
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // 单位 MB，默认 2048MB (2GB)
  maxFiles?: number;
  extraData?: Record<string, string>;
  onSuccess?: (file: ChunkUploadFile) => void;
  onComplete?: (files: ChunkUploadFile[]) => void;
  onError?: (file: ChunkUploadFile, error: string) => void;
  className?: string;
  hint?: string;
  chunkSize?: number; // 分片大小 MB，默认 5MB
}

// 分片大小：5MB
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;

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

function formatSpeed(bytesPerSecond: number): string {
  return formatSize(bytesPerSecond) + '/s';
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分${Math.round(seconds % 60)}秒`;
  return `${Math.floor(seconds / 3600)}小时${Math.floor((seconds % 3600) / 60)}分`;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function ChunkUpload({
  knowledgeBaseId,
  accept = '.pdf,.doc,.docx,.txt,.xlsx,.xls,.csv,.md,.json',
  multiple = false,
  maxSize = 2048,
  maxFiles = 1,
  extraData = {},
  onSuccess,
  onComplete,
  onError,
  className,
  hint = '拖拽文件到此处或点击选择',
  chunkSize = DEFAULT_CHUNK_SIZE,
}: ChunkUploadProps) {
  const [files, setFiles] = useState<ChunkUploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  // 使用 ref 追踪取消状态，避免闭包问题
  const cancelledFilesRef = useRef<Set<string>>(new Set());

  const updateFile = useCallback((id: string, updates: Partial<ChunkUploadFile>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }, []);

  const uploadFile = useCallback(async (uploadFileObj: ChunkUploadFile) => {
    const file = uploadFileObj.file;
    let uploadId = uploadFileObj.uploadId || '';
    let totalParts = uploadFileObj.totalParts || 0;
    let uploadedPartNumbers = uploadFileObj.uploadedPartNumbers || [];
    let isResuming = uploadFileObj.isResuming || false;
    
    // 清除该文件的取消状态
    cancelledFilesRef.current.delete(uploadFileObj.id);
    
    try {
      // 创建 AbortController 用于取消上传
      const abortController = new AbortController();
      abortControllersRef.current.set(uploadFileObj.id, abortController);

      // 1. 如果是断点续传，先获取已上传的分片
      if (isResuming && uploadId) {
        updateFile(uploadFileObj.id, { status: 'initializing' });
        
        const progressResponse = await fetch(`/api/upload/chunk?uploadId=${uploadId}`);
        if (progressResponse.ok) {
          const progressData = await progressResponse.json();
          if (progressData.success && progressData.data) {
            uploadedPartNumbers = progressData.data.uploadedPartNumbers || [];
            totalParts = progressData.data.totalParts;
            
            // 计算已上传的字节数
            const uploadedSize = uploadedPartNumbers.length * chunkSize;
            
            console.log(`[断点续传] 已上传 ${uploadedPartNumbers.length}/${totalParts} 分片`);
            
            updateFile(uploadFileObj.id, {
              status: 'uploading',
              uploadId,
              totalParts,
              uploadedParts: uploadedPartNumbers.length,
              uploadedSize: Math.min(uploadedSize, file.size),
              progress: Math.round((uploadedPartNumbers.length / totalParts) * 100),
              uploadedPartNumbers,
            });
          } else {
            // 会话不存在或已过期，重新初始化
            console.log('[断点续传] 会话不存在或已过期，重新初始化');
            isResuming = false;
            uploadId = '';
          }
        } else {
          // 请求失败，重新初始化
          isResuming = false;
          uploadId = '';
        }
      }

      // 2. 如果不是断点续传，初始化新的分片上传
      if (!isResuming || !uploadId) {
        updateFile(uploadFileObj.id, { status: 'initializing', progress: 0, uploadedSize: 0 });

        const initFormData = new FormData();
        initFormData.append('fileName', file.name);
        initFormData.append('fileSize', file.size.toString());
        initFormData.append('fileType', file.type || 'application/octet-stream');
        if (knowledgeBaseId) initFormData.append('knowledgeBaseId', knowledgeBaseId);
        Object.entries(extraData).forEach(([key, value]) => initFormData.append(key, value));

        const initResponse = await fetch('/api/upload/chunk', {
          method: 'POST',
          body: initFormData,
          signal: abortController.signal,
        });

        if (!initResponse.ok) {
          const errorData = await initResponse.json();
          throw new Error(errorData.error || '初始化上传失败');
        }

        const initData = await initResponse.json();
        if (!initData.success) {
          throw new Error(initData.error || '初始化上传失败');
        }

        uploadId = initData.data.uploadId;
        totalParts = initData.data.totalParts;
        uploadedPartNumbers = [];

        updateFile(uploadFileObj.id, { 
          status: 'uploading', 
          uploadId,
          totalParts,
          uploadedParts: 0,
          uploadedPartNumbers: [],
          isResuming: false,
        });
      }

      // 3. 分片上传（跳过已上传的分片）
      const uploadedSet = new Set(uploadedPartNumbers);
      const startTime = Date.now();
      let lastUpdateTime = startTime;
      let lastUploadedSize = uploadFileObj.uploadedSize || 0;

      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        // 检查是否已取消
        if (abortController.signal.aborted) {
          return;
        }

        // 跳过已上传的分片（断点续传）
        if (uploadedSet.has(partNumber)) {
          continue;
        }

        // 获取当前分片
        const start = (partNumber - 1) * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        // 上传分片
        const chunkResponse = await fetch(
          `/api/upload/chunk?uploadId=${uploadId}&partNumber=${partNumber}`,
          {
            method: 'POST',
            body: chunk,
            signal: abortController.signal,
          }
        );

        if (!chunkResponse.ok) {
          const errorData = await chunkResponse.json();
          throw new Error(errorData.error || `分片 ${partNumber} 上传失败`);
        }

        const chunkData = await chunkResponse.json();
        if (!chunkData.success) {
          throw new Error(chunkData.error || `分片 ${partNumber} 上传失败`);
        }

        // 更新进度
        const uploadedSize = end;
        const now = Date.now();
        const timeDiff = (now - lastUpdateTime) / 1000;
        
        // 每 500ms 更新一次速度
        let speed = 0;
        if (timeDiff >= 0.5) {
          speed = (uploadedSize - lastUploadedSize) / timeDiff;
          lastUpdateTime = now;
          lastUploadedSize = uploadedSize;
        }

        const progress = Math.round((uploadedSize / file.size) * 100);
        
        updateFile(uploadFileObj.id, {
          progress,
          uploadedSize,
          speed: speed > 0 ? speed : undefined,
          uploadedParts: uploadedSet.size + (partNumber - uploadedSet.size),
        });
      }

      // 3. 完成上传
      updateFile(uploadFileObj.id, { status: 'completing' });

      const completeResponse = await fetch(
        `/api/upload/chunk?uploadId=${uploadId}&complete=true`,
        {
          method: 'POST',
          signal: abortController.signal,
        }
      );

      if (!completeResponse.ok) {
        const errorData = await completeResponse.json();
        throw new Error(errorData.error || '完成上传失败');
      }

      const completeData = await completeResponse.json();
      if (!completeData.success) {
        throw new Error(completeData.error || '完成上传失败');
      }

      // 上传成功
      updateFile(uploadFileObj.id, { 
        status: 'success', 
        progress: 100, 
        uploadedSize: file.size,
        response: completeData.data,
      });
      
      onSuccess?.({ ...uploadFileObj, status: 'success', progress: 100, response: completeData.data });
      
      setFiles(prev => {
        const allDone = prev.every(f => f.status === 'success' || f.status === 'error');
        if (allDone) {
          onComplete?.(prev);
        }
        return prev;
      });

    } catch (error) {
      // 使用 ref 检查是否是取消操作（避免闭包问题）
      const isCancelled = cancelledFilesRef.current.has(uploadFileObj.id);
      
      // 检查是否是 abort 导致的错误
      const isAbortError = error instanceof Error && (
        error.name === 'AbortError' ||
        error.message.includes('abort') ||
        error.message.includes('取消') ||
        abortControllersRef.current.get(uploadFileObj.id)?.signal.aborted
      );
      
      if (isAbortError) {
        if (isCancelled) {
          // 用户取消（删除），静默处理，不更新状态（文件会被删除）
          console.log('上传已取消:', uploadFileObj.id);
          // 清理取消标记
          cancelledFilesRef.current.delete(uploadFileObj.id);
        } else {
          // 用户主动暂停
          console.log('上传已暂停:', uploadFileObj.id);
          updateFile(uploadFileObj.id, { status: 'paused' });
        }
      } else {
        // 真正的错误
        const msg = error instanceof Error ? error.message : '上传失败';
        updateFile(uploadFileObj.id, { status: 'error', error: msg });
        onError?.({ ...uploadFileObj, status: 'error', error: msg }, msg);
      }
    } finally {
      abortControllersRef.current.delete(uploadFileObj.id);
    }
  }, [knowledgeBaseId, extraData, chunkSize, updateFile, onSuccess, onError, onComplete]);

  const handleFiles = useCallback(async (selectedFiles: FileList | File[]) => {
    const fileArray = Array.from(selectedFiles);
    if (files.length + fileArray.length > maxFiles) {
      alert(`最多只能上传 ${maxFiles} 个文件`);
      return;
    }

    const newFiles: ChunkUploadFile[] = fileArray
      .filter(f => {
        if (f.size > maxSize * 1024 * 1024) {
          alert(`文件 "${f.name}" 超过 ${maxSize}MB 限制，请重新选择`);
          return false;
        }
        return true;
      })
      .map(f => ({ 
        id: generateId(), 
        file: f, 
        status: 'pending', 
        progress: 0,
        uploadedSize: 0,
      }));

    if (newFiles.length === 0) return;

    setFiles(prev => [...prev, ...newFiles]);
    for (const f of newFiles) {
      await uploadFile(f);
    }
  }, [files, maxFiles, maxSize, uploadFile]);

  // 暂停上传
  const cancelUpload = useCallback((id: string) => {
    const controller = abortControllersRef.current.get(id);
    if (controller) {
      controller.abort();
    }
    updateFile(id, { status: 'paused' });
  }, [updateFile]);

  // 恢复上传（支持断点续传）
  const resumeUpload = useCallback(async (uploadFileObj: ChunkUploadFile) => {
    // 清除取消状态
    cancelledFilesRef.current.delete(uploadFileObj.id);
    
    // 标记为断点续传
    updateFile(uploadFileObj.id, { 
      status: 'pending', 
      isResuming: true,
      // 保留 uploadId 用于断点续传
    });
    
    await uploadFile(uploadFileObj);
  }, [updateFile, uploadFile]);

  // 删除文件
  const removeFile = useCallback(async (id: string) => {
    const file = files.find(f => f.id === id);
    
    // 如果正在上传，先标记为取消，再中断
    if (file?.status === 'uploading' || file?.status === 'initializing') {
      // 使用 ref 标记为取消（区别于暂停）
      cancelledFilesRef.current.add(id);
      
      const controller = abortControllersRef.current.get(id);
      if (controller) {
        controller.abort();
      }
      
      // 通知服务器清理
      if (file.uploadId) {
        try {
          await fetch(`/api/upload/chunk?uploadId=${file.uploadId}`, {
            method: 'DELETE',
          });
        } catch (e) {
          console.warn('清理上传失败:', e);
        }
      }
    }
    
    // 从列表中移除
    setFiles(prev => prev.filter(f => f.id !== id));
  }, [files]);

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

  const isUploadingAny = files.some(f => 
    f.status === 'uploading' || 
    f.status === 'initializing' || 
    f.status === 'completing'
  );
  const totalProgress = files.length > 0 
    ? Math.round(files.reduce((s, f) => s + f.progress, 0) / files.length) 
    : 0;

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
              支持格式: {accept.replace(/\./g, '').toUpperCase()} · 单文件最大 {maxSize >= 1024 ? `${(maxSize/1024).toFixed(0)}GB` : `${maxSize}MB`}
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

      {/* 文件列表区域 */}
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
                <div className="flex items-center gap-3 w-full min-w-0">
                  <div className="p-1.5 bg-gray-50 rounded-lg shrink-0">{getFileIcon(file.file)}</div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 w-full">
                      <p className="text-sm font-semibold text-gray-800 truncate flex-1" title={file.file.name}>
                        {file.file.name}
                      </p>
                      <div className="shrink-0">
                        {file.status === 'success' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                        {file.status === 'error' && <AlertCircle className="h-5 w-5 text-red-500" />}
                        {(file.status === 'uploading' || file.status === 'initializing' || file.status === 'completing') && (
                          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                        )}
                        {file.status === 'paused' && <Pause className="h-4 w-4 text-amber-500" />}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 mt-1 w-full min-w-0 flex-wrap">
                      <span className="text-xs text-gray-400 shrink-0">{formatSize(file.file.size)}</span>
                      <span className="text-gray-200 text-xs shrink-0">|</span>
                      
                      <span className={cn(
                        'text-xs font-medium truncate',
                        file.status === 'uploading' && 'text-blue-500',
                        file.status === 'initializing' && 'text-blue-400',
                        file.status === 'completing' && 'text-amber-600',
                        file.status === 'success' && 'text-green-600',
                        file.status === 'error' && 'text-red-500',
                        file.status === 'paused' && 'text-amber-500'
                      )}>
                        {file.status === 'initializing' && '正在初始化...'}
                        {file.status === 'uploading' && (
                          <>
                            {formatSize(file.uploadedSize)} / {formatSize(file.file.size)}
                            {file.speed && file.speed > 0 && (
                              <> · {formatSpeed(file.speed)}</>
                            )}
                            {file.uploadedParts && file.totalParts && (
                              <> · 分片 {file.uploadedParts}/{file.totalParts}</>
                            )}
                          </>
                        )}
                        {file.status === 'completing' && '正在合并文件...'}
                        {file.status === 'success' && '上传成功'}
                        {file.status === 'error' && (
                          <>
                            {file.progress > 0 && (
                              <>{formatSize(file.uploadedSize)} / {formatSize(file.file.size)} · </>
                            )}
                            {file.error || '上传失败'}
                          </>
                        )}
                        {file.status === 'paused' && (
                          <>
                            {file.progress > 0 && (
                              <>{formatSize(file.uploadedSize)} / {formatSize(file.file.size)} · </>  
                            )}
                            已暂停（支持断点续传）
                          </>
                        )}
                      </span>
                    </div>

                    {/* 预计剩余时间 */}
                    {file.status === 'uploading' && file.speed && file.speed > 0 && (
                      <div className="text-xs text-gray-400 mt-1">
                        预计剩余: {formatTime((file.file.size - file.uploadedSize) / file.speed)}
                      </div>
                    )}
                  </div>

                  {/* 控制按钮 */}
                  <div className="flex items-center gap-1 shrink-0">
                    {file.status === 'uploading' && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-full transition-colors" 
                        onClick={() => cancelUpload(file.id)}
                        title="暂停上传"
                      >
                        <Pause className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {(file.status === 'paused' || file.status === 'error') && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors" 
                        onClick={() => resumeUpload(file)}
                        title={file.status === 'error' ? '重试上传（断点续传）' : '恢复上传（断点续传）'}
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors" 
                      onClick={() => removeFile(file.id)}
                      title="删除"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* 上传进度条 */}
                {(file.status === 'uploading' || file.status === 'initializing' || file.status === 'completing' || file.status === 'paused' || file.status === 'error') && file.progress > 0 && (
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

export default ChunkUpload;
