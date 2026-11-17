import puppeteer from "puppeteer-core";

const name = process.argv[2] ?? "应届生通用简历模板";
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
await new Promise((r) => setTimeout(r, 1500));

const readPreviewName = () =>
  page.evaluate(() => {
    const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    return f?.contentDocument?.querySelector(".user-name")?.textContent?.trim() ?? "?";
  });

const before = await readPreviewName();
console.log("preview name before:", before);

// Find the 姓名 input in the left panel (value === before) and change it.
const changed = await page.evaluate((oldName) => {
  const inputs = [...document.querySelectorAll("input")];
  const target =
    inputs.find((i) => i.value === oldName) ||
    inputs.find((i) => i.closest("label,div")?.textContent?.includes("姓名"));
  if (!target) return null;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(target, "测试改名XYZ");
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
  return target.value;
}, before);
console.log("input changed to:", changed);

await new Promise((r) => setTimeout(r, 1200));
const after = await readPreviewName();
console.log("preview name after:", after);
console.log(after.includes("测试改名XYZ") ? "SYNC OK" : "SYNC BROKEN");
await page.close();
browser.disconnect();
