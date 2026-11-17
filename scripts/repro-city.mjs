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

// Locate the 所在城市 input by its label.
const info = await page.evaluate(() => {
  const labels = [...document.querySelectorAll("label,div,span")];
  const cityLabel = labels.find((l) => l.textContent?.trim() === "所在城市");
  let input = null;
  if (cityLabel) {
    const container = cityLabel.closest("div")?.parentElement;
    input = container?.querySelector("input") ?? null;
  }
  if (!input) {
    // fallback: input with value 北京
    input = [...document.querySelectorAll("input")].find((i) => i.value === "北京") ?? null;
  }
  return { found: Boolean(input), value: input?.value, readOnly: input?.readOnly, disabled: input?.disabled, type: input?.type };
});
console.log("city input:", JSON.stringify(info));

if (info.found) {
  const res = await page.evaluate(() => {
    const input = [...document.querySelectorAll("input")].find((i) => i.value === "北京");
    if (!input) return { ok: false };
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "上海测试");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, now: input.value };
  });
  console.log("set result:", JSON.stringify(res));
  await new Promise((r) => setTimeout(r, 1200));
  const preview = await page.evaluate(() => {
    const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    return f?.contentDocument?.body?.textContent?.includes("上海测试") ?? false;
  });
  const stillThere = await page.evaluate(() => [...document.querySelectorAll("input")].some((i) => i.value === "上海测试"));
  console.log("preview shows 上海测试:", preview, "| input keeps value:", stillThere);
}
await page.close();
browser.disconnect();
