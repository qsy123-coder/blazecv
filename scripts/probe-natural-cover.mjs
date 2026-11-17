import puppeteer from "puppeteer-core";
import sharp from "sharp";
import path from "node:path";

const tokens = process.argv.slice(2);
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9227",
  defaultViewport: { width: 900, height: 2400, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
for (const token of tokens) {
  const coverPath = path.join(
    "F:/Projects/blazecv/public/template-thumbs",
    `${token}.webp`,
  );
  let coverMeta = null;
  try {
    coverMeta = await sharp(coverPath).metadata();
  } catch {}

  await page.goto(`http://127.0.0.1:3000/template-pages/${token}.html`, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 600));

  // Force the page to its natural content height (no A4 clip, no shrink).
  const natural = await page.evaluate(() => {
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
    return { h: Math.round(main.scrollHeight) };
  });
  await new Promise((r) => setTimeout(r, 300));
  const box = await page.evaluate(() => {
    const main = document.querySelector(".main");
    const r = main.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  const el = await page.$(".main");
  const shot = await el.screenshot({ type: "png" });
  const meta = await sharp(shot).metadata();
  await sharp(shot).toFile(
    path.join("F:/Projects/blazecv/tools/audit/raw", `${token}-natural.png`),
  );
  console.log(
    JSON.stringify({
      token,
      cover: coverMeta ? `${coverMeta.width}x${coverMeta.height}` : null,
      coverH794: coverMeta
        ? Math.round((coverMeta.height / coverMeta.width) * 794)
        : null,
      naturalBox: box,
      shot: `${meta.width}x${meta.height}`,
    }),
  );
}
await page.close();
browser.disconnect();
