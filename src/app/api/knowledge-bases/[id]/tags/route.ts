/**
 * 本地知识库标签管理API - 已废弃
 * 
 * ⚠️ 此接口已废弃，请使用百炼知识库接口：
 * - GET/POST: /api/bailian/knowledge-bases/[id]/tags
 * 
 * 原因：系统已全面迁移到阿里云百炼知识库服务
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * 获取标签列表 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases/[id]/tags
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库接口: /api/bailian/knowledge-bases/[id]/tags',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]/tags',
  }, { status: 410 });
}

/**
 * 创建标签 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases/[id]/tags
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库接口: /api/bailian/knowledge-bases/[id]/tags',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]/tags',
  }, { status: 410 });
}
