import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SE Lab · 软件工程实践平台",
  description: "面向现代软件工程课程的团队实践平台。导入项目、分析代码规模、查看语言分布并导出代码统计报告，记录从需求到交付的工程实践。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
