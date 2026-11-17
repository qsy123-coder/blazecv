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

const readMain = () =>
  page.evaluate(() => {
    const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    const d = f?.contentDocument;
    const m = d?.querySelector(".main");
    if (!m) return null;
    const cs = d.defaultView.getComputedStyle(m);
    return { fontSize: cs.fontSize, lineHeight: cs.lineHeight, height: Math.round(m.getBoundingClientRect().height) };
  });

console.log("before:", JSON.stringify(await readMain()));

// Click 大 (fontScale lg)
const clicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "大");
  b?.click();
  return Boolean(b);
});
console.log("clicked 大:", clicked);
await new Promise((r) => setTimeout(r, 1200));
console.log("after 大:", JSON.stringify(await readMain()));

// Move 行距 slider (range input) to higher value.
const slider = await page.evaluate(() => {
  const ranges = [...document.querySelectorAll('input[type="range"]')];
  // find the one near label 行距
  const el = ranges.find((r) => {
    const t = r.closest("div")?.parentElement?.textContent || "";
    return t.includes("行距");
  }) || ranges[0];
  if (!el) return null;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, "1.6");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return el.value;
});
console.log("slider set:", slider);
await new Promise((r) => setTimeout(r, 1200));
console.log("after lineHeight:", JSON.stringify(await readMain()));
await page.close();
browser.disconnect();
