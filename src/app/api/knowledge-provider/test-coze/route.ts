import { NextResponse } from 'next/server';
import { testCozeApiConnection } from '@/lib/services/coze-api-client';

/**
 * 测试扣子知识库连接（使用官方 Coze Open API）
 */
export async function GET() {
  try {
    const result = await testCozeApiConnection();

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
      });
    }

    return NextResponse.json(
      { success: false, error: result.message },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Coze Test] 测试连接失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}
