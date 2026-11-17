// 验证假设：编辑页 [data-resume-page] 的 210mm/297mm + scale(793.7/794) 会让预览内容
// 以 99.96% 渲染，和真实导出（794 CSS px × DPR2）产生系统性亚像素差。
// 做法：同一份文档截两次第 1 页——原样 vs 把页面盒子和内层 scale 改成 794×1123/1:1，
// 再和真实导出 PNG 比较 mean/changedPct。
//
// 用法：node scripts/probe-scale1-vs-export.mjs <token> [token...]
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

sharp.cache(false);
const ROOT = "F:/Projects/blazecv";
const OUT = path.join(ROOT, "tools/audit/scale-probe");
await mkdir(OUT, { recursive: true });
const catalog = JSON.parse(await readFile(path.join(ROOT, "public/template-catalog.json"), "utf8"));
const byToken = new Map(catalog.templates.map((t) => [t.token, t]));
const tokens = process.argv.slice(2);
if (tokens.length === 0) tokens.push("bbb107de5b600df0");

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1500, deviceScaleFactor: 2 },
  protocolTimeout: 240000,
});

function buildDoc(token, entry, content) {
  return {
    schemaVersion: 1,
    id: `resume_probe_${token}`,
    title: content?.title ?? entry.name,
    templateId: `wcx-${token}`,
    templatePreset: {
      id: `wcx-${token}`,
      name: entry.name,
      desc: entry.desc ?? "",
      layout: entry.layout,
      tags: entry.tags ?? [],
      source: { token, name: entry.sourceName ?? entry.name },
      base: entry.tokens ?? {},
    },
    theme: { primary: "", fontScale: "md", lineHeight: 1.2, margin: 10 },
    basics: { name: "", jobTitle: "", phone: "", email: "", city: "", links: [], ...(content?.basics ?? {}) },
    sections: content?.sections ?? [],
    updatedAt: Date.now(),
  };
}

async function insertDoc(page, doc) {
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
}

