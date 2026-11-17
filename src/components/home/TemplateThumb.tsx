"use client";

import type { ResumeDoc, TemplateId } from "@/lib/types";
import { getTemplate, resolveTokens } from "@/lib/templates";
import { ResumePaper } from "@/components/preview/ResumePaper";

export function TemplateThumb({
  doc,
  templateId,
  scale,
}: {
  doc: ResumeDoc;
  templateId: TemplateId;
  scale: number;
}) {
  const preset =
    doc.templateId === templateId && doc.templatePreset
      ? doc.templatePreset
      : getTemplate(templateId);
  const tokens = resolveTokens(preset, doc.theme);
  return (
    <div
      style={{ width: 794 * scale, height: 1122 * scale, overflow: "hidden" }}
      aria-hidden="true"
    >
      <div
        style={{
          width: 794,
          height: 1122,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <div style={{ width: "210mm", height: "297mm", overflow: "hidden", background: "#fff" }}>
          <ResumePaper doc={{ ...doc, templateId }} tokens={tokens} />
        </div>
      </div>
    </div>
  );
}
