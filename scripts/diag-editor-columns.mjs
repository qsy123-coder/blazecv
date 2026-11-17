// 试验不同视口/左栏宽度/列数下，左栏内容高度是否 <= 可用高度。
import puppeteer from "puppeteer-core";

const cases = [
  [1920, 1080, 0.52, 2],
  [1920, 1080, 0.6, 3],
  [1600, 900, 0.6, 2],
  [1600, 900, 0.6, 3],
  [1536, 864, 0.6, 3],
  [1440, 900, 0.6, 3],
  [1366, 768, 0.6, 3],
];

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1920, height: 1080 },
  protocolTimeout: 120000,
});

for (const [width, height, ratio, cols] of cases) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:3000/editor?cb=${Date.now()}`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("[data-resume-page]", { timeout: 30000 });
  const info = await page.evaluate(
    ([r, c]) => {
      const aside = document.querySelector("aside");
      aside.style.width = `${r * 100}vw`;
      aside.style.flex = `0 0 ${r * 100}vw`;
      aside.style.overflow = "visible";
      const cards = document.querySelector(".editor-cards");
      cards.style.columns = String(c);
      const header = Math.round(aside.querySelector("div").getBoundingClientRect().height);
      return new Promise((resolve) =>
        requestAnimationFrame(() =>
          resolve({
            asideW: Math.round(aside.getBoundingClientRect().width),
            clientH: aside.clientHeight,
            header,
            cardsH: Math.round(cards.getBoundingClientRect().height),
            avail: aside.clientHeight - header - 24,
            cols: c,
            ratio: r,
          }),
        ),
      );
    },
    [ratio, cols],
  );
  const fits = info.cardsH <= info.avail;
  console.log(`${width}x${height} ratio=${ratio} cols=${cols}`, JSON.stringify(info), fits ? "FITS" : "OVERFLOW");
  await page.close();
}
await browser.disconnect();
