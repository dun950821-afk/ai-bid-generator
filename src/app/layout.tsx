import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'AI-Bid | 智能标书生成系统',
    template: '%s | AI-Bid',
  },
  description:
    'AI-Bid 是一款基于大语言模型的智能标书生成系统，通过评分驱动的自动化流程，实现招标文档解析、标书大纲生成、章节内容AI生成、知识库管理等核心功能。',
  keywords: [
    'AI-Bid',
    '智能标书',
    '标书生成',
    '投标文件',
    '招标文档',
    'AI写作',
    '知识库',
    'RAG',
  ],
  authors: [{ name: 'AI-Bid Team' }],
  generator: 'AI-Bid',
  // icons: {
  //   icon: '',
  // },
  openGraph: {
    title: 'AI-Bid | 智能标书生成系统',
    description:
      '基于大语言模型的智能标书生成系统，通过评分驱动的自动化流程，快速生成高质量投标文件。',
    url: 'http://39.105.115.117:5000',
    siteName: 'AI-Bid',
    locale: 'zh_CN',
    type: 'website',
  },
  // twitter: {
  //   card: 'summary_large_image',
  //   title: 'Coze Code | Your AI Engineer is Here',
  //   description:
  //     'Build and deploy full-stack applications through AI conversation. No env setup, just flow.',
  //   // images: [''],
  // },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="en">
      <body className={`antialiased`}>
        {isDev && <Inspector />}
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
