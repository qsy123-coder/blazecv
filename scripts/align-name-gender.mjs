/**
 * 让模板里的占位姓名与头像性别一致。
 *
 * 之前姓名按「旧样例名」映射、头像按 token 哈希分配，两者互相独立，
 * 于是出现「男性头像 + 女性名字」。本脚本以头像性别为准重新分配姓名：
 *   1. 每个模板 token 的性别 = 其头像的性别（无头像的模板用 token 哈希决定）；
 *   2. 姓名从对应性别的占位池里按 token 哈希取；
 *   3. 同步替换 template-content/<token>.json 与 template-pages/<token>.html
 *      里的旧姓名（含 title 与 user-name 文本）。
 *
 * 头像图本身不改，所以不需要重新生成缩略图之外的任何图片资源；
 * 但姓名是渲染在缩略图里的，改完必须重跑 regen-template-thumbs.mjs。
 *
 * 运行：node scripts/align-name-gender.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const CONTENT_DIR = "public/template-content";
const PAGES_DIR = "public/template-pages";

const AVATAR_GENDER = JSON.parse(readFileSync("src/lib/avatar-gender.json", "utf8"));
const NAMES = JSON.parse(readFileSync("src/lib/placeholder-names.json", "utf8"));

const MALE = NAMES.male;
const FEMALE = NAMES.female;
const ALL_NAMES = new Set([...MALE, ...FEMALE]);

// 上一轮使用的混合池名字：不再是目标池成员，但仍属「可安全替换的占位名」，
// 让无头像模板也统一收敛到性别池里。
const LEGACY_PLACEHOLDERS = new Set([
  "王小明", "李思远", "张若曦", "陈嘉宁", "刘子涵", "杨晨曦",
  "周慕白", "吴清和", "郑亦然", "孙可欣", "徐嘉树", "何书言",
  "林知远", "黄予安", "赵清欢", "马一诺",
]);

function hash(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pickName(token, gender) {
  const pool = gender === "male" ? MALE : FEMALE;
  return pool[hash(`${token}#name`) % pool.length];
}

const contentFiles = readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".json"));

let renamed = 0;
let skipped = 0;
let noAvatarHashGender = 0;
const report = [];

for (const file of contentFiles) {
  const token = basename(file, ".json");
  const jsonPath = join(CONTENT_DIR, file);
  const htmlPath = join(PAGES_DIR, `${token}.html`);

  const text = readFileSync(jsonPath, "utf8");
  const basics = text.match(/"basics":\{.*?\}/);
  if (!basics) {
    skipped += 1;
    continue;
  }
  const nameMatch = basics[0].match(/"name":"((?:[^"\\]|\\.)*)"/);
  if (!nameMatch) {
    skipped += 1;
    continue;
  }
  const oldName = nameMatch[1];

  // 1) 性别：优先取头像性别
  const avatarMatch = text.match(/avatars\/avatar-(\d+)\.jpg/);
  let gender;
  if (avatarMatch && AVATAR_GENDER[avatarMatch[1]]) {
    gender = AVATAR_GENDER[avatarMatch[1]];
  } else {
    gender = hash(`${token}#gender`) % 2 === 0 ? "male" : "female";
    noAvatarHashGender += 1;
  }

  // 2) 目标姓名
  const newName = pickName(token, gender);
  if (oldName === newName) continue;

  // 只替换「占位池里的名字」或明显的样例名，避免动到模板标题型文本
  const isPlaceholder = ALL_NAMES.has(oldName) || LEGACY_PLACEHOLDERS.has(oldName);
  const isLegacySample = oldName.includes("简历模板") || oldName === "姓名" || oldName === "xx姓名";
  if (!isPlaceholder && !isLegacySample) {
    skipped += 1;
    continue;
  }

  // 3) 同步写入 json 与 html
  let nextText = text.split(oldName).join(newName);
  writeFileSync(jsonPath, nextText, "utf8");

  let nextHtml = null;
  try {
    const html = readFileSync(htmlPath, "utf8");
    nextHtml = html.split(oldName).join(newName);
    writeFileSync(htmlPath, nextHtml, "utf8");
  } catch {
    /* 模板页缺失时忽略 */
  }

  renamed += 1;
  if (report.length < 10) report.push(`${token}: ${oldName} -> ${newName} (${gender})`);
}

console.log(`contentFiles=${contentFiles.length} renamed=${renamed} skipped=${skipped}`);
console.log(`templates without avatar (hash gender)=${noAvatarHashGender}`);
report.forEach((line) => console.log("  " + line));
