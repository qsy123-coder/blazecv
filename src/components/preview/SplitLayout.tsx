import type { ResumeDoc, TemplateTokens } from "@/lib/types";
import {
  Avatar,
  contactParts,
  pageStyle,
  SectionTitle,
  SectionView,
  SkillBars,
} from "./blocks";

const RIGHT_TYPES = new Set(["skills", "certificates"]);

export function SplitLayout({
  doc,
  tokens,
}: {
  doc: ResumeDoc;
  tokens: TemplateTokens;
}) {
  const visible = doc.sections.filter((section) => section.visible);
  const leftSections = visible.filter((section) => !RIGHT_TYPES.has(section.type));
  const rightSections = visible.filter((section) => RIGHT_TYPES.has(section.type));
  const parts = contactParts(doc.basics);
  const twoColumns = rightSections.length > 0;

  return (
    <div style={{ ...pageStyle(tokens), padding: `${tokens.margin}mm` }}>
      <header style={{ textAlign: "center", marginBottom: 18 }}>
        {doc.basics.avatar ? (
          <div style={{ marginBottom: 10 }}>
            <Avatar src={doc.basics.avatar} size={64} tokens={tokens} />
          </div>
        ) : null}
        <div style={{ display: "inline-block", border: `1.5px solid ${tokens.primary}`, padding: "6px 24px" }}>
          <div
            style={{
              fontFamily: tokens.fontHead,
              fontSize: `${tokens.nameSize}pt`,
              fontWeight: tokens.nameWeight,
              letterSpacing: "0.13em",
              lineHeight: 1.1,
              color: tokens.headingColor,
            }}
          >
            {doc.basics.name}
          </div>
        </div>
        {doc.basics.jobTitle ? (
          <div
            style={{
              color: tokens.primary,
              fontSize: `${tokens.baseSize + 1.5}pt`,
              letterSpacing: "0.08em",
              marginTop: 8,
            }}
          >
            {doc.basics.jobTitle}
          </div>
        ) : null}
        {parts.length > 0 ? (
          <div
            style={{
              color: tokens.muted,
              fontSize: "0.88em",
              marginTop: 6,
              overflowWrap: "anywhere",
            }}
          >
            {parts.join("  ·  ")}
          </div>
        ) : null}
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: twoColumns ? "1.1fr 1fr" : "1fr",
          columnGap: 24,
          alignItems: "start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          {leftSections.map((section) => (
            <SectionView key={section.id} section={section} tokens={tokens} />
          ))}
        </div>
        {twoColumns ? (
          <div style={{ minWidth: 0 }}>
            {rightSections.map((section) =>
              section.type === "skills" ? (
                <section
                  key={section.id}
                  data-section-id={section.id}
                  data-section-title={section.title}
                  style={{ marginBottom: tokens.dense ? 8 : 16 }}
                >
                  <SectionTitle text={section.title} tokens={tokens} />
                  <SkillBars items={section.items} tokens={tokens} />
                </section>
              ) : (
                <SectionView key={section.id} section={section} tokens={tokens} />
              ),
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
