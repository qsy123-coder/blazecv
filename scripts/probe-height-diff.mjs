import puppeteer from "puppeteer-core";

const token = process.argv[2] ?? "55a4443dcc09579a";
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9227",
  defaultViewport: { width: 900, height: 2600, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();

// RAW path
await page.goto(`http://127.0.0.1:3000/template-pages/${token}.html`, {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 500));
const raw = await page.evaluate(() => {
  const main = document.querySelector(".main");
  const content = document.querySelector(".content");
  const scroll = document.querySelector(".content-scroll");
  if (content) {
    content.style.height = "auto";
    content.style.overflow = "visible";
  }
  if (scroll) {
    scroll.style.height = "auto";
    scroll.style.overflow = "visible";
  }
  main.style.height = "auto";
  main.style.minHeight = "0";
  void main.offsetHeight;
  const m = main.getBoundingClientRect();
  const c = content?.getBoundingClientRect();
  const s = scroll?.getBoundingClientRect();
  return {
    mainH: m.height,
    mainScrollH: main.scrollHeight,
    contentH: c?.height,
    contentScrollH: content?.scrollHeight,
    scrollH: s?.height,
    scrollScrollH: scroll?.scrollHeight,
    mainPad: getComputedStyle(main).padding,
    lastOptionBottom: (() => {
      const opts = [...document.querySelectorAll(".option")].filter(
        (n) => getComputedStyle(n).display !== "none",
      );
      let b = 0;
      for (const o of opts) b = Math.max(b, o.getBoundingClientRect().bottom - m.top);
      return b;
    })(),
  };
});
console.log("RAW", JSON.stringify(raw, null, 2));

// BOUND path via audit iframe
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
  const main = doc.querySelector(".main");
  const content = doc.querySelector(".content");
  const scroll = doc.querySelector(".content-scroll");
  const m = main.getBoundingClientRect();
  return {
    auditHeight: document.querySelector("[data-audit-height]")?.dataset.auditHeight,
    mainH: m.height,
    mainScrollH: main.scrollHeight,
    mainInlineHeight: main.style.height,
    contentH: content?.getBoundingClientRect().height,
    contentScrollH: content?.scrollHeight,
    scrollH: scroll?.getBoundingClientRect().height,
    scrollScrollH: scroll?.scrollHeight,
    mainPad: getComputedStyle(main).padding,
    lastOptionBottom: (() => {
      const opts = [...doc.querySelectorAll(".option")].filter(
        (n) => getComputedStyle(n).display !== "none",
      );
      let b = 0;
      for (const o of opts) b = Math.max(b, o.getBoundingClientRect().bottom - m.top);
      return b;
    })(),
  };
});
console.log("BOUND", JSON.stringify(bound, null, 2));
await page.close();
browser.disconnect();
