import puppeteer from "puppeteer-core";
import path from "node:path";

const file = process.argv[2];
const output = process.argv[3] ?? "C:/Users/WINDOWS11/AppData/Local/Temp/render.png";
if (!file) throw new Error("usage: node render-html.mjs <html-file> [png]");
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1400, height: 1200, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
await page.goto(`file:///${path.resolve(file).replace(/\\/g, "/")}`, {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 1000));
const info = await page.evaluate(() => {
  const pages = [...document.querySelectorAll("[data-resume-page]")].map((el) => {
    const rect = el.getBoundingClientRect();
    return {
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      top: Math.round(rect.top),
    };
  });
  const scroll = document.querySelector(".content-scroll");
  return {
    pages,
    scrollH: scroll?.scrollHeight,
    pageH: scroll?.clientHeight,
    bodyH: document.body.scrollHeight,
  };
});
console.log(JSON.stringify(info));
const target = (await page.$("[data-resume-page='1']")) ?? (await page.$("#cv-container"));
if (target) await target.screenshot({ path: output });
await page.close();
browser.disconnect();
