// 同一 doc 在编辑页 iframe 与 /audit 渲染 iframe 中的元素坐标/CSS 对比。
import puppeteer from "puppeteer-core";
import { readFile } from "node:fs/promises";

const token = process.argv[2] ?? "d9d0ec05a0515f93";
const catalog = JSON.parse(await readFile("public/template-catalog.json", "utf8"));
const entry = catalog.templates.find((t) => t.token === token);
const content = JSON.parse(await readFile(`public/template-content/${token}.json`, "utf8"));
const doc = {
  schemaVersion: 1,
  id: `resume_batch_${token}`,
  title: content.title ?? entry.name,
  templateId: `wcx-${token}`,
  templatePreset: {
    id: `wcx-${token}`, name: entry.name, desc: entry.desc ?? "", layout: entry.layout,
    tags: entry.tags ?? [], source: { token, name: entry.sourceName ?? entry.name }, base: entry.tokens ?? {},
  },
  theme: { primary: "", fontScale: "md", lineHeight: 1.2, margin: 10 },
  basics: { name: "", jobTitle: "", phone: "", email: "", city: "", links: [], ...(content.basics ?? {}) },
  sections: content.sections ?? [],
  updatedAt: Date.now(),
};

const browser = await puppeteer.launch({
  executablePath: process.env.EXPORT_CHROME_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
  args: ["--no-sandbox"],
  defaultViewport: { width: 1500, height: 1500, deviceScaleFactor: 2 },
});

function metricsScript() {
  const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const d = f?.contentDocument;
  if (!d) return { error: "no doc" };
  const y = (el) => Math.round(el.getBoundingClientRect().top * 100) / 100;
  const h = (el) => Math.round(el.getBoundingClientRect().height * 100) / 100;
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const main = d.querySelector(".main");
  const contentEl = d.querySelector(".content");
  const header = d.querySelector(".header, .top, .profile, .cover");
  return {
    iframeH: f.getAttribute("height"),
    innerH: f.contentWindow.innerHeight,
    scrollH: d.documentElement.scrollHeight,
    main: main ? { top: y(main), h: h(main), fontSize: cs(main).fontSize, lineHeight: cs(main).lineHeight, padding: cs(main).padding, margin: cs(main).margin } : null,
    content: contentEl ? { top: y(contentEl), h: h(contentEl), padding: cs(contentEl).padding, margin: cs(contentEl).margin } : null,
    header: header ? { tag: header.className, top: y(header), h: h(header) } : null,
    options: [...d.querySelectorAll(".option")].slice(0, 8).map((el) => ({
      t: el.querySelector("h3,.title")?.textContent?.trim().slice(0, 10) ?? "",
      top: y(el), h: h(el),
      margin: cs(el).margin, padding: cs(el).padding,
    })),
    h3s: [...d.querySelectorAll(".option h3, .option .title")].slice(0, 8).map((el) => ({
      t: el.textContent?.trim().slice(0, 10) ?? "",
      top: y(el), h: h(el),
      fontSize: cs(el).fontSize, lineHeight: cs(el).lineHeight, margin: cs(el).margin, padding: cs(el).padding,
    })),
    bodySamples: [...d.querySelectorAll(".option li, .option p, .option .content, .option span")].slice(0, 6).map((el) => ({
      t: el.textContent?.trim().slice(0, 16) ?? "",
      font: cs(el).fontFamily, size: cs(el).fontSize, weight: cs(el).fontWeight,
      color: cs(el).color, smoothing: cs(el).webkitFontSmoothing,
    })),
  };
}

const page = await browser.newPage();
await page.goto("http://127.0.0.1:3000/favicon.ico", { waitUntil: "domcontentloaded" }).catch(() => undefined);
await page.evaluate(async (record) => {
  const openDB = (version) => new Promise((resolve, reject) => {
    const req = version ? indexedDB.open("blazecv", version) : indexedDB.open("blazecv");
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("resumes")) d.createObjectStore("resumes", { keyPath: "id" });
      if (!d.objectStoreNames.contains("settings")) d.createObjectStore("settings", { keyPath: "key" });
      if (!d.objectStoreNames.contains("versions")) d.createObjectStore("versions", { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  let db = await openDB();
  if (!db.objectStoreNames.contains("resumes")) { db.close(); db = await openDB(2); }
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["resumes", "settings"], "readwrite");
    tx.objectStore("resumes").put(record);
    tx.objectStore("settings").put({ key: "active-resume", value: record.id });
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  db.close();
}, { id: doc.id, title: doc.title, updatedAt: doc.updatedAt, doc });

await page.goto(`http://127.0.0.1:3000/editor?id=${encodeURIComponent(doc.id)}`, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 2000));
const editor = await page.evaluate(metricsScript);

const b64 = Buffer.from(JSON.stringify(doc)).toString("base64");
await page.goto(`http://127.0.0.1:3000/audit?doc=${encodeURIComponent(b64)}`, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await page.waitForFunction(() => document.querySelector("[data-audit-ready='1']"), { timeout: 45000 }).catch(() => undefined);
await new Promise((r) => setTimeout(r, 2000));
const audit = await page.evaluate(metricsScript);

console.log(JSON.stringify({ token, editor, audit }, null, 2));
await page.close();
await browser.close();
