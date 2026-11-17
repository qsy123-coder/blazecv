import puppeteer from "puppeteer-core";

const tokens = process.argv.slice(2);
const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9226",
  defaultViewport: { width: 1400, height: 1200 },
});
for (const token of tokens) {
  const page = await browser.newPage();
  try {
    await page.goto(`https://www.wondercv.com/jianlimoban/${token}.html`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForSelector("#cv-container", { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2500));
    const links = await page.evaluate(() =>
      [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) =>
        link.getAttribute("href"),
      ),
    );
    console.log(token, JSON.stringify(links));
  } catch (error) {
    console.log(token, "ERROR", String(error).slice(0, 120));
  }
  await page.close();
}
browser.disconnect();
