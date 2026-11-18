import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TemplateCollectionPage } from "@/components/templates/TemplateCollectionPage";
import { getCatalog } from "@/lib/catalog-server";
import {
  LAYOUT_KEYS,
  LAYOUT_LABELS,
  MIN_TAG_COUNT,
  decodeTagParam,
  isLinkableTag,
  layoutCollection,
  layoutHref,
  layoutMeta,
  tagHref,
  tagStats,
} from "@/lib/seo-collections";
import { OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

export const revalidate = 86400;
export const dynamicParams = false;

export async function generateStaticParams() {
  const catalog = await getCatalog().catch(() => null);
  if (!catalog) return LAYOUT_KEYS.map((layout) => ({ layout }));
  return LAYOUT_KEYS.filter(
    (layout) => catalog.templates.some((entry) => entry.layout === layout),
  ).map((layout) => ({ layout }));
}

async function load(layoutParam: string) {
  const catalog = await getCatalog().catch(() => null);
  if (!catalog) return null;
  const layout = decodeTagParam(layoutParam).trim();
  if (!LAYOUT_LABELS[layout]) return null;
  const data = layoutCollection(catalog, layout);
  if (data.count === 0) return null;
  return { catalog, ...data };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ layout: string }>;
}): Promise<Metadata> {
  const { layout: raw } = await params;
  const data = await load(raw);
  if (!data) {
    return { title: "版式未找到", robots: { index: false, follow: false } };
  }
  const { layout, count } = data;
  const meta = layoutMeta(layout, count);
  const title = `${meta.label}简历模板 · ${count} 套免费在线模板`;
  const description = `${meta.summary} 共 ${count} 套，支持在线编辑、A4 实时预览，免费导出 PDF、PNG、Word。`;
  const canonical = `${SITE_URL}/templates/layout/${encodeURIComponent(layout)}`;

  return {
    title,
    description,
    keywords: [
      `${meta.label}简历模板`,
      `${meta.label}版式简历模板`,
      `免费${meta.label}简历模板`,
      "简历模板",
      "在线简历",
    ],
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: SITE_NAME,
      title,
      description,
      url: canonical,
      images: [{ ...OG_IMAGE, alt: `${meta.label}简历模板` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE.url],
    },
  };
}

export default async function TemplateLayoutPage({
  params,
}: {
  params: Promise<{ layout: string }>;
}) {
  const { layout: raw } = await params;
  const data = await load(raw);
  if (!data) notFound();

  const { catalog, layout, count, items } = data;
  const meta = layoutMeta(layout, count);
  const canonical = `${SITE_URL}/templates/layout/${encodeURIComponent(layout)}`;

  const otherLayouts = (Object.entries(LAYOUT_LABELS) as Array<[string, string]>)
    .filter(([key]) => key !== layout)
    .map(([key, label]) => ({
      label: `${label}简历模板`,
      href: layoutHref(key),
      count: catalog.templates.filter((entry) => entry.layout === key).length,
    }))
    .filter((entry) => entry.count > 0);

  const tags = tagStats(catalog)
    .filter((row) => row.count >= MIN_TAG_COUNT && isLinkableTag(row.tag))
    .slice(0, 8)
    .map((row) => ({
      label: `${row.tag}简历模板`,
      href: tagHref(row.tag),
      count: row.count,
    }));

  return (
    <TemplateCollectionPage
      heading={`${meta.label}简历模板`}
      kicker="版式分类 · 在线简历模板"
      summary={meta.summary}
      tips={meta.tips}
      total={count}
      items={items}
      breadcrumbLabel={`${meta.label}简历模板`}
      canonical={canonical}
      related={[...otherLayouts, ...tags]}
      relatedTitle="其他版式与用途"
    />
  );
}
