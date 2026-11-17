import type { ResumeDoc, TemplateTokens } from "@/lib/types";
import { pageStyle, SectionView, SingleHeader } from "./blocks";

export function SingleLayout({
  doc,
  tokens,
}: {
  doc: ResumeDoc;
  tokens: TemplateTokens;
}) {
  return (
    <div style={{ ...pageStyle(tokens), padding: `${tokens.margin}mm` }}>
      <SingleHeader basics={doc.basics} tokens={tokens} />
      {doc.sections
        .filter((section) => section.visible)
        .map((section) => (
          <SectionView key={section.id} section={section} tokens={tokens} />
        ))}
    </div>
  );
}
