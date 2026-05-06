/**
 * IMA 文件上传 API
 * 两步流程：
 * 1. createMedia - 获取COS上传凭证
 * 2. addKnowledge - 完成上传确认
 */

import { NextRequest, NextResponse } from 'next/server';
import { getIMAProviderConfig } from '@/lib/services/retrieval/provider';
import {
  createMedia,
  addKnowledge,
  type IMAConfig,
} from '@/lib/services/ima-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const fileName = formData.get('fileName') as string | null;

    if (!file && !fileName) {
      return NextResponse.json(
        { success: false, error: '请提供文件' },
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

    const actualFileName = fileName || file!.name;
    const fileSize = file ? file.size : 0;

    // Step 1: 获取COS上传凭证
    const mediaResult = await createMedia(config, {
      knowledge_base_id: id,
      file_name: actualFileName,
      file_size: fileSize,
    });

    if (!mediaResult.success) {
      return NextResponse.json(
        { success: false, error: mediaResult.error || '获取上传凭证失败' },
        { status: 500 }
      );
    }

    const mediaData = mediaResult.data!;

    // Step 2: 如果有文件内容，上传到COS
    if (file) {
      const cosResponse = await fetch(mediaData.upload_url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      });

      if (!cosResponse.ok) {
        return NextResponse.json(
          { success: false, error: '文件上传到COS失败' },
          { status: 500 }
        );
      }
    }

    // Step 3: 完成上传确认
    const addResult = await addKnowledge(config, {
      knowledge_base_id: id,
      media_id: mediaData.media_id,
      title: actualFileName,
      type: 'file',
    });

    if (!addResult.success) {
      return NextResponse.json(
        { success: false, error: addResult.error || '添加知识失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        media_id: mediaData.media_id,
        knowledge_id: addResult.data?.knowledge_id,
      },
    });
  } catch (error: any) {
    console.error('[IMA Upload] Failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || '文件上传失败' },
      { status: 500 }
    );
  }
}
