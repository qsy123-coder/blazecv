import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://aetouban.cn";

// Private app routes and share tokens. Everything public (home, catalog,
// tag/layout landing pages, template details, guides, FAQ) stays crawlable.
const DISALLOW = ["/editor", "/resumes", "/audit", "/api/", "/r/"];

// Named crawlers are listed explicitly so that a per-bot rule can be tuned
// without touching the `*` fallback. Chinese engines matter most here:
// Baiduspider, Sogou, 360Spider and YisouSpider do not render much JavaScript,
// which is why the crawlable content is server-rendered.
const CRAWLERS = [
  "Baiduspider",
  "Baiduspider-render",
  "Googlebot",
  "bingbot",
  "Sogou web spider",
  "360Spider",
  "YisouSpider",
  "Bytespider",
  "Applebot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOW,
      },
      {
        userAgent: CRAWLERS,
        allow: "/",
        disallow: DISALLOW,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
