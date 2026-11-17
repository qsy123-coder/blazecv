import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9230",
  defaultViewport: { width: 1500, height: 1400, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:3000/resumes", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));

async function snapshot(label) {
  const state = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("[data-resume-card]")];
    return {
      y: Math.round(window.scrollY),
      cards: cards.length,
      iframes: document.querySelectorAll("iframe").length,
      bound: [...document.querySelectorAll("iframe")].filter(
        (f) => !!f.contentDocument?.querySelector("#cv-container .user-name"),
      ).length,
      placeholders: [...document.querySelectorAll("[data-resume-card]")].filter(
        (c) => !c.querySelector("iframe") && c.innerText.includes("预览"),
      ).length,
    };
  });
  console.log(label, JSON.stringify(state));
}

await snapshot("top");
const height = await page.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y <= height; y += 700) {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await new Promise((r) => setTimeout(r, 450));
}
await new Promise((r) => setTimeout(r, 2500));
await snapshot("after scroll");
await page.evaluate(() => window.scrollTo(0, 0));
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({
  path: "F:/Projects/blazecv/tools/audit/compare/RESUMES-AFTER-SCROLL.png",
  fullPage: true,
  captureBeyondViewport: true,
});
await page.close();
await browser.disconnect();
