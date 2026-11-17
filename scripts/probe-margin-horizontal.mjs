// 验证页边距滑块同时改变左右内容留白（且不影响全幅背景）。
// usage: node scripts/probe-margin-horizontal.mjs [token]
import puppeteer from "puppeteer-core";
import { readFile, mkdir } from "node:fs/promises";

const ROOT = "F:/Projects/blazecv";
const OUT = `${ROOT}/tools/audit/margin-probe`;
await mkdir(OUT, { recursive: true });
const token = process.argv[2] ?? "bbb107de5b600df0";
const catalog = JSON.parse(await readFile(`${ROOT}/public/template-catalog.json`, "utf8"));
const entry = catalog.templates.find((t) => t.token === token);
const content = JSON.parse(await readFile(`${ROOT}/public/template-content/${token}.json`, "utf8"));
const doc = {
  schemaVersion: 1,
  id: `resume_probe_margin_${Date.now()}`,
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
  defaultViewport: { width: 1500, height: 1300, deviceScaleFactor: 1 },
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

await page.goto(`http://127.0.0.1:3000/editor?id=${encodeURIComponent(doc.id)}&cb=${Date.now()}`, {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200));

const measure = () =>
  page.evaluate(() => {
    const frame = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    const d = frame?.contentDocument;
    const win = frame?.contentWindow;
    if (!d || !win) return null;
    const main = d.querySelector(".main");
    const info = (sel) => {
      const el = d.querySelector(sel);
      if (!el) return null;
      const cs = win.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        w: Math.round(r.width),
        ml: cs.marginLeft,
        mr: cs.marginRight,
        pl: cs.paddingLeft,
        pr: cs.paddingRight,
      };
    };
    return {
      mainPad: win.getComputedStyle(main).padding,
      user: info(".user"),
      title: info(".module-title-wrapper"),
      item: info(".section-item-container"),
      firstOption: info(".content .option"),
      pattern: info("img.cv-pattern"),
      headerLine: info(".header-line"),
      height: Number(frame.getAttribute("height") ?? 0),
    };
  });

const setMargin = async (value) => {
  await page.evaluate((v) => {
    const inputs = [...document.querySelectorAll('input[type="range"]')];
    const el = inputs.find((i) => i.max === "22") ?? inputs[inputs.length - 1];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await new Promise((r) => setTimeout(r, 900));
};

const shot = async (name) => {
  const el = await page.$("[data-resume-page]");
  if (el) await el.screenshot({ path: `${OUT}/${token}-margin-${name}.png` });
};

console.log("== 10mm (neutral)", JSON.stringify(await measure()));
await shot("10");

await setMargin(14);
console.log("== 14mm", JSON.stringify(await measure()));
await shot("14");

await setMargin(4);
console.log("== 4mm", JSON.stringify(await measure()));
await shot("4");

await page.close();
await browser.disconnect();
