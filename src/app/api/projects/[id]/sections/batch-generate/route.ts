/**
 * 批量章节生成API
 * @description 批量生成多个章节，支持SSE流式输出进度
 */

import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// =====================================================
// 辅助函数
// =====================================================

function createSSEEncoder() {
  const encoder = new TextEncoder();
  return {
    send: (type: string, data: Record<string, unknown>) => {
      return encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    },
  };
}

// =====================================================
// 获取待生成章节列表
// =====================================================

interface SectionInfo {
  id: string;
  title: string;
  order: number;
}

function getPendingSections(sections: any[]): SectionInfo[] {
  const result: SectionInfo[] = [];
  
  function traverse(items: any[]) {
    for (const item of items) {
      // 只处理叶子节点（没有children或children为空）
      const hasChildren = item.children && item.children.length > 0;
      
      if (!hasChildren) {
        // 如果没有内容或状态不是completed，则是待生成
        if (!item.content || item.status !== 'completed') {
          result.push({
            id: item.id,
            title: item.title,
            order: item.order,
          });
        }
      } else {
        traverse(item.children);
      }
    }
  }
  
  traverse(sections);
  return result;
}

// =====================================================
// 主处理函数
// =====================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const body = await req.json();
  const { 
    sectionIds,
    knowledgeBaseIds = [],
  } = body;

  const encoder = createSSEEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: Record<string, unknown> = {}) => {
        controller.enqueue(encoder.send(type, data));
      };

      try {
        // 获取项目信息
        const client = getSupabaseClient();
        const { data: project, error } = await client
          .from('projects')
          .select('metadata')
          .eq('id', projectId)
          .single();

        if (error || !project) {
          send('error', { error: '项目不存在' });
          controller.close();
          return;
        }

        // 获取待生成章节
        const allSections = project.metadata?.outline?.sections || [];
        let targetSections: SectionInfo[];

        if (sectionIds && sectionIds.length > 0) {
          // 使用指定的章节ID
          targetSections = sectionIds.map((id: string) => {
            const section = findSectionById(allSections, id);
            return section || { id, title: '未知章节', order: 0 };
          });
        } else {
          // 获取所有待生成章节
          targetSections = getPendingSections(allSections);
        }

        if (targetSections.length === 0) {
          send('complete', { message: '没有需要生成的章节' });
          controller.close();
          return;
        }

        send('start', { 
          totalSections: targetSections.length,
          sections: targetSections,
        });

        // 统计信息
        let completedCount = 0;
        let failedCount = 0;
        let totalTokens = 0;
        let totalElapsed = 0;

        // 串行生成每个章节
        for (const section of targetSections) {
          send('section_start', {
            sectionId: section.id,
            title: section.title,
            order: section.order,
            progress: completedCount + failedCount + 1,
            total: targetSections.length,
          });

          try {
            // 调用单个章节生成API
            const baseUrl = process.env.DEPLOY_RUN_PORT 
              ? `http://localhost:${process.env.DEPLOY_RUN_PORT}` 
              : 'http://localhost:5000';
            
            const response = await fetch(
              `${baseUrl}/api/projects/${projectId}/sections/${section.id}/generate`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  knowledgeBaseIds,
                  skipLockCheck: true,
                }),
              }
            );

            const result = await response.json();

            if (result.success) {
              completedCount++;
              totalTokens += result.metadata?.contextTokens || 0;
              totalElapsed += result.metadata?.elapsed || 0;

              send('section_done', {
                sectionId: section.id,
                title: section.title,
                wordCount: result.content?.length || 0,
                metadata: result.metadata,
                completedCount,
                failedCount,
              });
            } else {
              failedCount++;
              send('section_failed', {
                sectionId: section.id,
                title: section.title,
                error: result.error || '生成失败',
                completedCount,
                failedCount,
              });
            }
          } catch (err) {
            failedCount++;
            send('section_failed', {
              sectionId: section.id,
              title: section.title,
              error: err instanceof Error ? err.message : '生成失败',
              completedCount,
              failedCount,
            });
          }

          // 短暂延迟，避免请求过快
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        // 完成
        send('batch_complete', {
          totalSections: targetSections.length,
          completedCount,
          failedCount,
          totalTokens,
          totalElapsed,
        });

        controller.close();
      } catch (error) {
        console.error('[BatchGenerate] 批量生成失败:', error);
        send('error', { error: error instanceof Error ? error.message : '批量生成失败' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// =====================================================
// 辅助函数：查找章节
// =====================================================

function findSectionById(sections: any[], id: string): SectionInfo | null {
  for (const section of sections) {
    if (section.id === id) {
      return {
        id: section.id,
        title: section.title,
        order: section.order,
      };
    }
    if (section.children) {
      const found = findSectionById(section.children, id);
      if (found) return found;
    }
  }
  return null;
}
