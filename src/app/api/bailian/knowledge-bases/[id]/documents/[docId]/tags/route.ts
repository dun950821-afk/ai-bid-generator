/**
 * 文档标签API
 * 
 * 注意：百炼不支持更新已上传文档的标签
 * 标签只能在文档上传时设置，无法后续修改
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/bailian/knowledge-bases/[id]/documents/[docId]/tags
 * 获取文档的标签（从文档信息中提取）
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params;
    
    // 由于百炼不提供单独获取文档标签的API
    // 这里返回空数组，实际标签信息在文档列表中已有
    return NextResponse.json({
      success: true,
      data: [],
    });
  } catch (error) {
    console.error('[Bailian API] Get document tags failed:', error);
    return NextResponse.json(
      { success: false, error: '获取文档标签失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bailian/knowledge-bases/[id]/documents/[docId]/tags
 * 更新文档标签（不支持）
 * 
 * 百炼不支持更新已上传文档的标签
 * 如需修改标签，请重新上传文档
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '百炼知识库不支持更新已上传文档的标签。如需修改标签，请删除文档后重新上传并设置新标签。',
    code: 'OPERATION_NOT_SUPPORTED',
  }, { status: 400 });
}

/**
 * DELETE /api/bailian/knowledge-bases/[id]/documents/[docId]/tags
 * 删除文档标签（不支持）
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  return NextResponse.json({
    success: false,
    error: '百炼知识库不支持删除已上传文档的标签。如需修改标签，请删除文档后重新上传。',
    code: 'OPERATION_NOT_SUPPORTED',
  }, { status: 400 });
}
