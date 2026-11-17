import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.argv[2];
const outFile =
  process.argv[3] ?? "F:/Projects/blazecv/src/lib/templates.generated.ts";
if (!root) throw new Error("usage: node generate-wondercv-templates.mjs <crawler-root> [out-file]");

const detailDir = path.join(root, "data", "details");
const files = (await readdir(detailDir)).filter((file) => file.endsWith(".json"));

const TARGETS = {
  single: 6,
  sidebar: 7,
  timeline: 5,
  banner: 5,
  "dark-sidebar": 4,
  split: 5,
  editorial: 5,
};

const LAYOUT_LABEL = {
  single: "单栏",
  sidebar: "侧栏",
  timeline: "时间轴",
  banner: "横幅",
  "dark-sidebar": "深色",
  split: "分栏",
  editorial: "标签",
};

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

const PREFERRED_TAGS = [
  "应届生",
  "校招",
  "实习",
  "社招",
  "跳槽",
  "程序员",
  "数据分析",
  "产品经理",
  "运营",
  "设计",
  "UI/UX",
  "金融",
  "银行",
  "互联网",
  "教师",
  "软件工程",
  "电气工程",
  "游戏",
  "市场营销",
  "咨询",
  "销售",
  "制造业",
];

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

function colorLabel(hex) {
  const [r, g, b] = channels(hex);
  let best = COLOR_PALETTE[0][0];
  let bestDistance = Infinity;
  for (const [label, target] of COLOR_PALETTE) {
    const [tr, tg, tb] = channels(target);
    const distance = (r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = label;
    }
  }
  return best;
}

function normalizeTag(tag) {
  if (typeof tag !== "string") return "";
  return tag
    .replace(/简历模板|简历|模板/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function displayTag(tags) {
  const usable = tags.filter((tag) => tag && !EXCLUDED_TAGS.has(tag));
  for (const preferred of PREFERRED_TAGS) {
    if (usable.includes(preferred)) return preferred;
  }
  return usable[0] || "通用";
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
  if (format.pattern_type && format.pattern_type !== "blank") scores.banner += 1;

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
  const scores = layoutScores(format);
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
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
    layout === "editorial" ? Math.round(baseSize * 1.3 * 2) / 2 : Math.round(baseSize * 1.25 * 2) / 2;

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
  if (font === "serif") {
    tokens.headingColor = "#111827";
  }
  return { tokens, font };
}

const candidates = [];
for (const file of files) {
  try {
    const record = JSON.parse(await readFile(path.join(detailDir, file), "utf8"));
    const sc = record.data?.sample_cv ?? {};
    const format = record.data?.cv_data?.format_info ?? {};
    if (sc.lang !== "cn" || !sc.name || !format.body_format) continue;
    const layout = bestLayout(format);
    const { tokens, font } = buildTokens(format, layout);
    const tags = [
      ...new Set(
        (sc.tags ?? [])
          .map((tag) => normalizeTag(tag?.cn))
          .filter((tag) => tag && !EXCLUDED_TAGS.has(tag)),
      ),
    ].slice(0, 4);
    const sourceName = String(sc.name || "").trim();
    const primaryTag = displayTag(tags);
    candidates.push({
      token: String(sc.token || file.replace(/\.json$/, "")),
      name: primaryTag,
      sourceName,
      desc: tags.length
        ? `适用 ${tags.slice(0, 3).join(" / ")}`
        : `参考「${sourceName.slice(0, 24) || "通用版式"}」`,
      tags,
      people: Number(sc.people_count) || 0,
      layout,
      font,
      tokens,
      format,
      signature: [
        layout,
        tokens.primary,
        font,
        tokens.headerAlign,
        tokens.titleStyle,
        tokens.dense,
        tokens.bannerStyle,
        tokens.timelineSidebar,
      ].join("|"),
    });
  } catch {
    /* skip malformed */
  }
}

candidates.sort((a, b) => b.people - a.people);

const selected = [];
const usedSignatures = new Set();
const usedNames = new Set();
const layoutCounts = Object.fromEntries(Object.keys(TARGETS).map((key) => [key, 0]));

function addCandidate(candidate) {
  if (usedSignatures.has(candidate.signature)) return false;
  const id = `wc-${candidate.token.replace(/[^A-Za-z0-9_-]/g, "")}`;
  if (selected.some((item) => item.id === id)) return false;
  let name = `${candidate.name} · ${colorLabel(candidate.tokens.primary)} · ${LAYOUT_LABEL[candidate.layout]}`;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${candidate.name} · ${colorLabel(candidate.tokens.primary)} · ${LAYOUT_LABEL[candidate.layout]} ${suffix}`;
    suffix += 1;
  }
  usedNames.add(name);
  usedSignatures.add(candidate.signature);
  layoutCounts[candidate.layout] += 1;
  selected.push({ ...candidate, id, displayName: name });
  return true;
}

for (const [layout, target] of Object.entries(TARGETS)) {
  for (const candidate of candidates) {
    if (layoutCounts[layout] >= target) break;
    if (candidate.layout !== layout) continue;
    if (layoutCounts[layout] >= target) break;
    if (usedSignatures.has(candidate.signature)) continue;
    // prevent one source token from being used twice
    if (selected.some((item) => item.token === candidate.token)) continue;
    addCandidate(candidate);
  }
}

console.log("candidates", candidates.length);
console.log("layoutCounts", layoutCounts);
console.log("selected", selected.length);

for (const item of selected) {
  console.log(
    `${item.id}\t${item.layout}\t${item.displayName}\t${item.tags.join("/")}\t${item.people}`,
  );
}

const header = `// AUTO-GENERATED from tools/wondercv-crawler/data/details.
// Only format metadata is transformed; no scraped HTML/CSS or images are shipped.
import type { LayoutKind, TemplateTokens } from "./types";

export interface GeneratedTemplate {
  id: string;
  name: string;
  desc: string;
  layout: LayoutKind;
  tags: string[];
  font: "sans" | "serif";
  source: { token: string; name: string };
  tokens: Partial<Omit<TemplateTokens, "layout" | "lineHeight" | "margin">>;
}

export const GENERATED_TEMPLATES: GeneratedTemplate[] = `;

const payload = selected.map((item) => ({
  id: item.id,
  name: item.displayName,
  desc: item.desc,
  layout: item.layout,
  tags: item.tags,
  font: item.font,
  source: { token: item.token, name: item.sourceName },
  tokens: item.tokens,
}));

await writeFile(outFile, `${header}${JSON.stringify(payload, null, 2)};\n`, "utf8");
console.log("written", outFile);
