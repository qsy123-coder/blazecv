import type { Metadata } from "next";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "编辑简历",
  description:
    "在线编辑简历，实时 A4 预览；免费版可带水印导出，会员无水印导出 PDF、图片与 Word。",
  robots: { index: false, follow: false },
};

export default function EditorPage() {
  return <AppShell />;
}
