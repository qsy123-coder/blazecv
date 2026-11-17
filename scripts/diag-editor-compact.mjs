// 试验紧凑间距在不同宽高/左栏占比下能否消除滚动。
// usage: node scripts/diag-editor-compact.mjs [ratio]
import puppeteer from "puppeteer-core";

const ratio = Number(process.argv[2] ?? 0.6);
const cases = [
  [1366, 768],
  [1440, 900],
  [1600, 900],
  [1920, 1080],
];

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1920, height: 1080 },
  protocolTimeout: 120000,
});

for (const [width, height] of cases) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:3000/editor?cb=${Date.now()}`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("[data-resume-page]", { timeout: 30000 });
  const info = await page.evaluate(
    (r) => {
      const style = document.createElement("style");
      style.textContent = `
        .editor-panel { width: ${r * 100}vw !important; flex: 0 0 ${r * 100}vw !important; }
        .editor-cards { columns: 3 !important; column-gap: 8px !important; }
        .editor-cards > * { margin-bottom: 8px !important; }
        .editor-cards .p-3 { padding: 8px !important; }
        .editor-cards .p-2\\.5 { padding: 6px !important; }
        .editor-cards .py-2 { padding-top: 4px !important; padding-bottom: 4px !important; }
        .editor-cards .space-y-4 > * + * { margin-top: 8px !important; }
        .editor-cards .space-y-3 > * + * { margin-top: 8px !important; }
        .editor-cards .space-y-2 > * + * { margin-top: 6px !important; }
      `;
      document.head.appendChild(style);
      const aside = document.querySelector("aside");
      const cards = document.querySelector(".editor-cards");
      const header = aside.querySelector("div");
      return new Promise((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const avail = aside.clientHeight - Math.round(header.getBoundingClientRect().height) - 24;
            const h = Math.round(cards.getBoundingClientRect().height);
            resolve({
              avail,
              cardsH: h,
              fits: h <= avail,
              asideW: Math.round(aside.getBoundingClientRect().width),
            });
          }),
        ),
      );
    },
    ratio,
  );
  console.log(`${width}x${height} ratio=${ratio}`, JSON.stringify(info));
  await page.close();
}
await browser.disconnect();
