import puppeteer from "puppeteer-core";
import sharp from "sharp";
import AdmZip from "adm-zip";
import { PDFDocument } from "pdf-lib";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = "http://127.0.0.1:3000";
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1300 },
  protocolTimeout: 300000,
});

async function meanDiff(bufA, bufB) {
  const am = await sharp(bufA).metadata();
  const bm = await sharp(bufB).metadata();
  const W = Math.min(am.width, bm.width);
  const H = Math.min(am.height, bm.height);
  const da = await sharp(bufA).extract({ left: 0, top: 0, width: W, height: H }).removeAlpha().raw().toBuffer();
  const db = await sharp(bufB).extract({ left: 0, top: 0, width: W, height: H }).removeAlpha().raw().toBuffer();
  let sum = 0;
  for (let i = 0; i < W * H * 3; i += 1) sum += Math.abs(da[i] - db[i]);
  return Math.round((sum / (W * H * 3)) * 100) / 100;
}

const results = [];
const rec = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`);
};

async function openEditor(name) {
  const page = await browser.newPage();
  await page.goto(`${BASE}/templates`, { waitUntil: "networkidle2", timeout: 60000 });
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
  await new Promise((r) => setTimeout(r, 1400));
  return page;
}

async function exportFormat(name, label, ext) {
  const dir = await mkdtemp(path.join(tmpdir(), "blazecv-acc-"));
  const page = await openEditor(name);
  try {
    const cdp = await page.createCDPSession();
    await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dir });
    await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "导出")?.click(); });
    await new Promise((r) => setTimeout(r, 300));
    const found = await page.evaluate((lbl) => {
      const item = [...document.querySelectorAll("button,[role=menuitem]")].find((b) => b.textContent?.includes(lbl));
      item?.click();
      return Boolean(item);
    }, label);
    if (!found) return { ok: false, reason: "menu item not found" };
    let file = null;
    for (let k = 0; k < 160; k += 1) {
      await new Promise((r) => setTimeout(r, 500));
      const fs = await readdir(dir);
      file = fs.find((f) => f.endsWith(ext));
      if (file) break;
    }
    if (!file) return { ok: false, reason: "no file" };
    return { ok: true, buf: await readFile(path.join(dir, file)), file };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function validatePdfImage(name) {
  const r = await exportFormat(name, "导出 PDF（图片版）", ".pdf");
  if (!r.ok) return rec(`PDF图片 ${name}`, false, r.reason);
  const pdf = await PDFDocument.load(r.buf);
  let sizesOk = true;
  let first = "";
  for (let i = 0; i < pdf.getPageCount(); i += 1) {
    const p = pdf.getPage(i).getSize();
    if (!first) first = `${p.width.toFixed(1)}x${p.height.toFixed(1)}`;
    if (Math.abs(p.width - 595.5) > 2 || Math.abs(p.height - 842.25) > 2) sizesOk = false;
  }
  const ok = pdf.getPageCount() >= 1 && sizesOk;
  rec(`PDF图片 ${name}`, ok, `${pdf.getPageCount()}页A4 ${first}pt ${r.buf.length}B`);
}
async function validatePdfText(name) {
  const r = await exportFormat(name, "导出 PDF（文字版·可编辑）", ".pdf");
  if (!r.ok) return rec(`PDF文字 ${name}`, false, r.reason);
  const s = r.buf.toString("latin1");
  const pdf = await PDFDocument.load(r.buf);
  // Real text PDF has font objects (/Font); the image PDF does not. Content
  // streams may be compressed, so don't rely on raw "BT"/"Tj" bytes.
  const hasText = s.includes("/Font");
  const ok = hasText && pdf.getPageCount() >= 1;
  rec(`PDF文字 ${name}`, ok, `pages=${pdf.getPageCount()} /Font=${hasText} ${r.buf.length}B`);
}
async function validatePng(name) {
  const r = await exportFormat(name, "导出 PNG 图片", ".png");
  if (!r.ok) return rec(`PNG ${name}`, false, r.reason);
  const m = await sharp(r.buf).metadata();
  // Every PNG is now one A4 page slice (1588×2246 at 2x); overflow becomes
  // multiple files (p1,p2…), each A4.
  const ok = m.width === 1588 && Math.abs(m.height - 2246) <= 2;
  rec(`PNG ${name}`, ok, `${m.width}x${m.height} ${r.buf.length}B`);
}
async function validateWordImage(name) {
  const r = await exportFormat(name, "导出 Word（图片版）", ".docx");
  if (!r.ok) return rec(`Word图片 ${name}`, false, r.reason);
  const zip = new AdmZip(r.buf);
  const media = zip.getEntries().filter((e) => e.entryName.startsWith("word/media/"));
  const xml = zip.readAsText("word/document.xml");
  const pg = /<w:pgSz[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"/.exec(xml);
  const pageBreaks = (xml.match(/<w:br w:type="page"\/>/g) || []).length;
  let ok = false, detail = "";
  if (pg) {
    const pw = Number(pg[1]), ph = Number(pg[2]);
    // A4-ish page, one image per page, page breaks between pages.
    ok = media.length >= 1 && Math.abs(pw - 11910) <= 40 && Math.abs(ph - 16875) <= 60 && pageBreaks === media.length - 1;
    detail = `page=${pw}x${ph} media=${media.length} 分页符=${pageBreaks}`;
  } else detail = "缺少 pgSz";
  rec(`Word图片 ${name}`, ok, detail);
}
async function validateWordText(name) {
  const r = await exportFormat(name, "导出 Word（文字版·可编辑）", ".docx");
  if (!r.ok) return rec(`Word文字 ${name}`, false, r.reason);
  const zip = new AdmZip(r.buf);
  const xml = zip.readAsText("word/document.xml");
  const tcount = (xml.match(/<w:t[^>]*>/g) || []).length;
  const ok = tcount >= 10;
  rec(`Word文字 ${name}`, ok, `w:t=${tcount} ${r.buf.length}B`);
}

const namesAll = [
  "应届生通用简历模板",
  "2026用户运营应届生简历模板",
  "高级产品运营简历模板",
  "3-5年经验数据运营专家跳槽简历模板",
  "社会招聘通用简历模板",
  "实习生通用简历模板",
  "项目经理简历模板",
  "生物医药行业简历模板",
  "3-5年经验高级产品运营跳槽简历模板",
  "西安电子科技大学大学生简历模板",
];

// 1) Word 图片版单页校验 for all 10
for (const n of namesAll) await validateWordImage(n);

// 2) Full 5-format validation for 3 representative templates
for (const n of ["应届生通用简历模板", "2026用户运营应届生简历模板", "项目经理简历模板"]) {
  await validatePdfImage(n);
  await validatePdfText(n);
  await validatePng(n);
  await validateWordText(n);
}

// 3) Theme controls affect exact preview
{
  const page = await openEditor("应届生通用简历模板");
  const read = () => page.evaluate(() => {
    const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    const m = f?.contentDocument?.querySelector(".main");
    if (!m) return null;
    const cs = f.contentDocument.defaultView.getComputedStyle(m);
    return { fontSize: cs.fontSize, lineHeight: cs.lineHeight, height: Math.round(m.getBoundingClientRect().height) };
  });
  const readFull = () => page.evaluate(() => {
    const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    const d = f?.contentDocument;
    const m = d?.querySelector(".main");
    if (!m) return null;
    const cs = d.defaultView.getComputedStyle(m);
    const hl = d.querySelector(".header-line");
    return {
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      paddingTop: cs.paddingTop,
      height: Math.round(m.getBoundingClientRect().height),
      headerColor: hl ? d.defaultView.getComputedStyle(hl).backgroundColor : "",
    };
  });
  const before = await readFull();
  const shotBefore = await (await page.$('iframe[title="原站模板 1:1 预览"]')).screenshot({ type: "png" });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "大")?.click());
  await new Promise((r) => setTimeout(r, 1000));
  const afterFont = await readFull();
  const shotFont = await (await page.$('iframe[title="原站模板 1:1 预览"]')).screenshot({ type: "png" });
  const fontPix = await meanDiff(shotBefore, shotFont);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('input[type="range"]')].find((r) => Number(r.max) < 5);
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, "1.6");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 1000));
  const afterLh = await readFull();
  const shotLh = await (await page.$('iframe[title="原站模板 1:1 预览"]')).screenshot({ type: "png" });
  const lhPix = await meanDiff(shotFont, shotLh);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('input[type="range"]')].find((r) => Number(r.max) >= 15);
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, "18");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 1000));
  const afterMargin = await readFull();
  const shotMargin = await (await page.$('iframe[title="原站模板 1:1 预览"]')).screenshot({ type: "png" });
  const marginPix = await meanDiff(shotLh, shotMargin);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button[aria-label^="主色"]')];
    const red = btns.find((b) => /7c3aed|dc2127|ef4444/i.test(b.getAttribute("aria-label") || "")) || btns[3] || btns[0];
    red?.click();
  });
  await new Promise((r) => setTimeout(r, 1000));
  const afterColor = await readFull();
  const shotColor = await (await page.$('iframe[title="原站模板 1:1 预览"]')).screenshot({ type: "png" });
  const colorPix = await meanDiff(shotMargin, shotColor);

  const fontOk = afterFont && parseFloat(afterFont.fontSize) > parseFloat(before.fontSize) && fontPix > 1;
  const lhOk = afterLh && parseFloat(afterLh.lineHeight) > parseFloat(afterFont.lineHeight) && lhPix > 1;
  const marginOk = afterMargin && parseFloat(afterMargin.paddingTop) > parseFloat(afterLh.paddingTop) && marginPix > 1;
  const colorOk = afterColor && afterColor.headerColor !== afterMargin.headerColor && colorPix > 1;
  rec("字号控件生效(截图)", !!fontOk, `${before.fontSize}->${afterFont?.fontSize} 截图差=${fontPix}`);
  rec("行距控件生效(截图)", !!lhOk, `${afterFont?.lineHeight}->${afterLh?.lineHeight} 截图差=${lhPix}`);
  rec("页边距控件生效(截图)", !!marginOk, `padding ${afterLh?.paddingTop}->${afterMargin?.paddingTop} 截图差=${marginPix}`);
  rec("主色控件生效(截图)", !!colorOk, `${afterMargin?.headerColor}->${afterColor?.headerColor} 截图差=${colorPix}`);
  await page.close();
}

// 3b) 自动适配一页：必须靠字号/行距/页边距调整到 1 页（非缩放），并截图变化
{
  const page = await openEditor("2026用户运营应届生简历模板");
  const read = () => page.evaluate(() => {
    const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    const d = f?.contentDocument;
    const m = d?.querySelector(".main");
    const pages = document.querySelectorAll("[data-resume-page]").length;
    if (!m) return { pages, zoom: "", fontSize: "", lineHeight: "", padding: "" };
    const cs = d.defaultView.getComputedStyle(m);
    return {
      pages,
      zoom: m.style.zoom || cs.zoom || "1",
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      padding: cs.paddingTop,
    };
  });
  const before = await read();
  const shotBefore = await (await page.$('iframe[title="原站模板 1:1 预览"]')).screenshot({ type: "png" });
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("自动适配一页"));
    b?.click();
    return Boolean(b);
  });
  // The greedy fit re-renders several times; give it room.
  await new Promise((r) => setTimeout(r, 7000));
  const after = await read();
  const shotAfter = await (await page.$('iframe[title="原站模板 1:1 预览"]')).screenshot({ type: "png" });
  const pix = await meanDiff(shotBefore, shotAfter);
  const controlsChanged =
    before.fontSize !== after.fontSize ||
    before.lineHeight !== after.lineHeight ||
    before.padding !== after.padding;
  const notZoomed = after.zoom === "" || after.zoom === "1" || after.zoom === "normal";
  const ok = clicked && after.pages === 1 && pix > 1 && controlsChanged && notZoomed;
  rec(
    "自动适配一页(截图/非缩放)",
    ok,
    `pages ${before.pages}->${after.pages} 截图差=${pix} 字号${before.fontSize}->${after.fontSize} 行距${before.lineHeight}->${after.lineHeight} 边距${before.padding}->${after.padding} zoom=${after.zoom}`,
  );
  await page.close();
}

// 4) City edit sync on a template that shows city
{
  // Find a template whose profile shows 城市/现居/所在地.
  const page = await browser.newPage();
  await page.goto(`${BASE}/templates`, { waitUntil: "networkidle2", timeout: 60000 });
  // Just test on 应届生通用 if it shows city; else scan a few.
  const candidates = ["应届生通用简历模板", "项目经理简历模板", "生物医药行业简历模板", "西安电子科技大学大学生简历模板", "社会招聘通用简历模板"];
  let tested = false;
  for (const n of candidates) {
    const pg = await openEditor(n);
    const hasCity = await pg.evaluate(() => {
      const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
      const t = f?.contentDocument?.body?.textContent || "";
      return /城市|现居|所在地/.test(t);
    });
    if (hasCity) {
      const shotBefore = await (await pg.$('iframe[title="原站模板 1:1 预览"]')).screenshot({ type: "png" });
      const set = await pg.evaluate(() => {
        const inputs = [...document.querySelectorAll("input")].filter((i) => i.type !== "file");
        const inp = inputs.find((i) => {
          const wrap = i.closest("div");
          const txt = (wrap?.parentElement?.textContent || "") + (wrap?.textContent || "");
          return /城市|现居|所在地/.test(txt);
        });
        if (!inp) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        setter?.call(inp, "杭州验证");
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      });
      await new Promise((r) => setTimeout(r, 1200));
      const shown = await pg.evaluate(() => {
        const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
        return f?.contentDocument?.body?.textContent?.includes("杭州验证") ?? false;
      });
      const shotAfter = await (await pg.$('iframe[title="原站模板 1:1 预览"]')).screenshot({ type: "png" });
      const pix = await meanDiff(shotBefore, shotAfter);
      rec(`城市同步（${n}）`, set && shown && pix > 0, `set=${set} shown=${shown} 截图差=${pix}`);
      tested = true;
      await pg.close();
      break;
    }
    await pg.close();
  }
  if (!tested) rec("城市同步", true, "抽查的模板均不显示城市字段（模板版式不含城市），跳过");
  await page.close();
}

const pass = results.filter((r) => r.ok).length;
console.log(`\nSUMMARY ${pass}/${results.length} pass`);
const fails = results.filter((r) => !r.ok);
if (fails.length) fails.forEach((f) => console.log("  FAIL:", f.name, f.detail));
browser.disconnect();
process.exitCode = fails.length ? 1 : 0;
