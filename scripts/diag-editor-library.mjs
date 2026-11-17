// 验证编辑器顶部「我的简历」入口，以及模板弹窗内的「全部模板库」。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9232",
  defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("PAGEERROR", error.message));
await page.goto("http://127.0.0.1:3000/editor", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('input[aria-label="简历名称"]', { timeout: 30000 });

const before = await page.evaluate(() => {
  const link = [...document.querySelectorAll("header a")].find(
    (a) => a.textContent?.trim() === "我的简历",
  );
  return {
    path: location.pathname,
    title: document.querySelector('input[aria-label="简历名称"]')?.value,
    navLink: link ? { href: link.getAttribute("href"), visible: !!(link.offsetWidth || link.offsetHeight) } : null,
    headerHeight: Math.round(document.querySelector("header")?.getBoundingClientRect().height ?? 0),
  };
});
console.log("editor before:", JSON.stringify(before));

// 打开模板弹窗 → 全部模板库
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("模板"))?.click();
});
await page.waitForFunction(() => document.body.innerText.includes("选择模板"), { timeout: 20000 });
const tabs = await page.evaluate(() =>
  [...document.querySelectorAll("button")]
    .map((b) => b.textContent?.trim())
    .filter((text) => text?.startsWith("精选模板") || text?.startsWith("全部模板库")),
);
console.log("tabs:", JSON.stringify(tabs));
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith("全部模板库"))?.click();
});
await page.waitForFunction(
  () => document.querySelectorAll("[data-catalog-card]").length > 0,
  { timeout: 30000 },
);
const library = await page.evaluate(() => ({
  cards: document.querySelectorAll("[data-catalog-card]").length,
  hasJumpLink: document.body.innerText.includes("浏览全部模板库"),
  pageInfo: document.body.innerText.match(/共 \d+ 套 · 第 \d+ \/ \d+ 页/)?.[0] ?? null,
}));
console.log("library tab:", JSON.stringify(library));

const search = await page.$('input[aria-label="搜索全部模板库"]');
await search.type("应届生通用");
await new Promise((r) => setTimeout(r, 900));
const searched = await page.evaluate(() => ({
  cards: document.querySelectorAll("[data-catalog-card]").length,
  first: document.querySelector("[data-catalog-card]")?.getAttribute("aria-label"),
}));
console.log("search:", JSON.stringify(searched));

await page.screenshot({
  path: "F:/Projects/blazecv/tools/audit/compare/EDITOR-LIBRARY-MODAL.png",
  fullPage: false,
});

// 选中第一张目录模板：应保持在 /editor，内容保留，预览切到该模板 token
await page.evaluate(() => document.querySelector("[data-catalog-card]")?.click());
await page.waitForFunction(() => !document.body.innerText.includes("选择模板"), { timeout: 15000 });
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));
const after = await page.evaluate(() => {
  const frame = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  return {
    path: location.pathname,
    title: document.querySelector('input[aria-label="简历名称"]')?.value,
    token: frame?.getAttribute("src")?.split("/").pop(),
    name: frame?.contentDocument?.querySelector("#cv-container .user-name")?.textContent?.trim(),
    pages: document.querySelectorAll("[data-resume-page]").length,
  };
});
console.log("after select:", JSON.stringify(after));

// 顶部「我的简历」导航
await page.evaluate(() => {
  [...document.querySelectorAll("header a")].find((a) => a.textContent?.trim() === "我的简历")?.click();
});
await page.waitForFunction(() => location.pathname === "/resumes", { timeout: 20000 });
await new Promise((r) => setTimeout(r, 1500));
const resumes = await page.evaluate(() => ({
  path: location.pathname,
  cards: document.querySelectorAll("[data-resume-card]").length,
  headerHeight: Math.round(document.querySelector("header")?.getBoundingClientRect().height ?? 0),
}));
console.log("resumes after nav:", JSON.stringify(resumes));

await page.close();
await browser.disconnect();
