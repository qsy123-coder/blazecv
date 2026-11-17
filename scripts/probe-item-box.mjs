import puppeteer from "puppeteer-core";

const token = process.argv[2] ?? "55a4443dcc09579a";
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9227",
  defaultViewport: { width: 900, height: 2600, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();

function collectFn() {
  const opt = document.querySelector(".option.works");
  if (!opt) return null;
  return [...opt.querySelectorAll(".section-item-container")].map((item) => {
    const cs = getComputedStyle(item);
    return {
      marginTop: cs.marginTop,
      marginBottom: cs.marginBottom,
      paddingTop: cs.paddingTop,
      paddingBottom: cs.paddingBottom,
      borderTop: cs.borderTopWidth,
      borderBottom: cs.borderBottomWidth,
      height: cs.height,
      offsetH: item.offsetHeight,
      rectH: Math.round(item.getBoundingClientRect().height * 1000) / 1000,
      className: item.className,
    };
  });
}

await page.goto(`http://127.0.0.1:3000/template-pages/${token}.html`, {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 500));
const raw = await page.evaluate(collectFn);
console.log("RAW:", JSON.stringify(raw, null, 2));

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
  const opt = doc.querySelector(".option.works");
  if (!opt) return null;
  return [...opt.querySelectorAll(".section-item-container")].map((item) => {
    const cs = getComputedStyle(item);
    return {
      marginTop: cs.marginTop,
      marginBottom: cs.marginBottom,
      paddingTop: cs.paddingTop,
      paddingBottom: cs.paddingBottom,
      borderTop: cs.borderTopWidth,
      borderBottom: cs.borderBottomWidth,
      height: cs.height,
      offsetH: item.offsetHeight,
      rectH: Math.round(item.getBoundingClientRect().height * 1000) / 1000,
      className: item.className,
    };
  });
});
console.log("BOUND:", JSON.stringify(bound, null, 2));
await page.close();
browser.disconnect();
