// 扫描所有模板页：教育模块 (#edus / class 含 edus) 是否存在，以及其槽位里有没有 .menu-content。
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const dir = "F:/Projects/blazecv/public/template-pages";
const files = await readdir(dir);
let withEdu = 0;
let noMenuContent = 0;
const samples = [];
for (const file of files) {
  if (!file.endsWith(".html")) continue;
  const html = await readFile(path.join(dir, file), "utf8");
  const idx = html.indexOf('id="edus"');
  if (idx < 0) continue;
  withEdu += 1;
  // 教育 option 从 id="edus" 到下一个顶层 <div id=" 之间
  const next = html.indexOf('<div id="', idx + 10);
  const block = html.slice(idx, next > 0 ? next : Math.min(html.length, idx + 20000));
  const hasMenu = /class="[^"]*\bmenu-content\b/.test(block);
  if (!hasMenu) {
    noMenuContent += 1;
    if (samples.length < 8) samples.push({ file, block: block.replace(/\s+/g, " ").slice(0, 900) });
  }
}
console.log(JSON.stringify({ files: files.length, withEdu, noMenuContent, samples }, null, 2));
