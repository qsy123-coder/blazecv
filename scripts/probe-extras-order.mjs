import puppeteer from "puppeteer-core";

const token = process.argv[2];
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 900, height: 2600, deviceScaleFactor: 1 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.setRequestInterception(true).catch(() => undefined);
page.on("request", (req) => {
  try {
    const u = req.url();
    const host = u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("about:") ? "" : new URL(u).host;
    if (!host || /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(host)) req.continue().catch(() => {});
    else req.abort().catch(() => {});
  } catch {
    req.continue().catch(() => {});
  }
});
await page.goto(`http://127.0.0.1:3000/audit?token=${token}`, {
  waitUntil: "domcontentloaded",
  timeout: 45000,
});
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await page.waitForFunction(() => document.querySelector("[data-audit-ready='1']"), { timeout: 45000 });
await new Promise((r) => setTimeout(r, 250));
const labels = () => {
  const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const d = f.contentDocument;
  const opt = d.querySelector(".option.extras");
  const icon = [...opt.querySelectorAll(".extras-icon-item")].map((n) => n.querySelector(".extras-icon-title")?.textContent?.trim());
  const li = [...opt.querySelectorAll("li.extras-item")].map((n) => n.textContent.slice(0, 10));
  return { icon, li };
};
console.log("RAW", JSON.stringify(await page.evaluate(labels)));
await page.evaluate(async () => (typeof window.__auditApply === "function" ? await window.__auditApply() : 0));
await new Promise((r) => setTimeout(r, 250));
console.log("BOUND", JSON.stringify(await page.evaluate(labels)));
await page.close();
browser.disconnect();
