import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.argv[2];
const projectRoot = process.argv[3] ?? "F:/Projects/blazecv";
if (!root) throw new Error("usage: node build-template-catalog.mjs <crawler-root> [project-root]");

const detailDir = path.join(root, "data", "details");
const imageDir = path.join(root, "data", "images");
const thumbDir = path.join(projectRoot, "public", "template-thumbs");
const contentDir = path.join(projectRoot, "public", "template-content");
const catalogPath = path.join(projectRoot, "public", "template-catalog.json");
const files = (await readdir(detailDir)).filter((file) => file.endsWith(".json"));

const EXCLUDED_TAGS = new Set([
  "免费",
  "范文",
  "热门推荐",
  "求职",
  "下载",
  "限时优惠",
  "简历",
  "模板",
]);

const COLOR_PALETTE = [
  ["蓝", "#4183ff"],
  ["红", "#dc2127"],
  ["橙", "#ee8732"],
  ["青", "#167b86"],
  ["绿", "#6db557"],
  ["紫", "#9c5bde"],
  ["灰", "#404040"],
  ["黑", "#111827"],
];

function parseHex(value, fallback) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : fallback;
}

function channels(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function luminance(hex) {
  const [r, g, b] = channels(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function mix(hex, target, ratio) {
  const a = channels(hex);
  const b = channels(target);
  const mixed = a.map((value, index) =>
    Math.round(value * (1 - ratio) + b[index] * ratio),
  );
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function darken(hex, amount = 0.22) {
  return mix(hex, "#000000", amount);
}

function brighten(hex, amount = 0.35) {
  return mix(hex, "#ffffff", amount);
}

function readableOnWhite(hex) {
  return luminance(hex) > 0.62 ? darken(hex, 0.35) : hex;
}

function readableOnDark(hex) {
  return luminance(hex) < 0.42 ? brighten(hex, 0.35) : hex;
}

function tint(hex, ratio = 0.9) {
  return mix(hex, "#ffffff", ratio);
}

function normalizeTag(tag) {
  if (typeof tag !== "string") return "";
  return tag
    .replace(/简历模板|简历|模板/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/**
 * Parse an HTML description into bullet lines, preserving list nesting depth.
 * Many resume templates put a labelled line ("**行动：**") as a parent <li>
 * with a nested <ul> of sub-bullets; the renderer indents the nested items, so
 * we keep each line's depth to rebuild the same structure.
 */
function htmlToBulletTree(value) {
  if (!value) return { lines: [], nestStyle: null };
  const html = String(value);
  // Does a nested list sit *inside* an <li> or as a sibling <ul> of the <li>?
  // Renderers indent both, but the box model differs, so we mirror whichever
  // the captured markup used.
  let nestStyle = null;
  const liWithUl = /<li\b[^>]*>(?:(?!<\/li>)[\s\S])*?<(ul|ol)\b/i.test(html);
  if (liWithUl) nestStyle = "inside";
  else if (/<\/li>\s*<(ul|ol)\b/i.test(html)) nestStyle = "sibling";

  const tokens = html.split(/(<[^>]+>)/g);
  const out = [];
  let depth = 0;
  let inLi = false;
  let buffer = "";
  const flush = () => {
    const text = decodeHtml(buffer).replace(/\s+/g, " ").trim();
    if (text) out.push({ text, depth });
    buffer = "";
  };
  for (const token of tokens) {
    if (!token) continue;
    if (token[0] === "<") {
      const tag = token.toLowerCase();
      if (/^<ul|^<ol/.test(tag)) {
        if (inLi || buffer.trim()) flush();
        depth += 1;
      } else if (/^<\/ul|^<\/ol/.test(tag)) {
        flush();
        depth = Math.max(0, depth - 1);
      } else if (/^<li/.test(tag)) {
        if (buffer.trim()) flush();
        inLi = true;
      } else if (/^<\/li/.test(tag)) {
        flush();
        inLi = false;
      } else if (/^<br|^<\/p|^<\/div/.test(tag)) {
        flush();
      }
    } else {
      buffer += token;
    }
  }
  flush();
  // Normalize so the outermost list is depth 0 (the whole block is often
  // wrapped in an extra <ul>).
  const minDepth = out.reduce((min, line) => Math.min(min, line.depth), Infinity);
  const shift = Number.isFinite(minDepth) ? minDepth : 0;
  const lines = out
    .slice(0, 40)
    .map((line) => ({ text: line.text, depth: Math.max(0, line.depth - shift) }));
  const hasNesting = lines.some((line) => line.depth > 0);
  return { lines, nestStyle: hasNesting ? nestStyle : null };
}

function htmlToBullets(value) {
  // Only keep the text of each line for flat consumers (summary, text
  // sections); bullet-bearing sections use htmlToBulletTree.
  return htmlToBulletTree(value).lines.map((line) => line.text);
}

function plainText(value) {
  return htmlToBullets(value).join(" ").trim();
}

function formatMonth(value, present = false) {
  if (present) return "至今";
  const text = String(value ?? "").trim();
  if (!text) return "";
  const matched = text.match(/(\d{4})-(\d{2})/);
  if (matched) {
    return Number(matched[1]) >= 2090 ? "至今" : `${matched[1]}.${matched[2]}`;
  }
  const year = text.match(/(\d{4})/);
  return year ? year[1] : "";
}

function stripTitle(value) {
  return String(value ?? "").replace(/[：:]\s*$/g, "").trim();
}

function otherDescription(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return String(value.description ?? "").trim();
}

function parseSkills(value) {
  return String(value ?? "")
    .split(/[，,；;、]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 60)
    .map((item, index) => {
      const matched = item.match(/^(.+?)[（(](.+?)[）)]$/);
      return {
        id: `ph_skill_${index}`,
        name: matched ? matched[1].trim() : item,
        detail: matched ? matched[2].trim() : "",
      };
    });
}

function splitTextItems(value, prefix) {
  return String(value ?? "")
    .split(/[\n，,；;、]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((text, index) => ({ id: `${prefix}_${index}`, text }));
}

function infoTextItems(infos, prefix) {
  const items = [];
  for (const info of infos) {
    const head = String(info.title || info.name || "").trim();
    if (head) items.push({ id: `${prefix}_${items.length}`, text: head });
    for (const line of htmlToBullets(info.description)) {
      items.push({ id: `${prefix}_${items.length}`, text: line });
    }
  }
  return items.slice(0, 20);
}

function infoExperienceItems(infos, prefix) {
  return infos
    .map((info, index) => {
      const tree = htmlToBulletTree(info.description);
      return {
        id: `${prefix}_${info.id ?? index}`,
        org: String(info.name || info.title || "项目").trim(),
        role: String(info.title || "").trim(),
        department: String(info.dept || "").trim() || undefined,
        start: formatMonth(info.start_at, info.present),
        end: formatMonth(info.end_at, info.present),
        location: String(info.city || "").trim(),
        bullets: tree.lines.map((line) => line.text),
        bulletDepths: tree.nestStyle
          ? tree.lines.map((line) => line.depth)
          : undefined,
        bulletNestStyle: tree.nestStyle ?? undefined,
      };
    })
    .filter((item) => item.org || item.bullets.length > 0);
}

function buildPlaceholder(cv, sc) {
  const profile = cv.profile || {};
  const basic = cv.basic_info || {};
  const sub = cv.submodule_info || {};
  const customs = cv.custom_sections || [];
  const byCategory = (category) =>
    customs.filter((section) => section.category === category);

  const sections = [];
  const customUsed = new Set();
  let sequence = 0;
  const nextId = (prefix) => `ph_${prefix}_${sequence++}`;

  const summaryText = byCategory("personal_summary")
    .flatMap((section) => (section.infos || []).map((info) => plainText(info.description)))
    .filter(Boolean)
    .join("\n");
  if (summaryText) {
    const summarySection = byCategory("personal_summary")[0];
    sections.push({
      id: "ph_summary",
      type: "summary",
      title: stripTitle(summarySection?.section_title) || "个人简介",
      visible: true,
      content: summaryText,
    });
    customUsed.add(summarySection?.id);
  }

  const edus = Array.isArray(cv.edus) ? cv.edus : [];
  const eduItems = edus
    .map((edu, index) => ({
      id: `ph_edu_${edu.id ?? index}`,
      school: String(edu.university || edu.school?.cn || "").trim(),
      major: String(edu.major_name?.cn || edu.major || "").trim(),
      degree: String(edu.degree_name?.cn || edu.degree || "").trim(),
      start: formatMonth(edu.start_at),
      end: formatMonth(edu.end_at, edu.present),
      detail: plainText(edu.description),
    }))
    .filter((item) => item.school || item.major);
  if (eduItems.length > 0) {
    sections.push({
      id: "ph_education",
      type: "education",
      title: stripTitle(sub.edus_title) || "教育经历",
      visible: true,
      items: eduItems,
    });
  }

  const works = Array.isArray(cv.works) ? cv.works : [];
  const workItems = works
    .map((work) => {
      const tree = htmlToBulletTree(work.description);
      return {
        id: `ph_work_${work.id ?? index}`,
        org: String(work.company || "").trim(),
        role: String(work.title || "").trim(),
        department: String(work.dept || "").trim() || undefined,
        start: formatMonth(work.start_at, work.present),
        end: formatMonth(work.end_at, work.present),
        location: String(work.city || "").trim(),
        bullets: tree.lines.map((line) => line.text),
        bulletDepths: tree.nestStyle
          ? tree.lines.map((line) => line.depth)
          : undefined,
        bulletNestStyle: tree.nestStyle ?? undefined,
      };
    })
    .filter((item) => item.org || item.bullets.length > 0);
  if (workItems.length > 0) {
    sections.push({
      id: "ph_experience",
      type: "experience",
      title: stripTitle(sub.works_title) || "工作经历",
      visible: true,
      items: workItems,
    });
  }

  for (const category of ["project_experience", "reasearch_experience"]) {
    const custom = byCategory(category);
    for (const section of custom) {
      customUsed.add(section.id);
      const items = infoExperienceItems(section.infos || [], `ph_project_${section.id}`);
      if (items.length > 0) {
        sections.push({
          id: `ph_projects_${section.id ?? sections.length}`,
          type: "projects",
          title: stripTitle(section.section_title) || "项目经历",
          visible: true,
          items,
        });
      }
    }
  }

  const orgs = Array.isArray(cv.orgs) ? cv.orgs : [];
  const orgItems = orgs
    .map((org, index) => {
      const tree = htmlToBulletTree(org.description);
      return {
        id: `ph_org_${org.id ?? index}`,
        org: String(org.name || "").trim(),
        role: String(org.title || "").trim(),
        department: String(org.dept || "").trim() || undefined,
        start: formatMonth(org.start_at, org.present),
        end: formatMonth(org.end_at, org.present),
        location: String(org.city || "").trim(),
        bullets: tree.lines.map((line) => line.text),
        bulletDepths: tree.nestStyle ? tree.lines.map((line) => line.depth) : undefined,
        bulletNestStyle: tree.nestStyle ?? undefined,
      };
    })
    .filter((item) => item.org || item.bullets.length > 0);
  if (orgItems.length > 0) {
    sections.push({
      id: "ph_orgs",
      type: "experience",
      title: stripTitle(sub.orgs_title) || "社团和组织经历",
      visible: true,
      items: orgItems,
    });
  }

  const skills = parseSkills(otherDescription(cv.others?.skill));
  for (const section of byCategory("skill_list")) {
    customUsed.add(section.id);
    for (const info of section.infos || []) {
      const parsed = parseSkills(
        [info.title, info.name, plainText(info.description)].filter(Boolean).join(" "),
      );
      for (const item of parsed) {
        skills.push({ ...item, id: `ph_skill_${skills.length}` });
      }
    }
  }
  if (skills.length > 0) {
    sections.push({
      id: "ph_skills",
      type: "skills",
      title: stripTitle(sub.skill_title) || "专业技能",
      visible: true,
      items: skills.slice(0, 60),
      rawValue: otherDescription(cv.others?.skill) || undefined,
    });
  }

  const honorItems = [];
  for (const section of byCategory("honor")) {
    customUsed.add(section.id);
    honorItems.push(...infoTextItems(section.infos || [], `ph_honor_${section.id}`));
  }
  const certificateText = otherDescription(cv.others?.certificate);
  if (certificateText) {
    honorItems.push(
      ...splitTextItems(certificateText, "ph_certificate").map((item) => ({
        ...item,
        id: `ph_certificate_${honorItems.length}`,
      })),
    );
  }
  if (honorItems.length > 0) {
    sections.push({
      id: "ph_certificates",
      type: "certificates",
      title:
        (byCategory("honor")[0]?.section_title
          ? stripTitle(byCategory("honor")[0].section_title)
          : "") ||
        stripTitle(sub.certificate_title) ||
        "证书与荣誉",
      visible: true,
      items: honorItems.slice(0, 20),
    });
  }

  const languageText = otherDescription(cv.others?.language);
  if (languageText) {
    sections.push({
      id: "ph_languages",
      type: "custom",
      title: stripTitle(sub.language_title) || "语言能力",
      visible: true,
      items: splitTextItems(languageText, "ph_language"),
      rawValue: languageText,
    });
  }

  const interestText = otherDescription(cv.others?.interest);
  if (interestText) {
    sections.push({
      id: "ph_interests",
      type: "custom",
      title: stripTitle(sub.interest_title) || "兴趣爱好",
      visible: true,
      items: splitTextItems(interestText, "ph_interest"),
    });
  }

  // WonderCV's `others.other` renders as the "活动" row in the 其他 section.
  const otherText = otherDescription(cv.others?.other);
  if (otherText) {
    sections.push({
      id: "ph_other",
      type: "custom",
      title: "活动",
      visible: true,
      items: splitTextItems(otherText, "ph_other"),
      rawValue: otherText,
    });
  }

  const opus = Array.isArray(cv.opus) ? cv.opus : [];
  if (opus.length > 0) {
    sections.push({
      id: "ph_opus",
      type: "custom",
      title: stripTitle(sub.opus_title) || "作品集",
      visible: true,
      items: infoTextItems(opus, "ph_opus"),
    });
  }

  for (const section of customs) {
    if (customUsed.has(section.id)) continue;
    if (
      ["personal_summary", "project_experience", "reasearch_experience", "honor", "skill_list"].includes(
        section.category,
      )
    ) {
      continue;
    }
    const items = infoTextItems(section.infos || [], `ph_custom_${section.id}`);
    if (items.length > 0) {
      sections.push({
        id: `ph_custom_${section.id ?? sections.length}`,
        type: "custom",
        title: stripTitle(section.section_title) || "自定义模块",
        visible: true,
        items,
      });
    }
  }

  if (sections.length === 0) return null;

  const name = String(profile.username || "").trim() || "示例姓名";
  const jobTitle = String(
    profile.current_job ||
      profile.exp_job ||
      basic.exp_job ||
      works[0]?.title ||
      "",
  ).trim();
  const city = String(
    profile.city || works[0]?.city || edus[0]?.city || "",
  ).trim();
  const links = [];
  if (profile.homepage) {
    links.push({ id: "ph_link_home", label: "主页", url: String(profile.homepage) });
  }
  if (profile.github_name) {
    const github = String(profile.github_name);
    links.push({
      id: "ph_link_github",
      label: "GitHub",
      url: github.includes("github.com")
        ? github
        : `github.com/${github.replace(/^https?:\/\//, "")}`,
    });
  }
  if (profile.linked_in) {
    links.push({
      id: "ph_link_linkedin",
      label: "LinkedIn",
      url: String(profile.linked_in),
    });
  }

  return {
    title: `${name} · 示例简历`,
    basics: {
      name,
      jobTitle,
      phone: String(profile.phone || "").trim(),
      email: String(profile.email || "").trim(),
      city,
      avatar: String(profile.avatar_url || "").trim() || undefined,
      links,
    },
    sections,
  };
}

function layoutScores(format) {
  const scores = {
    single: 0,
    sidebar: 0,
    timeline: 0,
    banner: 0,
    "dark-sidebar": 0,
    split: 0,
    editorial: 0,
  };
  const module = String(format.module_format ?? "");
  const headModule = String(format.head_module_format ?? "");
  const head = String(format.head_format ?? "");
  const title = String(format.title_format ?? "");
  const top = String(format.top_format ?? "");
  const pattern = String(format.pattern_type ?? "blank");
  const position = String(format.pattern_position ?? "right");

  if (/left|stereo/.test(module)) scores.sidebar += 4;
  if (["left_block", "business", "card"].includes(headModule)) scores.sidebar += 3;
  if (position === "left") scores.sidebar += 1;

  if (module === "table-table" || module === "left_form-flat") scores.split += 4;
  if (head === "body_center") scores.split += 2;
  if (["icon-flat", "icon-stereo"].includes(module)) scores.split += 1;

  if (["strip-avantgarde", "arrow-flat"].includes(module)) scores.timeline += 4;
  if (headModule === "highlight") scores.timeline += 3;
  if (head === "left" && module === "wave-flat") scores.timeline += 1;

  if (["fancy", "personalized"].includes(top)) scores.banner += 4;
  if (["wave", "cut", "flow", "zigzag"].includes(pattern) && head === "center") {
    scores.banner += 2;
  }
  if (pattern !== "blank") scores.banner += 1;

  if (["circle", "diamond", "wrinkle"].includes(pattern) && position === "right") {
    scores["dark-sidebar"] += 3;
  }
  if (["circle", "compactness"].includes(headModule)) scores["dark-sidebar"] += 2;

  if (["professional", "clear", "neatly"].includes(headModule)) scores.editorial += 4;
  if (["strip", "tag"].includes(title)) scores.editorial += 2;
  if (["card", "highlight"].includes(headModule)) scores.editorial += 1;

  scores.single += 1;
  if (head === "center" && module === "default-flat" && pattern === "blank") {
    scores.single += 3;
  }
  if (String(format.body_format) === "one_line") scores.single += 2;
  return scores;
}

function bestLayout(format) {
  return Object.entries(layoutScores(format)).sort((a, b) => b[1] - a[1])[0][0];
}

function buildTokens(format, layout) {
  const accent = readableOnWhite(
    parseHex(
      format.title_color,
      parseHex(
        format.head_module_color,
        parseHex(format.top_line_color, "#334155"),
      ),
    ),
  );
  const dense = Number(format.line_spacing) <= 18;
  const fontSize = Number(format.font_size);
  const font = ["font-2", "font-1004", "font-1005"].includes(String(format.font))
    ? "serif"
    : "sans";
  const head = String(format.head_format);
  const headerAlign = head === "center" || head === "body_center" ? "center" : "left";
  const titleStyle =
    /strip/.test(String(format.module_format)) ||
    String(format.title_format) === "strip"
      ? "bar"
      : "rule";
  const baseSize = fontSize >= 13 ? 10.5 : dense ? 9.8 : 10;
  const sectionSize =
    layout === "editorial"
      ? Math.round(baseSize * 1.3 * 2) / 2
      : Math.round(baseSize * 1.25 * 2) / 2;

  const tokens = {
    primary: accent,
    headingColor: "#1f2937",
    bodyColor: "#1f2937",
    muted: "#6b7280",
    border: "#e5e7eb",
    nameSize: head === "body_center" ? 25 : 24,
    baseSize,
    sectionSize,
    nameWeight: 700,
    headerAlign,
    titleStyle,
    dense,
  };

  if (layout === "sidebar" || layout === "split" || layout === "editorial") {
    tokens.sidebarBg = tint(accent, 0.92);
    tokens.sidebarWidth =
      String(format.head_module_format) === "left_block" ? 32 : 30;
  }
  if (layout === "split") tokens.stackedEntries = true;
  if (layout === "banner") {
    tokens.primary = darken(readableOnWhite(accent), 0.18);
    tokens.bannerStyle = ["wave", "cut", "flow", "zigzag"].includes(
      String(format.pattern_type),
    )
      ? "diagonal"
      : "band";
    tokens.headerAlign = "left";
  }
  if (layout === "timeline") {
    tokens.timelineSidebar = String(format.module_format) === "strip-avantgarde";
    if (tokens.timelineSidebar) {
      tokens.sidebarBg = tint(accent, 0.94);
      tokens.sidebarWidth = 30;
    }
  }
  if (layout === "dark-sidebar") {
    tokens.primary = darken(readableOnWhite(accent), 0.12);
    tokens.sidebarBg = "#111827";
    tokens.sidebarText = "#f8fafc";
    tokens.sidebarMuted = "#94a3b8";
    tokens.sidebarAccent = readableOnDark(accent);
    tokens.sidebarWidth = 32;
  }
  if (font === "serif") tokens.headingColor = "#111827";
  return { tokens, font };
}

await mkdir(thumbDir, { recursive: true });
await mkdir(contentDir, { recursive: true });

const templates = [];
for (const file of files) {
  const detailToken = file.replace(/\.json$/, "");
  try {
    const record = JSON.parse(await readFile(path.join(detailDir, file), "utf8"));
    const sc = record.data?.sample_cv ?? {};
    const format = record.data?.cv_data?.format_info ?? {};
    if (!sc.name || !format.body_format) continue;
    const layout = bestLayout(format);
    const { tokens, font } = buildTokens(format, layout);
    const tags = [
      ...new Set(
        (sc.tags ?? [])
          .map((tag) => normalizeTag(tag?.cn))
          .filter((tag) => tag && !EXCLUDED_TAGS.has(tag)),
      ),
    ].slice(0, 4);
    const imagePath = path.join(imageDir, `${detailToken}.png`);
    let hasImage = false;
    try {
      hasImage = (await stat(imagePath)).isFile();
    } catch {
      hasImage = false;
    }
    // 缩略图也可能来自 regen-template-thumbs.mjs（MISSING=1），
    // 没有 crawler 原图时保留已经生成好的本地缩略图。
    let hasThumb = false;
    try {
      hasThumb = (await stat(path.join(thumbDir, `${detailToken}.webp`))).isFile();
    } catch {
      hasThumb = false;
    }
    const placeholder = buildPlaceholder(record.data?.cv_data ?? {}, sc);
    let content = null;
    if (placeholder) {
      content = `/template-content/${detailToken}.json`;
      await writeFile(
        path.join(contentDir, `${detailToken}.json`),
        JSON.stringify(placeholder),
        "utf8",
      );
    }
    templates.push({
      id: `wcx-${detailToken}`,
      token: detailToken,
      sourceToken: sc.token ?? "",
      name: String(sc.name).trim(),
      desc: String(sc.desc ?? "").slice(0, 100),
      tags,
      layout,
      font,
      tokens,
      preview:
        hasImage || hasThumb ? `/template-thumbs/${detailToken}.webp` : null,
      content,
      people: Number(sc.people_count) || 0,
      sourceName: String(sc.name).trim(),
    });
  } catch {
    /* skip malformed */
  }
}

templates.sort((a, b) => b.people - a.people);

const withImages = templates.filter((template) => template.preview);
console.log(`templates=${templates.length} withImages=${withImages.length}`);

let cursor = 0;
let done = 0;
const CONCURRENCY = 6;
async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= withImages.length) return;
    const entry = withImages[index];
    const input = path.join(imageDir, `${entry.token}.png`);
    const output = path.join(thumbDir, `${entry.token}.webp`);
    try {
      try {
        const [inStat, outStat] = await Promise.all([stat(input), stat(output)]);
        if (outStat.mtimeMs >= inStat.mtimeMs) {
          done += 1;
          continue;
        }
      } catch {
        /* regenerate */
      }
      await sharp(input)
        .resize({ width: 720, withoutEnlargement: true })
        .webp({ quality: 84 })
        .toFile(output);
    } catch {
      // 没有 crawler 原图时不要清掉本地已生成的缩略图。
      try {
        if (!(await stat(output)).isFile()) entry.preview = null;
      } catch {
        entry.preview = null;
      }
    }
    done += 1;
    if (done % 200 === 0) {
      console.log(`thumbs ${done}/${withImages.length}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

await writeFile(
  catalogPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      count: templates.length,
      withPreview: templates.filter((template) => template.preview).length,
      withContent: templates.filter((template) => template.content).length,
      templates,
    },
    null,
    1,
  ),
  "utf8",
);

console.log(`written ${catalogPath}`);
console.log(`thumbs dir ${thumbDir}`);
