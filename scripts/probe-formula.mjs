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
  defaultViewport: { width: 900, height: 2600, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
const errs = { a: [], b: [], c: [], d: [] };
for (const entry of entries) {
  let coverMeta = null;
  try {
    coverMeta = await sharp(
      path.join("F:/Projects/blazecv/public/template-thumbs", `${entry.token}.webp`),
    ).metadata();
  } catch {}
  if (!coverMeta) continue;
  await page.goto(
    `http://127.0.0.1:3000/template-pages/${entry.token}.html`,
    { waitUntil: "networkidle2", timeout: 60000 },
  );
  await new Promise((r) => setTimeout(r, 400));
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
    void main.offsetHeight;
    const cs = getComputedStyle(main);
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
      rectHeight: Math.round(main.getBoundingClientRect().height),
      padBottom: Math.round(parseFloat(cs.paddingBottom) || 0),
      padTop: Math.round(parseFloat(cs.paddingTop) || 0),
    };
  });
  const coverH = Math.round((coverMeta.height / coverMeta.width) * 794);
  const cand = {
    a: Math.max(1123, info.contentBottom),
    b: Math.max(1123, info.contentBottom + info.padBottom),
    c: Math.max(1123, info.rectHeight),
    d: Math.max(1123, info.scrollHeight),
  };
  for (const k of Object.keys(cand)) errs[k].push(Math.abs(coverH - cand[k]));
  console.log(
    `${entry.token} cover=${coverH} cb=${info.contentBottom} padB=${info.padBottom} rect=${info.rectHeight} sh=${info.scrollHeight} :: a=${cand.a}(${coverH-cand.a}) b=${cand.b}(${coverH-cand.b}) c=${cand.c}(${coverH-cand.c}) d=${cand.d}(${coverH-cand.d})`,
  );
}
for (const k of Object.keys(errs)) {
  const arr = errs[k];
  const sum = arr.reduce((x, y) => x + y, 0);
  const max = Math.max(...arr);
  console.log(`formula ${k}: meanErr=${(sum/arr.length).toFixed(1)} maxErr=${max}`);
}
await page.close();
browser.disconnect();
