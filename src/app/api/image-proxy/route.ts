import { NextRequest, NextResponse } from 'next/server';

/**
 * 图片代理 API
 * 用于解决 OSS 图片跨域加载问题
 * GET /api/image-proxy?url=xxx
 */

// 允许的域名白名单 - 使用精确匹配模式
// 阿里云 OSS 域名格式: <bucket>.oss-<region>.aliyuncs.com
const ALLOWED_DOMAINS = [
  // 阿里云 OSS 域名
  /^[\w-]+\.oss-[a-z]+(-\d+)?\.aliyuncs\.com$/i,
  // 阿里云 OSS 内网域名（可选）
  /^[\w-]+\.oss-[a-z]+(-\d+)?-internal\.aliyuncs\.com$/i,
  // 阿里云 CDN 域名（如果使用）
  /^[\w-]+\.cdn\.aliyuncs\.com$/i,
];

/**
 * 验证域名是否在白名单中
 * @param hostname 要验证的域名
 * @returns 是否允许
 */
function isAllowedDomain(hostname: string): boolean {
  // 防止通过子域名绕过（如 aliyuncs.com.evil.com）
  const normalizedHostname = hostname.toLowerCase();
  
  // 检查是否匹配任何允许的域名模式
  return ALLOWED_DOMAINS.some(pattern => pattern.test(normalizedHostname));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
      return NextResponse.json({ error: '缺少图片URL参数' }, { status: 400 });
    }

    // 限制URL长度，防止过长的恶意URL
    if (imageUrl.length > 2048) {
      return NextResponse.json({ error: 'URL过长' }, { status: 400 });
    }

    // 解析并验证URL
    let urlObj: URL;
    try {
      urlObj = new URL(imageUrl);
    } catch {
      return NextResponse.json({ error: '无效的图片URL' }, { status: 400 });
    }

    // 强制使用 HTTPS
    if (urlObj.protocol !== 'https:') {
      return NextResponse.json({ error: '仅支持HTTPS协议' }, { status: 400 });
    }

    // 验证域名是否在白名单中
    if (!isAllowedDomain(urlObj.hostname)) {
      console.warn(`[Image Proxy] Blocked domain: ${urlObj.hostname}`);
      return NextResponse.json({ error: '不允许代理该域名的图片' }, { status: 403 });
    }

    // 请求图片
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      // 设置超时，防止SSRF攻击长时间阻塞
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(`[Image Proxy] Fetch failed: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `图片请求失败: ${response.status}` },
        { status: response.status }
      );
    }

    // 验证返回的内容类型是否为图片
    const contentType = response.headers.get('content-type') || '';
    const allowedContentTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'image/bmp',
      'image/x-icon',
    ];
    
    if (!allowedContentTypes.some(type => contentType.includes(type))) {
      console.warn(`[Image Proxy] Blocked content type: ${contentType}`);
      return NextResponse.json({ error: '不支持的内容类型' }, { status: 400 });
    }

    // 获取图片数据
    const imageBuffer = await response.arrayBuffer();
    
    // 限制图片大小（最大 10MB）
    const MAX_SIZE = 10 * 1024 * 1024;
    if (imageBuffer.byteLength > MAX_SIZE) {
      return NextResponse.json({ error: '图片过大' }, { status: 400 });
    }

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
