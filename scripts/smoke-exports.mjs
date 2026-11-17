import puppeteer from "puppeteer-core";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const name = process.argv[2] ?? "应届生通用简历模板";
const wanted = ["导出 PDF（文字版·可编辑）", "导出 Word（文字版·可编辑）"];
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1300 },
  protocolTimeout: 240000,
});
for (const label of wanted) {
  const dir = await mkdtemp(path.join(tmpdir(), "blazecv-smoke-"));
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dir });
  try {
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
    const clicked = await page.evaluate((lbl) => {
      const item = [...document.querySelectorAll("button,[role=menuitem]")].find((b) => b.textContent?.includes(lbl));
      item?.click();
      return Boolean(item);
    }, label);
    let file = null;
    for (let k = 0; k < 120; k += 1) { await new Promise((r) => setTimeout(r, 500)); const fs = await readdir(dir); file = fs.find((f) => f.endsWith(".pdf") || f.endsWith(".docx")); if (file) break; }
    if (!file) { console.log(`${label}: FAILED (no file), menu-item-found=${clicked}`); }
    else { const b = await readFile(path.join(dir, file)); console.log(`${label}: OK ${file} ${b.length}B header=${b.subarray(0, 4).toString("latin1")}`); }
  } catch (e) {
    console.log(`${label}: ERR ${String(e?.message ?? e).slice(0, 140)}`);
  } finally {
    await page.close().catch(() => undefined);
  }
}
browser.disconnect();
