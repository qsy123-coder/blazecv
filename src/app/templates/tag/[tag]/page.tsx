import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TemplateCollectionPage } from "@/components/templates/TemplateCollectionPage";
import { getCatalog } from "@/lib/catalog-server";
import {
  LAYOUT_LABELS,
  MIN_TAG_COUNT,
  decodeTagParam,
  indexableTags,
  isLinkableTag,
  layoutHref,
  relatedTags,
  tagCollection,
  tagHref,
  tagMeta,
} from "@/lib/seo-collections";
import { OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  const catalog = await getCatalog().catch(() => null);
  if (!catalog) return [];
  return indexableTags(catalog, 60).map((tag) => ({ tag }));
}

async function load(tagParam: string) {
  const catalog = await getCatalog().catch(() => null);
  if (!catalog) return null;
  const tag = decodeTagParam(tagParam).trim();
  if (!tag || !isLinkableTag(tag)) return null;
  const data = tagCollection(catalog, tag);
  if (data.count === 0) return null;
  return { catalog, ...data };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag: raw } = await params;
  const data = await load(raw);
  if (!data) {
    return { title: "模板分类未找到", robots: { index: false, follow: false } };
  }
  const { tag, count } = data;
  const meta = tagMeta(tag, count);
  const title = `${tag}简历模板 · ${count} 套免费在线模板`;
  const description = `${meta.summary} 共 ${count} 套，支持在线编辑、A4 实时预览，免费导出 PDF、PNG、Word。`;
  const canonical = `${SITE_URL}/templates/tag/${encodeURIComponent(tag)}`;

  return {
    title,
    description,
    keywords: [
      `${tag}简历模板`,
      `免费${tag}简历模板`,
      `${tag}简历模板下载`,
      `${tag}求职简历模板`,
      "简历模板",
      "在线简历",
    ],
    alternates: { canonical },
    robots:
      count >= MIN_TAG_COUNT
        ? { index: true, follow: true }
        : { index: false, follow: true },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: SITE_NAME,
      title,
      description,
      url: canonical,
      images: [{ ...OG_IMAGE, alt: `${tag}简历模板` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE.url],
    },
  };
}

export default async function TemplateTagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag: raw } = await params;
  const data = await load(raw);
  if (!data) notFound();

  const { catalog, tag, count, items } = data;
  const meta = tagMeta(tag, count);
  const canonical = `${SITE_URL}/templates/tag/${encodeURIComponent(tag)}`;

  const layouts = (Object.entries(LAYOUT_LABELS) as Array<[string, string]>)
    .map(([key, label]) => ({
      label: `${label}简历模板`,
      href: layoutHref(key),
      count: catalog.templates.filter((entry) => entry.layout === key).length,
    }))
    .filter((entry) => entry.count > 0);

  const related = [
    ...relatedTags(items, tag, 10).map((entry) => ({
      label: `${entry.tag}简历模板`,
      href: tagHref(entry.tag),
      count: entry.count,
    })),
    ...layouts,
  ];

  return (
    <TemplateCollectionPage
      heading={`${tag}简历模板`}
      kicker="用途分类 · 在线简历模板"
      summary={meta.summary}
      tips={meta.tips}
      total={count}
      items={items}
      breadcrumbLabel={`${tag}简历模板`}
      canonical={canonical}
      related={related}
      relatedTitle="相关用途与版式"
    />
  );
}
