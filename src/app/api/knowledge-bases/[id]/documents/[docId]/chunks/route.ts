/**
 * 本地知识库文档分块API - 已废弃
 * 
 * ⚠️ 此接口已废弃。百炼知识库的文档解析和分块由百炼服务自动处理。
 * 如需查看文档状态，请使用: /api/bailian/knowledge-bases/[id]/documents
 * 
 * 原因：系统已全面迁移到阿里云百炼知识库服务
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * 获取文档分块列表 - 已废弃
 * @deprecated 百炼知识库的分块由百炼服务自动处理
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃。百炼知识库的文档分块由百炼服务自动处理。查看文档状态请使用: /api/bailian/knowledge-bases/[id]/documents',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]/documents',
  }, { status: 410 });
}
