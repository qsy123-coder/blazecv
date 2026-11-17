// 验证编辑页 iframe 的像素偏移是否来自 element.screenshot（缩放 iframe 的裁剪伪影）。
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const name = process.argv[2] ?? "2026用户运营应届生简历模板";
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1600, deviceScaleFactor: 2 },
  protocolTimeout: 240000,
});
const page = await browser.newPage();
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
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => document.querySelector('iframe[title="原站模板 1:1 预览"]').scrollIntoView({ block: "start" }));
await new Promise((r) => setTimeout(r, 500));

const info = await page.evaluate(() => {
  const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const r = f.getBoundingClientRect();
  const chain = [];
  let el = f;
  while (el && el !== document.documentElement) {
    const cs = getComputedStyle(el);
    chain.push({ tag: el.tagName, cls: el.className?.toString().slice(0, 60), transform: cs.transform, zoom: cs.zoom, padding: cs.padding, border: cs.borderWidth });
    el = el.parentElement;
  }
  return { rect: { x: r.x, y: r.y, w: r.width, h: r.height }, scrollY: window.scrollY, dpr: devicePixelRatio, chain };
});

const el = await page.$('iframe[title="原站模板 1:1 预览"]');
await el.screenshot({ path: "F:/Projects/blazecv/tools/audit/compare/CLIP-ELEMENT.png" });
await page.screenshot({ path: "F:/Projects/blazecv/tools/audit/compare/CLIP-PAGE.png", clip: { x: info.rect.x, y: info.rect.y, width: info.rect.w, height: Math.min(info.rect.h, 1600 - info.rect.y) }, captureBeyondViewport: true });

for (const f of ["CLIP-ELEMENT.png", "CLIP-PAGE.png"]) {
  const { data, info: im } = await sharp("F:/Projects/blazecv/tools/audit/compare/" + f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const row = 380;
  let first = -1;
  for (let x = 0; x < 400; x += 1) { const i = (row * im.width + x) * 3; if (data[i] < 120) { first = x; break; } }
  console.log(f, `${im.width}x${im.height}`, "row380 firstDark=" + first);
}
console.log(JSON.stringify(info, null, 2));
await page.close();
browser.disconnect();
