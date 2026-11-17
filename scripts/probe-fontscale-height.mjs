// 验证：字号变化是否同比例压缩行高（进而改变自然高度），以及行距滑块的作用范围。
// usage: node scripts/probe-fontscale-height.mjs [token]
import puppeteer from "puppeteer-core";
import { readFile } from "node:fs/promises";

const ROOT = "F:/Projects/blazecv";
const token = process.argv[2] ?? "bbb107de5b600df0";
const catalog = JSON.parse(await readFile(`${ROOT}/public/template-catalog.json`, "utf8"));
const entry = catalog.templates.find((t) => t.token === token);
const content = JSON.parse(await readFile(`${ROOT}/public/template-content/${token}.json`, "utf8"));
const doc = {
  schemaVersion: 1,
  id: `resume_probe_font_${Date.now()}`,
  title: content.title ?? entry.name,
  templateId: `wcx-${token}`,
  templatePreset: {
    id: `wcx-${token}`,
    name: entry.name,
    layout: entry.layout,
    tags: entry.tags ?? [],
    source: { token, name: entry.sourceName ?? entry.name },
    base: entry.tokens ?? {},
  },
  theme: { primary: "", fontScale: "md", lineHeight: 1.2, margin: 10 },
  basics: { name: "", jobTitle: "", phone: "", email: "", city: "", links: [], ...(content.basics ?? {}) },
  sections: content.sections ?? [],
  updatedAt: Date.now(),
};

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1300 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.goto("http://127.0.0.1:3000/favicon.ico", { waitUntil: "domcontentloaded" }).catch(() => undefined);
await page.evaluate(async (record) => {
  const openDB = (version) =>
    new Promise((resolve, reject) => {
      const req = version ? indexedDB.open("blazecv", version) : indexedDB.open("blazecv");
      req.onupgradeneeded = () => {
        const d = req.result;
        ["resumes", "settings", "versions"].forEach((name, i) => {
          if (!d.objectStoreNames.contains(name)) {
            d.createObjectStore(name, i === 0 ? { keyPath: "id" } : i === 1 ? { keyPath: "key" } : { keyPath: "id", autoIncrement: true });
          }
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["resumes", "settings"], "readwrite");
    tx.objectStore("resumes").put({ id: record.id, title: record.title, updatedAt: record.updatedAt, doc: record });
    tx.objectStore("settings").put({ key: "active-resume", value: record.id });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}, doc);

await page.goto(`http://127.0.0.1:3000/editor?id=${encodeURIComponent(doc.id)}&cb=${Date.now()}`, { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));

const height = () =>
  page.evaluate(() => ({
    h: Number(document.querySelector('iframe[title="原站模板 1:1 预览"]')?.getAttribute("height") ?? 0),
    pages: document.querySelectorAll("[data-resume-page]").length,
  }));

const clickScale = async (label) => {
  await page.evaluate((text) => {
    const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === text);
    btn?.click();
  }, label);
  await new Promise((r) => setTimeout(r, 800));
};

const setRange = async (index, value) => {
  await page.evaluate(([i, v]) => {
    const inputs = [...document.querySelectorAll('input[type="range"]')];
    const el = inputs[i];
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, [index, value]);
  await new Promise((r) => setTimeout(r, 800));
};

const rows = [];
rows.push(["标准/md", await height()]);
await clickScale("特小");
rows.push(["特小/xs", await height()]);
await clickScale("大");
rows.push(["大/lg", await height()]);
await clickScale("标准");
rows.push(["回标准", await height()]);
await setRange(0, 1.0);
rows.push(["行距1.00", await height()]);
await setRange(0, 1.4);
rows.push(["行距1.40", await height()]);

for (const [label, info] of rows) console.log(label, JSON.stringify(info));
await page.close();
await browser.disconnect();
