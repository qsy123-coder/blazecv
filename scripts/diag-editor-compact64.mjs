// 璇曢獙绱у噾闂磋窛鍦?1366x768 / 3 鍒椾笅鑳藉惁娑堥櫎婊氬姩銆?import puppeteer from "puppeteer-core";

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
  const info = await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = `
      .editor-panel { width: 64vw !important; flex: 0 0 64vw !important; }
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
          resolve({ avail, cardsH: h, fits: h <= avail, asideW: Math.round(aside.getBoundingClientRect().width) });
        }),
      ),
    );
  });
  console.log(`${width}x${height}`, JSON.stringify(info));
  await page.close();
}
await browser.disconnect();

