import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { mkdtemp, readdir, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const names = process.argv.slice(2);
const OUT = "F:/Projects/blazecv/tools/audit/compare";
await mkdir(OUT, { recursive: true });
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1400, deviceScaleFactor: 2 },
  protocolTimeout: 240000,
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
  return { mean: Math.round((sum / (w * h * 3)) * 100) / 100, changedPct: Math.round((changed / (w * h)) * 1000) / 10 };
}

const rows = [];
for (const [i, name] of names.entries()) {
  const dir = await mkdtemp(path.join(tmpdir(), `blazecv-x10-${i}-`));
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dir });
  try {
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
    await new Promise((r) => setTimeout(r, 1400));
    const token = await page.evaluate(() => {
      const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
      return (f?.getAttribute("src") ?? "").split("/").pop()?.replace(/\.html$/, "");
    });
    const editorFrame = await page.$('iframe[title="原站模板 1:1 预览"]');
    const editorShot = await editorFrame.screenshot({ type: "png" });
    const em = await sharp(editorShot).metadata();

    await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "导出")?.click(); });
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => { [...document.querySelectorAll("button,[role=menuitem]")].find((b) => b.textContent?.includes("导出 PNG"))?.click(); });
    let png = null;
    for (let k = 0; k < 120; k += 1) { await new Promise((r) => setTimeout(r, 500)); const fs = await readdir(dir); png = fs.find((f) => f.endsWith(".png")); if (png) break; }
    if (!png) { rows.push({ name, token, error: "no png" }); console.log(`${name}: EXPORT FAILED`); await page.close(); continue; }
    const expBuf = await readFile(path.join(dir, png));
    const exm = await sharp(expBuf).metadata();

    const W = em.width, H = em.height;
    const a = await sharp(editorShot).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
    const b = await sharp(expBuf).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
    const m = compare(a, b, W, H);
    rows.push({ name, token, editor: `${em.width}x${em.height}`, exportFile: `${exm.width}x${exm.height}`, ...m });
    console.log(`${name}: token=${token} editor=${em.width}x${em.height} export=${exm.width}x${exm.height} mean=${m.mean} changed=${m.changedPct}%`);

    const er = await sharp(expBuf).resize(W, H, { fit: "fill" }).toBuffer();
    const rr = await sharp(editorShot).resize(W, H, { fit: "fill" }).toBuffer();
    await sharp({ create: { width: W * 2 + 20, height: H + 40, channels: 3, background: "#d0d4da" } })
      .composite([
        { input: rr, left: 0, top: 40 },
        { input: er, left: W + 20, top: 40 },
        { input: Buffer.from(`<svg width="${W * 2 + 20}" height="40"><text x="10" y="26" font-family="sans-serif" font-size="18" fill="#111">编辑页(左) vs 实际导出PNG(右) · ${name} · mean=${m.mean}</text></svg>`), left: 0, top: 0 },
      ])
      .png()
      .toFile(path.join(OUT, `X10-${token}.png`));
  } catch (e) {
    rows.push({ name, error: String(e?.message ?? e).slice(0, 120) });
    console.log(`${name}: ERR ${String(e?.message ?? e).slice(0, 120)}`);
  } finally {
    await page.close().catch(() => undefined);
  }
}
console.log("\nSUMMARY");
for (const r of rows) console.log(JSON.stringify(r));
await browser.disconnect();
