import { NextRequest, NextResponse } from 'next/server';
import { getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import * as imaService from '@/lib/services/ima-service';

/**
 * IMA 知识库导入URL API
 * POST /api/ima/knowledge-bases/[id]/import-urls
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { urls, parent_folder_id } = body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: 'urls为必填且必须是非空数组' }, { status: 400 });
  }

  const config = await getIMAProviderConfig();
  if (!config) {
    return NextResponse.json({ error: 'IMA知识库未配置' }, { status: 400 });
  }

  const result = await imaService.importUrls(config, {
    kb_id: id,
    urls,
    parent_folder_id: parent_folder_id || '',
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: result.data,
  });
}
