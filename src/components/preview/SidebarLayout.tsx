import type { ResumeDoc, TemplateTokens } from "@/lib/types";
import { pageStyle, SectionView, SidebarHeader } from "./blocks";

const SIDEBAR_TYPES = new Set(["skills", "certificates"]);

export function SidebarLayout({
  doc,
  tokens,
}: {
  doc: ResumeDoc;
  tokens: TemplateTokens;
}) {
  const visible = doc.sections.filter((section) => section.visible);
  const sidebarSections = visible.filter((section) => SIDEBAR_TYPES.has(section.type));
  const mainSections = visible.filter((section) => !SIDEBAR_TYPES.has(section.type));
  const width = tokens.sidebarWidth ?? 32;

  return (
    <div
      style={{
        ...pageStyle(tokens),
        display: "grid",
        gridTemplateColumns: `${width}% 1fr`,
      }}
    >
      <aside
        style={{
          background: tokens.sidebarBg ?? "#f8fafc",
          padding: `${tokens.margin}mm ${Math.max(6, tokens.margin * 0.55)}mm`,
          boxSizing: "border-box",
        }}
      >
        <SidebarHeader basics={doc.basics} tokens={tokens} />
        {sidebarSections.map((section) => (
          <SectionView
            key={section.id}
            section={section}
            tokens={tokens}
            context="sidebar"
            titleAdjust={-0.5}
          />
        ))}
      </aside>
      <main
        style={{
          padding: `${tokens.margin}mm ${tokens.margin}mm ${tokens.margin}mm ${Math.max(
            6,
            tokens.margin * 0.7,
          )}mm`,
          boxSizing: "border-box",
          minWidth: 0,
        }}
      >
        {mainSections.map((section) => (
          <SectionView key={section.id} section={section} tokens={tokens} />
        ))}
      </main>
    </div>
  );
}
