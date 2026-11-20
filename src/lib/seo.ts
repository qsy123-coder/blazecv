export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://aetouban.cn";
export const SITE_NAME = "BlazeCV";

/**
 * RSS discovery link. `alternates` is replaced wholesale by a page-level
 * definition, so every page that sets a canonical must also re-declare the
 * feed — otherwise only the pages without their own `alternates` expose it.
 */
export const RSS_ALTERNATE = {
  "application/rss+xml": `${SITE_URL}/feed.xml`,
} as const;

export function pageAlternates(canonical: string) {
  return { canonical, types: RSS_ALTERNATE };
}
export const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "BlazeCV · 4127 套简历模板",
} as const;
