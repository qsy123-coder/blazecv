import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";

const crawlerRoot = process.argv[2];
const projectRoot = process.argv[3] ?? "F:/Projects/blazecv";
if (!crawlerRoot) throw new Error("usage: node capture-all-template-pages.mjs <crawler-root> [project-root]");

const detailDir = path.join(crawlerRoot, "data", "details");
const outDir = path.join(projectRoot, "public", "template-pages");
await mkdir(outDir, { recursive: true });

const files = (await readdir(detailDir)).filter((file) => file.endsWith(".json"));
const baseUrl = "https://www.wondercv.com/jianlimoban/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

let cursor = 0;
let done = 0;
let failed = 0;
let written = 0;
const CONCURRENCY = 4;

async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= files.length) return;
    const token = files[index].replace(/\.json$/, "");
    const outFile = path.join(outDir, `${token}.html`);
    try {
      try {
        const existing = await readFile(outFile, "utf8");
        if (existing.includes("template-base.css")) {
          done += 1;
          continue;
        }
      } catch {
        /* capture */
      }
      const response = await fetch(`${baseUrl}${encodeURIComponent(token)}.html`, {
        headers: { "User-Agent": UA, Referer: "https://www.wondercv.com/jianlimoban/" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const $ = cheerio.load(html);
      const container = $("#cv-container");
      if (container.length === 0) throw new Error("missing #cv-container");
      const page = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=794">
<link rel="stylesheet" href="/wondercv-assets/template-base.css">
<style>
@font-face { font-family: "iconfont"; src: url("/wondercv-assets/iconfont.woff2") format("woff2"); font-display: swap; }
.cover { z-index: 0 !important; }
.cover-transparent { z-index: 1 !important; }
html, body { margin: 0; padding: 0; background: #fff; width: 794px; }
.resume-preview-wrapper, .resume-preview-container { width: 794px !important; height: auto !important; overflow: visible !important; }
.scale { transform: none !important; width: 794px !important; height: auto !important; }
#cv-container { width: 794px !important; }
</style>
</head>
<body>${container.toString()}</body>
</html>`;
      await writeFile(outFile, page, "utf8");
      written += 1;
    } catch (error) {
      failed += 1;
      if (failed <= 20) console.warn(token, String(error.message || error));
    } finally {
      done += 1;
      if (done % 100 === 0) {
        console.log(`captured ${done}/${files.length} written=${written} failed=${failed}`);
      }
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
console.log(`done total=${files.length} written=${written} failed=${failed}`);
