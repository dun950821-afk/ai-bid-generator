/**
 * 本地知识库向量化API - 已废弃
 * 
 * ⚠️ 此接口已废弃，百炼知识库会自动进行文档解析和向量化。
 * 上传文档请使用: /api/bailian/knowledge-bases/[id]/documents/upload
 * 
 * 原因：系统已全面迁移到阿里云百炼知识库服务，百炼会自动处理文档解析和向量化
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * 文档向量化 - 已废弃
 * @deprecated 百炼知识库会自动进行文档解析和向量化
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃。百炼知识库会自动进行文档解析和向量化。上传文档请使用: /api/bailian/knowledge-bases/[id]/documents/upload',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]/documents/upload',
  }, { status: 410 });
}

/**
 * 获取向量化状态 - 已废弃
 * @deprecated 请使用 /api/bailian/knowledge-bases/[id]/documents 查看文档状态
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '此接口已废弃，请使用百炼知识库接口查看文档状态: /api/bailian/knowledge-bases/[id]/documents',
    deprecated: true,
    alternative: '/api/bailian/knowledge-bases/[id]/documents',
  }, { status: 410 });
}
