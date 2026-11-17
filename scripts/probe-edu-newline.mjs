// 复现/验证：exact 模板的教育「补充」多行 -> 预览圆点条目。
// usage: node scripts/probe-edu-newline.mjs [token]
import puppeteer from "puppeteer-core";
import { readFile } from "node:fs/promises";

const ROOT = "F:/Projects/blazecv";
const token = process.argv[2] ?? "-7BQQyo";
const catalog = JSON.parse(await readFile(`${ROOT}/public/template-catalog.json`, "utf8"));
const entry = catalog.templates.find((t) => t.token === token);
if (!entry) throw new Error(`no catalog entry for ${token}`);
const content = JSON.parse(await readFile(`${ROOT}/public/template-content/${token}.json`, "utf8"));
const doc = {
  schemaVersion: 1,
  id: `resume_probe_edu_${Date.now()}`,
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
  defaultViewport: { width: 1500, height: 1400, deviceScaleFactor: 1 },
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
  let db = await openDB();
  if (!db.objectStoreNames.contains("resumes")) {
    db.close();
    db = await openDB(2);
  }
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
await new Promise((r) => setTimeout(r, 1200));

const found = await page.evaluate(() => {
  const areas = [...document.querySelectorAll("textarea")];
  const target = areas.find((a) => (a.placeholder || "").includes("GPA"));
  if (!target) return { found: false };
  target.focus();
  target.setSelectionRange(target.value.length, target.value.length);
  return { found: true, value: target.value, rows: target.rows };
});
console.log("textarea:", JSON.stringify(found));
if (!found.found) {
  await page.close();
  await browser.disconnect();
  process.exit(1);
}

await page.keyboard.type("GPA 3.9 / 专业前 5%");
await page.keyboard.press("Enter");
await page.keyboard.type("校级三好学生");
await page.keyboard.press("Enter");
await page.keyboard.type("国家奖学金");
await new Promise((r) => setTimeout(r, 800));

const afterTyping = await page.evaluate(() => {
  const area = [...document.querySelectorAll("textarea")].find((a) => (a.placeholder || "").includes("GPA"));
  return { value: area?.value ?? null, lineCount: (area?.value ?? "").split("\n").length };
});
console.log("after typing:", JSON.stringify(afterTyping));

const preview = await page.evaluate(() => {
  const frame = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const root = frame?.contentDocument?.querySelector("#cv-container");
  if (!root) return null;
  return [...root.querySelectorAll(".option")]
    .map((opt) => ({
      title: opt.querySelector(".module-title-wrapper .title")?.textContent?.trim() ?? "",
      liTexts: [...opt.querySelectorAll(".menu-content li")].map((li) => li.textContent?.trim()),
      menuContentHtml: opt.querySelector(".menu-content")?.innerHTML?.slice(0, 300) ?? null,
    }))
    .filter((o) => o.title.includes("教育"));
});
console.log("preview education:", JSON.stringify(preview, null, 2));

const frameEl = await page.$('iframe[title="原站模板 1:1 预览"]');
if (frameEl) await frameEl.screenshot({ path: "tools/audit/compare/EDU-EXACT-FULL.png" }).catch(() => undefined);

await page.close();
await browser.disconnect();
