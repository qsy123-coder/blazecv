import type { CSSProperties } from "react";
import type {
  Basics,
  EducationItem,
  ExperienceItem,
  Section,
  SkillItem,
  TemplateTokens,
  TextItem,
} from "@/lib/types";
import { formatRange, splitDetailLines } from "@/lib/utils";

export { formatRange } from "@/lib/utils";

export function pageStyle(tokens: TemplateTokens): CSSProperties {
  return {
    fontFamily: tokens.fontBody,
    color: tokens.bodyColor,
    fontSize: `${tokens.baseSize}pt`,
    lineHeight: tokens.lineHeight,
    background: "#ffffff",
    minHeight: "297mm",
    boxSizing: "border-box",
  };
}

export function Avatar({
  src,
  size,
  tokens,
}: {
  src?: string;
  size: number;
  tokens: TemplateTokens;
}) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        border: `1.5px solid ${tokens.border}`,
        flex: "0 0 auto",
      }}
    />
  );
}

export function contactParts(basics: Basics): string[] {
  const parts: string[] = [basics.phone, basics.email, basics.city].filter(Boolean);
  for (const link of basics.links) {
    if (!link.label && !link.url) continue;
    parts.push(link.label && link.url ? `${link.label}：${link.url}` : link.label || link.url);
  }
  return parts;
}

export function InlineContact({ basics, tokens }: { basics: Basics; tokens: TemplateTokens }) {
  const parts = contactParts(basics);
  if (parts.length === 0) return null;
  return (
    <div
      style={{
        color: tokens.muted,
        fontSize: "0.9em",
        overflowWrap: "anywhere",
        textAlign: tokens.headerAlign === "center" ? "center" : "left",
      }}
    >
      {parts.join("  ·  ")}
    </div>
  );
}

export function SectionTitle({
  text,
  tokens,
  sizeAdjust = 0,
}: {
  text: string;
  tokens: TemplateTokens;
  sizeAdjust?: number;
}) {
  const style: CSSProperties = {
    fontFamily: tokens.fontHead,
    fontSize: `${tokens.sectionSize + sizeAdjust}pt`,
    fontWeight: 700,
    color: tokens.primary,
    letterSpacing: tokens.titleStyle === "uppercase" ? "0.06em" : "0.02em",
    lineHeight: 1.2,
    marginBottom: tokens.dense ? 4 : 8,
  };
  if (tokens.titleStyle === "rule") {
    style.borderBottom = `1px solid ${tokens.border}`;
    style.paddingBottom = 4;
  }
  if (tokens.titleStyle === "bar") {
    style.borderLeft = `3px solid ${tokens.primary}`;
    style.paddingLeft = 8;
  }
  return <div style={style}>{text}</div>;
}

export function Bullets({ items, tokens }: { items: string[]; tokens: TemplateTokens }) {
  const lines = items.map((item) => item.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <div style={{ marginTop: 4 }}>
      {lines.map((line, index) => (
        <div
          key={`${index}-${line.slice(0, 12)}`}
          style={{ display: "flex", gap: 6, marginBottom: tokens.dense ? 2 : 4 }}
        >
          <span
            style={{
              color: tokens.muted,
              opacity: 0.6,
              flex: "0 0 auto",
              lineHeight: "inherit",
            }}
          >
            •
          </span>
          <span style={{ flex: "1 1 auto", minWidth: 0 }}>{line}</span>
        </div>
      ))}
    </div>
  );
}

