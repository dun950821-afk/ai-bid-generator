/**
 * IMA 导入URL API
 * 对应 IMA API: /openapi/wiki/v1/import_urls
 */

import { NextRequest, NextResponse } from 'next/server';
import { getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import { importUrls, type IMAConfig } from '@/lib/services/ima-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { urls, parent_id } = body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { success: false, error: '请提供要导入的URL列表' },
        { status: 400 }
      );
    }

    const providerConfig = await getIMAProviderConfig();
    if (!providerConfig.apiKey || !providerConfig.clientId) {
      return NextResponse.json(
        { success: false, error: 'IMA知识库未配置' },
        { status: 400 }
      );
    }

    const config: IMAConfig = {
      apiKey: providerConfig.apiKey,
      clientId: providerConfig.clientId,
    };

    const result = await importUrls(config, {
      knowledge_base_id: id,
      urls,
      parent_id,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || '导入URL失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error: any) {
    console.error('[IMA Import URLs] Failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '导入URL失败' },
      { status: 500 }
    );
  }
}
