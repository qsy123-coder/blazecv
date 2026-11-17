// 截图预览：64vw + 3 列 + 紧凑间距在 1366x768 与 1920x1080 的效果。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1920, height: 1080 },
  protocolTimeout: 120000,
});
for (const [w, h] of [
  [1366, 768],
  [1920, 1080],
]) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:3000/editor?cb=${Date.now()}`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("[data-resume-page]", { timeout: 30000 });
  await page.evaluate(() => {
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
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: `tools/audit/compare/EDITOR-COMPACT-${w}x${h}.png` });
  console.log("saved", w, h);
  await page.close();
}
await browser.disconnect();
