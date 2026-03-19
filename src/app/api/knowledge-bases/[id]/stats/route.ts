/**
 * 本地知识库统计API - 已废弃
 * 
 * ⚠️ 此接口已废弃，请使用百炼知识库接口：
 * - GET: /api/bailian/knowledge-bases/[id]/stats
 * 
 * 原因：系统已全面迁移到阿里云百炼知识库服务
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * 获取知识库统计信息 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases/[id]/stats
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库接口: /api/bailian/knowledge-bases/[id]/stats',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]/stats',
  }, { status: 410 });
}
