// 复现：页面打开时清除 IndexedDB，随后新建页面加载编辑器是否会卡在“正在载入简历…”。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1600, height: 1000 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.setCacheEnabled(false);
page.on("pageerror", (error) => console.log("PAGEERR", error.message.slice(0, 400)));
await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForFunction(() => document.body.innerText.includes("浏览模板"), { timeout: 20000 });
await new Promise((r) => setTimeout(r, 1000));

const cdp = await page.createCDPSession();
await cdp.send("Storage.clearDataForOrigin", {
  origin: "http://127.0.0.1:3000",
  storageTypes: "indexeddb,cookies",
});

await page.goto(`http://127.0.0.1:3000/editor?template=business&cb=${Date.now()}`, {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 3000));
console.log(
  JSON.stringify(
    await page.evaluate(() => ({
      titleInput: Boolean(document.querySelector('input[aria-label="简历名称"]')),
      body: document.body.innerText.slice(0, 200),
    })),
  ),
);
await page.close();
await browser.disconnect();
