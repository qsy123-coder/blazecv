// 抓取「模板库点使用此模板」创建的真实 doc，用于与批量脚本直接构造的 doc 对比。
import puppeteer from "puppeteer-core";
import { writeFile } from "node:fs/promises";

const name = process.argv[2] ?? "应届生通用简历模板";
const browser = await puppeteer.launch({
  executablePath: process.env.EXPORT_CHROME_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
  args: ["--no-sandbox"],
  defaultViewport: { width: 1500, height: 1500, deviceScaleFactor: 2 },
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
await new Promise((r) => setTimeout(r, 1200));

const doc = await page.evaluate(async () => {
  const open = () => new Promise((resolve, reject) => {
    const req = indexedDB.open("blazecv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const db = await open();
  const read = (store, key) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = key === undefined ? tx.objectStore(store).getAll() : tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const active = await read("settings", "active-resume");
  const record = active?.value ? await read("resumes", active.value) : null;
  db.close();
  return record?.doc ?? null;
});
await writeFile("tools/audit/compare/UI-DOC.json", JSON.stringify(doc, null, 2), "utf8");
const info = await page.evaluate(() => ({
  badge: [...document.querySelectorAll("span")].map((s) => s.textContent).filter((t) => t?.includes("原站 DOM")),
  labels: [...document.querySelectorAll("div")].map((d) => d.textContent).filter((t) => t?.startsWith("原站模板渲染")).slice(0, 1),
  pages: document.querySelectorAll("[data-resume-page]").length,
  iframes: document.querySelectorAll('iframe[title="原站模板 1:1 预览"]').length,
  pageHasIframe: !!document.querySelector("[data-resume-page] iframe"),
  height: document.querySelector('iframe[title="原站模板 1:1 预览"]')?.getAttribute("height"),
}));
const pageEl = await page.$("[data-resume-page]");
if (pageEl) await pageEl.screenshot({ path: "tools/audit/compare/UI-PAGE.png" });
console.log(JSON.stringify({ name, docId: doc?.id, templateId: doc?.templateId, presetId: doc?.templatePreset?.id, info }, null, 2));
await page.close();
await browser.close();
