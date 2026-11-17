import puppeteer from "puppeteer-core";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const templateName = process.argv[2] ?? "应届生通用简历模板";
const dir = await mkdtemp(path.join(tmpdir(), "blazecv-exact-png-"));
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
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
  const menu = [...document.querySelectorAll("button")].find(
    (node) => node.textContent?.trim() === "导出",
  );
  menu?.click();
});
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => {
  const item = [...document.querySelectorAll("button, [role=menuitem]")].find((node) =>
    node.textContent?.includes("导出 PNG"),
  );
  item?.click();
});
let png = null;
for (let i = 0; i < 40; i += 1) {
  await new Promise((r) => setTimeout(r, 500));
  const files = await readdir(dir);
  png = files.find((file) => file.endsWith(".png"));
  if (png) break;
}
if (!png) {
  console.log("FAIL 未生成 PNG");
  process.exitCode = 1;
} else {
  const full = path.join(dir, png);
  const meta = await sharp(full).metadata();
  const stats = await sharp(full).stats();
  // Natural-height render: width is fixed at 2×A4 width (1588), height is
  // 2× the template's natural page height (>= 2246 for a one-page template).
  const ok = meta.width === 1588 && meta.height >= 2246;
  console.log(
    `${ok ? "PASS" : "FAIL"} 精确 PNG ${png} · ${meta.width}×${meta.height} · ` +
      `mean=${stats.channels.map((channel) => Math.round(channel.mean)).join(",")}`,
  );
  if (!ok) process.exitCode = 1;
  console.log(full);
}
await page.close();
browser.disconnect();
