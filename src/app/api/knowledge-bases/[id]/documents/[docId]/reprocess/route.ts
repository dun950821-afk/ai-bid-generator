/**
 * 本地知识库文档重新处理API - 已废弃
 * 
 * ⚠️ 此接口已废弃，请使用百炼知识库接口：
 * - POST: /api/bailian/knowledge-bases/[id]/documents/[docId]/reprocess
 * 
 * 原因：系统已全面迁移到阿里云百炼知识库服务
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * 重新处理文档 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases/[id]/documents/[docId]/reprocess
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库接口: /api/bailian/knowledge-bases/[id]/documents/[docId]/reprocess',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]/documents/[docId]/reprocess',
  }, { status: 410 });
}
