import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { mkdtemp, readdir, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const name = process.argv[2] ?? "应届生通用简历模板";
const dir = await mkdtemp(path.join(tmpdir(), "blazecv-off-"));
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1200, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dir });
await page.goto("http://127.0.0.1:3000/templates", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("[data-catalog-card]", { timeout: 30000 });
const input = await page.$('input[aria-label="搜索模板"]');
await input.type(name);
await new Promise((r) => setTimeout(r, 700));
await page.evaluate((n) => {
  const card = [...document.querySelectorAll("[data-catalog-card]")].find((c) => c.textContent.includes(n));
  [...(card?.querySelectorAll("button") ?? [])].find((b) => b.textContent.includes("使用此模板"))?.click();
}, name);
await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1300));
const token = await page.evaluate(() => {
  const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  return (f?.getAttribute("src") ?? "").split("/").pop()?.replace(/\.html$/, "");
});
await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "导出")?.click(); });
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => { [...document.querySelectorAll("button,[role=menuitem]")].find((b) => b.textContent?.includes("导出 PNG"))?.click(); });
let png = null;
for (let i = 0; i < 80; i += 1) { await new Promise((r) => setTimeout(r, 500)); const fs = await readdir(dir); png = fs.find((f) => f.endsWith(".png")); if (png) break; }
if (!png) { console.log("export failed"); await page.close(); browser.disconnect(); process.exit(1); }
const expBuf = await readFile(path.join(dir, png));

await page.goto(`http://127.0.0.1:3000/template-pages/${token}.html`, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForSelector("#cv-container", { timeout: 15000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 400));
const rawH = await page.evaluate(async () => {
  const main = document.querySelector(".main"); const content = document.querySelector(".content"); const scroll = document.querySelector(".content-scroll");
  if (content) { content.style.height = "auto"; content.style.overflow = "visible"; }
  if (scroll) { scroll.style.height = "auto"; scroll.style.overflow = "visible"; }
  main.style.height = "auto"; main.style.minHeight = "0";
  await document.fonts?.ready?.catch(() => {});
  return Math.max(1123, Math.ceil(main.getBoundingClientRect().height));
});
const rawEl = await page.$("#cv-container");
const rawShot = await rawEl.screenshot({ type: "png" });

const W = 794, H = rawH;
const exp = await sharp(expBuf).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
const raw = await sharp(rawShot).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();

function meanAt(offX, offY) {
  let s = 0, n = 0;
  for (let y = Math.max(0, offY); y < H; y++) {
    for (let x = Math.max(0, offX); x < W; x++) {
      const ei = (y * W + x) * 3;
      const ri = ((y - offY) * W + (x - offX)) * 3;
      s += Math.abs(exp[ei] - raw[ri]) + Math.abs(exp[ei + 1] - raw[ri + 1]) + Math.abs(exp[ei + 2] - raw[ri + 2]);
      n += 3;
    }
  }
  return Math.round((s / n) * 100) / 100;
}
let best = { x: 0, y: 0, m: 1e9 };
for (let dy = -10; dy <= 10; dy++) {
  for (let dx = -4; dx <= 4; dx++) {
    const m = meanAt(dx, dy);
    if (m < best.m) best = { x: dx, y: dy, m };
  }
}
console.log(JSON.stringify({ token, rawH, exportLogicalH: Math.round((await sharp(expBuf).metadata()).height / 2), mean0: meanAt(0, 0), best }));
await page.close();
browser.disconnect();
