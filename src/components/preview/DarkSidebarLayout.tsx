import type { ReactNode } from "react";
import type { ResumeDoc, TemplateTokens } from "@/lib/types";
import { Icon } from "@/components/icons";
import {
  Bullets,
  pageStyle,
  SectionView,
  SkillBars,
} from "./blocks";

const SIDEBAR_TYPES = new Set(["skills", "certificates"]);

export function DarkSidebarLayout({
  doc,
  tokens,
}: {
  doc: ResumeDoc;
  tokens: TemplateTokens;
}) {
  const sideText = tokens.sidebarText ?? "#f8fafc";
  const sideMuted = tokens.sidebarMuted ?? "rgba(255,255,255,0.66)";
  const accent = tokens.sidebarAccent ?? "#38bdf8";
  const width = tokens.sidebarWidth ?? 32;

  const visible = doc.sections.filter((section) => section.visible);
  const sidebarSections = visible.filter((section) => SIDEBAR_TYPES.has(section.type));
  const mainSections = visible.filter((section) => !SIDEBAR_TYPES.has(section.type));

  const lightTokens: TemplateTokens = {
    ...tokens,
    muted: sideMuted,
    border: "rgba(255,255,255,0.16)",
  };

  const title = (text: string): ReactNode => (
    <div
      style={{
        fontFamily: tokens.fontHead,
        fontSize: `${tokens.sectionSize - 0.5}pt`,
        fontWeight: 700,
        color: sideText,
        letterSpacing: "0.02em",
        borderBottom: "1px solid rgba(255,255,255,0.16)",
        paddingBottom: 4,
        marginBottom: 8,
      }}
    >
      {text}
    </div>
  );

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
          background: tokens.sidebarBg ?? "#111827",
          color: sideText,
          padding: `${tokens.margin}mm ${Math.max(6, tokens.margin * 0.55)}mm`,
          boxSizing: "border-box",
        }}
      >
        {doc.basics.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={doc.basics.avatar}
            alt=""
            style={{
              width: 84,
              height: 84,
              borderRadius: "50%",
              objectFit: "cover",
              border: `2px solid ${accent}`,
              marginBottom: 12,
              display: "block",
            }}
          />
        ) : null}

        <div
          style={{
            fontFamily: tokens.fontHead,
            fontSize: `${Math.max(17, tokens.nameSize - 3)}pt`,
            fontWeight: tokens.nameWeight,
            color: sideText,
            lineHeight: 1.2,
            letterSpacing: "0.02em",
          }}
        >
          {doc.basics.name}
        </div>
        {doc.basics.jobTitle ? (
          <div style={{ color: accent, fontSize: `${tokens.baseSize}pt`, marginTop: 4 }}>
            {doc.basics.jobTitle}
          </div>
        ) : null}

        <div
          style={{
            marginTop: 14,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            color: sideMuted,
            fontSize: "0.88em",
            overflowWrap: "anywhere",
          }}
        >
          {doc.basics.phone ? (
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <Icon name="phone" size={12} style={{ marginTop: 2, flex: "0 0 auto" }} />
              <span>{doc.basics.phone}</span>
            </div>
          ) : null}
          {doc.basics.email ? (
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <Icon name="mail" size={12} style={{ marginTop: 2, flex: "0 0 auto" }} />
              <span>{doc.basics.email}</span>
            </div>
          ) : null}
          {doc.basics.city ? (
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <Icon name="pin" size={12} style={{ marginTop: 2, flex: "0 0 auto" }} />
              <span>{doc.basics.city}</span>
            </div>
          ) : null}
          {doc.basics.links
            .filter((link) => link.label || link.url)
            .map((link) => (
              <div
                key={link.id}
                style={{ display: "flex", gap: 6, alignItems: "flex-start" }}
              >
                <Icon name="link" size={12} style={{ marginTop: 2, flex: "0 0 auto" }} />
                <span>
                  {link.label && link.url
                    ? `${link.label}：${link.url}`
                    : link.label || link.url}
                </span>
              </div>
            ))}
        </div>

        {sidebarSections.map((section) => (
          <div
            key={section.id}
            data-section-id={section.id}
            data-section-title={section.title}
            style={{ marginTop: 18 }}
          >
            {title(section.title)}
            {section.type === "skills" ? (
              <SkillBars items={section.items} tokens={tokens} onDark />
            ) : section.type === "certificates" ? (
              <Bullets
                items={section.items.map((item) => item.text)}
                tokens={lightTokens}
              />
            ) : null}
          </div>
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
