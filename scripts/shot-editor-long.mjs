import puppeteer from "puppeteer-core";
import path from "node:path";

const name = process.argv[2] ?? "移动端开发工程师简历模板";
const out = process.argv[3] ?? "C:/Users/WINDOWS11/AppData/Local/Temp/editor-long.png";
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1100 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:3000/templates", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("[data-catalog-card]", { timeout: 30000 });
const input = await page.$('input[aria-label="搜索模板"]');
await input.type(name);
await new Promise((r) => setTimeout(r, 700));
await page.evaluate((n) => {
  const card = [...document.querySelectorAll("[data-catalog-card]")].find((node) =>
    node.textContent.includes(n),
  );
  [...(card?.querySelectorAll("button") ?? [])]
    .find((node) => node.textContent.includes("使用此模板"))
    ?.click();
}, name);
await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1600));
const info = await page.evaluate(() => {
  const frame = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const doc = frame?.contentDocument;
  const main = doc?.querySelector(".main");
  return {
    iframeH: frame?.getBoundingClientRect().height,
    mainH: Math.round(main?.getBoundingClientRect().height ?? 0),
    badge: [...document.querySelectorAll("span")].map((s) => s.textContent).find((t) => t?.includes("210mm")),
  };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: out, fullPage: false });
console.log(out);
await page.close();
browser.disconnect();
