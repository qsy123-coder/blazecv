// 实测编辑页左栏是否出现纵向滚动条（当前真实 CSS）。
import puppeteer from "puppeteer-core";

const sizes = [
  [1920, 1080],
  [1600, 900],
  [1536, 864],
  [1440, 900],
  [1366, 768],
  [1280, 800],
];

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1920, height: 1080 },
  protocolTimeout: 120000,
});

for (const [width, height] of sizes) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:3000/editor?cb=${Date.now()}`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("[data-resume-page]", { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 700));
  const info = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    const cards = document.querySelector(".editor-cards");
    return {
      asideW: Math.round(aside.getBoundingClientRect().width),
      clientH: aside.clientHeight,
      scrollH: aside.scrollHeight,
      scrollbar: aside.scrollHeight > aside.clientHeight,
      cols: getComputedStyle(cards).columnCount,
      cardsH: Math.round(cards.getBoundingClientRect().height),
      previewW: (() => {
        const p = document.querySelector("section.flex.min-w-0");
        return p ? Math.round(p.getBoundingClientRect().width) : null;
      })(),
    };
  });
  console.log(`${width}x${height}`, JSON.stringify(info));
  await page.close();
}
await browser.disconnect();
