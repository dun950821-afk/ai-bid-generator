import { NextRequest, NextResponse } from 'next/server';

/**
 * 图片代理 API
 * 用于解决 OSS 图片跨域加载问题
 * GET /api/image-proxy?url=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
      return NextResponse.json({ error: '缺少图片URL参数' }, { status: 400 });
    }

    // 解析并验证URL
    let urlObj: URL;
    try {
      urlObj = new URL(imageUrl);
    } catch {
      return NextResponse.json({ error: '无效的图片URL' }, { status: 400 });
    }

    // 验证URL是否为阿里云OSS地址
    const isAllowed = urlObj.hostname.includes('aliyuncs.com');

    if (!isAllowed) {
      return NextResponse.json({ error: '不允许代理该域名的图片' }, { status: 403 });
    }

    // 请求图片
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.error(`[Image Proxy] Fetch failed: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `图片请求失败: ${response.status}` },
        { status: response.status }
      );
    }

    // 获取图片数据
    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';

    // 返回图片，添加CORS头
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    console.error('[Image Proxy] Error:', error);
    return NextResponse.json(
      { error: error.message || '图片代理失败' },
      { status: 500 }
    );
  }
}
