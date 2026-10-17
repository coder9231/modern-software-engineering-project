import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SE Lab · 工程宇宙",
  description: "在 SE Lab 工程宇宙中探索代码统计、四则运算、24 点挑战和软件工程实践。每一颗星球，都是一个正在成长的作品。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
