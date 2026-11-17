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

const read = () => page.evaluate(() => {
  const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const m = f?.contentDocument?.querySelector(".main");
  if (!m) return null;
  const cs = f.contentDocument.defaultView.getComputedStyle(m);
  const header = f.contentDocument.querySelector(".header-line");
  const hc = header ? f.contentDocument.defaultView.getComputedStyle(header).backgroundColor : "";
  return { fontSize: cs.fontSize, lineHeight: cs.lineHeight, paddingTop: cs.paddingTop, height: Math.round(m.getBoundingClientRect().height), headerColor: hc };
});
console.log("base:", JSON.stringify(await read()));

await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "大")?.click());
await new Promise((r) => setTimeout(r, 900));
console.log("字号=大:", JSON.stringify(await read()));

await page.evaluate(() => {
  const el = [...document.querySelectorAll('input[type="range"]')].find((r) => (r.closest("div")?.parentElement?.textContent || "").includes("行距"));
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, "1.6"); el.dispatchEvent(new Event("input", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 900));
console.log("行距=1.6:", JSON.stringify(await read()));

await page.evaluate(() => {
  const ranges = [...document.querySelectorAll('input[type="range"]')];
  const el = ranges.find((r) => Number(r.max) >= 15); // 页边距滑块的 max 是 mm
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, "18"); el.dispatchEvent(new Event("input", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 900));
console.log("边距=18mm:", JSON.stringify(await read()));

const colorClicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button[aria-label^="主色"]')];
  // pick a non-default colour (the red one), fallback to index 3
  const red = btns.find((b) => /dc2127|e11d48|ef4444/i.test(b.getAttribute("aria-label") || "")) || btns[3] || btns[0];
  red?.click();
  return red?.getAttribute("aria-label");
});
await new Promise((r) => setTimeout(r, 900));
console.log("主色点击:", colorClicked, JSON.stringify(await read()));
await page.close();
browser.disconnect();
