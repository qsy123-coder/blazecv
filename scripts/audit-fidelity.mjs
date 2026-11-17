import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:3000";
const CDP_URL = process.env.CDP_URL ?? "http://127.0.0.1:9227";
const LIMIT = Number(process.env.AUDIT_LIMIT ?? 0);
const START = Number(process.env.AUDIT_START ?? 0);
const CONCURRENCY = Number(process.env.AUDIT_CONCURRENCY ?? 4);
const OUT_DIR = "F:/Projects/blazecv/tools/audit/fidelity";
const FLAG_DIR = path.join(OUT_DIR, "flagged");
const RESULT_PATH =
  process.env.RESULT_PATH ?? path.join(OUT_DIR, "fidelity-results.json");
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
  protocolTimeout: 300000,
});
let cursor = 0;
const results = [];
let flagged = 0;
let done = 0;
const pages = await Promise.all(
  Array.from({ length: CONCURRENCY }, () => browser.newPage()),
);

const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/i;
async function setupPage(page) {
  await page.setRequestInterception(true).catch(() => undefined);
  page.on("request", (req) => {
    try {
      const url = req.url();
      if (
        url.startsWith("data:") ||
        url.startsWith("blob:") ||
        url.startsWith("about:") ||
        LOCAL_HOST.test(new URL(url).host)
      ) {
        req.continue().catch(() => undefined);
      } else {
        // External CDN avatars/banners are slow or blocked in the lab; abort so
        // the audit is fast and deterministic. Both the raw and bound renders
        // abort identically, so layout/CSS comparison stays valid.
        req.abort().catch(() => undefined);
      }
    } catch {
      req.continue().catch(() => undefined);
    }
  });
}
await Promise.all(pages.map((p) => setupPage(p)));

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function capturePair(page, token) {
  // ONE page load: the audit route renders the template iframe at natural
  // height (raw). We screenshot that, then call window.__auditApply() to run
  // the exact binder, and screenshot again. This halves the per-template cost
  // versus loading the template page and the audit route separately.
  await page.goto(`${APP_URL}/audit?token=${encodeURIComponent(token)}`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', {
    timeout: 30000,
  });
  await page.waitForFunction(
    () => document.querySelector("[data-audit-ready='1']"),
    { timeout: 45000 },
  );
  // Let layout settle deterministically: two animation frames plus a short beat
  // so we never screenshot mid-relayout (which produced false diffs under load).
  const settle = async () => {
    await page.evaluate(
      () =>
        new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))),
    );
    await new Promise((r) => setTimeout(r, 200));
  };
  await settle();

  const rawHeight = await page.evaluate(
    () => Number(document.querySelector("[data-audit-height]")?.dataset.auditHeight ?? 0),
  );
  const frame = await page.$('iframe[title="原站模板 1:1 预览"]');
  if (!frame) throw new Error("no iframe");
  const rawShot = await frame.screenshot({ type: "png" });

  // Run the binder in the live iframe.
  const boundHeight = await page.evaluate(async () => {
    if (typeof window.__auditApply !== "function") return 0;
    const h = await window.__auditApply();
    // Wait until React has committed the new container height.
    const target = String(h);
    for (let i = 0; i < 60; i += 1) {
      const cur = document.querySelector("[data-audit-height]")?.dataset.auditHeight;
      if (cur === target) break;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    return h;
  });
  await settle();
  const frame2 = await page.$('iframe[title="原站模板 1:1 预览"]');
  const boundShot = await frame2.screenshot({ type: "png" });
  const measuredBound = await page.evaluate(
    () => Number(document.querySelector("[data-audit-height]")?.dataset.auditHeight ?? 0),
  );
  return {
    rawShot,
    rawHeight,
    boundShot,
    boundHeight: boundHeight || measuredBound,
  };
}

