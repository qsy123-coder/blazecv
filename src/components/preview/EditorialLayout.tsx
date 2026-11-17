import type { ResumeDoc, TemplateTokens } from "@/lib/types";
import { contactParts, pageStyle, SectionBody } from "./blocks";

export function EditorialLayout({
  doc,
  tokens,
}: {
  doc: ResumeDoc;
  tokens: TemplateTokens;
}) {
  const parts = contactParts(doc.basics);
  const visible = doc.sections.filter((section) => section.visible);

  return (
    <div style={{ ...pageStyle(tokens), padding: `${tokens.margin}mm` }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 16,
          borderBottom: `2px solid ${tokens.primary}`,
          paddingBottom: 12,
          marginBottom: 18,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: tokens.fontHead,
              fontSize: `${tokens.nameSize}pt`,
              fontWeight: tokens.nameWeight,
              color: tokens.headingColor,
              letterSpacing: "0.01em",
              lineHeight: 1.05,
            }}
          >
            {doc.basics.name}
          </div>
          {doc.basics.jobTitle ? (
            <div
              style={{
                color: tokens.primary,
                fontSize: `${tokens.baseSize + 1.5}pt`,
                marginTop: 6,
              }}
            >
              {doc.basics.jobTitle}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, maxWidth: "50%" }}>
          {doc.basics.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doc.basics.avatar}
              alt=""
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                objectFit: "cover",
                border: `1.5px solid ${tokens.border}`,
                flex: "0 0 auto",
              }}
            />
          ) : null}
          {parts.length > 0 ? (
            <div
              style={{
                color: tokens.muted,
                fontSize: "0.86em",
                lineHeight: 1.55,
                textAlign: "right",
                overflowWrap: "anywhere",
              }}
            >
              {parts.map((part, index) => (
                <div key={index}>{part}</div>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {visible.map((section) => (
        <div
          key={section.id}
          data-section-id={section.id}
          data-section-title={section.title}
          style={{
            display: "grid",
            gridTemplateColumns: "28mm 1fr",
            columnGap: 14,
            marginBottom: tokens.dense ? 8 : 16,
            breakInside: "avoid",
          }}
        >
          <div
            style={{
              fontFamily: tokens.fontHead,
              fontSize: `${tokens.sectionSize - 0.5}pt`,
              fontWeight: 700,
              color: tokens.primary,
              letterSpacing: "0.04em",
              lineHeight: 1.3,
              paddingTop: 2,
            }}
          >
            {section.title}
          </div>
          <div style={{ minWidth: 0 }}>
            <SectionBody section={section} tokens={tokens} context="main" />
          </div>
        </div>
      ))}
    </div>
  );
}