function Tags({ tags, tokens }: { tags?: string[]; tokens: TemplateTokens }) {
  const valid = (tags ?? []).filter(Boolean);
  if (valid.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
      {valid.map((tag) => (
        <span
          key={tag}
          style={{
            border: `1px solid ${tokens.border}`,
            color: tokens.muted,
            borderRadius: 3,
            padding: "0 4px",
            fontSize: "0.82em",
            lineHeight: 1.5,
          }}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

export function EntryHead({
  org,
  role,
  meta,
  tokens,
  stacked = false,
}: {
  org: string;
  role?: string;
  meta?: string;
  tokens: TemplateTokens;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div style={{ marginBottom: 2 }}>
        <div style={{ fontWeight: 600, color: tokens.headingColor }}>
          {org}
          {role ? (
            <span style={{ fontWeight: 400, color: tokens.muted, marginLeft: 6 }}>{role}</span>
          ) : null}
        </div>
        {meta ? (
          <div style={{ color: tokens.muted, fontSize: "0.86em", marginTop: 2 }}>{meta}</div>
        ) : null}
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 12,
      }}
    >
      <div style={{ fontWeight: 600, color: tokens.headingColor, minWidth: 0 }}>
        {org}
        {role ? (
          <span style={{ fontWeight: 400, color: tokens.muted, marginLeft: 7 }}>{role}</span>
        ) : null}
      </div>
      {meta ? (
        <div style={{ color: tokens.muted, whiteSpace: "nowrap", fontSize: "0.88em" }}>
          {meta}
        </div>
      ) : null}
    </div>
  );
}

export function ExperienceBlock({
  items,
  tokens,
}: {
  items: ExperienceItem[];
  tokens: TemplateTokens;
}) {
  return (
    <div>
      {items.map((item) => {
        const meta = [formatRange(item.start, item.end), item.location]
          .filter(Boolean)
          .join(" · ");
        return (
          <div key={item.id} style={{ marginBottom: tokens.dense ? 6 : 8 }}>
            <EntryHead
              org={item.org || " "}
              role={item.role}
              meta={meta}
              tokens={tokens}
              stacked={tokens.stackedEntries}
            />
            <Bullets items={item.bullets} tokens={tokens} />
            <Tags tags={item.tags} tokens={tokens} />
          </div>
        );
      })}
    </div>
  );
}

export function EducationBlock({
  items,
  tokens,
}: {
  items: EducationItem[];
  tokens: TemplateTokens;
}) {
  return (
    <div>
      {items.map((item) => (
        <div key={item.id} style={{ marginBottom: 8 }}>
          <EntryHead
            org={item.school || " "}
            role={[item.degree, item.major].filter(Boolean).join(" · ")}
            meta={formatRange(item.start, item.end)}
            tokens={tokens}
            stacked={tokens.stackedEntries}
          />
          {item.detail ? (
            <div style={{ fontSize: "0.95em" }}>
              <Bullets items={splitDetailLines(item.detail)} tokens={tokens} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function SkillsGrid({ items, tokens }: { items: SkillItem[]; tokens: TemplateTokens }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        columnGap: 16,
        rowGap: 4,
      }}
    >
      {items.map((item) => (
        <div key={item.id} style={{ minWidth: 0 }}>
          {item.name ? (
            <span style={{ fontWeight: 600, color: tokens.headingColor }}>{item.name}</span>
          ) : null}
          {item.name && item.detail ? (
            <span style={{ color: tokens.muted }}>：</span>
          ) : null}
          {item.detail ? <span>{item.detail}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function SkillBars({
  items,
  tokens,
  onDark = false,
}: {
  items: SkillItem[];
  tokens: TemplateTokens;
  onDark?: boolean;
}) {
  const label = onDark
    ? tokens.sidebarText ?? "#f8fafc"
    : tokens.headingColor;
  const detailColor = onDark
    ? tokens.sidebarMuted ?? "rgba(255,255,255,0.66)"
    : tokens.muted;
  const track = onDark ? "rgba(255,255,255,0.16)" : tokens.border;
  const fill = onDark ? tokens.sidebarAccent ?? tokens.primary : tokens.primary;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) => {
        const level =
          typeof item.level === "number"
            ? Math.max(0, Math.min(5, Math.round(item.level)))
            : 0;
        return (
          <div key={item.id}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 8,
              }}
            >
              <span style={{ fontWeight: 600, color: label, fontSize: "0.95em" }}>
                {item.name}
              </span>
            </div>
            {item.detail ? (
              <div
                style={{
                  color: detailColor,
                  fontSize: "0.84em",
                  lineHeight: 1.45,
                  overflowWrap: "anywhere",
                }}
              >
                {item.detail}
              </div>
            ) : null}
            {level > 0 ? (
              <div
                style={{
                  marginTop: 4,
                  height: 4,
                  borderRadius: 2,
                  background: track,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${level * 20}%`,
                    height: "100%",
                    borderRadius: 2,
                    background: fill,
                  }}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function SidebarSkills({ items, tokens }: { items: SkillItem[]; tokens: TemplateTokens }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) => (
        <div key={item.id}>
          {item.name ? (
            <div style={{ fontWeight: 600, color: tokens.headingColor, fontSize: "0.95em" }}>
              {item.name}
            </div>
          ) : null}
          {item.detail ? (
            <div style={{ fontSize: "0.92em", lineHeight: 1.45, overflowWrap: "anywhere" }}>
              {item.detail}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function TextBlock({ items, tokens }: { items: TextItem[]; tokens: TemplateTokens }) {
  return <Bullets items={items.map((item) => item.text)} tokens={tokens} />;
}

export function SectionBody({
  section,
  tokens,
  context,
}: {
  section: Section;
  tokens: TemplateTokens;
  context: "main" | "sidebar";
}) {
  switch (section.type) {
    case "summary":
      return (
        <p style={{ margin: 0, textAlign: "justify", whiteSpace: "pre-wrap" }}>
          {section.content}
        </p>
      );
    case "education":
      return <EducationBlock items={section.items} tokens={tokens} />;
    case "experience":
    case "projects":
      return <ExperienceBlock items={section.items} tokens={tokens} />;
    case "skills":
      return context === "sidebar" ? (
        <SidebarSkills items={section.items} tokens={tokens} />
      ) : (
        <SkillsGrid items={section.items} tokens={tokens} />
      );
    case "certificates":
    case "custom":
      return <TextBlock items={section.items} tokens={tokens} />;
  }
}

export function SectionView({
  section,
  tokens,
  context = "main",
  titleAdjust = 0,
}: {
  section: Section;
  tokens: TemplateTokens;
  context?: "main" | "sidebar";
  titleAdjust?: number;
}) {
  return (
    <section
      data-section-id={section.id}
      data-section-title={section.title}
      style={{ marginBottom: tokens.dense ? 8 : 16 }}
    >
      <SectionTitle text={section.title} tokens={tokens} sizeAdjust={titleAdjust} />
      <SectionBody section={section} tokens={tokens} context={context} />
    </section>
  );
}

export function SingleHeader({ basics, tokens }: { basics: Basics; tokens: TemplateTokens }) {
  const centered = tokens.headerAlign === "center";
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexDirection: centered ? "column" : "row",
        textAlign: centered ? "center" : "left",
        marginBottom: tokens.dense ? 8 : 16,
        paddingBottom: tokens.dense ? 8 : 12,
        borderBottom: `2px solid ${tokens.primary}`,
      }}
    >
      {centered ? <Avatar src={basics.avatar} size={64} tokens={tokens} /> : null}
      <div style={{ flex: "1 1 auto", minWidth: 0, width: "100%" }}>
        <div
          style={{
            fontFamily: tokens.fontHead,
            fontSize: `${tokens.nameSize}pt`,
            fontWeight: tokens.nameWeight,
            color: tokens.headingColor,
            letterSpacing: "0.03em",
            lineHeight: 1.15,
          }}
        >
          {basics.name}
        </div>
        {basics.jobTitle ? (
          <div
            style={{
              fontSize: `${tokens.baseSize + 2}pt`,
              color: tokens.primary,
              marginTop: 4,
            }}
          >
            {basics.jobTitle}
          </div>
        ) : null}
        <div style={{ marginTop: 8 }}>
          <InlineContact basics={basics} tokens={tokens} />
        </div>
      </div>
      {!centered ? <Avatar src={basics.avatar} size={72} tokens={tokens} /> : null}
    </header>
  );
}

export function SidebarHeader({ basics, tokens }: { basics: Basics; tokens: TemplateTokens }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {basics.avatar ? (
        <div style={{ marginBottom: 12 }}>
          <Avatar src={basics.avatar} size={72} tokens={tokens} />
        </div>
      ) : null}
      <div
        style={{
          fontFamily: tokens.fontHead,
          fontSize: `${Math.max(16, tokens.nameSize - 3)}pt`,
          fontWeight: tokens.nameWeight,
          color: tokens.headingColor,
          lineHeight: 1.2,
          letterSpacing: "0.02em",
        }}
      >
        {basics.name}
      </div>
      {basics.jobTitle ? (
        <div style={{ color: tokens.primary, fontSize: `${tokens.baseSize}pt`, marginTop: 4 }}>
          {basics.jobTitle}
        </div>
      ) : null}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          color: tokens.muted,
          fontSize: "0.9em",
          overflowWrap: "anywhere",
        }}
      >
        {basics.phone ? <div>{basics.phone}</div> : null}
        {basics.email ? <div>{basics.email}</div> : null}
        {basics.city ? <div>{basics.city}</div> : null}
        {basics.links
          .filter((link) => link.label || link.url)
          .map((link) => (
            <div key={link.id}>
              {link.label && link.url ? `${link.label}：${link.url}` : link.label || link.url}
            </div>
          ))}
      </div>
    </div>
  );
}
