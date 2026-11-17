import type { Metadata } from "next";
import { HomePage } from "@/components/home/HomePage";
import { OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

const TITLE = "BlazeCV 简历模板库 · 4127 套在线简历模板与简历制作";
const DESC =
  "4127 套免费简历模板，覆盖应届生、社招、技术、运营、设计等用途。在线填写内容，实时 A4 预览，一键导出 PDF、PNG、Word；数据只保存在本机，无需注册。";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: SITE_NAME,
    title: TITLE,
    description: DESC,
    url: "/",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [OG_IMAGE.url],
  },
};

export default function Home() {
  return <HomePage />;
}
