import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Render each template as: left = original captured page (raw), right = our
// bound render, side by side, with a diff score. Output PNGs for review.
const tokens = process.argv.slice(2);
const OUT = "F:/Projects/blazecv/tools/audit/compare";
await mkdir(OUT, { recursive: true });

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1000, height: 2600, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
await page.setRequestInterception(true).catch(() => undefined);
page.on("request", (req) => {
  try {
    const u = req.url();
    const host = u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("about:") ? "" : new URL(u).host;
    if (!host || /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(host)) req.continue().catch(() => {});
    else req.abort().catch(() => {});
  } catch {
    req.continue().catch(() => {});
  }
});

function compare(a, b, w, h) {
  let sum = 0;
  let changed = 0;
  for (let i = 0; i < w * h; i += 1) {
    const o = i * 3;
    const d = Math.abs(a[o] - b[o]) + Math.abs(a[o + 1] - b[o + 1]) + Math.abs(a[o + 2] - b[o + 2]);
    sum += d;
    if (d > 30) changed += 1;
  }
  return {
    mean: Math.round((sum / (w * h * 3)) * 100) / 100,
    changedPct: Math.round((changed / (w * h)) * 1000) / 10,
  };
}

for (const token of tokens) {
  await page.goto(`http://127.0.0.1:3000/audit?token=${encodeURIComponent(token)}`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector("[data-audit-ready='1']"), { timeout: 45000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
  await new Promise((r) => setTimeout(r, 200));
  const rawH = await page.evaluate(() => Number(document.querySelector("[data-audit-height]")?.dataset.auditHeight ?? 0));
  const f1 = await page.$('iframe[title="原站模板 1:1 预览"]');
  const raw = await f1.screenshot({ type: "png" });

  const boundH = await page.evaluate(async () => (typeof window.__auditApply === "function" ? await window.__auditApply() : 0));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
  await new Promise((r) => setTimeout(r, 250));
  const f2 = await page.$('iframe[title="原站模板 1:1 预览"]');
  const bound = await f2.screenshot({ type: "png" });

  const rm = await sharp(raw).metadata();
  const bm = await sharp(bound).metadata();
  const W = Math.min(rm.width, bm.width);
  const H = Math.min(rm.height, bm.height);
  const a = await sharp(raw).extract({ left: 0, top: 0, width: W, height: H }).removeAlpha().raw().toBuffer();
  const b = await sharp(bound).extract({ left: 0, top: 0, width: W, height: H }).removeAlpha().raw().toBuffer();
  const m = compare(a, b, W, H);

  const gap = 20;
  const canvasW = rm.width + gap + bm.width;
  const canvasH = Math.max(rm.height, bm.height) + 40;
  const rawBuf = await sharp(raw).toBuffer();
  const boundBuf = await sharp(bound).toBuffer();
  await sharp({ create: { width: canvasW, height: canvasH, channels: 3, background: "#d0d4da" } })
    .composite([
      { input: rawBuf, left: 0, top: 40 },
      { input: boundBuf, left: rm.width + gap, top: 40 },
      {
        input: Buffer.from(
          `<svg width="${canvasW}" height="40"><text x="10" y="26" font-family="sans-serif" font-size="20" fill="#111">原站（左） vs 我们的渲染（右） · ${token} · mean=${m.mean} changed=${m.changedPct}% · 高 ${rawH}/${boundH}px</text></svg>`,
        ),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toFile(path.join(OUT, `${token}.png`));
  console.log(`${token} mean=${m.mean} changed=${m.changedPct}% rawH=${rawH} boundH=${boundH} -> ${path.join(OUT, token + ".png")}`);
}
await page.close();
browser.disconnect();
