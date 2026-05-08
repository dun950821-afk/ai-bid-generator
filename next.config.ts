import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone', // Docker部署支持
  allowedDevOrigins: ['*.dev.coze.site'],
  serverExternalPackages: ['@alicloud/bailian20231229', '@darabonba/typescript', 'moment', '@alicloud/tea-util', '@alicloud/openapi-util'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lf-coze-web-cdn.coze.cn',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
