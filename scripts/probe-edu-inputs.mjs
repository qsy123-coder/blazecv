import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1300 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:3000/templates", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("[data-catalog-card]", { timeout: 30000 });
const input = await page.$('input[aria-label="搜索模板"]');
await input.type("应届生通用简历模板");
await new Promise((r) => setTimeout(r, 700));
await page.evaluate(() => {
  const card = [...document.querySelectorAll("[data-catalog-card]")].find((c) => c.textContent.includes("应届生通用"));
  [...(card?.querySelectorAll("button") ?? [])].find((b) => b.textContent.includes("使用此模板"))?.click();
});
await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1600));

await page.evaluate(() => {
  const summary = [...document.querySelectorAll("summary")].find((s) => s.textContent?.includes("添加模块"));
  summary?.click();
});
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "教育经历")?.click();
});
await new Promise((r) => setTimeout(r, 1500));

const info = await page.evaluate(() =>
  [...document.querySelectorAll("input,textarea")]
    .map((i) => ({ tag: i.tagName, ph: i.getAttribute("placeholder") || "", val: (i.value || "").slice(0, 12) }))
    .filter((i) => i.tag !== "FILE")
    .slice(-14),
);
console.log(JSON.stringify(info, null, 1));
await page.close();
browser.disconnect();
