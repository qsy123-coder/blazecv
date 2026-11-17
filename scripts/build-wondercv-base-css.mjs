import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.argv[2] ?? "F:/Projects/blazecv";
const URLs = [
  "https://at.alicdn.com/t/c/font_1614557_py6ouxigr5.css",
  "https://static.wondercv.com/cv_pc_nuxt/css/9e35a22.css",
  "https://static.wondercv.com/cv_pc_nuxt/css/04dbfc0.css",
  "https://static.wondercv.com/cv_pc_nuxt/css/f8094d2.css",
  "https://static.wondercv.com/cv_pc_nuxt/css/dbdea8b.css",
  "https://static.wondercv.com/cv_pc_nuxt/css/2e54baf.css",
  "https://static.wondercv.com/cv_pc_nuxt/css/129969e.css",
  "https://static.wondercv.com/cv_pc_nuxt/css/aa31f88.css",
  "https://static.wondercv.com/cv_pc_nuxt/css/2af2965.css",
  "https://static.wondercv.com/cv_pc_nuxt/css/31f0cc4.css",
  "https://static.wondercv.com/cv_pc_nuxt/css/80deadd.css",
  "https://static.wondercv.com/cv_pc_nuxt/css/235630d.css",
  "https://static.wondercv.com/cv_pc_nuxt/css/359aa32.css",
];

let css = "";
for (const url of URLs) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Referer: "https://www.wondercv.com/",
    },
  });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  const text = await response.text();
  const rewritten = text.replace(/url\(([^)]+)\)/g, (match, raw) => {
    const value = String(raw).trim().replace(/^['"]|['"]$/g, "");
    if (/^(data:|https?:|\/\/)/i.test(value)) return match;
    try {
      return `url(${new URL(value, url).toString()})`;
    } catch {
      return match;
    }
  });
  css += `\n/* ${url} */\n${rewritten}`;
}

const outDir = path.join(projectRoot, "public", "wondercv-assets");
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, "template-base.css");
await writeFile(outFile, css, "utf8");
console.log(outFile, Math.round(css.length / 1024) + "KB");
