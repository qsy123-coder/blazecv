import type { Metadata } from "next";
import { HomePage } from "@/components/home/HomePage";
import { HomeSeoContent } from "@/components/seo/HomeSeoContent";
import { HOME_FAQ } from "@/lib/home-faq";
import { OG_IMAGE, SITE_NAME, SITE_URL, pageAlternates } from "@/lib/seo";

const TITLE = "BlazeCV 简历模板库 · 4127 套在线简历模板与简历制作";
const DESC =
  "4127 套免费简历模板，覆盖应届生、社招、技术、运营、设计等用途。在线填写内容，实时 A4 预览，免费编辑与预览；导出 PDF、PNG、Word 为会员功能。数据默认只保存在本机，无需注册即可编辑。";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: pageAlternates(`${SITE_URL}/`),
  keywords: [
    "简历模板",
    "个人简历模板",
    "免费简历模板",
    "简历模板下载",
    "在线简历制作",
    "简历制作",
    "应届生简历模板",
    "社招简历模板",
    "A4 简历",
    "BlazeCV",
  ],
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

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${SITE_URL}/#home-faq`,
  mainEntity: HOME_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default function Home() {
  return (
    <>
      <HomePage seoContent={<HomeSeoContent />} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
