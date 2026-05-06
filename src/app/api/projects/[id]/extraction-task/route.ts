import { NextRequest, NextResponse } from 'next/server';
import { 
  startExtractionTask, 
  getTaskStatus, 
  getLatestTaskForProject 
} from '@/lib/services/background-task-service';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * GET /api/projects/[id]/extraction-task
 * 获取项目的提取任务状态
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const taskId = url.searchParams.get('taskId');

    let task;
    if (taskId) {
      // 获取指定任务
      task = await getTaskStatus(taskId);
    } else {
      // 获取最新任务
      task = await getLatestTaskForProject(id, 'extraction');
    }

    if (!task) {
      return NextResponse.json({
        success: true,
        data: {
          hasTask: false,
          task: null,
        },
      });
    }

    // 如果任务完成，同时返回提取结果
    let extractionResult = null;
    if (task.status === 'completed') {
      const client = getSupabaseClient();
      const { data } = await client
        .from('tender_extraction_results')
        .select('*')
        .eq('project_id', id)
        .single();
      extractionResult = data;
    }

    return NextResponse.json({
      success: true,
      data: {
        hasTask: true,
        task: {
          id: task.id,
          status: task.status,
          progress: task.progress,
          stage: task.stage,
          stageDetail: task.stageDetail,
          errorMessage: task.errorMessage,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
          createdAt: task.createdAt,
        },
        extractionResult,
      },
    });
  } catch (error) {
    console.error('[extraction-task] 获取任务状态失败:', error);
    return NextResponse.json(
      { success: false, error: '获取任务状态失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[id]/extraction-task
 * 启动新的提取任务
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { documentUrl, documentName, uploadId, documentText } = body;

    const client = getSupabaseClient();

    // 验证项目存在
    const { data: project, error: projectError } = await client
      .from('projects')
      .select('id, metadata')
      .eq('id', id)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { success: false, error: '项目不存在' },
        { status: 404 }
      );
    }

    // 获取文档URL或文本
    let docUrl = documentUrl;
    let docName = documentName;
    
    if (!docUrl && project.metadata?.uploadedDocument?.url) {
      docUrl = project.metadata.uploadedDocument.url;
      docName = project.metadata.uploadedDocument.name;
    }

    // 如果有直接传入的文本内容
    if (documentText) {
      // 对文本内容进行 URL 编码，避免 URI 畸形错误
      const encodedText = encodeURIComponent(documentText);
      docUrl = 'text://' + encodedText;
      docName = documentName || '粘贴文本.txt';
    } else if (!docUrl) {
      return NextResponse.json(
        { success: false, error: '请先上传招标文档或粘贴文本内容' },
        { status: 400 }
      );
    }

    // 检查是否有正在运行的任务
    const existingTask = await getLatestTaskForProject(id, 'extraction');
    if (existingTask && existingTask.status === 'running') {
      return NextResponse.json({
        success: true,
        data: {
          taskId: existingTask.id,
          message: '已有提取任务正在运行',
          task: {
            id: existingTask.id,
            status: existingTask.status,
            progress: existingTask.progress,
            stage: existingTask.stage,
          },
        },
      });
    }

    // 启动新的提取任务，传入uploadId用于获取百炼file_id
    const taskId = await startExtractionTask(id, docUrl, docName || '招标文档', undefined, uploadId);

    // 更新项目的上传文档状态
    await client.from('projects').update({
      metadata: {
        ...(project.metadata || {}),
        uploadedDocument: {
          name: docName,
          url: docUrl.startsWith('text://') ? '' : docUrl,
          extracted: false,
          uploadingAt: new Date().toISOString(),
          isTextInput: !!documentText,
        },
      },
    }).eq('id', id);

    return NextResponse.json({
      success: true,
      data: {
        taskId,
        message: '提取任务已启动',
      },
    });
  } catch (error) {
    console.error('[extraction-task] 启动任务失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '启动任务失败' },
      { status: 500 }
    );
  }
}
