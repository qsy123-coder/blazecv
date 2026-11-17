import type {
  Basics,
  EducationItem,
  ExperienceItem,
  ResumeDoc,
  Section,
  SectionType,
  SkillItem,
  TextItem,
  Theme,
  TemplateId,
  TemplatePreset,
  LayoutKind,
  LinkItem,
  FontScale,
} from "./types";
import { clamp, uid } from "./utils";

const SECTION_TYPES: SectionType[] = [
  "summary",
  "education",
  "experience",
  "projects",
  "skills",
  "certificates",
  "custom",
];

export const DEFAULT_SECTION_TITLE: Record<SectionType, string> = {
  summary: "个人简介",
  education: "教育经历",
  experience: "工作经历",
  projects: "项目经历",
  skills: "专业技能",
  certificates: "证书与荣誉",
  custom: "自定义模块",
};

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLinks(value: unknown): LinkItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    id: str(item.id) || uid("link"),
    label: str(item.label),
    url: str(item.url),
  }));
}

function parseBasics(value: unknown): Basics {
  const source = isRecord(value) ? value : {};
  return {
    name: str(source.name, "未命名"),
    jobTitle: str(source.jobTitle),
    phone: str(source.phone),
    email: str(source.email),
    city: str(source.city),
    avatar: str(source.avatar) || undefined,
    links: parseLinks(source.links),
  };
}

function parseTheme(value: unknown): Theme {
  const source = isRecord(value) ? value : {};
  const scale = source.fontScale;
  const fontScale: FontScale =
    scale === "xs" ||
    scale === "sm" ||
    scale === "smd" ||
    scale === "lg" ||
    scale === "md" ||
    scale === "custom"
      ? scale
      : "md";
  return {
    primary: str(source.primary),
    fontScale,
    customFontScale:
      typeof source.customFontScale === "number"
        ? clamp(source.customFontScale, 0.7, 1.3)
        : undefined,
    lineHeight: clamp(
      typeof source.lineHeight === "number" ? source.lineHeight : 1.5,
      1.2,
      1.8,
    ),
    margin: clamp(typeof source.margin === "number" ? source.margin : 16, 6, 22),
    dense: source.dense === true ? true : undefined,
    fitScale:
      typeof source.fitScale === "number"
        ? clamp(source.fitScale, 0.7, 1)
        : undefined,
  };
}

function parseEducationItems(value: unknown): EducationItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    id: str(item.id) || uid("edu"),
    school: str(item.school),
    major: str(item.major),
    degree: str(item.degree),
    start: str(item.start),
    end: str(item.end),
    detail: str(item.detail) || undefined,
  }));
}

function parseExperienceItems(value: unknown): ExperienceItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => {
    const item_ = item;
    return {
      id: str(item_.id) || uid("exp"),
      org: str(item_.org),
      role: str(item_.role),
      department: str(item_.department) || undefined,
      start: str(item_.start),
      end: str(item_.end),
      location: str(item_.location) || undefined,
      bullets: Array.isArray(item_.bullets)
        ? item_.bullets.filter((b): b is string => typeof b === "string")
        : [],
      bulletDepths: Array.isArray(item_.bulletDepths)
        ? (item_.bulletDepths as unknown[]).filter(
            (d): d is number => typeof d === "number",
          )
        : undefined,
      bulletNestStyle:
        item_.bulletNestStyle === "inside" || item_.bulletNestStyle === "sibling"
          ? item_.bulletNestStyle
          : undefined,
      tags: Array.isArray(item_.tags)
        ? item_.tags.filter((t): t is string => typeof t === "string")
        : undefined,
    };
  });
}

function parseSkillItems(value: unknown): SkillItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => {
    const level =
      typeof item.level === "number" && Number.isFinite(item.level)
        ? clamp(Math.round(item.level), 1, 5)
        : undefined;
    return {
      id: str(item.id) || uid("skill"),
      name: str(item.name),
      detail: str(item.detail),
      ...(level ? { level } : {}),
    };
  });
}

