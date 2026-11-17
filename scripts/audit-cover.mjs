import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:3000";
const CDP_URL = process.env.CDP_URL ?? "http://127.0.0.1:9227";
const LIMIT = Number(process.env.AUDIT_LIMIT ?? 0);
const START = Number(process.env.AUDIT_START ?? 0);
const CONCURRENCY = Number(process.env.AUDIT_CONCURRENCY ?? 4);
const OUT_DIR = "F:/Projects/blazecv/tools/audit/cover";
const FLAG_DIR = path.join(OUT_DIR, "flagged");
const RESULT_PATH = path.join(OUT_DIR, "cover-results.json");
const THUMBS = "F:/Projects/blazecv/public/template-thumbs";
const W = 794;

await mkdir(FLAG_DIR, { recursive: true });
const catalog = JSON.parse(
  await readFile("F:/Projects/blazecv/public/template-catalog.json", "utf8"),
);
const entries = catalog.templates.slice(
  START,
  LIMIT > 0 ? START + LIMIT : undefined,
);

function compare(a, b, w, h) {
  let sum = 0;
  let changed = 0;
  const cells = 16;
  const cellW = Math.max(1, Math.floor(w / cells));
  const cellH = Math.max(1, Math.floor(h / cells));
  const grid = new Float64Array(cells * cells);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 3;
      const d =
        Math.abs(a[i] - b[i]) +
        Math.abs(a[i + 1] - b[i + 1]) +
        Math.abs(a[i + 2] - b[i + 2]);
      sum += d;
      if (d > 30) changed += 1;
      if (d > 60) {
        grid[Math.floor(y / cellH) * cells + Math.floor(x / cellW)] += 1;
      }
    }
  }
  let maxCell = 0;
  for (const value of grid) maxCell = Math.max(maxCell, value / (cellW * cellH));
  return {
    mean: Math.round((sum / (w * h * 3)) * 100) / 100,
    changedPct: Math.round((changed / (w * h)) * 1000) / 10,
    maxCellPct: Math.round(maxCell * 1000) / 10,
  };
}

const browser = await puppeteer.connect({
  browserURL: CDP_URL,
  defaultViewport: { width: 900, height: 2600, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
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
      let coverMeta = null;
      try {
        coverMeta = await sharp(
          path.join(THUMBS, `${entry.token}.webp`),
        ).metadata();
      } catch {
        coverMeta = null;
      }

      await page.goto(
        `${APP_URL}/audit?token=${encodeURIComponent(entry.token)}`,
        { waitUntil: "domcontentloaded", timeout: 45000 },
      );
      await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', {
        timeout: 30000,
      });
      await page.waitForFunction(
        () => document.querySelector("[data-audit-ready='1']"),
        { timeout: 45000 },
      );
      await new Promise((r) => setTimeout(r, 700));
      const boundHeight = await page.evaluate(
        () => Number(document.querySelector("[data-audit-height]")?.dataset.auditHeight ?? 0),
      );
      const frame = await page.$('iframe[title="原站模板 1:1 预览"]');
      if (!frame) throw new Error("no iframe");
      const boundShot = await frame.screenshot({ type: "png" });

      let metrics = null;
      if (coverMeta && boundHeight > 0) {
        // Resize both to the cover's exact pixel size, preserving the height
        // ratio implied by the natural page so text lands in the same place.
        const cw = coverMeta.width;
        const chh = coverMeta.height;
        const boundResized = await sharp(boundShot)
          .resize(cw, chh, { fit: "fill" })
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const coverResized = await sharp(
          path.join(THUMBS, `${entry.token}.webp`),
        )
          .resize(cw, chh, { fit: "fill" })
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        metrics = compare(coverResized.data, boundResized.data, cw, chh);

        // Height agreement: cover height implied at 794 width vs our page.
        const coverHeightAt794 = Math.round((chh / cw) * 794);
        metrics.heightDelta = Math.abs(coverHeightAt794 - boundHeight);
      }

      const isFlag =
        !metrics ||
        metrics.mean > 12 ||
        metrics.changedPct > 16 ||
        metrics.maxCellPct > 32 ||
        metrics.heightDelta > 60;
      if (isFlag) {
        flagged += 1;
        await sharp(boundShot)
          .resize(coverMeta?.width ?? 720, coverMeta?.height ?? 1018, {
            fit: "fill",
          })
          .png()
          .toFile(path.join(FLAG_DIR, `${entry.token}-bound.png`));
        try {
          await sharp(path.join(THUMBS, `${entry.token}.webp`))
            .png()
            .toFile(path.join(FLAG_DIR, `${entry.token}-cover.png`));
        } catch {}
        await writeFile(
          path.join(FLAG_DIR, `${entry.token}.json`),
          JSON.stringify({
            token: entry.token,
            name: entry.name,
            layout: entry.layout,
            metrics,
            boundHeight,
            coverMeta,
          }),
        );
      }
      results.push({
        token: entry.token,
        name: entry.name,
        layout: entry.layout,
        boundHeight,
        metrics,
      });
    } catch (error) {
      flagged += 1;
      results.push({
        token: entry.token,
        name: entry.name,
        layout: entry.layout,
        error: String(error?.message ?? error).slice(0, 200),
      });
    }
    done += 1;
    if (done % 50 === 0) {
      await writeFile(RESULT_PATH, JSON.stringify(results), "utf8");
      console.log(
        `cover ${done}/${entries.length} flagged=${flagged} last=${entry.name}`,
      );
    }
  }
}

await Promise.all(pages.map((page) => worker(page)));
await writeFile(RESULT_PATH, JSON.stringify(results), "utf8");
console.log(`done ${done}/${entries.length} flagged=${flagged}`);
for (const page of pages) await page.close();
browser.disconnect();
