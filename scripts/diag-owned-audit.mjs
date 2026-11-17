// 复刻 /api/export-image 的「按需冷启动」渲染：同样的 launch 参数 + /audit?doc=，
// 测量元素坐标与字体，定位与编辑页的差异。
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
  defaultViewport: { width: 1000, height: 2600, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
const b64 = Buffer.from(JSON.stringify(doc)).toString("base64");
await page.goto(`http://127.0.0.1:3000/audit?doc=${encodeURIComponent(b64)}`, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await page.waitForFunction(() => document.querySelector("[data-audit-ready='1']"), { timeout: 45000 });
await page.evaluate(async () => {
  const frame = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const d = frame?.contentDocument;
  if (d) { try { await d.fonts.ready; } catch {} await Promise.all([...d.images].map((i) => i.decode().catch(() => undefined))); }
});
await new Promise((r) => setTimeout(r, 150));

const metrics = await page.evaluate(() => {
  const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const d = f?.contentDocument;
  if (!d) return { error: "no doc" };
  const top = (el) => Math.round(el.getBoundingClientRect().top * 100) / 100;
  const h = (el) => Math.round(el.getBoundingClientRect().height * 100) / 100;
  const cs = (el) => getComputedStyle(el);
  const h3s = [...d.querySelectorAll(".option h3, .option .title")].slice(0, 4);
  return {
    iframe: { w: f.getAttribute("width"), h: f.getAttribute("height"), innerH: f.contentWindow.innerHeight },
    docFonts: [...d.fonts].map((x) => `${x.family}:${x.status}`),
    options: [...d.querySelectorAll(".option")].slice(0, 4).map((el) => ({
      top: top(el), h: h(el), padding: cs(el).padding, margin: cs(el).margin,
    })),
    h3s: h3s.map((el) => ({
      t: el.textContent?.trim().slice(0, 8),
      top: top(el), h: h(el),
      font: cs(el).fontFamily, size: cs(el).fontSize, lh: cs(el).lineHeight,
      margin: cs(el).margin, padding: cs(el).padding, border: cs(el).borderBottomWidth,
    })),
    bodyFont: cs(d.body).fontFamily,
    mainFont: cs(d.querySelector(".main")).fontFamily,
  };
});
const frame = await page.$('iframe[title="原站模板 1:1 预览"]');
await frame.screenshot({ path: "tools/audit/compare/OWNED-AUDIT.png" });
console.log(JSON.stringify(metrics, null, 2));
await page.close();
await browser.close();
