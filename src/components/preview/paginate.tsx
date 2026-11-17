"use client";

import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { ResumeDoc, Section, TemplateTokens } from "@/lib/types";
import { ResumePaper } from "@/components/preview/ResumePaper";
import { A4_HEIGHT_PX } from "@/lib/paper";

const MAX_PAGES = 12;

function withSections(doc: ResumeDoc, sections: Section[]): ResumeDoc {
  return { ...doc, sections };
}

function continuationTitle(title: string): string {
  return title.endsWith("（续）") ? title : `${title}（续）`;
}

export async function paginateResume(
  doc: ResumeDoc,
  tokens: TemplateTokens,
): Promise<ResumeDoc[]> {
  const visible = doc.sections
    .filter((section) => section.visible)
    .map((section) => structuredClone(section));
  if (visible.length === 0) return [doc];

  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:210mm;visibility:hidden;pointer-events:none;";
  document.body.appendChild(host);
  const root = createRoot(host);

  const measure = (sections: Section[]): number => {
    flushSync(() => {
      root.render(<ResumePaper doc={withSections(doc, sections)} tokens={tokens} />);
    });
    return host.scrollHeight;
  };
  const fits = (sections: Section[]): boolean =>
    measure(sections) <= A4_HEIGHT_PX + 2;

  const splitSection = (
    section: Section,
    pageIndex: number,
  ): { page: Section; remainder: Section | null } => {
    if ("items" in section && section.items.length > 1) {
      let best = 0;
      let low = 1;
      let high = section.items.length - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const candidate = {
          ...section,
          items: section.items.slice(0, mid),
        } as Section;
        if (fits([candidate])) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      const count = Math.max(1, Math.min(best, section.items.length - 1));
      const page = {
        ...section,
        items: section.items.slice(0, count),
      } as Section;
      const remainder = {
        ...section,
        id: `${section.id}_cont_${pageIndex}`,
        title: continuationTitle(section.title),
        items: section.items.slice(count),
      } as Section;
      return { page, remainder };
    }

    if (section.type === "summary" && section.content.length > 40) {
      let best = 0;
      let low = 20;
      let high = section.content.length - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const candidate = { ...section, content: section.content.slice(0, mid) };
        if (fits([candidate])) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      let cut = Math.max(20, Math.min(best, section.content.length - 1));
      const sentence = Math.max(
        section.content.lastIndexOf("。", cut),
        section.content.lastIndexOf("\n", cut),
      );
      if (sentence >= 20) cut = sentence + 1;
      const page = { ...section, content: section.content.slice(0, cut) };
      const remainder = {
        ...section,
        id: `${section.id}_cont_${pageIndex}`,
        title: continuationTitle(section.title),
        content: section.content.slice(cut),
      };
      return { page, remainder };
    }

    return { page: section, remainder: null };
  };

  const pages: ResumeDoc[] = [];
  let flow = visible;

  try {
    while (flow.length > 0 && pages.length < MAX_PAGES) {
      if (fits(flow)) {
        pages.push(withSections(doc, flow.map((section) => structuredClone(section))));
        flow = [];
        break;
      }

      let fitCount = 0;
      for (let count = flow.length - 1; count >= 1; count -= 1) {
        if (fits(flow.slice(0, count))) {
          fitCount = count;
          break;
        }
      }

      if (fitCount > 0) {
        pages.push(
          withSections(
            doc,
            flow.slice(0, fitCount).map((section) => structuredClone(section)),
          ),
        );
        flow = flow.slice(fitCount);
        continue;
      }

      const first = flow[0];
      const { page, remainder } = splitSection(first, pages.length);
      pages.push(withSections(doc, [structuredClone(page)]));
      flow = remainder
        ? [remainder, ...flow.slice(1)]
        : flow.slice(1);
    }

    if (flow.length > 0) {
      pages.push(withSections(doc, flow.map((section) => structuredClone(section))));
    }

    return pages.length > 0 ? pages : [doc];
  } finally {
    root.unmount();
    host.remove();
  }
}
