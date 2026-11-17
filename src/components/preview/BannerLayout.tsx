import type { ResumeDoc, TemplateTokens } from "@/lib/types";
import { contactParts, pageStyle, SectionView } from "./blocks";

export function BannerLayout({
  doc,
  tokens,
}: {
  doc: ResumeDoc;
  tokens: TemplateTokens;
}) {
  const diagonal = tokens.bannerStyle === "diagonal";
  const parts = contactParts(doc.basics);

  return (
    <div style={pageStyle(tokens)}>
      <header
        style={{
          background: tokens.primary,
          color: "#ffffff",
          padding: `${tokens.margin}mm ${tokens.margin}mm ${
            diagonal ? tokens.margin + 10 : tokens.margin
          }mm`,
          clipPath: diagonal
            ? "polygon(0 0, 100% 0, 100% 86%, 0 100%)"
            : undefined,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: tokens.fontHead,
              fontSize: `${tokens.nameSize + 2}pt`,
              fontWeight: tokens.nameWeight,
              letterSpacing: "0.03em",
              lineHeight: 1.1,
            }}
          >
            {doc.basics.name}
          </div>
          {doc.basics.jobTitle ? (
            <div
              style={{
                fontSize: `${tokens.baseSize + 2}pt`,
                color: "rgba(255,255,255,0.88)",
                marginTop: 4,
              }}
            >
              {doc.basics.jobTitle}
            </div>
          ) : null}
          {parts.length > 0 ? (
            <div
              style={{
                marginTop: 8,
                fontSize: "0.88em",
                color: "rgba(255,255,255,0.8)",
                overflowWrap: "anywhere",
              }}
            >
              {parts.join("  ·  ")}
            </div>
          ) : null}
        </div>
        {doc.basics.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={doc.basics.avatar}
            alt=""
            style={{
              width: 76,
              height: 76,
              borderRadius: "50%",
              objectFit: "cover",
              border: "2px solid rgba(255,255,255,0.75)",
              flex: "0 0 auto",
            }}
          />
        ) : null}
      </header>

      <div
        style={{
          padding: `${
            diagonal ? Math.max(8, tokens.margin - 4) : tokens.margin
          }mm ${tokens.margin}mm ${tokens.margin}mm`,
        }}
      >
        {doc.sections
          .filter((section) => section.visible)
          .map((section) => (
            <SectionView key={section.id} section={section} tokens={tokens} />
          ))}
      </div>
    </div>
  );
}
