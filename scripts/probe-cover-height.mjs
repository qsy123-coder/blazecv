import puppeteer from "puppeteer-core";
import sharp from "sharp";
import path from "node:path";

const tokens = process.argv.slice(2);
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9227",
  defaultViewport: { width: 900, height: 2200, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
for (const token of tokens) {
  let coverMeta = null;
  try {
    coverMeta = await sharp(
      path.join("F:/Projects/blazecv/public/template-thumbs", `${token}.webp`),
    ).metadata();
  } catch {}
  await page.goto(`http://127.0.0.1:3000/template-pages/${token}.html`, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 600));
  const info = await page.evaluate(() => {
    const main = document.querySelector(".main");
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
      fontSize: getComputedStyle(main).fontSize,
      lineHeight: main.style.lineHeight || getComputedStyle(main).lineHeight,
      mainH: Math.round(main.getBoundingClientRect().height),
    };
  });
  const coverHeightAt794 = coverMeta
    ? Math.round((coverMeta.height / coverMeta.width) * 794)
    : null;
  console.log(
    JSON.stringify({
      token,
      cover: coverMeta ? `${coverMeta.width}x${coverMeta.height}` : null,
      coverHeightAt794,
      naturalBottom: info.contentBottom,
      expectedPageHeight: Math.max(1123, info.contentBottom),
      lineHeight: info.lineHeight,
    }),
  );
}
await page.close();
browser.disconnect();
