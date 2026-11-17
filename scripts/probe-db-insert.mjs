// 验证：直接把一个模板文档写入 IndexedDB，再打开编辑器，渲染结果与原模板一致。
import puppeteer from "puppeteer-core";
import { readFile } from "node:fs/promises";

const token = process.argv[2] ?? "cbd7600944137f93";
const catalog = JSON.parse(await readFile("public/template-catalog.json", "utf8"));
const entry = catalog.templates.find((t) => t.token === token);
if (!entry) throw new Error("token not in catalog");
const content = JSON.parse(await readFile(`public/template-content/${token}.json`, "utf8"));

const doc = {
  schemaVersion: 1,
  id: `resume_batch_${token}`,
  title: content.title ?? entry.name,
  templateId: `wcx-${token}`,
  templatePreset: {
    id: `wcx-${token}`,
    name: entry.name,
    desc: entry.desc,
    layout: entry.layout,
    tags: entry.tags,
    source: { token, name: entry.sourceName },
    base: entry.tokens,
  },
  theme: { primary: "", fontScale: "md", lineHeight: 1.2, margin: 10 },
  basics: {
    name: "",
    jobTitle: "",
    phone: "",
    email: "",
    city: "",
    links: [],
    ...content.basics,
  },
  sections: content.sections ?? [],
  updatedAt: Date.now(),
};

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1500, deviceScaleFactor: 2 },
  protocolTimeout: 240000,
});
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
page.on("pageerror", (e) => console.log("PAGEERR", String(e?.message ?? e).slice(0, 200)));
await page.goto("http://127.0.0.1:3000/templates", { waitUntil: "domcontentloaded", timeout: 45000 });

await page.evaluate(async (record) => {
  const openDB = (version) =>
    new Promise((resolve, reject) => {
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
  if (!db.objectStoreNames.contains("resumes")) {
    db.close();
    db = await openDB(2);
  }
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["resumes", "settings"], "readwrite");
    tx.objectStore("resumes").put(record);
    tx.objectStore("settings").put({ key: "active-resume", value: record.id });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}, { id: doc.id, title: doc.title, updatedAt: doc.updatedAt, doc });

await page.goto(`http://127.0.0.1:3000/editor?id=${encodeURIComponent(doc.id)}`, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1800));
const info = await page.evaluate(() => {
  const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  return {
    src: f?.getAttribute("src"),
    height: f?.getAttribute("height"),
    pages: document.querySelectorAll("[data-resume-page]").length,
    title: document.title,
    badge: [...document.querySelectorAll("span")].map((s) => s.textContent).filter((t) => t?.includes("原站 DOM")),
    labels: [...document.querySelectorAll("div")].map((d) => d.textContent).filter((t) => t?.startsWith("原站模板渲染")).slice(0, 1),
    pageHasIframe: !!document.querySelector("[data-resume-page] iframe"),
  };
});
const shot = await page.screenshot({ type: "png" });
await import("node:fs/promises").then(({ writeFile }) => writeFile("tools/audit/compare/PROBE-DB.png", shot));
const pageEl = await page.$("[data-resume-page]");
if (pageEl) await pageEl.screenshot({ path: "tools/audit/compare/PROBE-PAGE.png" });
console.log(JSON.stringify({ token, docId: doc.id, info }, null, 2));
await page.close();
browser.disconnect();
