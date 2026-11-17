import { readFileSync, writeFileSync } from "node:fs";

const path = "F:/Projects/blazecv/src/lib/exact-template.ts";
const lines = readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);

const repl = new Map([
  [
    543,
    [
      "  // 页边距：相对中性值 10mm 的增量，避免默认改变模板原生内边距。",
      '  if (typeof theme.margin === "number") {',
    ],
  ],
  [
    557,
    [
      "  // 主色：把模板实际使用的强调色替换为用户选的主色（theme.primary 为空则跟随模板）。",
      "  // 注意：改字号会让浏览器把内联 #4183FF 重新序列化为 rgb(65,131,255)，需同时按 hex 与 rgb() 匹配。",
      '  const targetPrimary = (theme.primary || "").trim().toLowerCase();',
    ],
  ],
]);

const out = [];
lines.forEach((line, i) => {
  const r = repl.get(i + 1);
  if (r) out.push(...r);
  else out.push(line);
});
writeFileSync(path, out.join("\n"), "utf8");
console.log("done");
