import type {
  Basics,
  ResumeDoc,
  Section,
  TemplatePreset,
} from "./types";
import { createSampleResume } from "./sample";

export interface TemplateContent {
  title?: string;
  basics?: Partial<Basics>;
  sections?: Section[];
}

export async function loadTemplateContent(
  token: string,
): Promise<TemplateContent | null> {
  try {
    const response = await fetch(
      `/template-content/${encodeURIComponent(token)}.json`,
    );
    if (!response.ok) return null;
    return (await response.json()) as TemplateContent;
  } catch {
    return null;
  }
}

/**
 * Build the sample document a template actually ships with. The featured cards
 * and the copy created from them must use this content — the generic
 * createSampleResume() document lacks most template-specific sections, which is
 * why the cards did not match the template's preview cover.
 */
export function buildTemplateSample(
  preset: TemplatePreset,
  content: TemplateContent | null,
): ResumeDoc {
  const doc = createSampleResume(preset.id);
  doc.templateId = preset.id;
  doc.templatePreset = preset;
  if (content) {
    if (content.title) doc.title = content.title;
    if (content.basics) {
      doc.basics = {
        ...doc.basics,
        ...content.basics,
        links: content.basics.links ?? doc.basics.links,
      };
    }
    if (Array.isArray(content.sections) && content.sections.length > 0) {
      doc.sections = content.sections;
    }
  }
  if (preset.source?.token) {
    // Captured template: neutral 1:1 theme, same as the catalog uses.
    doc.theme = {
      ...doc.theme,
      lineHeight: 1.2,
      margin: 10,
      fontScale: "md",
      fitScale: undefined,
      dense: undefined,
    };
  }
  // A template sample must not trigger the "edited basics" header append.
  doc.basicsEdited = false;
  doc.updatedAt = Date.now();
  return doc;
}

export async function createTemplateSampleDoc(
  preset: TemplatePreset,
): Promise<ResumeDoc> {
  const content = preset.source?.token
    ? await loadTemplateContent(preset.source.token)
    : null;
  return buildTemplateSample(preset, content);
}
