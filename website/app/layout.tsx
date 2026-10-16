import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SE Lab · 软件工程实践平台",
  description: "现代软件工程课程团队实践平台：项目代码统计、可定制的四则运算练习、精确批改与 24 点挑战，记录从需求到交付的工程实践。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
