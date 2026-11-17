import puppeteer from "puppeteer-core";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const templateName = process.argv[2] ?? "实习生通用简历模板";
const dir = await mkdtemp(path.join(tmpdir(), "blazecv-exact-pdf-"));
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
await page.evaluate(() => {
  [...document.querySelectorAll("button, [role=menuitem]")]
    .find((node) => node.textContent?.includes("导出 PDF"))
    ?.click();
});
let pdfFile = null;
for (let i = 0; i < 60; i += 1) {
  await new Promise((r) => setTimeout(r, 500));
  const files = await readdir(dir);
  pdfFile = files.find((file) => file.endsWith(".pdf"));
  if (pdfFile) break;
}
if (!pdfFile) {
  console.log("FAIL 未生成 PDF");
  process.exitCode = 1;
} else {
  const full = path.join(dir, pdfFile);
  const pdf = await PDFDocument.load(await readFile(full));
  const pageSize = pdf.getPage(0).getSize();
  // Natural-height PDF: width is A4 (595.92pt); height grows with the template
  // (>= A4 height 842.88pt) so long resumes are not squashed.
  const ok =
    pdf.getPageCount() === 1 &&
    Math.abs(pageSize.width - 595.92) < 2 &&
    pageSize.height >= 842.88 - 2;
  console.log(
    `${ok ? "PASS" : "FAIL"} 精确 PDF ${pdf.getPageCount()} 页 · ` +
      `${pageSize.width.toFixed(2)}×${pageSize.height.toFixed(2)}pt · ` +
      `${(await readFile(full)).length}B`,
  );
  console.log(full);
  if (!ok) process.exitCode = 1;
}
await page.close();
browser.disconnect();
