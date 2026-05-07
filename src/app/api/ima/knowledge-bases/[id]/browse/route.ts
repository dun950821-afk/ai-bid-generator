import { NextRequest, NextResponse } from 'next/server';
import { getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import { getKnowledgeList, isFolderEntry } from '@/lib/services/ima-service';

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
    const folderId = searchParams.get('folder_id') || undefined;
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

    // 构建文件夹信息映射（从 current_path 获取 file_number/folder_number）
    const folderInfoMap = new Map<string, { fileCount: number; folderCount: number }>();
    for (const folder of data.current_path || []) {
      folderInfoMap.set(String(folder.folder_id), {
        fileCount: folder.file_number || 0,
        folderCount: folder.folder_number || 0,
      });
    }

    // IMA media_type 到友好名称的映射
    const MEDIA_TYPE_NAMES: Record<number, string> = {
      1: 'PDF',
      2: '网页',
      3: 'Word',
      4: 'PPT',
      5: 'Excel',
      6: '公众号文章',
      7: 'Markdown',
      8: '图片',
      9: '笔记',
      10: 'AI会话',
      11: 'TXT',
      12: 'Xmind',
      13: '录音',
      99: '文件夹',
    };

    // 映射结果为前端友好的格式
    const items = (data.knowledge_list || []).map((entry) => {
      const isFolder = isFolderEntry(entry);
      
      if (isFolder) {
        // 文件夹条目: media_id 格式为 "folder_数字ID"
        const mediaId = entry.media_id || '';
        // 从 media_id 提取数字部分作为 folderId（用于匹配 current_path）
        const numericId = mediaId.startsWith('folder_') ? mediaId.substring(7) : mediaId;
        const folderInfo = folderInfoMap.get(numericId);
        
        return {
          id: mediaId,  // 保持完整 media_id（含 folder_ 前缀），用于浏览子目录
          name: entry.title || '未命名文件夹',
          isFolder: true,
          fileCount: folderInfo?.fileCount ?? 0,
          folderCount: folderInfo?.folderCount ?? 0,
          parentId: entry.parent_folder_id,
        };
      } else {
        // 文件条目
        const mediaId = entry.media_id || '';
        const mediaType = entry.media_type || 0;
        const mediaTypeName = MEDIA_TYPE_NAMES[mediaType] || '文档';

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
    // IMA 的 current_path 中根目录的 folder_id 是纯数字，子目录可能含 "folder_" 前缀
    const currentPath = (data.current_path || []).map((folder, index) => {
      const rawId = String(folder.folder_id);
      // 浏览时需要 "folder_" 前缀（根目录除外，根目录浏览不传 folder_id）
      const browseId = index === 0
        ? rawId  // 根目录保持原样（浏览根目录不传 folder_id）
        : rawId.startsWith('folder_') ? rawId : `folder_${rawId}`;
      return {
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
