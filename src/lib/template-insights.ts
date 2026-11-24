import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CatalogTemplate } from "./catalog";

/**
 * Per-template facts derived from the captured sample content.
 *
 * Template detail pages share the same surrounding copy, so search engines see
 * 4127 near-identical documents. These facts (module list, sample size, photo
 * slot) differ per template and are rendered as visible page content plus a
 * short generated paragraph, which gives each page real unique text.
 */

export interface TemplateInsight {
  modules: string[];
  items: number;
  bullets: number;
  words: number;
  hasPhoto: boolean;
}

const cache = new Map<string, TemplateInsight | null>();

const CJK = /[一-鿿]/g;
const LATIN = /[A-Za-z0-9]+/g;

function countText(value: unknown): number {
  if (typeof value !== "string") return 0;
  const cjk = (value.match(CJK) ?? []).length;
  const latin = (value.match(LATIN) ?? []).length;
  return cjk + latin;
}

interface RawSection {
  title?: string;
  content?: string;
  items?: Array<Record<string, unknown>>;
}

export async function getTemplateInsight(
  entry: CatalogTemplate,
): Promise<TemplateInsight | null> {
  const cached = cache.get(entry.token);
  if (cached !== undefined) return cached;

  try {
    const file = path.join(
      process.cwd(),
      "public",
      "template-content",
      `${entry.token}.json`,
    );
    const raw = await readFile(file, "utf8");
    const doc = JSON.parse(raw) as {
      basics?: { avatar?: string };
      sections?: RawSection[];
    };

    const sections = (doc.sections ?? []).filter(
      (section): section is RawSection & { title: string } =>
        Boolean(section && section.title),
    );

    let items = 0;
    let bullets = 0;
    let words = 0;

    for (const section of sections) {
      words += countText(section.content);
      for (const item of section.items ?? []) {
        items += 1;
        for (const [key, value] of Object.entries(item)) {
          if (key === "bullets" || key === "id") continue;
          if (Array.isArray(value)) {
            for (const entryValue of value) words += countText(entryValue);
          } else {
            words += countText(value);
          }
        }
        for (const bullet of (item.bullets as unknown[] | undefined) ?? []) {
          bullets += 1;
          words += countText(bullet);
        }
      }
    }

    const insight: TemplateInsight = {
      modules: sections.map((section) => section.title),
      items,
      bullets,
      words,
      hasPhoto: Boolean(doc.basics?.avatar),
    };
    cache.set(entry.token, insight);
    return insight;
  } catch {
    cache.set(entry.token, null);
    return null;
  }
}
