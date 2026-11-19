/**
 * 迁移云端已保存简历（user_resumes）里的旧样例身份数据。
 *
 * 背景：模板文件在 2026-11 已清洗，但清洗前云存的简历 doc 仍带
 * 陈媛媛Abbey / abbey@wondercv.com / 188-8888-8888 / 超级公司 / 外部 OSS 头像。
 * 浏览器本地 IndexedDB 由前端 migrateLegacySampleData() 自动处理，这里处理云端。
 *
 * 支持两种后端：
 *   - PGlite：读取 PGLITE_DIR（生产默认 /opt/blazecv/.data/pglite）
 *   - PostgreSQL：设置 DATABASE_URL
 *
 * 用法：
 *   node scripts/migrate-resume-identity.mjs --dry-run   # 只报告
 *   node scripts/migrate-resume-identity.mjs             # 实际写入
 */
import { readFileSync } from "node:fs";

const DRY = process.argv.includes("--dry-run");
const MAP = JSON.parse(readFileSync("src/lib/legacy-identity-map.json", "utf8"));
const NAME_MAP = MAP.names;
const EMAIL_MAP = MAP.emails;
const PHONE_MAP = MAP.phones;
const AVATAR_COUNT = 13;

const TEXT_RULES = [
  ["超级公司", "示例公司"],
  ["超级简历", "示例"],
  ["wondercv.com", "example.com"],
];

function stableIndex(key) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % AVATAR_COUNT;
}

const scrubText = (v) => {
  let out = v;
  for (const [from, to] of TEXT_RULES) if (out.includes(from)) out = out.split(from).join(to);
  return out;
};

const scrubName = (v) => {
  if (NAME_MAP[v]) return NAME_MAP[v];
  let out = v;
  for (const [from, to] of Object.entries(NAME_MAP)) {
    if (from.length < 2) continue;
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
};

const scrubPhone = (v) => (v.replace(/\D/g, "").length < 7 ? v : PHONE_MAP[v] ?? v);
const scrubAvatar = (v, seed) =>
  v && /^https?:\/\//i.test(v) && /avatars?\//i.test(v)
    ? `/wondercv-assets/avatars/avatar-${stableIndex(seed) + 1}.jpg`
    : v;

function scrubDoc(input) {
  const doc = JSON.parse(JSON.stringify(input));
  let changed = false;
  const setStr = (obj, key, next) => {
    if (typeof obj[key] === "string" && obj[key] !== next) {
      obj[key] = next;
      changed = true;
    }
  };

  if (typeof doc.title === "string") setStr(doc, "title", scrubText(scrubName(doc.title)));

  const b = doc.basics ?? {};
  if (typeof b.name === "string") setStr(b, "name", scrubName(b.name));
  if (typeof b.email === "string") setStr(b, "email", EMAIL_MAP[b.email] ?? b.email);
  if (typeof b.phone === "string") setStr(b, "phone", scrubPhone(b.phone));
  if (typeof b.jobTitle === "string") setStr(b, "jobTitle", scrubText(b.jobTitle));
  if (typeof b.avatar === "string") setStr(b, "avatar", scrubAvatar(b.avatar, doc.id ?? "resume"));

  for (const section of doc.sections ?? []) {
    if (typeof section.title === "string") setStr(section, "title", scrubText(section.title));
    if (typeof section.content === "string") setStr(section, "content", scrubText(section.content));
    for (const item of section.items ?? []) {
      for (const key of ["org", "role", "school", "major", "detail", "text", "location", "name"]) {
        if (typeof item[key] === "string") setStr(item, key, scrubText(item[key]));
      }
      if (Array.isArray(item.bullets)) {
        for (let i = 0; i < item.bullets.length; i += 1) {
          if (typeof item.bullets[i] === "string") {
            const next = scrubText(item.bullets[i]);
            if (next !== item.bullets[i]) {
              item.bullets[i] = next;
              changed = true;
            }
          }
        }
      }
    }
  }

  const preset = doc.templatePreset;
  if (preset && typeof preset.name === "string") setStr(preset, "name", scrubText(preset.name));

  return { doc, changed };
}

async function run(query, close) {
  const rows = await query("SELECT id, title, doc FROM user_resumes");
  console.log(`rows=${rows.length} dryRun=${DRY}`);

  let updated = 0;
  for (const row of rows) {
    const raw = typeof row.doc === "string" ? JSON.parse(row.doc) : row.doc;
    const { doc, changed } = scrubDoc(raw);
    if (!changed) {
      console.log(`  skip  ${row.id} (already clean)`);
      continue;
    }
    console.log(
      `  update ${row.id}\n    title: ${row.title} -> ${doc.title}` +
        `\n    name : ${raw.basics?.name} -> ${doc.basics?.name}` +
        `\n    email: ${raw.basics?.email} -> ${doc.basics?.email}` +
        `\n    phone: ${raw.basics?.phone} -> ${doc.basics?.phone}` +
        `\n    avatar: ${String(raw.basics?.avatar ?? "").slice(0, 60)} -> ${String(doc.basics?.avatar ?? "").slice(0, 60)}`,
    );
    if (!DRY) {
      await query(
        "UPDATE user_resumes SET title = $1, doc = $2::jsonb WHERE id = $3",
        [doc.title, JSON.stringify(doc), row.id],
      );
    }
    updated += 1;
  }
  await close();
  console.log(`\nmigrated=${DRY ? 0 : updated} wouldUpdate=${updated}`);
}

if (process.env.DATABASE_URL) {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await run(
    async (sql, params) => (await pool.query(sql, params)).rows,
    () => pool.end(),
  );
} else {
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? ".data/pglite";
  const db = await PGlite.create(dir);
  await run(
    async (sql, params) => (await db.query(sql, params)).rows,
    () => db.close(),
  );
}
