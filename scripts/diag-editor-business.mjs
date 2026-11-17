// 诊断 /editor?template=business 无法渲染标题输入的问题。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1600, height: 1000 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.setCacheEnabled(false);
page.on("pageerror", (error) => console.log("PAGEERR", error.message.slice(0, 500)));
page.on("console", (message) => {
  if (message.type() === "error") console.log("CONSOLE", message.text().slice(0, 300));
});
await page.goto(`http://127.0.0.1:3000/editor?template=business&cb=${Date.now()}`, {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 2500));
console.log(
  JSON.stringify(
    await page.evaluate(() => ({
      titleInput: Boolean(document.querySelector('input[aria-label="简历名称"]')),
      aside: Boolean(document.querySelector("aside")),
      pages: document.querySelectorAll("[data-resume-page]").length,
      body: document.body.innerText.slice(0, 400),
    })),
    null,
    1,
  ),
);
await page.close();
await browser.disconnect();
