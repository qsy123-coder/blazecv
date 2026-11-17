import puppeteer from "puppeteer-core";

const token = process.argv[2] ?? "55a4443dcc09579a";
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9227",
  defaultViewport: { width: 900, height: 2600, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();

await page.goto(`http://127.0.0.1:3000/template-pages/${token}.html`, {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 500));
const raw = await page.evaluate(() => {
  function measure(root) {
    const opt = root.querySelector(".option.works");
    if (!opt) return null;
    return [...opt.querySelectorAll(".section-item-container")].map((item) => {
      const r = item.getBoundingClientRect();
      const title1 = item.querySelector(".menu-title");
      const title2 = item.querySelectorAll(".menu-title")[1];
      const content = item.querySelector(".menu-content");
      const li = item.querySelector(".menu-content li");
      return {
        h: Math.round(r.height * 100) / 100,
        title1H: title1 ? Math.round(title1.getBoundingClientRect().height * 100) / 100 : null,
        title2H: title2 ? Math.round(title2.getBoundingClientRect().height * 100) / 100 : null,
        contentH: content ? Math.round(content.getBoundingClientRect().height * 100) / 100 : null,
        liH: li ? Math.round(li.getBoundingClientRect().height * 100) / 100 : null,
        liCount: item.querySelectorAll(".menu-content li").length,
        title1Text: title1?.innerText.replace(/\s+/g, " ").trim(),
        title2Text: title2?.innerText.replace(/\s+/g, " ").trim(),
      };
    });
  }
  return measure(document);
});
console.log("RAW works items:", JSON.stringify(raw, null, 2));

await page.goto(`http://127.0.0.1:3000/audit?token=${encodeURIComponent(token)}`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await page.waitForFunction(
  () => document.querySelector("[data-audit-ready='1']"),
  { timeout: 45000 },
);
await new Promise((r) => setTimeout(r, 700));
const bound = await page.evaluate(() => {
  const frame = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const doc = frame.contentDocument;
  function measure(root) {
    const opt = root.querySelector(".option.works");
    if (!opt) return null;
    return [...opt.querySelectorAll(".section-item-container")].map((item) => {
      const r = item.getBoundingClientRect();
      const title1 = item.querySelector(".menu-title");
      const title2 = item.querySelectorAll(".menu-title")[1];
      const content = item.querySelector(".menu-content");
      const li = item.querySelector(".menu-content li");
      return {
        h: Math.round(r.height * 100) / 100,
        title1H: title1 ? Math.round(title1.getBoundingClientRect().height * 100) / 100 : null,
        title2H: title2 ? Math.round(title2.getBoundingClientRect().height * 100) / 100 : null,
        contentH: content ? Math.round(content.getBoundingClientRect().height * 100) / 100 : null,
        liH: li ? Math.round(li.getBoundingClientRect().height * 100) / 100 : null,
        liCount: item.querySelectorAll(".menu-content li").length,
        title1Text: title1?.innerText.replace(/\s+/g, " ").trim(),
        title2Text: title2?.innerText.replace(/\s+/g, " ").trim(),
      };
    });
  }
  return measure(doc);
});
console.log("BOUND works items:", JSON.stringify(bound, null, 2));
await page.close();
browser.disconnect();
