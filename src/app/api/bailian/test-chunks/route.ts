/**
 * 测试百炼文档分块列表 API
 * POST /{WorkspaceId}/index/list_chunks
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBailianSettings } from '@/lib/bailian/service';
import Bailian20231229, * as $BailianModel from '@alicloud/bailian20231229';
import * as $Util from '@alicloud/tea-util';
import * as $OpenApi from '@alicloud/openapi-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const indexId = searchParams.get('indexId'); // 知识库 ID
    const fileId = searchParams.get('fileId'); // 文件 ID（可选）
    const pageSize = parseInt(searchParams.get('pageSize') || '10');
    const pageNum = parseInt(searchParams.get('pageNum') || '1');

    if (!indexId) {
      return NextResponse.json({ error: '缺少 indexId 参数' }, { status: 400 });
    }

    const settings = await getBailianSettings();
    if (!settings) {
      return NextResponse.json({ error: '百炼配置未设置' }, { status: 500 });
    }

    // 创建客户端
    const openApiConfig = new $OpenApi.Config({
      accessKeyId: settings.accessKeyId,
      accessKeySecret: settings.accessKeySecret,
      endpoint: settings.endpoint || 'bailian.cn-beijing.aliyuncs.com',
    });
    if (settings.region) {
      openApiConfig.regionId = settings.region;
    }
    const client = new Bailian20231229(openApiConfig);

    // 构造请求
    const requestObj = new $BailianModel.ListChunksRequest({
      indexId: indexId,
      fileId: fileId || undefined,
      pageSize: pageSize,
      pageNum: pageNum,
    });

    const runtime = new $Util.RuntimeOptions();
    const response = await client.listChunksWithOptions(
      settings.workspaceId,
      requestObj,
      {},
      runtime
    );

    const body = response.body!;

    return NextResponse.json({
      success: true,
      api: 'POST /{WorkspaceId}/index/list_chunks',
      indexId,
      fileId,
      result: {
        code: body.code,
        success: body.success,
        message: body.message,
        data: {
          nodes: body.data?.nodes?.map((node: any) => ({
            text: node.text?.substring(0, 200) + (node.text?.length > 200 ? '...' : ''),
            score: node.score,
            metadata: node.metadata,
          })),
          total: body.data?.total,
        },
      },
    });
  } catch (error: any) {
    console.error('[Test Chunks] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
