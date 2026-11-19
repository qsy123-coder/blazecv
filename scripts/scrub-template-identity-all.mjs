/**
 * 全量清洗模板样例身份数据（第二轮，覆盖所有样例姓名/邮箱/手机号/头像）。
 *
 * 与第一轮 scrub-template-identity.mjs 的区别：
 *   - 第一轮只处理 abbey/陈媛媛/超级公司 等已知字样；
 *   - 本轮从 template-content 里自动提取「全部」distinct 姓名、邮箱、手机号，
 *     再加上 template-pages 里的全部外部头像 URL，统一替换。
 *
 * 替换全部是纯文本 split/join，不涉及引号/反斜杠/换行，不破坏 JSON/HTML 结构。
 * 幂等：重复执行不会二次替换（映射值是新的占位值，不再匹配旧值）。
 *
 * 运行：node scripts/scrub-template-identity-all.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CONTENT_DIR = "public/template-content";
const PAGES_DIR = "public/template-pages";
const AVATAR_DIR_OUT = "/wondercv-assets/avatars";

// —— 占位姓名池（性别中性，避免与真实样例同名） ——
const NAME_POOL = [
  "王小明", "李思远", "张若曦", "陈嘉宁", "刘子涵", "杨晨曦",
  "周慕白", "吴清和", "郑亦然", "孙可欣", "徐嘉树", "何书言",
  "林知远", "黄予安", "赵清欢", "马一诺",
];

// 这些不是「个人信息」，而是通用标签或标题，不能替换，否则会破坏 UI 文案。
// 「示例」是上一轮把品牌前缀替换后的通用词，若当作姓名替换会污染
// 「示例公司 / 示例简历 / 示例大学」这类复合词——必须排除。
const NAME_EXCLUDE = new Set([
  "姓名", "xx姓名", "示例姓名", "示例", "XXX", "xxx", "XX", "xx", "",
]);

const isTemplateTitleName = (n) => n.includes("简历模板") || n.includes("简历");

// —— 从 template-content 提取全部 distinct 值 ——
function walkJsonValues() {
  const names = new Set();
  const emails = new Set();
  const phones = new Set();
  for (const file of readdirSync(CONTENT_DIR)) {
    if (!file.endsWith(".json")) continue;
    const text = readFileSync(join(CONTENT_DIR, file), "utf8");
    const basics = text.match(/"basics":\{.*?\}/);
    if (basics) {
      const name = basics[0].match(/"name":"((?:[^"\\]|\\.)*)"/);
      if (name) names.add(name[1]);
    }
    for (const m of text.matchAll(/"email":"((?:[^"\\]|\\.)*)"/g)) emails.add(m[1]);
    for (const m of text.matchAll(/"phone":"((?:[^"\\]|\\.)*)"/g)) phones.add(m[1]);
  }
  return { names, emails, phones };
}

function walkAvatarUrls() {
  const urls = new Set();
  for (const file of readdirSync(PAGES_DIR)) {
    if (!file.endsWith(".html")) continue;
    const text = readFileSync(join(PAGES_DIR, file), "utf8");
    for (const m of text.matchAll(/https:\/\/[^"'()\s]+avatars\/[^"'()\s]+/g)) {
      urls.add(m[0]);
    }
  }
  return urls;
}

// —— 构建映射（确定性，按排序后下标分配） ——
function buildMappings() {
  const { names, emails, phones } = walkJsonValues();
  const nameMap = new Map();
  let i = 0;
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    if (NAME_EXCLUDE.has(name)) continue;
    // 模板标题型「姓名」也替换，但保持短名优先映射，避免子串误伤
    nameMap.set(name, NAME_POOL[i % NAME_POOL.length]);
    i += 1;
  }

  const emailMap = new Map();
  let j = 0;
  for (const email of [...emails].sort((a, b) => b.length - a.length)) {
    if (!email) continue;
    emailMap.set(email, `user${j + 1}@example.com`);
    j += 1;
  }

  const phoneMap = new Map();
  let k = 0;
  for (const phone of [...phones].sort((a, b) => b.length - a.length)) {
    if (!phone) continue;
    phoneMap.set(phone, `138-0000-${String(k + 1).padStart(4, "0")}`);
    k += 1;
  }

  const avatarUrls = [...walkAvatarUrls()].sort();
  const avatarMap = new Map();
  avatarUrls.forEach((url, idx) => {
    avatarMap.set(url, `${AVATAR_DIR_OUT}/avatar-${(idx % 13) + 1}.jpg`);
  });

  return { nameMap, emailMap, phoneMap, avatarMap, counts: {
    names: nameMap.size, emails: emailMap.size, phones: phoneMap.size, avatars: avatarMap.size,
  } };
}

function applyAll(text, maps) {
  let out = text;
  // 长串优先，避免「刘丽」吃掉「刘丽美」
  for (const [from, to] of maps.nameMap) out = out.split(from).join(to);
  for (const [from, to] of maps.emailMap) out = out.split(from).join(to);
  for (const [from, to] of maps.phoneMap) out = out.split(from).join(to);
  for (const [from, to] of maps.avatarMap) out = out.split(from).join(to);
  return out;
}

const maps = buildMappings();
console.log("mappings:", JSON.stringify(maps.counts));

let files = 0;
let changed = 0;
for (const dir of [CONTENT_DIR, PAGES_DIR]) {
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json") && !file.endsWith(".html")) continue;
    const path = join(dir, file);
    const before = readFileSync(path, "utf8");
    const after = applyAll(before, maps);
    if (after !== before) {
      writeFileSync(path, after, "utf8");
      changed += 1;
    }
    files += 1;
  }
}
console.log(`files=${files} changed=${changed}`);
