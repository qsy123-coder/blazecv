// 验证全局左右留白收窄，以及第二屏标题与导航栏的间距。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9263",
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 1200));
await page.mouse.move(960, 540);

const before = await page.evaluate(() => {
  const headerInner = document.querySelector("header > div");
  const heroInner = document.querySelector("section .mx-auto");
  const header = document.querySelector("header");
  return {
    viewport: window.innerWidth,
    headerInnerWidth: headerInner ? Math.round(headerInner.getBoundingClientRect().width) : null,
    headerInnerX: headerInner ? Math.round(headerInner.getBoundingClientRect().x) : null,
    heroInnerWidth: heroInner ? Math.round(heroInner.getBoundingClientRect().width) : null,
    heroInnerX: heroInner ? Math.round(heroInner.getBoundingClientRect().x) : null,
    headerHeight: header ? Math.round(header.getBoundingClientRect().height) : null,
  };
});
console.log("before:", JSON.stringify(before));

await page.mouse.wheel({ deltaY: 120 });
await new Promise((r) => setTimeout(r, 1100));
const after = await page.evaluate(() => {
  const header = document.querySelector("header");
  const heading = [...document.querySelectorAll("h2")].find((el) =>
    el.textContent?.includes("选择一套模板开始"),
  );
  const templates = document.querySelector("#templates");
  const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
  const headingTop = heading ? heading.getBoundingClientRect().top : null;
  return {
    scrollY: Math.round(window.scrollY),
    headerBottom: Math.round(headerBottom),
    headingTop: headingTop === null ? null : Math.round(headingTop),
    gapBelowHeader: headingTop === null ? null : Math.round(headingTop - headerBottom),
    templatesTop: templates ? Math.round(templates.getBoundingClientRect().top) : null,
  };
});
console.log("after snap:", JSON.stringify(after));
await page.screenshot({
  path: "F:/Projects/blazecv/tools/audit/compare/HOME-SECOND-SCREEN.png",
  fullPage: false,
});

await page.goto("http://127.0.0.1:3000/templates", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 800));
const catalog = await page.evaluate(() => {
  const main = document.querySelector("main");
  return {
    mainWidth: main ? Math.round(main.getBoundingClientRect().width) : null,
    mainX: main ? Math.round(main.getBoundingClientRect().x) : null,
    viewport: window.innerWidth,
  };
});
console.log("templates page:", JSON.stringify(catalog));

await page.close();
await browser.disconnect();
