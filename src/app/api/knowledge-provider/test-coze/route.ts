import { NextResponse } from 'next/server';
import { KnowledgeClient, Config } from 'coze-coding-dev-sdk';

/**
 * 测试扣子知识库连接
 */
export async function GET() {
  try {
    const client = new KnowledgeClient(new Config());
    const result = await client.search('测试连接', undefined, 1, 0.0);

    if (result.code === 0) {
      return NextResponse.json({
        success: true,
        message: '扣子知识库连接成功',
      });
    }

    return NextResponse.json(
      { success: false, error: result.msg || '连接失败' },
      { status: 500 }
    );
  } catch (error) {
    console.error('[Coze Test] 测试连接失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}
