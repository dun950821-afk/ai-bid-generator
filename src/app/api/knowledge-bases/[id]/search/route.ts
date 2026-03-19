/**
 * 本地知识库检索API - 已废弃
 * 
 * ⚠️ 此接口已废弃，请使用百炼知识库接口：
 * - POST/GET: /api/bailian/knowledge-bases/[id]/search
 * 
 * 原因：系统已全面迁移到阿里云百炼知识库服务
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * 在知识库中检索 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases/[id]/search
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库检索接口: /api/bailian/knowledge-bases/[id]/search',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]/search',
  }, { status: 410 });
}

/**
 * 获取相关上下文 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases/[id]/search
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库检索接口: /api/bailian/knowledge-bases/[id]/search',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]/search',
  }, { status: 410 });
}
