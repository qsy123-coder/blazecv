import type { LayoutKind, TemplatePreset, TemplateTokens } from "./types";
import { makePresetFromDefinition } from "./templates";

export interface CatalogTemplate {
  id: string;
  token: string;
  sourceToken: string;
  name: string;
  desc: string;
  tags: string[];
  layout: LayoutKind;
  font: "sans" | "serif";
  preview: string | null;
  content: string | null;
  people: number;
  sourceName: string;
  tokens: Partial<Omit<TemplateTokens, "layout" | "lineHeight" | "margin">>;
}

export interface CatalogFile {
  generatedAt: string;
  count: number;
  withPreview: number;
  withContent?: number;
  templates: CatalogTemplate[];
}

export function presetFromCatalog(entry: CatalogTemplate): TemplatePreset {
  return makePresetFromDefinition({
    id: entry.id,
    name: entry.name,
    desc: entry.desc,
    layout: entry.layout,
    tags: entry.tags,
    source: {
      token: entry.sourceToken || entry.token,
      name: entry.sourceName,
    },
    font: entry.font,
    tokens: entry.tokens,
  });
}
