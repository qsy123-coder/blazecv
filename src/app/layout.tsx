import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BlazeCV · 在线简历制作",
  description: "免登录在线简历编辑器，48 套专业模板，一键导出 PDF、图片与 Word。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="scroll-smooth">
      <body>{children}</body>
    </html>
  );
}
