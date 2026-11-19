/**
 * 从 git 历史（ad837934^ = 清洗前）读取原始模板样例数据，
 * 生成「旧样例值 → 新占位值」映射，写入 src/lib/legacy-identity-map.json。
 *
 * 用途：已保存的用户简历（IndexedDB / 云端 user_resumes）里仍是旧样例数据，
 * 需要一个可复现的映射表来做数据迁移。
 *
 * 运行：node scripts/gen-legacy-identity-map.mjs
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const REV = process.env.BASE_REV ?? "ad837934^";

// 与清洗脚本一致的占位池
const NAME_POOL = [
  "王小明", "李思远", "张若曦", "陈嘉宁", "刘子涵", "杨晨曦",
  "周慕白", "吴清和", "郑亦然", "孙可欣", "徐嘉树", "何书言",
  "林知远", "黄予安", "赵清欢", "马一诺",
];

const NAME_EXCLUDE = new Set([
  "姓名", "xx姓名", "示例姓名", "示例", "XXX", "xxx", "XX", "xx", "",
]);

const lsTree = execFileSync("git", ["ls-tree", "--name-only", REV, "public/template-content/"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
})
  .split("\n")
  .filter((line) => line.endsWith(".json"));

console.log(`files in ${REV}: ${lsTree.length}`);

const names = new Set();
const emails = new Set();
const phones = new Set();

for (const path of lsTree) {
  const text = execFileSync("git", ["show", `${REV}:${path}`], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  const basics = text.match(/"basics":\{.*?\}/);
  if (basics) {
    const name = basics[0].match(/"name":"((?:[^"\\]|\\.)*)"/);
    if (name) names.add(name[1]);
  }
  for (const m of text.matchAll(/"email":"((?:[^"\\]|\\.)*)"/g)) emails.add(m[1]);
  for (const m of text.matchAll(/"phone":"((?:[^"\\]|\\.)*)"/g)) phones.add(m[1]);
}

// —— 姓名映射：长串优先，排除通用标签 ——
const nameMap = {};
let i = 0;
for (const name of [...names].sort((a, b) => b.length - a.length)) {
  if (NAME_EXCLUDE.has(name)) continue;
  nameMap[name] = NAME_POOL[i % NAME_POOL.length];
  i += 1;
}

const emailMap = {};
let j = 0;
for (const email of [...emails].sort((a, b) => b.length - a.length)) {
  if (!email) continue;
  emailMap[email] = `user${j + 1}@example.com`;
  j += 1;
}

const phoneMap = {};
let k = 0;
for (const phone of [...phones].sort((a, b) => b.length - a.length)) {
  if (!phone) continue;
  phoneMap[phone] = `138-0000-${String(k + 1).padStart(4, "0")}`;
  k += 1;
}

const out = { names: nameMap, emails: emailMap, phones: phoneMap };

mkdirSync("src/lib", { recursive: true });
writeFileSync("src/lib/legacy-identity-map.json", JSON.stringify(out, null, 0) + "\n", "utf8");

console.log(
  `names=${Object.keys(nameMap).length} emails=${Object.keys(emailMap).length} phones=${Object.keys(phoneMap).length}`,
);
