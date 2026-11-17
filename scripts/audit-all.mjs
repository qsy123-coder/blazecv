import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:3000";
const CDP_URL = process.env.CDP_URL ?? "http://127.0.0.1:9227";
const LIMIT = Number(process.env.AUDIT_LIMIT ?? 0);
const CONCURRENCY = Number(process.env.AUDIT_CONCURRENCY ?? 4);
const OUT_DIR = "F:/Projects/blazecv/tools/audit";
const FLAG_DIR = path.join(OUT_DIR, "flagged");
const RESULT_PATH = path.join(OUT_DIR, "audit-results.json");
const W = 720;
const H = 1019;

await mkdir(FLAG_DIR, { recursive: true });
const catalog = JSON.parse(
  await readFile("F:/Projects/blazecv/public/template-catalog.json", "utf8"),
);
const entries = catalog.templates.slice(0, LIMIT > 0 ? LIMIT : undefined);

async function imageData(buffer) {
  const { data } = await sharp(buffer)
    .resize(W, H, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
}

const coverCache = new Map();
async function coverData(token) {
  if (coverCache.has(token)) return coverCache.get(token);
  try {
    const buffer = await readFile(
      path.join("F:/Projects/blazecv/public/template-thumbs", `${token}.webp`),
    );
    const data = await imageData(buffer);
    coverCache.set(token, data);
    return data;
  } catch {
    coverCache.set(token, null);
    return null;
  }
}

function compare(a, b) {
  let sum = 0;
  let changed = 0;
  const cells = 16;
  const cellW = Math.floor(W / cells);
  const cellH = Math.floor(H / cells);
  const grid = new Float64Array(cells * cells);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const index = (y * W + x) * 3;
      const d =
        Math.abs(a[index] - b[index]) +
        Math.abs(a[index + 1] - b[index + 1]) +
        Math.abs(a[index + 2] - b[index + 2]);
      sum += d;
      if (d > 30) changed += 1;
      if (d > 60) {
        grid[Math.floor(y / cellH) * cells + Math.floor(x / cellW)] += 1;
      }
    }
  }
  let maxCell = 0;
  for (const value of grid) {
    maxCell = Math.max(maxCell, value / (cellW * cellH));
  }
  return {
    mean: Math.round((sum / (W * H * 3)) * 100) / 100,
    changedPct: Math.round((changed / (W * H)) * 1000) / 10,
    maxCellPct: Math.round(maxCell * 1000) / 10,
  };
}

const browser = await puppeteer.connect({
  browserURL: CDP_URL,
  defaultViewport: { width: 900, height: 1320, deviceScaleFactor: 1 },
});
let cursor = 0;
const results = [];
let flagged = 0;
let done = 0;
const pages = await Promise.all(
  Array.from({ length: CONCURRENCY }, () => browser.newPage()),
);

async function worker(page) {
  while (true) {
    const index = cursor++;
    if (index >= entries.length) return;
    const entry = entries[index];
    try {
      await page.goto(
        `${APP_URL}/audit?token=${encodeURIComponent(entry.token)}`,
        { waitUntil: "domcontentloaded", timeout: 45000 },
      );
      await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', {
        timeout: 30000,
      });
      await page.waitForFunction(
        () => document.querySelector("[data-audit-ready='1']"),
        { timeout: 30000 },
      );
      await new Promise((resolve) => setTimeout(resolve, 600));
      const frame = await page.$('iframe[title="原站模板 1:1 预览"]');
      if (!frame) throw new Error("no iframe");
      const shot = await frame.screenshot({ type: "png" });
      const rendered = await imageData(shot);
      const cover = await coverData(entry.token);
      const metrics = cover ? compare(cover, rendered) : null;
      const isFlag =
        !metrics ||
        metrics.mean > 24 ||
        metrics.changedPct > 42 ||
        metrics.maxCellPct > 55;
      if (isFlag) {
        flagged += 1;
        await sharp(shot)
          .resize(W, H, { fit: "fill" })
          .webp({ quality: 82 })
          .toFile(path.join(FLAG_DIR, `${entry.token}.webp`));
      }
      results.push({
        token: entry.token,
        name: entry.name,
        layout: entry.layout,
        preview: Boolean(entry.preview),
        metrics,
      });
    } catch (error) {
      flagged += 1;
      results.push({
        token: entry.token,
        name: entry.name,
        layout: entry.layout,
        preview: Boolean(entry.preview),
        error: String(error?.message ?? error).slice(0, 200),
      });
    }
    done += 1;
    if (done % 50 === 0) {
      await writeFile(RESULT_PATH, JSON.stringify(results), "utf8");
      console.log(
        `audit ${done}/${entries.length} flagged=${flagged} last=${entry.name}`,
      );
    }
  }
}

await Promise.all(pages.map((page) => worker(page)));
await writeFile(RESULT_PATH, JSON.stringify(results), "utf8");
console.log(`done ${done}/${entries.length} flagged=${flagged}`);
for (const page of pages) await page.close();
browser.disconnect();
