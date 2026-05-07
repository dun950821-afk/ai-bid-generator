import { NextRequest, NextResponse } from 'next/server';
import { getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import { getKnowledgeList, isFolderEntry, IMA_MEDIA_TYPE_MAP } from '@/lib/services/ima-service';

/**
 * IMA 知识库内容浏览 API
 * GET: 浏览知识库内容列表（文件+文件夹）
 * 
 * Query 参数:
 * - folder_id: 文件夹ID（IMA格式：folder_xxx），省略则列出根目录
 * - limit: 返回数量，默认50
 * - cursor: 分页游标
 * 
 * 返回格式:
 * - items: 文件和文件夹列表
 *   - 文件夹: { id, name, isFolder: true, fileCount, folderCount }
 *   - 文件: { id, name, isFolder: false, mediaType, mediaTypeName }
 * - currentPath: 面包屑路径（来自 IMA current_path）
 * - isEnd: 是否最后一页
 * - nextCursor: 下一页游标
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const config = await getIMAProviderConfig();
    if (!config.apiKey || !config.clientId) {
      return NextResponse.json({ error: 'IMA知识库未配置' }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const folderId = searchParams.get('folderId') || searchParams.get('folder_id') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const cursor = searchParams.get('cursor') || '';

    const result = await getKnowledgeList(config, {
      knowledge_base_id: id,
      folder_id: folderId,
      limit,
      cursor,
    });

    if (!result.success || !result.data) {
      return NextResponse.json(
        { error: result.error || '获取知识库内容失败' },
        { status: 500 }
      );
    }

    const data = result.data;

    // 映射结果为前端友好的格式
    const items = (data.knowledge_list || []).map((entry) => {
      const isFolder = isFolderEntry(entry);
      
      if (isFolder) {
        // 文件夹条目: 
        // - media_id 格式为 "folder_数字ID"，用于后续浏览子目录
        // - name 字段为文件夹名称（FolderInfo.name）
        // - file_number/folder_number 直接从 FolderInfo 获取
        const folderId = entry.media_id || '';
        
        return {
          id: folderId,
          folderId,  // 保持完整 media_id（含 folder_ 前缀），用于浏览子目录
          name: entry.name || entry.title || '未命名文件夹',
          isFolder: true,
          fileCount: entry.file_number ?? 0,
          folderCount: entry.folder_number ?? 0,
          parentId: entry.parent_folder_id,
        };
      } else {
        // 文件条目
        const mediaId = entry.media_id || '';
        const mediaType = entry.media_type || 0;
        const mediaTypeName = IMA_MEDIA_TYPE_MAP[mediaType] || '文档';

        return {
          id: mediaId,
          name: entry.title || '未命名',
          isFolder: false,
          mediaType,
          mediaTypeName,
          parentId: entry.parent_folder_id,
        };
      }
    });

    // 映射 current_path 面包屑
    // IMA 的 current_path 中:
    // - 根目录 folder_id 可能是纯数字（= knowledge_base_id）
    // - 子目录 folder_id 可能含 "folder_" 前缀
    // 浏览时需使用 "folder_" 前缀的 ID
    const currentPath = (data.current_path || []).map((folder, index) => {
      const rawId = String(folder.folder_id);
      // 根目录(index=0)浏览时不传 folder_id，所以不需要带前缀
      // 子目录需要 "folder_" 前缀
      const browseId = index === 0
        ? rawId
        : rawId.startsWith('folder_') ? rawId : `folder_${rawId}`;
      return {
        id: browseId,  // 统一用 id 字段，前端面包屑导航使用
        folderId: browseId,
        name: folder.name || '根目录',
        fileCount: folder.file_number || 0,
        folderCount: folder.folder_number || 0,
      };
    });

    return NextResponse.json({
      data: {
        items,
        currentPath,
        isEnd: data.is_end,
        nextCursor: data.next_cursor,
      },
    });
  } catch (error) {
    console.error('IMA browse error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '浏览知识库失败' },
      { status: 500 }
    );
  }
}
