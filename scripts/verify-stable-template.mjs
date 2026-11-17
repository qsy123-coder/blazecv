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
await input.type("实习生通用简历模板");
await new Promise((r) => setTimeout(r, 700));
await page.evaluate(() => {
  const card = [...document.querySelectorAll("[data-catalog-card]")].find((c) => c.textContent.includes("实习生通用"));
  [...(card?.querySelectorAll("button") ?? [])].find((b) => b.textContent.includes("使用此模板"))?.click();
});
await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1600));

const state = () =>
  page.evaluate(() => {
    const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    const src = f?.getAttribute("src") || "";
    const token = src.split("/").pop()?.replace(/\.html$/, "") || "";
    const exact = Boolean(f);
    const mapped = document.querySelectorAll(".app-shell [data-resume-page]").length;
    return { token, exact, mapped };
  });

const s0 = await state();
console.log("initial", JSON.stringify(s0));

const steps = [];
steps.push([
  "改字号=大",
  () => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "大")?.click(),
]);
steps.push([
  "拖行距=1.6",
  () => {
    const el = [...document.querySelectorAll('input[type="range"]')].find((r) => Number(r.max) < 5);
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (el) { set?.call(el, "1.6"); el.dispatchEvent(new Event("input", { bubbles: true })); }
  },
]);
steps.push([
  "拖页边距=16",
  () => {
    const el = [...document.querySelectorAll('input[type="range"]')].find((r) => Number(r.max) >= 15);
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (el) { set?.call(el, "16"); el.dispatchEvent(new Event("input", { bubbles: true })); }
  },
]);
steps.push([
  "改主色",
  () => [...document.querySelectorAll('button[aria-label="主色 #7c3aed"]')][0]?.click(),
]);

let ok = true;
for (const [name, fn] of steps) {
  await page.evaluate(fn);
  await new Promise((r) => setTimeout(r, 1200));
  const s = await state();
  const stable = s.exact && s.token === s0.token;
  if (!stable) ok = false;
  console.log(`${stable ? "PASS" : "FAIL"} ${name} — token=${s.token} exact=${s.exact}`);
}
console.log(ok ? "STABLE: never switched template" : "UNSTABLE: template switched");
await page.close();
browser.disconnect();
