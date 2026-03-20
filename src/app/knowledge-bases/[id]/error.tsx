'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 将错误记录到控制台
    console.error('Knowledge base detail page error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4">
      <AlertCircle className="h-12 w-12 text-red-500" />
      <h1 className="text-2xl font-bold">页面出错了</h1>
      <p className="text-muted-foreground text-center max-w-md">
        {error.message || '发生了未知错误，请刷新页面重试'}
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground">
          错误ID: {error.digest}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => window.history.back()}>
          返回上一页
        </Button>
        <Button onClick={() => reset()}>重试</Button>
      </div>
    </div>
  );
}
