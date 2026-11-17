// 复现：调整页边距后，部分模板顶部出现分离的蓝色横条。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9230",
  defaultViewport: { width: 1600, height: 1100, deviceScaleFactor: 2 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();

async function setMargin(value) {
  await page.evaluate((value) => {
    const input = [...document.querySelectorAll('input[type="range"]')].find(
      (el) => Number(el.max) >= 15 && Number(el.max) < 100,
    );
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  await new Promise((r) => setTimeout(r, 1200));
}

async function inspect(label) {
  const data = await page.evaluate(() => {
    const frame = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    const doc = frame?.contentDocument;
    if (!doc) return null;
    const rect = (selector) => {
      const el = doc.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        top: Math.round(r.top * 10) / 10,
        bottom: Math.round(r.bottom * 10) / 10,
        height: Math.round(r.height * 10) / 10,
        left: Math.round(r.left * 10) / 10,
        width: Math.round(r.width * 10) / 10,
        position: cs.position,
        bg: cs.backgroundColor,
        paddingTop: cs.paddingTop,
        marginTop: cs.marginTop,
        zIndex: cs.zIndex,
      };
    };
    return {
      main: rect(".main"),
      content: rect(".content"),
      contentScroll: rect(".content-scroll"),
      fancyTop: rect(".fancy-top"),
      fancyBottom: rect(".fancy-bottom"),
      headerLine: rect(".header-line"),
      pattern: rect(".cv-pattern"),
      user: rect(".user"),
      frameHeight: frame.getAttribute("height"),
      pages: document.querySelectorAll("[data-resume-page]").length,
    };
  });
  console.log(label, JSON.stringify(data, null, 2));
  const pageEl = await page.$('[data-resume-page]');
  if (pageEl) {
    await pageEl.screenshot({
      path: `F:/Projects/blazecv/tools/audit/compare/MARGIN-${label}.png`,
      type: "png",
    });
  }
}

await page.goto("http://127.0.0.1:3000/editor?id=resume_seed_1", {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));

await setMargin(10);
await inspect("m10");
await setMargin(16);
await inspect("m16");
await setMargin(18);
await inspect("m18");
await setMargin(22);
await inspect("m22");
await setMargin(4);
await inspect("m4");
await setMargin(10);
await inspect("m10back");

await page.close();
await browser.disconnect();
