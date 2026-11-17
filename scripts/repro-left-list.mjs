import puppeteer from "puppeteer-core";

const name = process.argv[2] ?? "应届生通用简历模板";
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1200 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:3000/templates", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("[data-catalog-card]", { timeout: 30000 });
const input = await page.$('input[aria-label="搜索模板"]');
await input.type(name);
await new Promise((r) => setTimeout(r, 700));
await page.evaluate((n) => {
  const card = [...document.querySelectorAll("[data-catalog-card]")].find((c) => c.textContent.includes(n));
  [...(card?.querySelectorAll("button") ?? [])].find((b) => b.textContent.includes("使用此模板"))?.click();
}, name);
await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1600));

const left = await page.evaluate(() => {
  // Section editor cards: each has a title input/heading. Collect visible section titles.
  const root = document.querySelector(".app-shell");
  const inputs = [...document.querySelectorAll("input,textarea")].map((i) => ({ tag: i.tagName, val: (i.value || "").slice(0, 30) })).filter((x) => x.val);
  // Section titles are usually rendered as text in cards; grab known headings.
  const known = ["个人总结","工作经历","项目经历","社团和组织经历","教育经历","技能","语言","荣誉奖项","证书","自定义","专业技能","证书与荣誉"];
  const found = known.filter((k) => root?.textContent?.includes(k));
  return { found, inputCount: inputs.length };
});
console.log("LEFT headings present:", JSON.stringify(left.found));
await page.screenshot({ path: "C:/Users/WINDOWS11/AppData/Local/Temp/editor-full.png", fullPage: true });
await page.close();
browser.disconnect();
