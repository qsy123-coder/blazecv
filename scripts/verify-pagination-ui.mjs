import puppeteer from "puppeteer-core";

const name = process.argv[2] ?? "2026用户运营应届生简历模板";
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1200 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:3000/templates", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("[data-catalog-card]", { timeout: 30000 });
const input = await page.$('input[aria-label="搜索模板"]');
await input.type(name);
await new Promise((r) => setTimeout(r, 700));
await page.evaluate((n) => {
  const card = [...document.querySelectorAll("[data-catalog-card]")].find((c) => c.textContent.includes(n));
  [...(card?.querySelectorAll("button") ?? [])].find((b) => b.textContent.includes("使用此模板"))?.click();
}, name);
await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1800));
const info = await page.evaluate(() => {
  const pages = document.querySelectorAll("[data-resume-page]").length;
  const labels = [...document.querySelectorAll("div")].map((d) => d.textContent || "").filter((t) => /共\s*\d+\s*页/.test(t));
  const label = labels.length ? labels[labels.length - 1].match(/共\s*\d+\s*页/)?.[0] : "";
  return { renderedPages: pages, label };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: "C:/Users/WINDOWS11/AppData/Local/Temp/pagination-ui.png" });
await page.close();
browser.disconnect();