async function worker(initialPage) {
  let page = initialPage;
  while (true) {
    const index = cursor++;
    if (index >= entries.length) return;
    const entry = entries[index];
    let captured = null;
    let lastError = null;
    for (let attempt = 0; attempt < 2 && !captured; attempt += 1) {
      try {
        captured = await withTimeout(
          capturePair(page, entry.token),
          20000,
          entry.token,
        );
      } catch (error) {
        lastError = error;
        // A stuck navigation poisons the tab; recreate it before retrying.
        try {
          await page.close();
        } catch {
          /* already gone */
        }
        page = await browser.newPage();
        await setupPage(page);
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    if (!captured) {
      flagged += 1;
      results.push({
        token: entry.token,
        name: entry.name,
        layout: entry.layout,
        error: String(lastError?.message ?? lastError).slice(0, 200),
      });
      done += 1;
      continue;
    }
    try {
      const { rawShot, rawHeight, boundShot, boundHeight } = captured;
      const rawData = await sharp(rawShot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const boundData = await sharp(boundShot).removeAlpha().raw().toBuffer({ resolveWithObject: true });

      let metrics = null;
      if (rawHeight === boundHeight) {
        metrics = compare(rawData.data, boundData.data, W, rawHeight);
      } else {
        // Different heights: crop both to the common height (top-aligned) and
        // compare — do NOT stretch, which would shift every row and inflate the
        // diff. Report the height gap as its own metric.
        const h = Math.min(rawHeight, boundHeight);
        const a = await sharp(rawShot).extract({ left: 0, top: 0, width: W, height: h }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const b = await sharp(boundShot).extract({ left: 0, top: 0, width: W, height: h }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        metrics = compare(a.data, b.data, W, h);
        metrics.heightDelta = Math.abs(rawHeight - boundHeight);
      }

      const isFlag =
        metrics.mean > 6 ||
        metrics.changedPct > 8 ||
        metrics.maxCellPct > 25 ||
        (metrics.heightDelta ?? 0) > 40;
      if (isFlag) {
        flagged += 1;
        await sharp(rawShot)
          .png()
          .toFile(path.join(FLAG_DIR, `${entry.token}-raw.png`));
        await sharp(boundShot)
          .png()
          .toFile(path.join(FLAG_DIR, `${entry.token}-bound.png`));
        await writeFile(
          path.join(FLAG_DIR, `${entry.token}.json`),
          JSON.stringify({
            token: entry.token,
            name: entry.name,
            layout: entry.layout,
            metrics,
            rawHeight,
            boundHeight,
          }),
        );
      }
      results.push({
        token: entry.token,
        name: entry.name,
        layout: entry.layout,
        rawHeight,
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
        `fidelity ${done}/${entries.length} flagged=${flagged} last=${entry.name}`,
      );
    }
  }
}

await Promise.all(pages.map((page) => worker(page)));

// Second pass: re-measure every template that timed out under concurrency, one
// at a time with a fresh tab each. Serial execution avoids the tab contention
// that causes those timeouts, so every template ends up measured.
const errored = results.filter((r) => r.error);
if (errored.length > 0) {
  console.log(`retry ${errored.length} errored templates serially…`);
  for (const item of errored) {
    const idx = results.indexOf(item);
    let retryPage = await browser.newPage();
    await setupPage(retryPage);
    try {
      const captured = await withTimeout(
        capturePair(retryPage, item.token),
        25000,
        item.token,
      );
      const rawData = await sharp(captured.rawShot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const boundData = await sharp(captured.boundShot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let metrics;
      if (captured.rawHeight === captured.boundHeight) {
        metrics = compare(rawData.data, boundData.data, W, captured.rawHeight);
      } else {
        const h = Math.min(captured.rawHeight, captured.boundHeight);
        const a = await sharp(captured.rawShot).extract({ left: 0, top: 0, width: W, height: h }).removeAlpha().raw().toBuffer();
        const b = await sharp(captured.boundShot).extract({ left: 0, top: 0, width: W, height: h }).removeAlpha().raw().toBuffer();
        metrics = compare(a, b, W, h);
        metrics.heightDelta = Math.abs(captured.rawHeight - captured.boundHeight);
      }
      results[idx] = {
        token: item.token,
        name: item.name,
        layout: item.layout,
        rawHeight: captured.rawHeight,
        boundHeight: captured.boundHeight,
        metrics,
      };
    } catch (error) {
      // leave the error record as-is if it still fails
      results[idx] = {
        ...item,
        error: String(error?.message ?? error).slice(0, 200),
      };
    } finally {
      await retryPage.close().catch(() => undefined);
    }
  }
}

await writeFile(RESULT_PATH, JSON.stringify(results), "utf8");
console.log(`done ${done}/${entries.length} flagged=${flagged}`);
for (const page of pages) {
  await page.close().catch(() => undefined);
}
browser.disconnect();
