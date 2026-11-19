/**
 * 清理 public/template-catalog.json 里的品牌前缀。
 *
 * 该文件由 scripts/build-template-catalog.mjs 生成，包含模板名称与描述，
 * 其中 7 处带「超级简历」品牌前缀。与 template-content/pages 保持一致的替换。
 *
 * 幂等，可重复执行。
 * 运行：node scripts/scrub-template-catalog.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "public/template-catalog.json";

const REPLACEMENTS = [
  ["超级简历", "示例"],
  ["超级公司", "示例公司"],
  ["wondercv.com", "example.com"],
];

const before = readFileSync(FILE, "utf8");
let text = before;
const counts = new Map();

for (const [from, to] of REPLACEMENTS) {
  if (!text.includes(from)) continue;
  const n = text.split(from).length - 1;
  text = text.split(from).join(to);
  counts.set(from, n);
}

// 结构自检：替换后必须仍是合法 JSON
JSON.parse(text);

if (text !== before) writeFileSync(FILE, text, "utf8");

console.log(text === before ? "no change" : "updated");
for (const [k, v] of counts) console.log(`  ${k} -> ${v}`);
