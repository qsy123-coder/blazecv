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
  const description = `${meta.summary} 共 ${count} 套，支持在线编辑、A4 实时预览；导出 PDF、PNG、Word 为会员功能。`;
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

  const faq = [
    { q: `如何挑选${tag}简历模板？`, a: meta.summary },
    {
      q: `${tag}简历需要写几页？`,
      a: `优先控制在 1 页 A4 内，把与目标岗位最相关的内容放在第一页。经历较多时可以扩展到 2 页；BlazeCV 会按 A4 高度自动分页，不会把纸张拉长或压扁内容。`,
    },
    {
      q: `这些${tag}简历模板可以免费导出吗？`,
      a: `可以免登录导出，但免费版文件带水印；开通会员后导出无水印，会员期内不限次数。本页 ${count} 套模板都支持在线编辑、A4 实时预览，并可导出 PDF（图片版/文字版）、PNG 和 Word。`,
    },
    {
      q: `${tag}简历模板会丢失原有排版吗？`,
      a: `不会。模板使用原站页面的真实 DOM 与 CSS 渲染，姓名字号、行距、页头花纹和模块顺序都按原版保留；预览、PNG、PDF 与 Word 图片版共用同一套渲染结果。`,
    },
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
      faq={faq}
    />
  );
}
