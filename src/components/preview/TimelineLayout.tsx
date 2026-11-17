import type {
  EducationItem,
  ExperienceItem,
  ResumeDoc,
  Section,
  TemplateTokens,
} from "@/lib/types";
import {
  Bullets,
  EducationBlock,
  EntryHead,
  formatRange,
  pageStyle,
  SectionTitle,
  SectionView,
  SingleHeader,
} from "./blocks";
import { splitDetailLines } from "@/lib/utils";

const TIMELINE_TYPES = new Set(["education", "experience", "projects"]);
const RAIL_TYPES = new Set(["skills", "certificates"]);

function TimelineRow({
  start,
  end,
  org,
  role,
  location,
  bullets,
  tags,
  tokens,
}: {
  start: string;
  end: string;
  org: string;
  role?: string;
  location?: string;
  bullets?: string[];
  tags?: string[];
  tokens: TemplateTokens;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "30mm 1fr", columnGap: 4 }}>
      <div
        style={{
          textAlign: "right",
          paddingRight: 8,
          paddingTop: 1,
          color: tokens.muted,
          fontSize: "0.86em",
          whiteSpace: "nowrap",
        }}
      >
        {formatRange(start, end)}
      </div>
      <div
        style={{
          borderLeft: `1px solid ${tokens.border}`,
          paddingLeft: 12,
          paddingBottom: tokens.dense ? 4 : 8,
          minWidth: 0,
        }}
      >
        <EntryHead org={org || " "} role={role} meta={location} tokens={tokens} />
        {bullets && bullets.length > 0 ? <Bullets items={bullets} tokens={tokens} /> : null}
        {tags && tags.length > 0 ? (
          <div style={{ marginTop: 4, color: tokens.muted, fontSize: "0.84em" }}>
            {tags.join(" / ")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TimelineEducationRow({
  item,
  tokens,
}: {
  item: EducationItem;
  tokens: TemplateTokens;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "30mm 1fr", columnGap: 4 }}>
      <div
        style={{
          textAlign: "right",
          paddingRight: 8,
          color: tokens.muted,
          fontSize: "0.86em",
          whiteSpace: "nowrap",
        }}
      >
        {formatRange(item.start, item.end)}
      </div>
      <div
        style={{
          borderLeft: `1px solid ${tokens.border}`,
          paddingLeft: 12,
          paddingBottom: tokens.dense ? 4 : 8,
          minWidth: 0,
        }}
      >
        <EntryHead
          org={item.school || " "}
          role={[item.degree, item.major].filter(Boolean).join(" · ")}
          tokens={tokens}
        />
        {item.detail ? (
          <div style={{ marginTop: 4, fontSize: "0.94em" }}>
            <Bullets items={splitDetailLines(item.detail)} tokens={tokens} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TimelineSection({
  section,
  tokens,
}: {
  section: Section;
  tokens: TemplateTokens;
}) {
  return (
    <section
      data-section-id={section.id}
      data-section-title={section.title}
      style={{ marginBottom: tokens.dense ? 8 : 16 }}
    >
      <SectionTitle text={section.title} tokens={tokens} />
      {section.type === "education"
        ? section.items.map((item) => (
            <TimelineEducationRow key={item.id} item={item} tokens={tokens} />
          ))
        : section.type === "experience" || section.type === "projects"
          ? section.items.map((item: ExperienceItem) => (
              <TimelineRow
                key={item.id}
                start={item.start}
                end={item.end}
                org={item.org}
                role={item.role}
                location={item.location}
                bullets={item.bullets}
                tags={item.tags}
                tokens={tokens}
              />
            ))
          : null}
    </section>
  );
}

export function TimelineLayout({
  doc,
  tokens,
}: {
  doc: ResumeDoc;
  tokens: TemplateTokens;
}) {
  const visible = doc.sections.filter((section) => section.visible);
  const railSections = tokens.timelineSidebar
    ? visible.filter((section) => RAIL_TYPES.has(section.type))
    : [];
  const bodySections = visible.filter((section) => !railSections.includes(section));
  const railWidth = tokens.sidebarWidth ?? 30;

  return (
    <div style={{ ...pageStyle(tokens), padding: `${tokens.margin}mm` }}>
      <SingleHeader basics={doc.basics} tokens={tokens} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: railSections.length > 0 ? `1fr ${railWidth}%` : "1fr",
          columnGap: 12,
          alignItems: "stretch",
        }}
      >
        <div style={{ minWidth: 0 }}>
          {bodySections.map((section) =>
            TIMELINE_TYPES.has(section.type) ? (
              <TimelineSection key={section.id} section={section} tokens={tokens} />
            ) : (
              <SectionView key={section.id} section={section} tokens={tokens} />
            ),
          )}
        </div>
        {railSections.length > 0 ? (
          <aside
            style={{
              background: tokens.sidebarBg ?? "#f8fafc",
              padding: "12px",
              boxSizing: "border-box",
              borderLeft: `1px solid ${tokens.border}`,
            }}
          >
            {railSections.map((section) => (
              <SectionView
                key={section.id}
                section={section}
                tokens={tokens}
                context="sidebar"
                titleAdjust={-0.5}
              />
            ))}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
