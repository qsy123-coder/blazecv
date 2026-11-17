// 检查模板页 .main 的结构与 padding 来源（页边距控件目前只改 padding-top/bottom）。
import { readFile } from "node:fs/promises";

const token = process.argv[2] ?? "bbb107de5b600df0";
const html = await readFile(`public/template-pages/${token}.html`, "utf8");
const i = html.indexOf('class="main');
console.log("=== .main opening ===");
console.log(html.slice(Math.max(0, i - 300), i + 500));

console.log("\n=== inline padding occurrences ===");
let pos = 0;
let k = 0;
while ((pos = html.indexOf("padding", pos + 1)) >= 0 && k < 10) {
  console.log(html.slice(Math.max(0, pos - 160), pos + 200).replace(/\s+/g, " "));
  k += 1;
}

console.log("\n=== stylesheet links ===");
for (const m of html.matchAll(/<link[^>]+href="([^"]+)"[^>]*>/g)) {
  console.log(m[1]);
}
