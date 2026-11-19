/**
 * 把第一轮占位头像（avatar-placeholder.svg）替换为本地可商用照片
 * public/wondercv-assets/avatars/avatar-1..13.jpg。
 *
 * 头像索引由 token（文件名去扩展名）的稳定哈希决定，
 * 因此同一模板的 template-content/<token>.json 与 template-pages/<token>.html
 * 会拿到同一张头像（编辑页与预览页一致），不同模板之间仍有多样性。
 *
 * 运行：node scripts/distribute-avatars.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const ROOTS = ["public/template-content", "public/template-pages"];
const PLACEHOLDER = "/wondercv-assets/avatar-placeholder.svg";
const COUNT = Object.keys(
  JSON.parse(readFileSync("src/lib/avatar-gender.json", "utf8")),
).length;

function stableIndex(key) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % COUNT;
}

let changed = 0;
let replaced = 0;

for (const dir of ROOTS) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") || f.endsWith(".html"));
  for (const file of files) {
    const path = join(dir, file);
    const before = readFileSync(path, "utf8");
    if (!before.includes(PLACEHOLDER)) continue;
    const token = basename(file).replace(/\.(json|html)$/, "");
    const avatar = `/wondercv-assets/avatars/avatar-${stableIndex(token) + 1}.jpg`;
    const hits = before.split(PLACEHOLDER).length - 1;
    const after = before.split(PLACEHOLDER).join(avatar);
    writeFileSync(path, after, "utf8");
    changed += 1;
    replaced += hits;
  }
}

console.log(`files=${changed} replacements=${replaced}`);
