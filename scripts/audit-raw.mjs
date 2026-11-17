import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const tokens = process.argv.slice(2);
const OUT = "F:/Projects/blazecv/tools/audit/raw";
await mkdir(OUT, { recursive: true });

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9227",
  defaultViewport: { width: 900, height: 1400, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
for (const token of tokens) {
  // 1. Raw captured original page, untouched.
  await page.goto(`http://127.0.0.1:3000/template-pages/${token}.html`, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 800));
  const root = await page.$("#cv-container");
  const box = await root.boundingBox();
  const raw = await root.screenshot({ type: "png" });
  await sharp(raw).toFile(path.join(OUT, `${token}-raw.png`));

  // 2. Bound render through the audit route.
  await page.goto(`http://127.0.0.1:3000/audit?token=${encodeURIComponent(token)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
  await page.waitForFunction(
    () => document.querySelector("[data-audit-ready='1']"),
    { timeout: 45000 },
  );
  await new Promise((r) => setTimeout(r, 800));
  const frame = await page.$('iframe[title="原站模板 1:1 预览"]');
  const bound = await frame.screenshot({ type: "png" });
  await sharp(bound).toFile(path.join(OUT, `${token}-bound.png`));

  // 3. Cover.
  const cover = path.join(
    "F:/Projects/blazecv/public/template-thumbs",
    `${token}.webp`,
  );
  let coverBuf = null;
  try {
    coverBuf = await sharp(cover).toBuffer();
  } catch {
    coverBuf = null;
  }

  const rawMeta = await sharp(raw).metadata();
  const boundMeta = await sharp(bound).metadata();
  let coverMeta = null;
  if (coverBuf) coverMeta = await sharp(coverBuf).metadata();

  console.log(
    JSON.stringify({
      token,
      rawBox: box && { w: Math.round(box.width), h: Math.round(box.height) },
      raw: `${rawMeta.width}x${rawMeta.height}`,
      bound: `${boundMeta.width}x${boundMeta.height}`,
      cover: coverMeta ? `${coverMeta.width}x${coverMeta.height}` : null,
    }),
  );
}
await page.close();
browser.disconnect();