function parseTextItems(value: unknown): TextItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    id: str(item.id) || uid("text"),
    text: str(item.text),
  }));
}

function parseSection(value: unknown): Section | null {
  if (!isRecord(value)) return null;
  const type = value.type as SectionType;
  if (!SECTION_TYPES.includes(type)) return null;

  const base = {
    id: str(value.id) || uid("sec"),
    title: str(value.title) || DEFAULT_SECTION_TITLE[type],
    visible: bool(value.visible, true),
  };

  switch (type) {
    case "summary":
      return { ...base, type, content: str(value.content) };
    case "education":
      return { ...base, type, items: parseEducationItems(value.items) };
    case "experience":
    case "projects":
      return { ...base, type, items: parseExperienceItems(value.items) };
    case "skills":
      return {
        ...base,
        type,
        items: parseSkillItems(value.items),
        rawValue: str(value.rawValue) || undefined,
      };
    case "certificates":
    case "custom":
      return {
        ...base,
        type,
        items: parseTextItems(value.items),
        rawValue: str(value.rawValue) || undefined,
      };
    default:
      return null;
  }
}

function parseSections(value: unknown): Section[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(parseSection)
    .filter((section): section is Section => section !== null);
}

const LAYOUTS: LayoutKind[] = [
  "single",
  "sidebar",
  "timeline",
  "banner",
  "dark-sidebar",
  "split",
  "editorial",
];

function parseTemplatePreset(value: unknown): TemplatePreset | undefined {
  if (!isRecord(value)) return undefined;
  const layout = value.layout as LayoutKind;
  if (!LAYOUTS.includes(layout)) return undefined;
  if (!isRecord(value.base)) return undefined;
  const base = value.base;
  if (
    typeof base.primary !== "string" ||
    typeof base.fontHead !== "string" ||
    typeof base.fontBody !== "string"
  ) {
    return undefined;
  }
  return {
    id: str(value.id),
    name: str(value.name, "模板"),
    desc: str(value.desc),
    layout,
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    source: isRecord(value.source)
      ? { token: str(value.source.token), name: str(value.source.name) }
      : undefined,
    base: base as unknown as TemplatePreset["base"],
  };
}

export type ParseResult =
  | { ok: true; doc: ResumeDoc }
  | { ok: false; error: string };

export function parseResumeJson(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "JSON 格式错误，无法解析" };
  }
  return parseResumeObject(raw);
}

export function parseResumeObject(raw: unknown): ParseResult {
  if (!isRecord(raw)) {
    return { ok: false, error: "文件内容不是一份简历" };
  }
  const version = raw.schemaVersion;
  if (typeof version !== "number") {
    return { ok: false, error: "缺少 schemaVersion，文件可能不是 BlazeCV 备份" };
  }
  if (version > 1) {
    return { ok: false, error: `备份版本过新（v${version}），请升级应用后再导入` };
  }
  if (version !== 1) {
    return { ok: false, error: `不支持的备份版本：v${version}` };
  }

  const templateId: TemplateId =
    typeof raw.templateId === "string" &&
    raw.templateId.length > 0 &&
    raw.templateId.length <= 128
      ? raw.templateId
      : "minimal";

  const sections = parseSections(raw.sections);
  if (sections.length === 0) {
    return { ok: false, error: "简历没有任何模块，导入已取消" };
  }

  const doc: ResumeDoc = {
    schemaVersion: 1,
    id: str(raw.id) || uid("resume"),
    title: str(raw.title, "未命名简历"),
    templateId,
    templatePreset: parseTemplatePreset(raw.templatePreset),
    theme: parseTheme(raw.theme),
    basics: parseBasics(raw.basics),
    sections,
    orderEdited: raw.orderEdited === true,
    basicsEdited: raw.basicsEdited === true,
    updatedAt: Date.now(),
  };
  return { ok: true, doc };
}
