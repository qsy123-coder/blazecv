import puppeteer from "puppeteer-core";

const token = process.argv[2] ?? "d9d0ec05a0515f93";
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 900, height: 1400 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:3000/template-pages/${token}.html`, {
  waitUntil: "domcontentloaded",
  timeout: 45000,
});
await new Promise((r) => setTimeout(r, 500));
const info = await page.evaluate(() => {
  const main = document.querySelector(".main");
  const header = main?.querySelector(".header, .user, .top, .user-info, .header-wrapper") || main;
  const nodes = [...(header?.querySelectorAll("*") || [])]
    .filter((el) => (el.textContent || "").trim().length > 0 && el.children.length === 0)
    .slice(0, 40)
    .map((el) => ({ cls: el.className?.toString().slice(0, 60), text: el.textContent.trim().slice(0, 24) }));
  return { nodes };
});
console.log(JSON.stringify(info, null, 1));
await page.close();
browser.disconnect();
