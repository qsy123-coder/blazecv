/**
 * 把已存在的 public/template-thumbs/<token>.webp 回填进 template-catalog.json。
 *
 * 用于补齐爬虫阶段没有原站预览图的模板（这些模板页有 HTML 但没有 crawler 截图）。
 * 先用 scripts/regen-template-thumbs.mjs 的 MISSING=1 模式生成缩略图，再跑本脚本。
 *
 * 用法：node scripts/attach-template-thumbs.mjs
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const catalogPath = path.join(root, "public", "template-catalog.json");
const thumbDir = path.join(root, "public", "template-thumbs");

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const thumbs = new Set(
  readdirSync(thumbDir)
    .filter((file) => file.endsWith(".webp"))
    .map((file) => file.replace(/\.webp$/, "")),
);

let added = 0;
for (const entry of catalog.templates) {
  if (entry.preview) continue;
  if (!thumbs.has(entry.token)) continue;
  entry.preview = `/template-thumbs/${entry.token}.webp`;
  added += 1;
}

catalog.withPreview = catalog.templates.filter((entry) => entry.preview).length;

if (added === 0) {
  console.log("没有需要回填的模板");
  process.exit(0);
}

writeFileSync(catalogPath, JSON.stringify(catalog, null, 1), "utf8");
console.log(
  `回填 ${added} 条预览图；withPreview=${catalog.withPreview}/${catalog.templates.length}`,
);

// 确认回填结果都能在磁盘上找到
const missingFile = catalog.templates.filter(
  (entry) =>
    entry.preview &&
    !existsSync(path.join(root, "public", entry.preview.replace(/^\//, ""))),
);
if (missingFile.length > 0) {
  console.error(`有 ${missingFile.length} 条 preview 指向不存在的文件`);
  process.exit(1);
}
