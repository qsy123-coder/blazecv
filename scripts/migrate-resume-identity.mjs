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

const AVATAR_GENDER = JSON.parse(readFileSync("src/lib/avatar-gender.json", "utf8"));
const AVATAR_INDEXES = Object.keys(AVATAR_GENDER);
const NAME_POOLS = JSON.parse(readFileSync("src/lib/placeholder-names.json", "utf8"));
const MALE_NAMES = NAME_POOLS.male;
const FEMALE_NAMES = NAME_POOLS.female;

/** 历史 13 张头像的性别 → 收敛到当前两套头像。 */
const LEGACY_AVATAR_GENDER = {
  "1": "female", "2": "male", "3": "male", "4": "female", "5": "male", "6": "female",
  "7": "male", "8": "female", "9": "male", "10": "male", "11": "male", "12": "female",
  "13": "female",
};
const avatarForGender = (g) => {
  const idx = AVATAR_INDEXES.find((i) => AVATAR_GENDER[i] === g) ?? AVATAR_INDEXES[0];
  return `/wondercv-assets/avatars/avatar-${idx}.jpg`;
};
const LEGACY_PLACEHOLDERS = new Set([
  "王小明", "李思远", "张若曦", "陈嘉宁", "刘子涵", "杨晨曦",
  "周慕白", "吴清和", "郑亦然", "孙可欣", "徐嘉树", "何书言",
  "林知远", "黄予安", "赵清欢", "马一诺",
]);
const ALL_PLACEHOLDERS = new Set([...MALE_NAMES, ...FEMALE_NAMES, ...LEGACY_PLACEHOLDERS]);

const rawHash = (key) => {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

const genderOfAvatar = (path) => {
  const m = String(path ?? "").match(/avatar-(\d+)\.jpg$/);
  return m ? AVATAR_GENDER[m[1]] ?? null : null;
};

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
const stableAvatar = (seed) => {
  const idx = AVATAR_INDEXES[stableIndex(seed) % AVATAR_INDEXES.length];
  return `/wondercv-assets/avatars/avatar-${idx}.jpg`;
};

const scrubAvatar = (v, seed) => {
  if (!v) return v;
  const local = String(v).match(/\/wondercv-assets\/avatars\/avatar-(\d+)\.jpg$/);
  if (local) {
    if (AVATAR_GENDER[local[1]]) return v;
    const g = LEGACY_AVATAR_GENDER[local[1]];
    return g ? avatarForGender(g) : stableAvatar(seed);
  }
  return /^https?:\/\//i.test(v) && /avatars?\//i.test(v) ? stableAvatar(seed) : v;
};

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

  // 性别一致性：占位姓名必须与头像性别匹配（用户自定义姓名不动）
  const nameBeforeAlignment = typeof b.name === "string" ? b.name : null;
  if (typeof b.name === "string" && ALL_PLACEHOLDERS.has(b.name)) {
    const gender = genderOfAvatar(b.avatar);
    if (gender) {
      const pool = gender === "male" ? MALE_NAMES : FEMALE_NAMES;
      setStr(b, "name", pool[rawHash(`${doc.id ?? "resume"}#name`) % pool.length]);
    }
  }

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

  // 姓名因性别对齐改了，标题同步
  if (
    nameBeforeAlignment &&
    typeof doc.basics.name === "string" &&
    doc.basics.name !== nameBeforeAlignment &&
    typeof doc.title === "string" &&
    doc.title.includes(nameBeforeAlignment)
  ) {
    doc.title = doc.title.split(nameBeforeAlignment).join(doc.basics.name);
    changed = true;
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
