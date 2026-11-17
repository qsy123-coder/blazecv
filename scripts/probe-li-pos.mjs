import puppeteer from "puppeteer-core";

const token = process.argv[2];
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9227",
  defaultViewport: { width: 900, height: 2600, deviceScaleFactor: 1 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();

const collect = () => {
  const opt = document.querySelector(".option.project_experience");
  const item = opt.querySelector(".section-item-container");
  const content = item.querySelector(".menu-content");
  const top = content.getBoundingClientRect().top;
  return [...content.querySelectorAll("li")].map((li) => {
    const r = li.getBoundingClientRect();
    return {
      x: Math.round(r.left),
      y: Math.round((r.top - top) * 10) / 10,
      w: Math.round(r.width),
      h: Math.round(r.height * 10) / 10,
      depth: li.parentElement?.parentElement?.tagName,
      text: li.textContent.slice(0, 16),
    };
  });
};

await page.goto(`http://127.0.0.1:3000/template-pages/${token}.html`, {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 450));
console.log("RAW:", JSON.stringify(await page.evaluate(collect), null, 1));

await page.goto(`http://127.0.0.1:3000/audit?token=${token}`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await page.waitForFunction(
  () => document.querySelector("[data-audit-ready='1']"),
  { timeout: 45000 },
);
await new Promise((r) => setTimeout(r, 700));
console.log(
  "BOUND:",
  JSON.stringify(
    await page.evaluate(() => {
      const frame = document.querySelector('iframe[title="原站模板 1:1 预览"]');
      const doc = frame.contentDocument;
      const opt = doc.querySelector(".option.project_experience");
      const item = opt.querySelector(".section-item-container");
      const content = item.querySelector(".menu-content");
      const top = content.getBoundingClientRect().top;
      return [...content.querySelectorAll("li")].map((li) => {
        const r = li.getBoundingClientRect();
        return {
          x: Math.round(r.left),
          y: Math.round((r.top - top) * 10) / 10,
          w: Math.round(r.width),
          h: Math.round(r.height * 10) / 10,
          depth: li.parentElement?.parentElement?.tagName,
          text: li.textContent.slice(0, 16),
        };
      });
    }),
    null,
    1,
  ),
);
await page.close();
browser.disconnect();
