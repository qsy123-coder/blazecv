import type {
  LayoutKind,
  ResumeDoc,
  TemplateId,
  TemplatePreset,
  TemplateTokens,
  Theme,
} from "./types";
import { FONT_SANS, FONT_SERIF } from "./fonts";
import { GENERATED_TEMPLATES } from "./templates.generated";

export { FONT_SANS, FONT_SERIF } from "./fonts";

const DEFAULTS: Omit<TemplateTokens, "lineHeight" | "margin"> = {
  layout: "single",
  primary: "#111827",
  headingColor: "#111827",
  bodyColor: "#1f2937",
  muted: "#6b7280",
  border: "#d1d5db",
  fontHead: FONT_SANS,
  fontBody: FONT_SANS,
  nameSize: 24,
  baseSize: 10,
  sectionSize: 12.5,
  nameWeight: 700,
  headerAlign: "left",
  titleStyle: "rule",
  sidebarWidth: 32,
  dense: false,
};

const CURATED_TAGS: Record<string, string[]> = {
  minimal: ["通用", "社招"],
  compact: ["通用", "技术"],
  academic: ["学术", "科研"],
  business: ["社招", "商务"],
  tech: ["技术", "互联网"],
  campus: ["应届生", "校招"],
  timeline: ["社招", "经历"],
  "timeline-dual": ["技术", "项目"],
  "banner-emerald": ["通用", "设计"],
  "banner-ink": ["社招", "设计"],
  "dark-slate": ["技术", "互联网"],
  "split-classic": ["通用", "应届生"],
  "editorial-serif": ["学术", "科研"],
  "editorial-blue": ["设计", "品牌"],
};

function makePreset(
  id: TemplateId,
  name: string,
  desc: string,
  layout: LayoutKind,
  overrides: Partial<Omit<TemplateTokens, "lineHeight" | "margin">>,
): TemplatePreset {
  return {
    id,
    name,
    desc,
    layout,
    tags: CURATED_TAGS[id] ?? [],
    base: { ...DEFAULTS, ...overrides, layout },
  };
}

const CURATED_TEMPLATES: TemplatePreset[] = [
  makePreset("minimal", "极简黑白", "单栏 · 通用", "single", {
    primary: "#111827",
    titleStyle: "rule",
  }),
  makePreset("compact", "紧凑单色", "单栏 · 信息密度高", "single", {
    primary: "#334155",
    titleStyle: "bar",
    nameSize: 23,
    baseSize: 9.5,
    sectionSize: 11.5,
    dense: true,
  }),
  makePreset("academic", "学术风", "单栏 · 科研 / 深造", "single", {
    primary: "#1f2937",
    fontHead: FONT_SERIF,
    fontBody: FONT_SERIF,
    headerAlign: "center",
    titleStyle: "uppercase",
    nameSize: 21,
    baseSize: 10,
    sectionSize: 13,
  }),
  makePreset("business", "商务蓝", "侧栏 · 社招", "sidebar", {
    primary: "#1d4ed8",
    sidebarBg: "#eef4ff",
    sidebarWidth: 32,
    titleStyle: "bar",
    baseSize: 10,
    sectionSize: 12.5,
  }),
  makePreset("tech", "技术岗", "侧栏 · 研发 / 产品", "sidebar", {
    primary: "#0f766e",
    sidebarBg: "#f0fdfa",
    sidebarWidth: 30,
    titleStyle: "bar",
    baseSize: 9.8,
    sectionSize: 12,
  }),
  makePreset("campus", "校招清新", "侧栏 · 应届生", "sidebar", {
    primary: "#7c3aed",
    sidebarBg: "#f5f3ff",
    sidebarWidth: 30,
    titleStyle: "bar",
    nameSize: 22,
    baseSize: 10,
    sectionSize: 12.5,
  }),
  makePreset("timeline", "时间轴经典", "时间轴 · 经历连续", "timeline", {
    primary: "#b45309",
    titleStyle: "bar",
    baseSize: 9.8,
    sectionSize: 12,
  }),
  makePreset("timeline-dual", "双栏时间轴", "时间轴 + 右侧技能栏", "timeline", {
    primary: "#0f172a",
    titleStyle: "bar",
    baseSize: 9.8,
    sectionSize: 12,
    timelineSidebar: true,
    sidebarBg: "#f8fafc",
    sidebarWidth: 30,
  }),
  makePreset("banner-emerald", "翡翠横幅", "横幅 · 设计感", "banner", {
    primary: "#047857",
    nameSize: 26,
    baseSize: 10,
    sectionSize: 12.5,
    titleStyle: "rule",
    bannerStyle: "band",
  }),
  makePreset("banner-ink", "墨黑斜切", "斜切横幅 · 强对比", "banner", {
    primary: "#0f172a",
    nameSize: 26,
    baseSize: 10,
    sectionSize: 12.5,
    titleStyle: "bar",
    bannerStyle: "diagonal",
  }),
  makePreset("dark-slate", "暗夜侧栏", "深色侧栏 · 技术岗", "dark-sidebar", {
    primary: "#0f766e",
    nameSize: 24,
    baseSize: 9.8,
    sectionSize: 12,
    titleStyle: "bar",
    sidebarBg: "#111827",
    sidebarText: "#f8fafc",
    sidebarMuted: "#94a3b8",
    sidebarAccent: "#38bdf8",
    sidebarWidth: 32,
  }),
  makePreset("split-classic", "左右分栏", "居中框线 · 双栏", "split", {
    primary: "#334155",
    nameSize: 24,
    baseSize: 9.8,
    sectionSize: 12,
    titleStyle: "rule",
    stackedEntries: true,
  }),
  makePreset("editorial-serif", "杂志衬线", "编辑排版 · 衬线", "editorial", {
    primary: "#1f2937",
    fontHead: FONT_SERIF,
    fontBody: FONT_SERIF,
    nameSize: 30,
    baseSize: 10,
    sectionSize: 12.5,
    titleStyle: "plain",
  }),
  makePreset("editorial-blue", "瑞士蓝", "标签栏 · 现代", "editorial", {
    primary: "#1d4ed8",
    nameSize: 28,
    baseSize: 9.8,
    sectionSize: 12,
    titleStyle: "plain",
  }),
];

