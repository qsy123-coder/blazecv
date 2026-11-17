// 原站模板自身的 padding-5 / padding-8 / padding-10 对照，判断大页边距的预期形态。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9230",
  defaultViewport: { width: 794, height: 1400, deviceScaleFactor: 2 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:3000/template-pages/d9d0ec05a0515f93.html", {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 1200));

for (const cls of ["padding-5", "padding-6", "padding-8", "padding-10"]) {
  await page.evaluate((cls) => {
    const main = document.querySelector(".main");
    if (!main) return;
    [...main.classList]
      .filter((name) => name.startsWith("padding-"))
      .forEach((name) => main.classList.remove(name));
    main.classList.add(cls);
  }, cls);
  await new Promise((r) => setTimeout(r, 500));
  const info = await page.evaluate(() => {
    const main = document.querySelector(".main");
    const cs = main ? getComputedStyle(main) : null;
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) };
    };
    return {
      padding: cs ? `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}` : null,
      main: rect(".main"),
      content: rect(".content"),
      line: rect(".header-line"),
      pattern: rect(".cv-pattern"),
    };
  });
  console.log(cls, JSON.stringify(info));
  await page.screenshot({
    path: `F:/Projects/blazecv/tools/audit/compare/PADDING-${cls}.png`,
    clip: { x: 0, y: 0, width: 794, height: 500 },
  });
}

await page.close();
await browser.disconnect();
