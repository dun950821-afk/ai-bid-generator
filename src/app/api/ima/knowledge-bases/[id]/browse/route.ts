import { NextRequest, NextResponse } from 'next/server';
import { getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import * as imaService from '@/lib/services/ima-service';

/**
 * IMA 知识库内容浏览 API
 * GET/POST /api/ima/knowledge-bases/[id]/browse
 * 支持层级浏览知识库中的文件和文件夹
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const parentFolderId = searchParams.get('parent_folder_id') || '';
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const cursor = searchParams.get('cursor') || '';

  const config = await getIMAProviderConfig();
  if (!config) {
    return NextResponse.json({ error: 'IMA知识库未配置' }, { status: 400 });
  }

  const result = await imaService.getKnowledgeList(config, {
    knowledge_base_id: id,
    parent_folder_id: parentFolderId,
    limit,
    cursor,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const data = result.data!;
  
  // 映射为统一格式
  const items = (data.knowledge_list || []).map(item => ({
    id: item.media_id,
    name: item.title,
    mediaType: item.media_type,
    mediaTypeName: imaService.IMA_MEDIA_TYPE_MAP[item.media_type] || '未知',
    isFolder: item.media_type === 99,
    parentId: item.parent_folder_id,
    tags: item.tags || [],
    status: item.status,
    createTime: item.create_time,
    updateTime: item.update_time,
    _provider: 'ima',
  }));

  return NextResponse.json({
    success: true,
    data: {
      items,
      isEnd: data.is_end,
      nextCursor: data.next_cursor,
      currentPath: (data.current_path || []).map(folder => ({
        id: folder.folder_id,
        name: folder.name,
        fileNumber: parseInt(folder.file_number || '0', 10),
        folderNumber: parseInt(folder.folder_number || '0', 10),
        parentId: folder.parent_folder_id,
      })),
      _provider: 'ima',
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch { /* empty body */ }

  const config = await getIMAProviderConfig();
  if (!config) {
    return NextResponse.json({ error: 'IMA知识库未配置' }, { status: 400 });
  }

  const result = await imaService.getKnowledgeList(config, {
    knowledge_base_id: id,
    parent_folder_id: (body.parent_folder_id as string) || '',
    limit: (body.limit as number) || 50,
    cursor: (body.cursor as string) || '',
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const data = result.data!;

  const items = (data.knowledge_list || []).map(item => ({
    id: item.media_id,
    name: item.title,
    mediaType: item.media_type,
    mediaTypeName: imaService.IMA_MEDIA_TYPE_MAP[item.media_type] || '未知',
    isFolder: item.media_type === 99,
    parentId: item.parent_folder_id,
    tags: item.tags || [],
    status: item.status,
    createTime: item.create_time,
    updateTime: item.update_time,
    _provider: 'ima',
  }));

  return NextResponse.json({
    success: true,
    data: {
      items,
      isEnd: data.is_end,
      nextCursor: data.next_cursor,
      currentPath: (data.current_path || []).map(folder => ({
        id: folder.folder_id,
        name: folder.name,
        fileNumber: parseInt(folder.file_number || '0', 10),
        folderNumber: parseInt(folder.folder_number || '0', 10),
        parentId: folder.parent_folder_id,
      })),
      _provider: 'ima',
    },
  });
}
