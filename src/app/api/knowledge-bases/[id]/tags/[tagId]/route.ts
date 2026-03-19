/**
 * 本地知识库单个标签管理API - 已废弃
 * 
 * ⚠️ 此接口已废弃，请使用百炼知识库接口：
 * - DELETE/PUT: /api/bailian/knowledge-bases/[id]/tags/[tagId]
 * 
 * 原因：系统已全面迁移到阿里云百炼知识库服务
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * 删除标签 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases/[id]/tags/[tagId]
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tagId: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库接口: /api/bailian/knowledge-bases/[id]/tags/[tagId]',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]/tags/[tagId]',
  }, { status: 410 });
}

/**
 * 更新标签 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases/[id]/tags/[tagId]
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tagId: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库接口: /api/bailian/knowledge-bases/[id]/tags/[tagId]',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]/tags/[tagId]',
  }, { status: 410 });
}
