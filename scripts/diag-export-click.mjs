import puppeteer from "puppeteer-core";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const name = process.argv[2] ?? "2026用户运营应届生简历模板";
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 2400, height: 1700, deviceScaleFactor: 2 },
  protocolTimeout: 240000,
});
const dir = await mkdtemp(path.join(tmpdir(), "blazecv-click-"));
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dir });
const reqs = [];
page.on("request", (r) => { if (r.url().includes("/api/")) reqs.push(`${r.method()} ${r.url().slice(0, 100)}`); });
page.on("requestfailed", (r) => reqs.push(`FAILED ${r.url().slice(0, 120)} ${r.failure()?.errorText}`));
page.on("console", (m) => { if (m.type() === "error") reqs.push(`CONSOLE ${m.text().slice(0, 160)}`); });

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
await new Promise((r) => setTimeout(r, 1600));

const buttons = await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.textContent?.trim()).filter(Boolean));
console.log("buttons:", JSON.stringify(buttons.slice(0, 40)));
await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "导出")?.click(); });
await new Promise((r) => setTimeout(r, 500));
const items = await page.evaluate(() => [...document.querySelectorAll("button,[role=menuitem]")].map((b) => b.textContent?.trim()).filter((t) => t && t.includes("导出")));
console.log("menu:", JSON.stringify(items));
await page.evaluate(() => { [...document.querySelectorAll("button,[role=menuitem]")].find((b) => b.textContent?.includes("导出 PNG"))?.click(); });
for (let i = 0; i < 60; i += 1) {
  await new Promise((r) => setTimeout(r, 500));
  const fs = await readdir(dir);
  if (fs.length > 0) { console.log("files:", JSON.stringify(fs)); break; }
}
console.log("requests:", JSON.stringify(reqs, null, 2));
console.log("dirFiles:", JSON.stringify(await readdir(dir)));
await page.close();
browser.disconnect();
