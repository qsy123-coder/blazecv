/**
 * 头像由 13 张收敛为 2 张（avatar-1 女 / avatar-2 男），姓名同步收敛为两个。
 *
 * 对每个模板：
 *   1. 读旧头像编号 → 用「旧编号表」还原性别（旧表已不再随仓库发布，故内联）；
 *   2. 头像路径改写为 avatar-1（女）/ avatar-2（男）；
 *   3. 姓名为该性别的唯一占位名（女 张若曦 / 男 王小明）；
 *   4. 同步 template-content JSON 与 template-pages HTML（含 title）。
 *
 * 幂等，可重复执行。
 * 运行：node scripts/remap-two-avatars.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const CONTENT_DIR = "public/template-content";
const PAGES_DIR = "public/template-pages";

/** 旧 13 张头像的性别（用于把历史引用映射到新表）。 */
const LEGACY_GENDER = {
  1: "female", 2: "male", 3: "male", 4: "female", 5: "male", 6: "female",
  7: "male", 8: "female", 9: "male", 10: "male", 11: "male", 12: "female", 13: "female",
};

const NAMES = JSON.parse(readFileSync("src/lib/placeholder-names.json", "utf8"));
const AVATAR_VERSION = "?v=2";
const NEW_AVATAR = { female: `avatar-1.jpg${AVATAR_VERSION}`, male: `avatar-2.jpg${AVATAR_VERSION}` };
const NEW_NAME = { female: NAMES.female[0], male: NAMES.male[0] };

/** 历史上出现过的占位名（含已被替换掉的旧池）。 */
const KNOWN_NAMES = new Set([
  ...NAMES.male, ...NAMES.female,
  "王小明", "李思远", "张若曦", "陈嘉宁", "刘子涵", "杨晨曦", "周慕白", "吴清和",
  "郑亦然", "孙可欣", "徐嘉树", "何书言", "林知远", "黄予安", "赵清欢", "马一诺",
  "张皓宇", "陈子昂", "刘博文", "杨志强", "周天成", "吴俊杰", "郑凯文", "孙浩然",
  "徐明轩", "何子豪", "高远航", "林建国", "罗子轩", "马天佑",
  "杨雪晴", "林思彤", "周语桐", "吴静怡", "郑雅婷", "徐婉清", "何书瑶", "刘雨桐",
  "马晓萱", "高静雯", "罗佳怡",
  "姓名", "xx姓名",
]);

function hash(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const pick = (t, re) => (t.match(re) || [])[1] ?? "";

let files = 0;
let avatarChanged = 0;
let nameChanged = 0;
const report = [];

for (const file of readdirSync(CONTENT_DIR)) {
  if (!file.endsWith(".json")) continue;
  const token = basename(file, ".json");
  const jsonPath = join(CONTENT_DIR, file);
  const htmlPath = join(PAGES_DIR, `${token}.html`);

  let json = readFileSync(jsonPath, "utf8");
  const oldAvatar = pick(json, /avatars\/(?:avatar-(\d+)\.jpg|avatar-placeholder\.svg)/);
  const hasAvatar = /avatars\//.test(json);

  let gender;
  if (hasAvatar) {
    gender = LEGACY_GENDER[oldAvatar] ?? "female";
  } else {
    // 无头像模板：性别只用于决定姓名，保持稳定
    gender = hash(`${token}#g`) % 2 === 0 ? "male" : "female";
  }

  const oldName = pick(json, /"basics":\{[^}]*?"name":"([^"]*)"/);
  const newName = NEW_NAME[gender];

  let nextJson = json;

  // 头像
  if (hasAvatar) {
    const target = `/wondercv-assets/avatars/${NEW_AVATAR[gender]}`;
    nextJson = nextJson.replace(
      /\/wondercv-assets\/avatars\/(?:avatar-\d+\.jpg|avatar-placeholder\.svg)/g,
      target,
    );
    if (nextJson !== json) avatarChanged += 1;
  }

  // 姓名
  if (oldName && oldName !== newName && KNOWN_NAMES.has(oldName)) {
    nextJson = nextJson.split(oldName).join(newName);
    nameChanged += 1;
  }

  if (nextJson !== json) {
    writeFileSync(jsonPath, nextJson, "utf8");
    try {
      const html = readFileSync(htmlPath, "utf8");
      let nextHtml = html;
      if (hasAvatar) {
        nextHtml = nextHtml.replace(
          /\/wondercv-assets\/avatars\/(?:avatar-\d+\.jpg|avatar-placeholder\.svg)/g,
          `/wondercv-assets/avatars/${NEW_AVATAR[gender]}`,
        );
      }
      if (oldName && oldName !== newName && KNOWN_NAMES.has(oldName)) {
        nextHtml = nextHtml.split(oldName).join(newName);
      }
      if (nextHtml !== html) writeFileSync(htmlPath, nextHtml, "utf8");
    } catch {
      /* 模板页缺失时忽略 */
    }
    if (report.length < 8) report.push(`${token}: ${oldName} -> ${newName} (${gender}, ${NEW_AVATAR[gender]})`);
  }
  files += 1;
}

console.log(`files=${files} avatarChanged=${avatarChanged} nameChanged=${nameChanged}`);
report.forEach((r) => console.log("  " + r));
