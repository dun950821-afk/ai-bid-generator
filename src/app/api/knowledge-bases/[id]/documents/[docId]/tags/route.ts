/**
 * 本地知识库文档标签关联API - 已废弃
 * 
 * ⚠️ 此接口已废弃，请使用百炼知识库接口：
 * - GET/POST/DELETE: /api/bailian/knowledge-bases/[id]/documents/[docId]/tags
 * 
 * 原因：系统已全面迁移到阿里云百炼知识库服务
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * 获取文档标签 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases/[id]/documents/[docId]/tags
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库接口: /api/bailian/knowledge-bases/[id]/documents/[docId]/tags',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]/documents/[docId]/tags',
  }, { status: 410 });
}

/**
 * 为文档添加标签 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases/[id]/documents/[docId]/tags
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库接口: /api/bailian/knowledge-bases/[id]/documents/[docId]/tags',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]/documents/[docId]/tags',
  }, { status: 410 });
}

/**
 * 移除文档标签 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases/[id]/documents/[docId]/tags
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库接口: /api/bailian/knowledge-bases/[id]/documents/[docId]/tags',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]/documents/[docId]/tags',
  }, { status: 410 });
}
