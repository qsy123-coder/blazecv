import { getCatalog } from "@/lib/catalog-server";
import { GUIDES, guideHref } from "@/lib/guides";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

export const revalidate = 3600;

const TEMPLATE_ITEMS = 50;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toUTCString();
  return date.toUTCString();
}

/**
 * RSS feed for guides and the most-used templates. Search engines and feed
 * readers use it to discover new pages without waiting for a sitemap recrawl;
 * the `<link rel="alternate">` in the root layout points here.
 */
export async function GET() {
  const catalog = await getCatalog().catch(() => null);
  const generatedAt = catalog?.generatedAt ? new Date(catalog.generatedAt) : new Date();
  const templates = catalog
    ? [...catalog.templates].sort((a, b) => b.people - a.people).slice(0, TEMPLATE_ITEMS)
    : [];

  const items: string[] = [];

  for (const guide of GUIDES) {
    const url = `${SITE_URL}${guideHref(guide.slug)}`;
    items.push(
      [
        "    <item>",
        `      <title>${escapeXml(guide.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <description>${escapeXml(guide.description)}</description>`,
        `      <category>写简历指南</category>`,
        `      <pubDate>${rfc822(guide.date)}</pubDate>`,
        "    </item>",
      ].join("\n"),
    );
  }

  for (const entry of templates) {
    const url = `${SITE_URL}/templates/${entry.token}`;
    const title = entry.sourceName || entry.name;
    const description = entry.desc || `${title}，支持在线编辑与 A4 实时预览。`;
    items.push(
      [
        "    <item>",
        `      <title>${escapeXml(title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <description>${escapeXml(description)}</description>`,
        `      <category>简历模板</category>`,
        `      <pubDate>${rfc822(generatedAt)}</pubDate>`,
        "    </item>",
      ].join("\n"),
    );
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(`${SITE_NAME} · 简历模板与写简历指南`)}</title>`,
    `    <link>${escapeXml(`${SITE_URL}/`)}</link>`,
    `    <description>${escapeXml(
      "BlazeCV 在线简历制作：4127 套简历模板、A4 实时预览与 PDF/PNG/Word 导出；附应届生、校招、社招简历写法指南。",
    )}</description>`,
    "    <language>zh-CN</language>",
    `    <lastBuildDate>${rfc822(generatedAt)}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(`${SITE_URL}/feed.xml`)}" rel="self" type="application/rss+xml" />`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
