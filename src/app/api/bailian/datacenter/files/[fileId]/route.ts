/**
 * 百炼数据中心文件API
 * DELETE: 删除文件
 * @see https://help.aliyun.com/zh/model-studio/developer-reference/api-bailian-2023-12-29-deletefile
 */

import { NextRequest, NextResponse } from 'next/server';
import { createBailianKnowledgeService } from '@/lib/bailian/service';

/**
 * 删除数据中心文件
 * @description 删除数据中心中的文件
 * 
 * 注意事项：
 * - 文件状态必须支持删除（非解析中等状态）
 * - 删除后文件将无法恢复
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;

    if (!fileId) {
      return NextResponse.json(
        { success: false, error: '文件ID不能为空' },
        { status: 400 }
      );
    }

    const service = await createBailianKnowledgeService();
    const result = await service.deleteFile(fileId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.message || '删除文件失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        fileId: result.data?.fileId || fileId,
      },
    });
  } catch (error: any) {
    console.error('[Bailian API] Delete file failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '删除文件失败' },
      { status: 500 }
    );
  }
}
