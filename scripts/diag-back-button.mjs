// 验证工具栏：返回箭头 = 上一页，Logo = 首页。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1400, height: 1000 },
  protocolTimeout: 120000,
});

async function openEditorFromTemplates(page) {
  await page.goto("http://127.0.0.1:3000/templates", { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("[data-catalog-card]", { timeout: 30000 });
  await page.evaluate(() => {
    const card = document.querySelector("[data-catalog-card]");
    [...(card?.querySelectorAll("button") ?? [])].find((b) => b.textContent.includes("使用此模板"))?.click();
  });
  await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
  await page.waitForSelector("[data-resume-page]", { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 400));
}

const a = await browser.newPage();
await a.setCacheEnabled(false);
await openEditorFromTemplates(a);
await a.click('button[aria-label="返回上一页"]');
await a.waitForFunction(() => location.pathname === "/templates", { timeout: 15000 });
console.log("A 返回箭头 ->", await a.evaluate(() => location.pathname));
await a.close();

const b = await browser.newPage();
await b.setCacheEnabled(false);
await openEditorFromTemplates(b);
await b.click('a[aria-label="返回首页"]');
await b.waitForFunction(() => location.pathname === "/", { timeout: 15000 });
console.log("B Logo ->", await b.evaluate(() => location.pathname));
await b.close();

await browser.disconnect();
