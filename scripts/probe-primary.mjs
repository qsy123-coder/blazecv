import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1200 },
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
await new Promise((r) => setTimeout(r, 1500));

const before = await page.evaluate(() => {
  const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const d = f.contentDocument;
  const hl = d.querySelector(".header-line");
  return { style: hl?.getAttribute("style"), bg: hl ? d.defaultView.getComputedStyle(hl).backgroundColor : null };
});
console.log("before", JSON.stringify(before));

// First change font size (as the acceptance flow does), then colour.
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "大")?.click());
await new Promise((r) => setTimeout(r, 900));
console.log("after 大:", JSON.stringify(await page.evaluate(() => {
  const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const hl = f.contentDocument.querySelector(".header-line");
  return { style: hl?.getAttribute("style"), bg: f.contentDocument.defaultView.getComputedStyle(hl).backgroundColor };
})));

const clicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button[aria-label="主色 #7c3aed"]')][0];
  b?.click();
  return Boolean(b);
});
console.log("clicked", clicked);
await new Promise((r) => setTimeout(r, 1200));

const after = await page.evaluate(() => {
  const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const d = f.contentDocument;
  const hl = d.querySelector(".header-line");
  const any7c = [...d.querySelectorAll("[style]")].filter((el) => (el.getAttribute("style") || "").toLowerCase().includes("7c3aed")).length;
  const sel = document.querySelector('button[aria-label="主色 #7c3aed"]')?.className;
  return { style: hl?.getAttribute("style"), bg: hl ? d.defaultView.getComputedStyle(hl).backgroundColor : null, any7c, btnClass: sel };
});
console.log("after", JSON.stringify(after));
await page.close();
browser.disconnect();
