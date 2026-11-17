import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogFile, CatalogTemplate } from "./catalog";

let cached: Promise<CatalogFile> | null = null;

/**
 * Server-only catalog reader for SSR/SEO pages and the sitemap. The catalog is
 * part of public/ so it is available both in the project root (build) and in
 * .next/standalone/public at runtime.
 */
export function getCatalog(): Promise<CatalogFile> {
  if (!cached) {
    cached = readFile(
      path.join(process.cwd(), "public", "template-catalog.json"),
      "utf8",
    ).then((raw) => JSON.parse(raw) as CatalogFile);
  }
  return cached;
}

export async function getCatalogTemplate(
  token: string,
): Promise<CatalogTemplate | null> {
  const catalog = await getCatalog();
  return (
    catalog.templates.find(
      (entry) => entry.token === token || entry.sourceToken === token,
    ) ?? null
  );
}
