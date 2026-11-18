import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuideArticle } from "@/components/guides/GuideArticle";
import { getCatalog } from "@/lib/catalog-server";
import { GUIDES, getGuide, guideHref } from "@/lib/guides";
import { OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) {
    return { title: "指南未找到", robots: { index: false, follow: false } };
  }
  const canonical = `${SITE_URL}${guideHref(guide.slug)}`;
  return {
    title: guide.title,
    description: guide.description,
    keywords: [guide.keyword, "简历模板", "简历怎么写", "应届生简历", "校招简历"],
    alternates: { canonical },
    openGraph: {
      type: "article",
      locale: "zh_CN",
      siteName: SITE_NAME,
      title: guide.title,
      description: guide.description,
      url: canonical,
      publishedTime: guide.date,
      modifiedTime: guide.updated,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description: guide.description,
      images: [OG_IMAGE.url],
    },
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();
  const catalog = await getCatalog().catch(() => null);
  return <GuideArticle guide={guide} catalog={catalog} />;
}