// ---- 对比（与 export-batch 相同的对齐/残差） ----
async function gray(buf) {
  const { data, info } = await sharp(buf).grayscale().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
async function rgb(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}
async function mask(buf, factor, w0, h0) {
  const { data, info } = await sharp(buf)
    .resize({ width: Math.round(w0 / factor), height: Math.round(h0 / factor), fit: "fill" })
    .grayscale().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
function score(A, B, dx, dy) {
  const x0 = Math.max(0, dx), x1 = Math.min(A.w, A.w + dx);
  const y0 = Math.max(0, dy), y1 = Math.min(A.h, A.h + dy);
  let inter = 0, ca = 0, cb = 0;
  for (let y = y0; y < y1; y += 1)
    for (let x = x0; x < x1; x += 1) {
      const av = A.data[y * A.w + x] < 230 ? 1 : 0;
      const bv = B.data[(y - dy) * B.w + (x - dx)] < 230 ? 1 : 0;
      if (av && bv) inter += 1;
      ca += av; cb += bv;
    }
  return ca && cb ? inter / Math.sqrt(ca * cb) : 0;
}
async function align(bufA, bufB) {
  const A4 = await mask(bufA, 4, 1588, 2246);
  const B4 = await mask(bufB, 4, 1588, 2246);
  let best = { dx: 0, dy: 0, s: -1 };
  for (let dy = -23; dy <= 23; dy += 1)
    for (let dx = -4; dx <= 4; dx += 1) {
      const s = score(A4, B4, dx, dy);
      if (s > best.s) best = { dx, dy, s };
    }
  const A2 = await mask(bufA, 2, 1588, 2246);
  const B2 = await mask(bufB, 2, 1588, 2246);
  let fine = { dx: best.dx * 4, dy: best.dy * 4, s: -1 };
  for (let dy = best.dy * 4 - 6; dy <= best.dy * 4 + 6; dy += 2)
    for (let dx = best.dx * 4 - 6; dx <= best.dx * 4 + 6; dx += 2) {
      const s = score(A2, B2, Math.round(dx / 2), Math.round(dy / 2));
      if (s > fine.s) fine = { dx, dy, s };
    }
  return { dx: Math.max(-16, Math.min(16, fine.dx)), dy: Math.max(-90, Math.min(90, fine.dy)) };
}
async function compare(bufA, bufB) {
  const A = await rgb(bufA);
  const B = await rgb(bufB);
  const { dx, dy } = await align(bufA, bufB);
  const ch = 3;
  const W = Math.min(A.w, B.w), H = Math.min(A.h, B.h);
  const x0 = Math.max(0, dx), x1 = Math.min(W, W + dx);
  const y0 = Math.max(0, dy), y1 = Math.min(H, H + dy);
  let sum = 0, changed = 0, n = 0;
  for (let y = y0; y < y1; y += 1)
    for (let x = x0; x < x1; x += 1) {
      const ai = (y * A.w + x) * ch;
      const bi = ((y - dy) * B.w + (x - dx)) * ch;
      const d0 = Math.abs(A.data[ai] - B.data[bi]);
      const d1 = Math.abs(A.data[ai + 1] - B.data[bi + 1]);
      const d2 = Math.abs(A.data[ai + 2] - B.data[bi + 2]);
      sum += d0 + d1 + d2;
      if (d0 + d1 + d2 > 30) changed += 1;
      n += 1;
    }
  return {
    dx: dx / 2, dy: dy / 2,
    mean: Math.round((sum / (n * ch)) * 100) / 100,
    changedPct: Math.round((changed / n) * 1000) / 10,
  };
}

// ---- 主流程 ----
for (const token of tokens) {
  const entry = byToken.get(token);
  if (!entry) { console.log(token, "no catalog entry"); continue; }
  const content = JSON.parse(await readFile(path.join(ROOT, "public/template-content", `${token}.json`), "utf8").catch(() => "{}"));
  const doc = buildDoc(token, entry, content);
  const dl = path.join(OUT, ".dl", token);
  await rm(dl, { recursive: true, force: true });
  await mkdir(dl, { recursive: true });

  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dl });
  try {
    await page.goto("http://127.0.0.1:3000/favicon.ico", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => undefined);
    await insertDoc(page, doc);
    await page.goto(`http://127.0.0.1:3000/editor?id=${encodeURIComponent(doc.id)}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
    await page.waitForFunction(() => [...document.querySelectorAll("span")].some((s) => s.textContent?.includes("原站 DOM/CSS 1:1")), { timeout: 15000 }).catch(() => undefined);
    let lastH = -1, stable = 0;
    for (let k = 0; k < 80; k += 1) {
      await new Promise((r) => setTimeout(r, 250));
      const h = await page.evaluate(() => Number(document.querySelector('iframe[title="原站模板 1:1 预览"]')?.getAttribute("height") ?? 0));
      if (h > 0 && h === lastH) stable += 1; else stable = 0;
      lastH = h;
      if (stable >= 3) break;
    }
    await page.evaluate(async () => {
      const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
      await f?.contentDocument?.fonts?.ready?.catch?.(() => undefined);
    }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 350));

    const el = await page.$("[data-resume-page]");
    const baseline = await el.screenshot({ type: "png" });

    // 改成 1:1：页面盒子 794×1123，内层 scale 1
    const patched = await page.evaluate(async () => {
      const pageEl = document.querySelector("[data-resume-page]");
      pageEl.style.width = "794px";
      pageEl.style.height = "1123px";
      const inner = pageEl.firstElementChild;
      inner.style.transform = "none";
      inner.style.width = "794px";
      inner.style.height = "1123px";
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { page: [pageEl.getBoundingClientRect().width, pageEl.getBoundingClientRect().height], inner: [inner.getBoundingClientRect().width, inner.getBoundingClientRect().height] };
    });
    await new Promise((r) => setTimeout(r, 400));
    const patchedShot = await (await page.$("[data-resume-page]")).screenshot({ type: "png" });
    console.log(token, "patchedRect", JSON.stringify(patched));

    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("导出 PNG"));
      b?.click();
    });
    const t0 = Date.now();
    let files = [];
    while (Date.now() - t0 < 60000) {
      await new Promise((r) => setTimeout(r, 500));
      files = await readdir(dl).catch(() => []);
      if (files.some((f) => f.endsWith(".png"))) {
        await new Promise((r) => setTimeout(r, 1200));
        files = await readdir(dl).catch(() => []);
        break;
      }
    }
    const first = files.filter((f) => f.endsWith(".png")).sort((a, b) => a.localeCompare(b))[0];
    if (!first) { console.log(token, "export failed"); continue; }
    const exportBuf = await readFile(path.join(dl, first));
    const baseCmp = await compare(baseline, exportBuf);
    const patchCmp = await compare(patchedShot, exportBuf);
    await sharp(baseline).toFile(path.join(OUT, `${token}-baseline.png`));
    await sharp(patchedShot).toFile(path.join(OUT, `${token}-scale1.png`));
    await sharp(exportBuf).toFile(path.join(OUT, `${token}-export.png`));
    console.log(JSON.stringify({ token, baseline: baseCmp, scale1: patchCmp }));
  } finally {
    await page.close().catch(() => undefined);
    await rm(dl, { recursive: true, force: true }).catch(() => undefined);
  }
}

await browser.disconnect();
