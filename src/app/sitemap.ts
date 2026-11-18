import type { MetadataRoute } from "next";
import { getCatalog } from "@/lib/catalog-server";
import {
  LAYOUT_KEYS,
  indexableTags,
  layoutHref,
  tagHref,
} from "@/lib/seo-collections";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://aetouban.cn";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/templates`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/faq`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  try {
    const catalog = await getCatalog();
    const lastModified = catalog.generatedAt
      ? new Date(catalog.generatedAt)
      : now;
    const tagPages: MetadataRoute.Sitemap = indexableTags(catalog, 60).map(
      (tag) => ({
        url: `${SITE_URL}${tagHref(tag)}`,
        lastModified,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }),
    );

    const layoutPages: MetadataRoute.Sitemap = LAYOUT_KEYS.filter((layout) =>
      catalog.templates.some((entry) => entry.layout === layout),
    ).map((layout) => ({
      url: `${SITE_URL}${layoutHref(layout)}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.75,
    }));

    return [
      ...staticPages,
      ...tagPages,
      ...layoutPages,
      ...catalog.templates.map((entry) => ({
        url: `${SITE_URL}/templates/${entry.token}`,
        lastModified,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch {
    return staticPages;
  }
}
