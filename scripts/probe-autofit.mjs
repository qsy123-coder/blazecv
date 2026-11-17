// 验证「自动适配一页」的组合搜索：耗时、最终参数、页数与高度。
// usage: node scripts/probe-autofit.mjs [token]
import puppeteer from "puppeteer-core";
import { readFile, mkdir } from "node:fs/promises";

const ROOT = "F:/Projects/blazecv";
const OUT = `${ROOT}/tools/audit/autofit`;
await mkdir(OUT, { recursive: true });
const token = process.argv[2] ?? "cbd7600944137f93";
const catalog = JSON.parse(await readFile(`${ROOT}/public/template-catalog.json`, "utf8"));
const entry = catalog.templates.find((t) => t.token === token);
const content = JSON.parse(await readFile(`${ROOT}/public/template-content/${token}.json`, "utf8"));
const doc = {
  schemaVersion: 1,
  id: `resume_probe_fit_${Date.now()}`,
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
await new Promise((r) => setTimeout(r, 1500));

const snapshot = () =>
  page.evaluate(() => {
    const frame = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    const win = frame?.contentWindow;
    const main = frame?.contentDocument?.querySelector(".main");
    const cs = main && win ? win.getComputedStyle(main) : null;
    const ranges = [...document.querySelectorAll('input[type="range"]')].map((i) => ({
      max: i.max,
      value: i.value,
    }));
    const activeScale = [...document.querySelectorAll("button")].find((b) => {
      const cls = b.className || "";
      return cls.includes("bg-white text-slate-900 shadow-sm");
    })?.textContent?.trim();
    return {
      pages: document.querySelectorAll("[data-resume-page]").length,
      height: Number(frame?.getAttribute("height") ?? 0),
      fontSize: cs?.fontSize ?? "",
      lineHeight: cs?.lineHeight ?? "",
      paddingTop: cs?.paddingTop ?? "",
      paddingLeft: cs?.paddingLeft ?? "",
      ranges,
      activeScale,
      message: [...document.querySelectorAll("p")].map((p) => p.textContent || "").find((t) => t.includes("适配") || t.includes("一页")) ?? null,
    };
  });

console.log("before:", JSON.stringify(await snapshot()));

const started = Date.now();
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("自动适配一页"));
  b?.click();
});
// 轮询：按钮从“正在测算…”恢复即视为完成
let done = false;
for (let i = 0; i < 120; i += 1) {
  await new Promise((r) => setTimeout(r, 100));
  const busy = await page.evaluate(() =>
    [...document.querySelectorAll("button")].some((b) => b.textContent?.includes("正在测算")),
  );
  if (!busy) { done = true; break; }
}
const elapsed = Date.now() - started;
await new Promise((r) => setTimeout(r, 800));
console.log("elapsedMs:", elapsed, "finished:", done);
console.log("after:", JSON.stringify(await snapshot(), null, 1));

const el = await page.$("iframe[title=\"原站模板 1:1 预览\"]");
if (el) await el.screenshot({ path: `${OUT}/${token}-autofit.png` });
await page.close();
await browser.disconnect();
