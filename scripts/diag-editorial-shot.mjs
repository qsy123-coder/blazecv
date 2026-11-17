import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9243",
  defaultViewport: { width: 1600, height: 1100, deviceScaleFactor: 2 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.goto(
  "http://127.0.0.1:3000/editor?id=resume_07c13358-be9f-4590-9417-9fae41fd7d85",
  { waitUntil: "networkidle2", timeout: 60000 },
);
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));
const info = await page.evaluate(() => {
  const doc = document.querySelector('iframe[title="原站模板 1:1 预览"]')?.contentDocument;
  const profile = doc?.querySelector(".profile-content");
  return {
    profileText: profile?.textContent?.replace(/\s+/g, " ").trim(),
    other: [...(doc?.querySelectorAll(".profile-other .other-item") ?? [])].map((item) =>
      item.textContent?.replace(/\s+/g, " ").trim(),
    ),
    infoItems: [...(doc?.querySelectorAll(".info-item") ?? [])].map((item) =>
      item.textContent?.replace(/\s+/g, " ").trim(),
    ),
  };
});
console.log(JSON.stringify(info, null, 2));
const pageEl = await page.$("[data-resume-page]");
await pageEl.screenshot({
  path: "F:/Projects/blazecv/tools/audit/compare/BASICS-EDITORIAL.png",
  type: "png",
});
await page.close();
await browser.disconnect();
