import { NextRequest, NextResponse } from 'next/server';
import { getActiveProvider, setActiveProvider, type KnowledgeProvider } from '@/lib/services/retrieval/provider';

/**
 * 获取当前激活的知识库引擎
 */
export async function GET() {
  try {
    const provider = await getActiveProvider();
    return NextResponse.json({ success: true, data: { activeProvider: provider } });
  } catch (error) {
    console.error('[Provider API] 获取引擎失败:', error);
    return NextResponse.json(
      { success: false, error: '获取引擎配置失败' },
      { status: 500 }
    );
  }
}

/**
 * 设置当前激活的知识库引擎
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider } = body;

    if (!provider || (provider !== 'bailian' && provider !== 'ima')) {
      return NextResponse.json(
        { success: false, error: '无效的引擎类型，仅支持 bailian 或 ima' },
        { status: 400 }
      );
    }

    const result = await setActiveProvider(provider as KnowledgeProvider);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: `已切换到${provider === 'ima' ? 'IMA' : '百炼'}知识库引擎`,
    });
  } catch (error) {
    console.error('[Provider API] 设置引擎失败:', error);
    return NextResponse.json(
      { success: false, error: '设置引擎失败' },
      { status: 500 }
    );
  }
}