export interface TemplateDefinition {
  id: string;
  name: string;
  desc: string;
  layout: LayoutKind;
  tags?: string[];
  source?: { token: string; name: string };
  font: "sans" | "serif";
  tokens: Partial<Omit<TemplateTokens, "layout" | "lineHeight" | "margin">>;
}

export function makePresetFromDefinition(def: TemplateDefinition): TemplatePreset {
  return {
    id: def.id,
    name: def.name,
    desc: def.desc,
    layout: def.layout,
    tags: def.tags,
    source: def.source,
    base: {
      ...DEFAULTS,
      ...def.tokens,
      layout: def.layout,
      fontHead: def.font === "serif" ? FONT_SERIF : FONT_SANS,
      fontBody: def.font === "serif" ? FONT_SERIF : FONT_SANS,
    },
  };
}

const GENERATED_PRESETS: TemplatePreset[] = GENERATED_TEMPLATES.map((item) =>
  makePresetFromDefinition(item),
);

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  ...CURATED_TEMPLATES,
  ...GENERATED_PRESETS,
];

export const TEMPLATE_IDS: TemplateId[] = TEMPLATE_PRESETS.map((t) => t.id);

export function getTemplate(id: TemplateId): TemplatePreset {
  return TEMPLATE_PRESETS.find((t) => t.id === id) ?? TEMPLATE_PRESETS[0];
}

export function getDocTemplate(doc: ResumeDoc): TemplatePreset {
  if (doc.templatePreset && doc.templatePreset.id === doc.templateId) {
    return doc.templatePreset;
  }
  return getTemplate(doc.templateId);
}

const SCALE: Record<Theme["fontScale"], number> = {
  xs: 0.86,
  sm: 0.94,
  smd: 0.97,
  md: 1,
  lg: 1.06,
  custom: 1,
};

function customScale(theme: Theme): number {
  return Math.min(1.3, Math.max(0.7, theme.customFontScale ?? 1));
}

function round05(n: number): number {
  return Math.round(n * 2) / 2;
}

export function resolveTokens(preset: TemplatePreset, theme: Theme): TemplateTokens {
  const scale =
    theme.fontScale === "custom" ? customScale(theme) : SCALE[theme.fontScale] ?? 1;
  const fitScale = Math.min(1, Math.max(0.7, theme.fitScale ?? 1));
  const primary = theme.primary?.trim() || preset.base.primary;
  return {
    ...preset.base,
    primary,
    nameSize: round05(preset.base.nameSize * scale * fitScale),
    baseSize: round05(preset.base.baseSize * scale * fitScale),
    sectionSize: round05(preset.base.sectionSize * scale * fitScale),
    lineHeight: theme.lineHeight,
    margin: round05(theme.margin * fitScale),
    dense: preset.base.dense || theme.dense === true,
  };
}
