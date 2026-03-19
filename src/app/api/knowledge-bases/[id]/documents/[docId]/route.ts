/**
 * 本地知识库文档详情API - 已废弃
 * 
 * ⚠️ 此接口已废弃，请使用百炼知识库接口：
 * - GET/DELETE: /api/bailian/knowledge-bases/[id]/documents/[docId]
 * 
 * 原因：系统已全面迁移到阿里云百炼知识库服务
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * 获取文档详情 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases/[id]/documents/[docId]
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库接口: /api/bailian/knowledge-bases/[id]/documents/[docId]',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]/documents/[docId]',
  }, { status: 410 });
}

/**
 * 删除文档 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases/[id]/documents/[docId]
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库接口: /api/bailian/knowledge-bases/[id]/documents/[docId]',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]/documents/[docId]',
  }, { status: 410 });
}
