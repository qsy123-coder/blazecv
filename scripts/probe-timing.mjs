import puppeteer from "puppeteer-core";

const token = process.argv[2] ?? "d9d0ec05a0515f93";
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 900, height: 2600, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
const t0 = Date.now();
const lap = (m) => console.log(`${Date.now() - t0}ms ${m}`);

lap("goto raw");
await page.goto(`http://127.0.0.1:3000/template-pages/${token}.html`, {
  waitUntil: "domcontentloaded",
  timeout: 45000,
});
lap("raw dom");
await new Promise((r) => setTimeout(r, 500));
lap("raw wait");
await page.evaluate(() => {
  const main = document.querySelector(".main");
  const content = document.querySelector(".content");
  const scroll = document.querySelector(".content-scroll");
  if (content) { content.style.height = "auto"; content.style.overflow = "visible"; }
  if (scroll) { scroll.style.height = "auto"; scroll.style.overflow = "visible"; }
  main.style.height = "auto";
  main.style.minHeight = "0";
});
lap("raw layout");
const rawEl = await page.$("#cv-container");
await rawEl.screenshot({ type: "png" });
lap("raw shot");

lap("goto audit");
await page.goto(`http://127.0.0.1:3000/audit?token=${token}`, {
  waitUntil: "domcontentloaded",
  timeout: 45000,
});
lap("audit dom");
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
lap("iframe present");
await page.waitForFunction(() => document.querySelector("[data-audit-ready='1']"), { timeout: 45000 });
lap("audit ready");
await new Promise((r) => setTimeout(r, 450));
lap("wait");
const frame = await page.$('iframe[title="原站模板 1:1 预览"]');
await frame.screenshot({ type: "png" });
lap("bound shot");
console.log("TOTAL", Date.now() - t0, "ms");
await page.close();
browser.disconnect();
