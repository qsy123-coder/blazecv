import puppeteer from "puppeteer-core";

const token = process.argv[2];
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9227",
  defaultViewport: { width: 900, height: 2600, deviceScaleFactor: 1 },
  protocolTimeout: 300000,
});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:3000/audit?token=${token}`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await page.waitForFunction(
  () => document.querySelector("[data-audit-ready='1']"),
  { timeout: 60000 },
);
await new Promise((r) => setTimeout(r, 700));
const t0 = Date.now();
const frame = await page.$('iframe[title="原站模板 1:1 预览"]');
console.log("element found", Date.now() - t0, "ms");
const t1 = Date.now();
const shot = await frame.screenshot({ type: "png" });
console.log("screenshot taken", Date.now() - t1, "ms", shot.length, "bytes");
await page.close();
browser.disconnect();
