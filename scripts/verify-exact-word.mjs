import puppeteer from "puppeteer-core";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";

const templateName = process.argv[2] ?? "实习生通用简历模板";
const dir = await mkdtemp(path.join(tmpdir(), "blazecv-exact-docx-"));
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9227",
  defaultViewport: { width: 1440, height: 1000 },
});
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dir });
await page.goto("http://127.0.0.1:3000/templates", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("[data-catalog-card]", { timeout: 30000 });
const input = await page.$('input[aria-label="搜索模板"]');
await input.type(templateName);
await new Promise((r) => setTimeout(r, 700));
await page.evaluate((name) => {
  const card = [...document.querySelectorAll("[data-catalog-card]")].find((node) =>
    node.textContent.includes(name),
  );
  [...(card?.querySelectorAll("button") ?? [])]
    .find((node) => node.textContent.includes("使用此模板"))
    ?.click();
}, templateName);
await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  [...document.querySelectorAll("button")]
    .find((node) => node.textContent?.trim() === "导出")
    ?.click();
});
await new Promise((r) => setTimeout(r, 300));
const label = await page.evaluate(() => {
  const item = [...document.querySelectorAll("button, [role=menuitem]")].find((node) =>
    node.textContent?.includes("导出 Word"),
  );
  const text = item?.textContent?.trim() ?? "";
  item?.click();
  return text;
});
console.log("word item", label);
let docx = null;
for (let i = 0; i < 50; i += 1) {
  await new Promise((r) => setTimeout(r, 500));
  const files = await readdir(dir);
  docx = files.find((file) => file.endsWith(".docx"));
  if (docx) break;
}
if (!docx) {
  console.log("FAIL 未生成 DOCX");
  process.exitCode = 1;
} else {
  const full = path.join(dir, docx);
  const zip = new AdmZip(full);
  const names = zip.getEntries().map((entry) => entry.entryName);
  const xml = zip.readAsText("word/document.xml");
  const media = names.filter((name) => name.startsWith("word/media/"));
  const pageSize = /<w:pgSz[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"/.exec(xml);
  // Natural-height DOCX: width fixed at A4 (11906 twips), height grows with the
  // template (>= 16838 twips for a one-page template).
  const ok =
    media.length > 0 &&
    xml.includes("<w:drawing") &&
    pageSize?.[1] === "11906" &&
    Number(pageSize?.[2] ?? 0) >= 16838;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${docx} · media=${media.join(",")} · ` +
      `page=${pageSize?.[1]}×${pageSize?.[2]} · ${(await readFile(full)).length}B`,
  );
  console.log(full);
  if (!ok) process.exitCode = 1;
}
await page.close();
browser.disconnect();
