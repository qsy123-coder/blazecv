import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";

const LIMIT = Number(process.env.LIMIT ?? 40);
const catalog = JSON.parse(
  await readFile("F:/Projects/blazecv/public/template-catalog.json", "utf8"),
);
const entries = catalog.templates.slice(0, LIMIT);

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9227",
  defaultViewport: { width: 900, height: 2400, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
let ok = 0;
let bad = 0;
for (const entry of entries) {
  let coverMeta = null;
  try {
    coverMeta = await sharp(
      path.join("F:/Projects/blazecv/public/template-thumbs", `${entry.token}.webp`),
    ).metadata();
  } catch {}
  await page.goto(
    `http://127.0.0.1:3000/template-pages/${entry.token}.html`,
    { waitUntil: "networkidle2", timeout: 60000 },
  );
  await new Promise((r) => setTimeout(r, 500));
  const info = await page.evaluate(() => {
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
    // Force layout.
    void main.offsetHeight;
    const options = [...document.querySelectorAll(".option")].filter(
      (n) => getComputedStyle(n).display !== "none",
    );
    const mainTop = main.getBoundingClientRect().top;
    let contentBottom = 0;
    for (const o of options) {
      contentBottom = Math.max(
        contentBottom,
        o.getBoundingClientRect().bottom - mainTop,
      );
    }
    return {
      contentBottom: Math.round(contentBottom),
      scrollHeight: Math.round(main.scrollHeight),
    };
  });
  if (!coverMeta) {
    bad += 1;
    console.log("NO-COVER", entry.token, entry.name);
    continue;
  }
  const coverH = Math.round((coverMeta.height / coverMeta.width) * 794);
  const predicted = Math.max(1123, info.contentBottom);
  const predicted2 = Math.max(1123, info.scrollHeight);
  const d1 = Math.abs(coverH - predicted);
  const d2 = Math.abs(coverH - predicted2);
  const pass = Math.min(d1, d2) <= 40;
  if (pass) ok += 1;
  else bad += 1;
  console.log(
    `${pass ? "ok  " : "BAD "} coverH=${coverH} contentBottom=${info.contentBottom} scrollH=${info.scrollHeight} d1=${d1} d2=${d2} ${entry.layout} ${entry.name}`,
  );
}
console.log(`\n${ok} ok, ${bad} bad of ${entries.length}`);
await page.close();
browser.disconnect();
