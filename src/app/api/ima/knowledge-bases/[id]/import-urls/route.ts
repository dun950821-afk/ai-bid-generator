import { NextRequest, NextResponse } from 'next/server';
import { getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import { importUrls } from '@/lib/services/ima-service';

/**
 * IMA 知识库导入URL API
 * POST /api/ima/knowledge-bases/[id]/import-urls
 * 
 * Body:
 * - urls: string[] (1-10个URL)
 * - folder_id: string (目标文件夹ID，根目录传 knowledge_base_id)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { urls, folder_id } = body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: 'urls为必填且必须是非空数组' }, { status: 400 });
  }

  if (urls.length > 10) {
    return NextResponse.json({ error: '单次最多导入10个URL' }, { status: 400 });
  }

  const config = await getIMAProviderConfig();
  if (!config.apiKey || !config.clientId) {
    return NextResponse.json({ error: 'IMA知识库未配置' }, { status: 400 });
  }

  // folder_id 必填，根目录传 knowledge_base_id（即 id）
  const result = await importUrls(config, {
    knowledge_base_id: id,
    folder_id: folder_id || id,
    urls,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: result.data,
  });
}
