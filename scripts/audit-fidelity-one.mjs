import puppeteer from "puppeteer-core";
import sharp from "sharp";
import path from "node:path";
import { readFile } from "node:fs/promises";

const tokens = process.argv.slice(2);
const W = 794;
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9227",
  defaultViewport: { width: 900, height: 2600, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
const catalog = JSON.parse(
  await readFile("F:/Projects/blazecv/public/template-catalog.json", "utf8"),
);
const byToken = new Map(catalog.templates.map((t) => [t.token, t]));

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
      if (d > 60) grid[Math.floor(y / cellH) * cells + Math.floor(x / cellW)] += 1;
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

for (const token of tokens) {
  const entry = byToken.get(token);
  await page.goto(`http://127.0.0.1:3000/template-pages/${token}.html`, {
    waitUntil: "networkidle2",
    timeout: 45000,
  });
  await new Promise((r) => setTimeout(r, 450));
  const rawHeight = await page.evaluate(() => {
    const main = document.querySelector(".main");
    const content = document.querySelector(".content");
    const scroll = document.querySelector(".content-scroll");
    if (content) {
      content.style.height = "auto";
      content.style.overflow = "visible";
    }
    if (scroll) {
      scroll.style.height = "auto";
      scroll.style.overflow = "visible";
    }
    main.style.height = "auto";
    main.style.minHeight = "0";
    void main.offsetHeight;
    const h = Math.max(1123, Math.ceil(main.getBoundingClientRect().height));
    main.style.height = `${h}px`;
    main.style.minHeight = "0";
    return h;
  });
  await new Promise((r) => setTimeout(r, 150));
  const rawEl = await page.$("#cv-container");
  const rawShot = await rawEl.screenshot({ type: "png" });

  await page.goto(`http://127.0.0.1:3000/audit?token=${token}`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
  await page.waitForFunction(
    () => document.querySelector("[data-audit-ready='1']"),
    { timeout: 45000 },
  );
  await new Promise((r) => setTimeout(r, 700));
  const boundHeight = await page.evaluate(
    () => Number(document.querySelector("[data-audit-height]")?.dataset.auditHeight ?? 0),
  );
  const frame = await page.$('iframe[title="原站模板 1:1 预览"]');
  const boundShot = await frame.screenshot({ type: "png" });

  const rd = await sharp(rawShot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bd = await sharp(boundShot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let metrics;
  if (rawHeight === boundHeight) {
    metrics = compare(rd.data, bd.data, W, rawHeight);
  } else {
    const h = Math.min(rawHeight, boundHeight);
    const a = await sharp(rawShot).resize(W, h, { fit: "fill" }).removeAlpha().raw().toBuffer();
    const b = await sharp(boundShot).resize(W, h, { fit: "fill" }).removeAlpha().raw().toBuffer();
    metrics = compare(a, b, W, h);
    metrics.heightDelta = Math.abs(rawHeight - boundHeight);
  }
  console.log(token, entry?.layout, entry?.name, JSON.stringify(metrics), `rh=${rawHeight} bh=${boundHeight}`);
  await sharp(rawShot).png().toFile(path.join("F:/Projects/blazecv/tools/audit/fidelity/flagged", `${token}-raw.png`));
  await sharp(boundShot).png().toFile(path.join("F:/Projects/blazecv/tools/audit/fidelity/flagged", `${token}-bound.png`));
}
await page.close();
browser.disconnect();
