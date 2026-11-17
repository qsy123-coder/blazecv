import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const name = process.argv[2] ?? "应届生通用简历模板";
const dir = await mkdtemp(path.join(tmpdir(), "blazecv-eve-"));
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1400, deviceScaleFactor: 1 },
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
await new Promise((r) => setTimeout(r, 1500));

// Screenshot the editor iframe (our live render) at natural height.
const editorFrame = await page.$('iframe[title="原站模板 1:1 预览"]');
const editorShot = await editorFrame.screenshot({ type: "png" });
const em = await sharp(editorShot).metadata();

// Export real PNG.
await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "导出")?.click(); });
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => { [...document.querySelectorAll("button,[role=menuitem]")].find((b) => b.textContent?.includes("导出 PNG"))?.click(); });
let png = null;
for (let i = 0; i < 80; i += 1) { await new Promise((r) => setTimeout(r, 500)); const fs = await readdir(dir); png = fs.find((f) => f.endsWith(".png")); if (png) break; }
if (!png) { console.log("export failed"); await page.close(); browser.disconnect(); process.exit(1); }
const expBuf = await readFile(path.join(dir, png));
const exm = await sharp(expBuf).metadata();

await sharp(editorShot).png().toFile("F:/Projects/blazecv/tools/audit/compare/EDITOR-only.png");
await sharp(expBuf).png().toFile("F:/Projects/blazecv/tools/audit/compare/EXPORT-only.png");
const W = em.width, H = em.height;
const a = await sharp(editorShot).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
const b = await sharp(expBuf).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
let sum = 0;
for (let i = 0; i < W * H; i += 1) { const o = i * 3; sum += Math.abs(a[o] - b[o]) + Math.abs(a[o + 1] - b[o + 1]) + Math.abs(a[o + 2] - b[o + 2]); }
console.log(JSON.stringify({ editor: `${em.width}x${em.height}`, exportFile: `${exm.width}x${exm.height}`, meanEditorVsExport: Math.round((sum / (W * H * 3)) * 100) / 100 }));

// Save side-by-side editor vs export.
const er = await sharp(expBuf).resize(W, H, { fit: "fill" }).toBuffer();
const rr = await sharp(editorShot).resize(W, H, { fit: "fill" }).toBuffer();
await sharp({ create: { width: W * 2 + 20, height: H + 40, channels: 3, background: "#d0d4da" } })
  .composite([
    { input: rr, left: 0, top: 40 },
    { input: er, left: W + 20, top: 40 },
    { input: Buffer.from(`<svg width="${W * 2 + 20}" height="40"><text x="10" y="26" font-family="sans-serif" font-size="18" fill="#111">编辑页渲染（左） vs 实际导出PNG（右） · ${name}</text></svg>`), left: 0, top: 0 },
  ])
  .png()
  .toFile("F:/Projects/blazecv/tools/audit/compare/EDITORvsEXPORT.png");
await page.close();
browser.disconnect();
