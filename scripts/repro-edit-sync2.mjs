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

const previewSummary = () =>
  page.evaluate(() => {
    const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    const opt = f?.contentDocument?.querySelector(".option.personal_summary .menu-content");
    return opt?.textContent?.trim().slice(0, 40) ?? "?";
  });

console.log("summary before:", await previewSummary());

// Edit the summary textarea (contains the summary content).
const edited = await page.evaluate(() => {
  const tas = [...document.querySelectorAll("textarea")];
  const t = tas.find((x) => x.value.length > 20);
  if (!t) return { ok: false, count: tas.length, values: tas.map((x) => x.value.slice(0, 20)) };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(t, "【同步测试】这是左侧修改后的总结内容ABC");
  t.dispatchEvent(new Event("input", { bubbles: true }));
  t.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true, val: t.value.slice(0, 30), count: tas.length };
});
console.log("textarea edit:", JSON.stringify(edited));

await new Promise((r) => setTimeout(r, 1500));
console.log("summary after:", await previewSummary());

// Also test bullet edit: find input holding a bullet text.
const bullet = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll("input")];
  const b = inputs.find((i) => i.value.startsWith("参与市场调研"));
  if (!b) return null;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(b, "【要点同步测试】改后的第一条要点");
  b.dispatchEvent(new Event("input", { bubbles: true }));
  b.dispatchEvent(new Event("change", { bubbles: true }));
  return b.value;
});
console.log("bullet edit:", bullet);
await new Promise((r) => setTimeout(r, 1500));
const bulletAfter = await page.evaluate(() => {
  const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  return f?.contentDocument?.body?.textContent?.includes("【要点同步测试】") ?? false;
});
console.log("bullet reflected:", bulletAfter);
await page.close();
browser.disconnect();
