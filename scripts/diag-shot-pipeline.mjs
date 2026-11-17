// 分离截图管线：编辑页 iframe 截图(E) / /audit iframe 截图(A) / /api/export-image 原始图(X)
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const name = process.argv[2] ?? "2026用户运营应届生简历模板";
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1400, deviceScaleFactor: 2 },
  protocolTimeout: 240000,
});

async function offsetSearch(a, b) {
  const am = await sharp(a).metadata();
  const bm = await sharp(b).metadata();
  const W = Math.min(am.width, bm.width);
  const H = Math.min(am.height, bm.height);
  const A = await sharp(a).extract({ left: 0, top: 0, width: W, height: H }).removeAlpha().raw().toBuffer();
  const B = await sharp(b).extract({ left: 0, top: 0, width: W, height: H }).removeAlpha().raw().toBuffer();
  function m(dx, dy) {
    let s = 0, n = 0;
    for (let y = Math.max(0, dy); y < H; y += 2) {
      for (let x = Math.max(0, dx); x < W; x += 2) {
        const ai = (y * W + x) * 3, bi = ((y - dy) * W + (x - dx)) * 3;
        s += Math.abs(A[ai] - B[bi]) + Math.abs(A[ai + 1] - B[bi + 1]) + Math.abs(A[ai + 2] - B[bi + 2]);
        n += 3;
      }
    }
    return s / n;
  }
  let best = { dx: 0, dy: 0, m: 1e9 };
  for (let dy = -16; dy <= 16; dy += 2) for (let dx = -24; dx <= 24; dx += 2) {
    const v = m(dx, dy);
    if (v < best.m) best = { dx, dy, m: Math.round(v * 100) / 100 };
  }
  return { sizeA: `${am.width}x${am.height}`, sizeB: `${bm.width}x${bm.height}`, mean0: Math.round(m(0, 0) * 100) / 100, best };
}

async function openEditor() {
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
  return page;
}

const editor = await openEditor();
let postData = null;
editor.on("request", (req) => {
  if (req.url().includes("/api/export-image") && req.method() === "POST") postData = req.postData();
});
const editorShot = await (await editor.$('iframe[title="原站模板 1:1 预览"]')).screenshot({ type: "png" });

await editor.evaluate(() => { [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "导出")?.click(); });
await new Promise((r) => setTimeout(r, 300));
await editor.evaluate(() => { [...document.querySelectorAll("button,[role=menuitem]")].find((b) => b.textContent?.includes("导出 PNG"))?.click(); });
for (let i = 0; i < 120 && !postData; i += 1) await new Promise((r) => setTimeout(r, 500));
const doc = JSON.parse(postData).doc;

const audit = await browser.newPage();
await audit.goto(`http://127.0.0.1:3000/audit?doc=${encodeURIComponent(Buffer.from(JSON.stringify(doc)).toString("base64"))}`, { waitUntil: "domcontentloaded", timeout: 45000 });
await audit.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await audit.waitForFunction(() => document.querySelector("[data-audit-ready='1']"), { timeout: 45000 }).catch(() => undefined);
await new Promise((r) => setTimeout(r, 1500));
const auditShot = await (await audit.$('iframe[title="原站模板 1:1 预览"]')).screenshot({ type: "png" });

const apiPage = await browser.newPage();
await apiPage.goto("http://127.0.0.1:3000/templates", { waitUntil: "domcontentloaded", timeout: 45000 });
const apiRes = await apiPage.evaluate(async (payload) => {
  const res = await fetch("/api/export-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) return { error: res.status, text: await res.text() };
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { b64: btoa(binary) };
}, { doc });
await apiPage.close();
const apiShot = Buffer.from(apiRes.b64, "base64");

await writeFile("F:/Projects/blazecv/tools/audit/compare/PIPE-E.png", editorShot);
await writeFile("F:/Projects/blazecv/tools/audit/compare/PIPE-A.png", auditShot);
await writeFile("F:/Projects/blazecv/tools/audit/compare/PIPE-X.png", apiShot);

console.log(JSON.stringify({
  token: (await editor.evaluate(() => document.querySelector('iframe[title="原站模板 1:1 预览"]')?.getAttribute("src")))?.split("/").pop(),
  E_vs_A: await offsetSearch(editorShot, auditShot),
  E_vs_X: await offsetSearch(editorShot, apiShot),
  A_vs_X: await offsetSearch(auditShot, apiShot),
}, null, 2));

await editor.close();
await audit.close();
browser.disconnect();
