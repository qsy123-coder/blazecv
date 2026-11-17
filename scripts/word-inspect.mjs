import puppeteer from "puppeteer-core";
import AdmZip from "adm-zip";
import sharp from "sharp";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const name = process.argv[2] ?? "应届生通用简历模板";
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1300 },
  protocolTimeout: 240000,
});

async function exportVia(label) {
  const dir = await mkdtemp(path.join(tmpdir(), "blazecv-winsp-"));
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dir });
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
  await new Promise((r) => setTimeout(r, 1300));
  await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "导出")?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate((lbl) => {
    [...document.querySelectorAll("button,[role=menuitem]")].find((b) => b.textContent?.includes(lbl))?.click();
  }, label);
  let docx = null;
  for (let k = 0; k < 120; k += 1) { await new Promise((r) => setTimeout(r, 500)); const fs = await readdir(dir); docx = fs.find((f) => f.endsWith(".docx")); if (docx) break; }
  await page.close().catch(() => undefined);
  if (!docx) return null;
  return readFile(path.join(dir, docx));
}

const imgBuf = await exportVia("导出 Word（图片版）");
if (imgBuf) {
  const zip = new AdmZip(imgBuf);
  const media = zip.getEntries().filter((e) => e.entryName.startsWith("word/media/"));
  const xml = zip.readAsText("word/document.xml");
  const pgSz = /<w:pgSz[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"/.exec(xml);
  const margins = /<w:pgMar[^>]*w:(top|right|bottom|left)="(\d+)"/.exec(xml);
  const extent = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(xml);
  const inline = /<wp:inline|wp:anchor/.exec(xml);
  console.log("IMAGE WORD pgSz", pgSz?.[1] + "x" + pgSz?.[2], "extent", extent?.[1] + "x" + extent?.[2], "inline?", inline?.[0]);
  console.log("  margins sample", margins?.[0]);
  if (media.length) {
    const p = `C:/Users/WINDOWS11/AppData/Local/Temp/word-image.png`;
    await sharp(media[0].getData()).toFile(p);
    const m = await sharp(media[0].getData()).metadata();
    console.log("  embedded image", m.width + "x" + m.height, "->", p);
  }
}

const txtBuf = await exportVia("导出 Word（文字版·可编辑）");
if (txtBuf) {
  const zip = new AdmZip(txtBuf);
  const xml = zip.readAsText("word/document.xml");
  const pgSz = /<w:pgSz[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"/.exec(xml);
  const pgMar = /<w:pgMar[^>]*\/>/.exec(xml);
  console.log("TEXT WORD pgSz", pgSz?.[1] + "x" + pgSz?.[2], "pgMar", pgMar?.[0]);
  const paras = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].slice(0, 6).map((m) => (m[0].match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, "")).join(""));
  console.log("  first paragraphs:", JSON.stringify(paras));
}
browser.disconnect();
