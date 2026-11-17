import puppeteer from "puppeteer-core";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const templateName = process.argv[2] ?? "实习生通用简历模板";
const dir = await mkdtemp(path.join(tmpdir(), "blazecv-debug-export-"));
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1440, height: 1000 },
});
const page = await browser.newPage();
page.on("console", (m) => console.log("console:", m.type(), m.text().slice(0, 200)));
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 300)));
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
await new Promise((r) => setTimeout(r, 1500));
const buttons = await page.evaluate(() =>
  [...document.querySelectorAll("button")].map((b) => b.textContent?.trim()),
);
console.log("buttons:", JSON.stringify(buttons.filter(Boolean)));
await page.evaluate(() => {
  [...document.querySelectorAll("button")]
    .find((node) => node.textContent?.trim() === "导出")
    ?.click();
});
await new Promise((r) => setTimeout(r, 400));
const menu = await page.evaluate(() =>
  [...document.querySelectorAll("button, [role=menuitem]")].map((b) => b.textContent?.trim()),
);
console.log("menu:", JSON.stringify(menu.filter(Boolean)));
await page.evaluate(() => {
  [...document.querySelectorAll("button, [role=menuitem]")]
    .find((node) => node.textContent?.includes("导出 PDF"))
    ?.click();
});
await new Promise((r) => setTimeout(r, 6000));
console.log("files:", JSON.stringify(await readdir(dir)));
await page.close();
browser.disconnect();
