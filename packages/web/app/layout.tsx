import type { Metadata } from 'next';
import './globals.css';
import { PlatformBoundary } from '../components/platform-safety';

export const metadata: Metadata = {
  title: 'SE Lab · 工程实践空间',
  description:
    '在 SE Lab 工程实践空间中使用代码统计、四则运算与 24 点挑战，了解项目的需求、设计、验证和持续迭代。',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <PlatformBoundary>{children}</PlatformBoundary>
      </body>
    </html>
  );
}
