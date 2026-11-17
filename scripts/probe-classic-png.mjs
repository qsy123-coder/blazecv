import puppeteer from "puppeteer-core";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = await mkdtemp(path.join(tmpdir(), "blazecv-png-"));
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1200 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
page.on("console", (m) => console.log("console:", m.type(), m.text().slice(0, 160)));
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 200)));
const cdp = await page.createCDPSession();
await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dir });

await page.goto("http://127.0.0.1:3000/editor", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
const state = await page.evaluate(() => ({
  title: document.title,
  hasResume: Boolean(document.querySelector(".app-shell")),
  pages: document.querySelectorAll("[data-resume-page]").length,
  exact: Boolean(document.querySelector('iframe[title="原站模板 1:1 预览"]')),
  buttons: [...document.querySelectorAll("button")].map((b) => (b.textContent || "").trim()).filter((t) => t.includes("导出")),
}));
console.log("state", JSON.stringify(state));

if (state.hasResume) {
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "导出")?.click());
  await new Promise((r) => setTimeout(r, 300));
  const clicked = await page.evaluate(() => {
    const it = [...document.querySelectorAll("button,[role=menuitem]")].find((b) => b.textContent?.includes("导出 PNG"));
    it?.click();
    return Boolean(it);
  });
  console.log("clicked", clicked);
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    const files = await readdir(dir);
    if (files.length) { console.log("files", files); break; }
  }
  console.log("final files", await readdir(dir));
}
await page.close();
browser.disconnect();
