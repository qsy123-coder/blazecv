// 诊断两行头部后 Tab 点击不滚动的原因。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9227",
  defaultViewport: { width: 1600, height: 1000 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:3000/editor?cb=${Date.now()}`, { waitUntil: "networkidle2", timeout: 60000 });
await page.evaluate(() => localStorage.setItem("blazecv.editor-width", "420"));
await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('[role="separator"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 800));

const info = await page.evaluate(() => {
  const aside = document.querySelector("aside");
  const cards = document.querySelector(".editor-cards");
  const themeCard = document.querySelector("#editor-card-theme");
  const before = { scrollTop: aside.scrollTop, scrollH: aside.scrollHeight, clientH: aside.clientHeight };
  themeCard.scrollIntoView({ block: "start" });
  const afterScrollIntoView = aside.scrollTop;
  aside.scrollTop = 0;
  aside.scrollTo({ top: 600 });
  const afterScrollTo = aside.scrollTop;
  aside.scrollTop = 0;
  return {
    before,
    afterScrollIntoView,
    afterScrollTo,
    overflow: getComputedStyle(aside).overflowY,
    cardsOverflow: getComputedStyle(cards).overflow,
    position: getComputedStyle(themeCard).position,
    scrollMargin: getComputedStyle(themeCard).scrollMarginTop,
    themeTop: Math.round(themeCard.getBoundingClientRect().top),
  };
});
console.log(JSON.stringify(info, null, 1));
await page.close();
await browser.disconnect();
