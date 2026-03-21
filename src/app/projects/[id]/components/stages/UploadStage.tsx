'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { FileUpload, UploadFile } from '@/components/ui/file-upload';
import { ExtractionProgress } from '@/components/extraction-progress';
import { cn } from '@/lib/utils';
import {
  Upload,
  FileText,
  Loader2,
  Play,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import type { UploadedDocument } from '../../types';

interface UploadStageProps {
  projectId: string;
  uploadedDocument: UploadedDocument | null;
  extracting: boolean;
  taskId: string | null;
  isNewUpload: boolean;
  onUploadComplete: (files: UploadFile[]) => void;
  onTaskComplete: () => void;
  onTaskFailed: (error: string) => void;
  onReextract: () => void;
  onUploadNew: () => void;
  onClearDocument: () => void;
  onNext: () => void;
}

/**
 * 上传文档阶段组件
 */
export function UploadStage({
  projectId,
  uploadedDocument,
  extracting,
  taskId,
  isNewUpload,
  onUploadComplete,
  onTaskComplete,
  onTaskFailed,
  onReextract,
  onUploadNew,
  onClearDocument,
  onNext,
}: UploadStageProps) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [textDialogOpen, setTextDialogOpen] = useState(false);
  const [documentText, setDocumentText] = useState('');
  const [uploadResetKey, setUploadResetKey] = useState(0);

  // 是否已完成上传和提取
  const isComplete = uploadedDocument?.extracted && !uploadedDocument.extractError;

  return (
    <div className="space-y-4">
      {!uploadedDocument ? (
        // 未上传状态
        <Card className="border-dashed">
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">上传招标文档</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  支持 PDF、Word、图片等格式，自动提取评分项和风险
                </p>
              </div>
              <div className="flex justify-center gap-3">
                <Button onClick={() => setUploadDialogOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  上传文件
                </Button>
                <Button variant="outline" onClick={() => setTextDialogOpen(true)}>
                  粘贴文本
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : isComplete ? (
        // 已完成提取
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <CardTitle className="text-base">文档已提取完成</CardTitle>
                  <CardDescription>{uploadedDocument.name}</CardDescription>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onReextract}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  重新提取
                </Button>
                <Button size="sm" onClick={onNext}>
                  下一步
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
      ) : (
        // 提取进度
        <ExtractionProgress
          projectId={projectId}
          taskId={taskId}
          documentName={uploadedDocument.name}
          isNewUpload={isNewUpload}
          onTaskComplete={onTaskComplete}
          onTaskFailed={onTaskFailed}
          onUploadNew={onUploadNew}
          onReextract={onReextract}
        />
      )}

      {/* 上传文件对话框 */}
      <Dialog open={uploadDialogOpen} onOpenChange={(open) => {
        setUploadDialogOpen(open);
        if (!open) {
          onClearDocument();
        }
      }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>上传招标文档</DialogTitle>
            <DialogDescription>
              支持 PDF、Word、TXT 格式的招标文档
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <FileUpload
              key={uploadResetKey}
              uploadUrl="/api/upload"
              accept=".pdf,.doc,.docx,.txt"
              multiple={false}
              maxSize={50}
              maxFiles={1}
              extraData={{ projectId }}
              onComplete={onUploadComplete}
              hint="拖拽文件到此处或点击选择"
            />
          </div>
          <Button variant="outline" className="w-full" onClick={() => setUploadDialogOpen(false)}>
            关闭
          </Button>
        </DialogContent>
      </Dialog>

      {/* 粘贴文本对话框 */}
      <Dialog open={textDialogOpen} onOpenChange={setTextDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>粘贴招标文档内容</DialogTitle>
            <DialogDescription>
              粘贴招标文档的文本内容，系统将自动提取
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="请粘贴招标文档内容..."
              className="min-h-[300px]"
              value={documentText}
              onChange={(e) => setDocumentText(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTextDialogOpen(false)}>
              取消
            </Button>
            <Button disabled={extracting || !documentText.trim()}>
              {extracting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              开始提取
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default UploadStage;
