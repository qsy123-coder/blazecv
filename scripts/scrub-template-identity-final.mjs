/**
 * 收尾清洗：处理前两轮遗漏的边角与品牌链接。
 *
 * 1) 「<占位名>姓名」这类拼接残留（第一轮替换后留下的「姓名」后缀）
 * 2) 通用占位姓名（姓名 / xx姓名）统一成占位名
 * 3) 个人主页链接里的品牌路径（github.com/wondercv、linkedin.com/in/wondercv）
 *
 * 幂等，可重复执行。
 *
 * 运行：node scripts/scrub-template-identity-final.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["public/template-content", "public/template-pages"];

const REPLACEMENTS = [
  // 拼接残留：占位名 + 姓名
  ["孙可欣姓名", "孙可欣"],
  ["王小明姓名", "王小明"],
  // 通用占位姓名
  ["\"name\":\"xx姓名\"", "\"name\":\"王小明\""],
  ["\"name\":\"姓名\"", "\"name\":\"王小明\""],
  // 品牌链接
  ["https://www.linkedin.com/in/wondercv", "https://www.linkedin.com/in/example"],
  ["http://github.com/wondercv", "https://github.com/example"],
  ["github.com/wondercv", "github.com/example"],
];

let files = 0;
let changed = 0;
const counts = new Map();

for (const dir of ROOTS) {
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json") && !file.endsWith(".html")) continue;
    const path = join(dir, file);
    let text = readFileSync(path, "utf8");
    const before = text;
    for (const [from, to] of REPLACEMENTS) {
      if (!text.includes(from)) continue;
      const n = text.split(from).length - 1;
      text = text.split(from).join(to);
      counts.set(from, (counts.get(from) ?? 0) + n);
    }
    if (text !== before) {
      writeFileSync(path, text, "utf8");
      changed += 1;
    }
    files += 1;
  }
}

console.log(`files=${files} changed=${changed}`);
for (const [k, v] of counts) console.log(`  ${k} -> ${v}`);
