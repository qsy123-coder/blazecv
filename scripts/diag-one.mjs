import puppeteer from "puppeteer-core";
import sharp from "sharp";

const token = process.argv[2];
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 900, height: 2600, deviceScaleFactor: 1 },
  protocolTimeout: 120000,
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
await page.goto(`http://127.0.0.1:3000/audit?token=${token}`, {
  waitUntil: "domcontentloaded",
  timeout: 45000,
});
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await page.waitForFunction(() => document.querySelector("[data-audit-ready='1']"), { timeout: 45000 });
await new Promise((r) => setTimeout(r, 300));
const rawH = await page.evaluate(() => Number(document.querySelector("[data-audit-height]")?.dataset.auditHeight ?? 0));
const frame = await page.$('iframe[title="原站模板 1:1 预览"]');
const raw = await frame.screenshot({ type: "png" });
const boundH = await page.evaluate(async () => (typeof window.__auditApply === "function" ? await window.__auditApply() : 0));
await new Promise((r) => setTimeout(r, 250));
const frame2 = await page.$('iframe[title="原站模板 1:1 预览"]');
const bound = await frame2.screenshot({ type: "png" });
await sharp(raw).toFile(`F:/Projects/blazecv/tools/audit/diag-${token}-raw.png`);
await sharp(bound).toFile(`F:/Projects/blazecv/tools/audit/diag-${token}-bound.png`);
const rm = await sharp(raw).metadata();
const bm = await sharp(bound).metadata();
const W = Math.min(rm.width, bm.width);
const H = Math.min(rm.height, bm.height);
const a = await sharp(raw).extract({ left: 0, top: 0, width: W, height: H }).removeAlpha().raw().toBuffer();
const b = await sharp(bound).extract({ left: 0, top: 0, width: W, height: H }).removeAlpha().raw().toBuffer();
let sum = 0;
for (let i = 0; i < W * H * 3; i += 1) sum += Math.abs(a[i] - b[i]);
console.log(JSON.stringify({ token, rawH, boundH, raw: `${rm.width}x${rm.height}`, bound: `${bm.width}x${bm.height}`, mean: Math.round((sum / (W * H * 3)) * 100) / 100 }));
await page.close();
browser.disconnect();
