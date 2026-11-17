import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9232",
  defaultViewport: { width: 1100, height: 900, deviceScaleFactor: 1 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
for (const width of [1100, 1280, 1440]) {
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:3000/editor", { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector('input[aria-label="简历名称"]', { timeout: 30000 });
  const info = await page.evaluate(() => {
    const header = document.querySelector("header");
    const link = [...header.querySelectorAll("a")].find((a) => a.textContent?.trim() === "我的简历");
    return {
      width: window.innerWidth,
      headerWidth: header.clientWidth,
      scrollWidth: header.scrollWidth,
      overflow: header.scrollWidth > header.clientWidth + 1,
      linkVisible: link ? !!(link.offsetWidth || link.offsetHeight) : false,
      linkDisplay: link ? getComputedStyle(link).display : null,
    };
  });
  console.log(JSON.stringify(info));
}
await page.close();
await browser.disconnect();
