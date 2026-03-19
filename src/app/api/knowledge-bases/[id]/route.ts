/**
 * 本地知识库详情API - 已废弃
 * 
 * ⚠️ 此接口已废弃，请使用百炼知识库接口：
 * - GET/PATCH/DELETE: /api/bailian/knowledge-bases/[id]
 * 
 * 原因：系统已全面迁移到阿里云百炼知识库服务
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * 获取知识库详情 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases/[id]
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库接口: /api/bailian/knowledge-bases/[id]',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]',
  }, { status: 410 });
}

/**
 * 更新知识库 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases/[id]
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库接口: /api/bailian/knowledge-bases/[id]',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]',
  }, { status: 410 });
}

/**
 * 删除知识库 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases/[id]
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库接口: /api/bailian/knowledge-bases/[id]',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]',
  }, { status: 410 });
}
