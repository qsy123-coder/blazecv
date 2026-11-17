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
const rawText = await page.evaluate(() => {
  const main = document.querySelector(".main");
  const opts = [...main.querySelectorAll(".option")].filter(
    (n) => getComputedStyle(n).display !== "none",
  );
  return opts.map((o) => ({
    cls: [...o.classList].join(" "),
    h: Math.round(o.getBoundingClientRect().height * 10) / 10,
    text: o.innerText.replace(/\s+/g, " ").slice(0, 120),
  }));
});

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
const boundText = await page.evaluate(() => {
  const frame = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const doc = frame.contentDocument;
  const main = doc.querySelector(".main");
  const opts = [...main.querySelectorAll(".option")].filter(
    (n) => getComputedStyle(n).display !== "none",
  );
  return opts.map((o) => ({
    cls: [...o.classList].join(" "),
    h: Math.round(o.getBoundingClientRect().height * 10) / 10,
    text: o.innerText.replace(/\s+/g, " ").slice(0, 120),
  }));
});

console.log("RAW:");
for (const o of rawText) console.log(`  h=${o.h} ${o.text}`);
console.log("BOUND:");
for (const o of boundText) console.log(`  h=${o.h} ${o.text}`);
await page.close();
browser.disconnect();
